require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");

const requiredEnv = ["TELEGRAM_BOT_TOKEN", "SUPABASE_URL"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  throw new Error(
    `Missing required environment variables: ${missingEnv.join(", ")}`,
  );
}

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  throw new Error(
    "Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.",
  );
}

const tableName = process.env.SUPABASE_TABLE || "Email_Atm";
const sheetWebhookUrl = process.env.EDGE_SHEET_URL || "";
const allowedChatIds = new Set(
  (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const isVercelRuntime = Boolean(process.env.VERCEL);
const bot = new TelegramBot(telegramToken, { polling: !isVercelRuntime });
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeActive(value) {
  return value === "Yes" || value === true || value === "true";
}

function parseEncodedHold(value) {
  const text = String(value || "");
  if (!text.startsWith("Hold|")) return null;
  const [, holdType = "", holdUntil = ""] = text.split("|");
  return { holdType, holdUntil };
}

function encodeHoldActiveValue(active, hold = {}) {
  if (active) return "Yes";
  if (!hold.holdUntil) return "No";
  return `Hold|${hold.holdType || "Custom"}|${hold.holdUntil}`;
}

function getRowHoldType(row) {
  return row["Hold Type"] || parseEncodedHold(row.Active)?.holdType || "";
}

function getRowHoldUntil(row) {
  return row["Hold Until"] || parseEncodedHold(row.Active)?.holdUntil || "";
}

function isMissingHoldColumnError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Hold Type") ||
    message.includes("Hold Until") ||
    message.includes("schema cache")
  );
}

function formatHoldUntil(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function parseHoldOption(input = "") {
  const value = input.trim().toLowerCase();
  const now = new Date();

  if (!value || value === "permanent" || value === "perm") {
    return { active: false, holdType: "Permanent", holdUntil: "" };
  }

  if (value === "week" || value === "weekly" || value === "1w") {
    return {
      active: false,
      holdType: "Week",
      holdUntil: addDays(now, 7).toISOString(),
    };
  }

  if (value === "month" || value === "monthly" || value === "1m") {
    return {
      active: false,
      holdType: "Month",
      holdUntil: addMonths(now, 1).toISOString(),
    };
  }

  const untilMatch = value.match(/^(custom|until)\s+(\d{4}-\d{2}-\d{2})$/);
  if (untilMatch) {
    const date = new Date(`${untilMatch[2]}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return {
        active: false,
        holdType: "Custom",
        holdUntil: date.toISOString(),
      };
    }
  }

  throw new Error("Use: week, month, permanent, or until YYYY-MM-DD");
}

function formatCandidate(row) {
  const status = normalizeActive(row.Active) ? "Active" : "Inactive";
  const holdType = getRowHoldType(row);
  const holdUntilValue = getRowHoldUntil(row);
  const holdUntil = holdUntilValue ? formatHoldUntil(holdUntilValue) : "";
  const holdLine =
    !normalizeActive(row.Active) && (holdType || holdUntil)
      ? `Hold: ${holdType || "Timed"}${holdUntil ? ` until ${holdUntil}` : ""}`
      : null;
  const title = row.Title || "-";
  const skills = row.Skills || "-";
  const recruiter = row["Recruiter name"] || "-";
  return [
    `#${row.Unique} ${row["Candidate Name"] || "Unnamed"}`,
    `Status: ${status}`,
    holdLine,
    `Title: ${title}`,
    `Skills: ${skills}`,
    `Recruiter: ${recruiter}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildListMessage(label, rows) {
  if (!rows.length) {
    return `${label}: 0 candidates found.`;
  }

  const lines = [`${label}: ${rows.length} candidate(s)`];
  for (const row of rows.slice(0, 25)) {
    const title = row.Title || "-";
    lines.push(
      `#${row.Unique} | ${row["Candidate Name"] || "Unnamed"} | ${title}`,
    );
  }

  if (rows.length > 25) {
    lines.push(
      `Showing first 25 of ${rows.length}. Use /search for a narrower list.`,
    );
  }

  return lines.join("\n");
}

async function syncToSheet(action, record) {
  if (!sheetWebhookUrl) return;

  try {
    await fetch(sheetWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: tableName,
        action,
        record,
      }),
    });
  } catch (error) {
    console.warn("Sheet sync failed:", error.message);
  }
}

function isAuthorized(chatId) {
  if (!allowedChatIds.size) return true;
  return allowedChatIds.has(String(chatId));
}

async function guardAccess(msg) {
  if (isAuthorized(msg.chat.id)) return true;
  await bot.sendMessage(
    msg.chat.id,
    "This bot is restricted. Add this chat ID to TELEGRAM_ALLOWED_CHAT_IDS to allow access.",
  );
  return false;
}

async function fetchCandidates({ active } = {}) {
  await releaseExpiredHolds();
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .order("Unique", { ascending: true });

  if (error) throw error;
  const rows = data || [];
  if (typeof active !== "boolean") return rows;
  return rows.filter((row) => normalizeActive(row.Active) === active);
}

async function fetchCandidateById(id) {
  await releaseExpiredHolds();
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("Unique", Number(id))
    .single();

  if (error) throw error;
  return data;
}

async function updateCandidateStatus(id, active, hold = {}) {
  const payload = {
    Active: active ? "Yes" : "No",
    "Hold Type": active ? "" : hold.holdType || "Permanent",
    "Hold Until": active ? null : hold.holdUntil || null,
  };
  let { data, error } = await supabase
    .from(tableName)
    .update(payload)
    .eq("Unique", Number(id))
    .select()
    .single();

  if (error && isMissingHoldColumnError(error)) {
    const fallback = await supabase
      .from(tableName)
      .update({ Active: encodeHoldActiveValue(active, hold) })
      .eq("Unique", Number(id))
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;
  await syncToSheet("update", data);
  return data;
}

async function releaseExpiredHolds() {
  const { data, error } = await supabase.from(tableName).select("*");

  if (error) {
    console.warn("Failed to check expired holds:", error.message);
    return;
  }

  const now = Date.now();
  for (const row of data || []) {
    if (normalizeActive(row.Active)) continue;
    const holdUntilValue = getRowHoldUntil(row);
    const holdUntil = holdUntilValue ? new Date(holdUntilValue).getTime() : NaN;
    if (Number.isNaN(holdUntil) || holdUntil > now) continue;
    try {
      await updateCandidateStatus(row.Unique, true);
      console.log(`Auto-activated candidate ${row.Unique} after hold expired.`);
    } catch (releaseError) {
      console.warn(
        `Failed to auto-activate candidate ${row.Unique}:`,
        releaseError.message,
      );
    }
  }
}

async function searchCandidates(searchTerm) {
  const term = searchTerm.trim();
  if (!term) return [];

  const rows = await fetchCandidates();
  const normalizedTerm = term.toLowerCase();
  const filtered = rows.filter((row) =>
    [
      row["Candidate Name"],
      row.Title,
      row.Skills,
      row["Recruiter name"],
      row.Email,
      row["Contact No"],
    ]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(normalizedTerm)),
  );

  return filtered.slice(0, 25);
}

bot.onText(/^\/start$/, async (msg) => {
  if (!(await guardAccess(msg))) return;

  await bot.sendMessage(
    msg.chat.id,
    [
      "Candidate bot is connected.",
      "",
      "Commands:",
      "/active",
      "/inactive",
      "/counts",
      "/status <candidateId>",
      "/activate <candidateId>",
      "/deactivate <candidateId> [week|month|permanent|until YYYY-MM-DD]",
      "/search <name | title | skill>",
      "/help",
    ].join("\n"),
  );
});

bot.onText(/^\/help$/, async (msg) => {
  if (!(await guardAccess(msg))) return;
  await bot.sendMessage(
    msg.chat.id,
    [
      "/active - list active candidates",
      "/inactive - list inactive candidates",
      "/counts - show active and inactive totals",
      "/status <candidateId> - show one candidate",
      "/activate <candidateId> - mark candidate active",
      "/deactivate <candidateId> week - inactive for 1 week",
      "/deactivate <candidateId> month - inactive for 1 month",
      "/deactivate <candidateId> until YYYY-MM-DD - inactive until a custom date",
      "/deactivate <candidateId> permanent - inactive until manually activated",
      "/search <text> - search by name, title, skill, recruiter, or email",
    ].join("\n"),
  );
});

bot.onText(/^\/active$/, async (msg) => {
  if (!(await guardAccess(msg))) return;
  try {
    const rows = await fetchCandidates({ active: true });
    await bot.sendMessage(msg.chat.id, buildListMessage("Active", rows));
  } catch (error) {
    await bot.sendMessage(
      msg.chat.id,
      `Failed to load active candidates: ${error.message}`,
    );
  }
});

bot.onText(/^\/inactive$/, async (msg) => {
  if (!(await guardAccess(msg))) return;
  try {
    const rows = await fetchCandidates({ active: false });
    await bot.sendMessage(msg.chat.id, buildListMessage("Inactive", rows));
  } catch (error) {
    await bot.sendMessage(
      msg.chat.id,
      `Failed to load inactive candidates: ${error.message}`,
    );
  }
});

bot.onText(/^\/counts$/, async (msg) => {
  if (!(await guardAccess(msg))) return;
  try {
    const [activeRows, inactiveRows] = await Promise.all([
      fetchCandidates({ active: true }),
      fetchCandidates({ active: false }),
    ]);
    await bot.sendMessage(
      msg.chat.id,
      `Counts\nActive: ${activeRows.length}\nInactive: ${inactiveRows.length}\nTotal: ${activeRows.length + inactiveRows.length}`,
    );
  } catch (error) {
    await bot.sendMessage(
      msg.chat.id,
      `Failed to load counts: ${error.message}`,
    );
  }
});

bot.onText(/^\/status\s+(\d+)$/, async (msg, match) => {
  if (!(await guardAccess(msg))) return;
  try {
    const row = await fetchCandidateById(match[1]);
    await bot.sendMessage(msg.chat.id, formatCandidate(row));
  } catch (error) {
    await bot.sendMessage(msg.chat.id, `Candidate not found: ${error.message}`);
  }
});

bot.onText(/^\/activate\s+(\d+)$/, async (msg, match) => {
  if (!(await guardAccess(msg))) return;
  try {
    const row = await updateCandidateStatus(match[1], true);
    await bot.sendMessage(
      msg.chat.id,
      `Candidate updated to Active.\n\n${formatCandidate(row)}`,
    );
  } catch (error) {
    await bot.sendMessage(
      msg.chat.id,
      `Failed to activate candidate: ${error.message}`,
    );
  }
});

bot.onText(/^\/deactivate\s+(\d+)(?:\s+(.+))?$/, async (msg, match) => {
  if (!(await guardAccess(msg))) return;
  try {
    const hold = parseHoldOption(match[2] || "permanent");
    const row = await updateCandidateStatus(match[1], false, hold);
    await bot.sendMessage(
      msg.chat.id,
      `Candidate updated to Inactive.\n\n${formatCandidate(row)}`,
    );
  } catch (error) {
    await bot.sendMessage(
      msg.chat.id,
      `Failed to deactivate candidate: ${error.message}`,
    );
  }
});

bot.onText(/^\/search\s+(.+)$/, async (msg, match) => {
  if (!(await guardAccess(msg))) return;
  try {
    const rows = await searchCandidates(match[1]);
    const label = `Search results for "${match[1].trim()}"`;
    await bot.sendMessage(msg.chat.id, buildListMessage(label, rows));
  } catch (error) {
    await bot.sendMessage(msg.chat.id, `Search failed: ${error.message}`);
  }
});

if (!isVercelRuntime) {
  bot.on("polling_error", (error) => {
    console.error("Telegram polling error:", error.message);
  });
}

console.log(
  isVercelRuntime
    ? "Telegram candidate bot webhook handler is ready."
    : "Telegram candidate bot is running.",
);

module.exports = { bot };

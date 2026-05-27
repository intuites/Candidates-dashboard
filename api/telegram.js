const { bot } = require("../telegram-bot/bot");

module.exports = async function telegramWebhook(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "telegram-webhook" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    await bot.processUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed:", error);
    return res.status(500).json({ ok: false, error: "Webhook failed" });
  }
};

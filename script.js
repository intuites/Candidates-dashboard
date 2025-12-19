// ============================================
// CANDIDATE DASHBOARD - SCRIPT.JS
// With Google Drive File Upload for Resume/DL
// ============================================

/* ---------------- Supabase Config ---------------- */
const SUPABASE_URL = "https://wltbgkbljjhkwmomosxo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsdGJna2Jsampoa3dtb21vc3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzIzNjMsImV4cCI6MjA3OTMwODM2M30.eXiy1rQKCeYIGOtayYTXF3kQU5iTCt3iMuhhTC_oyLg";

// const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
//   auth: { persistSession: false },
// });

if (!window._supabaseClient) {
  window._supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    { auth: { persistSession: false } }
  );
}

// const supabase = window._supabaseClient;
const db = window._supabaseClient;


/* ---------------- Google Apps Script Webhook ---------------- */
// This handles file uploads AND sheet sync
const EDGE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzi22VaAvIn6NCvDISJ3tsfJEymmTQLKmDhPqyxU2u8f4zIDHPNZYZhRi_jmDkZ9kldYg/exec";

/* ---------------- DOM References ---------------- */
const statusEl = document.getElementById("connectionStatus");
const tableBody = document.querySelector("#dataTable tbody");
const formCard = document.getElementById("candidateForm"); // The card container
const form = document.getElementById("candidateFormInner"); // The actual form element
const submitBtn = document.getElementById("submitBtn");
const cancelBtn = document.getElementById("cancelEditBtn");
const searchEl = document.getElementById("searchInput");
const openFormBtn = document.getElementById("openFormBtn");
const closeFormBtn = document.getElementById("closeFormBtn");

// File upload elements
const resumeFileInput = document.getElementById("resumeFile");
const dlFileInput = document.getElementById("dlFile");
const resumeDropArea = document.getElementById("resumeDropArea");
const dlDropArea = document.getElementById("dlDropArea");
const resumePreview = document.getElementById("resumePreview");
const dlPreview = document.getElementById("dlPreview");
const visaFileInput = document.getElementById("visaFile");
const visaDropArea = document.getElementById("visaDropArea");
const visaPreview = document.getElementById("visaPreview");
const resumeHidden = document.getElementById("resume");
const dlHidden = document.getElementById("dl");
const visaHidden = document.getElementById("visaCopy");

// Stats elements
const totalCandidatesEl = document.getElementById("totalCandidates");
const totalTitlesEl = document.getElementById("totalTitles");
const todayDateEl = document.getElementById("todayDate");
const tableCountEl = document.getElementById("tableCount");

// Title Map UI refs
const titleMapBtn = document.getElementById("navTitleMap");
const titleMapPopup = document.getElementById("titleMapPopup");
const closeTitleMap = document.getElementById("closeTitleMap");
const listEl = document.getElementById("list");
const searchInputTM = document.getElementById("searchInputTM");
const openAddBtnTM = document.getElementById("openAddBtnTM");
const modalBackTM = document.getElementById("modalBack");
const editBackTM = document.getElementById("editBack");
const editFields = document.getElementById("editFields");
const editSave = document.getElementById("editSave");
const editCancel = document.getElementById("editCancel");

/* ---------------- State ---------------- */
let allRows = [];
let editingId = null;
let titles = [];
let currentEdit = null;
let candidatesMap = new Map();

// File upload state - support multiple resumes with individual titles
let pendingResumeFiles = []; // Array of {file, title} objects for multiple resume files
let pendingDlFile = null;
let pendingVisaFile = null;

/* ---------------- Helpers ---------------- */
const encodeHTML = (str = "") =>
  String(str).replace(/[&<>"'`=\/]/g, (s) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
    "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;",
  }[s]));

function setStatusOk(text) {
  if (!statusEl) return;
  statusEl.classList.remove("error");
  statusEl.classList.add("ok");
  const statusText = statusEl.querySelector(".status-text");
  if (statusText) statusText.textContent = text;
}

function setStatusErr(text) {
  if (!statusEl) return;
  statusEl.classList.remove("ok");
  statusEl.classList.add("error");
  const statusText = statusEl.querySelector(".status-text");
  if (statusText) statusText.textContent = text;
}

function updateStats() {
  if (totalCandidatesEl) totalCandidatesEl.textContent = allRows.length;
  if (totalTitlesEl) totalTitlesEl.textContent = titles.length;
  if (todayDateEl) {
    const today = new Date();
    todayDateEl.textContent = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (tableCountEl) tableCountEl.textContent = `${allRows.length} records`;
}

/* ============================================
   FILE UPLOAD TO GOOGLE DRIVE
   ============================================ */

// Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
}

// Counter for unique file naming
let fileUploadCounter = 1;

// Upload file to Google Drive via Google Apps Script
async function uploadFileToDrive(file, candidateName, title = "", fileIndex = 0) {
  if (!file) return null;
  
  try {
    const base64 = await fileToBase64(file);
    // Format: CandidateName_Title_Number.extension (e.g., Akhil_Java_1.pdf, Akhil_Java_2.pdf)
    const namePart = (candidateName || 'NoName').replace(/[^a-zA-Z0-9]/g, '');
    const titlePart = title ? '_' + title.replace(/[^a-zA-Z0-9]/g, '') : '';
    const ext = file.name.split('.').pop();
    // Add unique number to prevent overwriting
    const uniqueNum = fileIndex > 0 ? `_${fileIndex}` : `_${fileUploadCounter++}`;
    const fileName = `${namePart}${titlePart}${uniqueNum}.${ext}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    
    const payload = JSON.stringify({
      action: "upload",
      file: {
        name: fileName,
        mimeType: file.type || 'application/octet-stream',
        content: base64,
      },
    });
    
    console.log("Uploading file:", fileName, "Size:", Math.round(base64.length / 1024), "KB");
    
    // Method 1: Try direct fetch with redirect follow
    try {
      const response = await fetch(EDGE_SHEET_URL, {
        method: "POST",
        redirect: "follow",
        body: payload,
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log("Upload response:", result);
        if (result.success && result.url) {
          console.log("File uploaded successfully! URL:", result.url);
          return result.url;
        }
      }
    } catch (e) {
      console.log("Direct fetch failed:", e.message);
    }
    
    // Method 2: Use iframe form submission (bypasses CORS completely)
    console.log("Trying iframe upload method...");
    const uploadResult = await uploadViaIframe(payload);
    if (uploadResult && uploadResult !== "FAILED") {
      return uploadResult;
    }
    
    // Method 3: Last resort - just log that upload needs manual check
    console.warn("Could not confirm upload. File may or may not be in Drive.");
    return null;
    
  } catch (err) {
    console.error("Upload error:", err);
    return null;
  }
}

// Upload via hidden iframe (bypasses CORS)
function uploadViaIframe(payload) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("Iframe upload timeout - assuming success, check Drive");
      cleanup();
      resolve("UPLOADED_CHECK_DRIVE");
    }, 15000); // 15 second timeout
    
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.name = "uploadFrame_" + Date.now();
    
    const form = document.createElement("form");
    form.method = "POST";
    form.action = EDGE_SHEET_URL;
    form.target = iframe.name;
    form.style.display = "none";
    
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "payload";
    input.value = payload;
    form.appendChild(input);
    
    const cleanup = () => {
      clearTimeout(timeout);
      try {
        document.body.removeChild(iframe);
        document.body.removeChild(form);
      } catch (e) {}
    };
    
    iframe.onload = () => {
      // Try to read response from iframe
      try {
        const content = iframe.contentWindow.document.body.innerText;
        console.log("Iframe response:", content);
        const result = JSON.parse(content);
        if (result.success && result.url) {
          cleanup();
          resolve(result.url);
          return;
        }
      } catch (e) {
        console.log("Could not read iframe response (CORS)");
      }
      cleanup();
      resolve("UPLOADED_CHECK_DRIVE");
    };
    
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
  });
}

// Setup file input handlers
function setupFileUpload(input, dropArea, previewEl, hiddenInput, type) {
  if (!input || !dropArea) return;
  
  // Click to select
  dropArea.addEventListener("click", () => input.click());
  
  // Drag and drop
  dropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropArea.classList.add("dragover");
  });
  
  dropArea.addEventListener("dragleave", () => {
    dropArea.classList.remove("dragover");
  });
  
  dropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    dropArea.classList.remove("dragover");
    const files = e.dataTransfer.files;
    // Handle multiple files for resume, single for DL
    if (type === "resume") {
      for (let i = 0; i < files.length; i++) {
        handleFileSelect(files[i], dropArea, previewEl, type);
      }
    } else if (files.length > 0) {
      handleFileSelect(files[0], dropArea, previewEl, type);
    }
  });
  
  // File input change
  input.addEventListener("change", () => {
    // Handle multiple files for resume
    if (type === "resume") {
      for (let i = 0; i < input.files.length; i++) {
        handleFileSelect(input.files[i], dropArea, previewEl, type);
      }
    } else if (input.files.length > 0) {
      handleFileSelect(input.files[0], dropArea, previewEl, type);
    }
  });
}

function handleFileSelect(file, dropArea, previewEl, type) {
  // Validate file type
  const allowedResume = [".pdf", ".doc", ".docx"];
  const allowedDL = [".pdf", ".jpg", ".jpeg", ".png"];
  const allowedVisa = [".pdf", ".jpg", ".jpeg", ".png"];
  const allowed = type === "resume" ? allowedResume : (type === "visa" ? allowedVisa : allowedDL);
  const ext = "." + file.name.split(".").pop().toLowerCase();
  
  if (!allowed.includes(ext)) {
    alert(`Invalid file type. Allowed: ${allowed.join(", ")}`);
    return;
  }
  
  // Store pending file(s)
  if (type === "resume") {
    // Check if file already added
    const exists = pendingResumeFiles.some(f => f.file.name === file.name && f.file.size === file.size);
    if (!exists) {
      // Store as object with file and title
      pendingResumeFiles.push({ file: file, title: "" });
    }
    // Update preview to show all resume files with title inputs
    updateResumePreview();
  } else if (type === "visa") {
    pendingVisaFile = file;
    // Update UI for single Visa file
    dropArea.classList.add("has-file");
    previewEl.innerHTML = `
      <div class="file-preview-item">
        <span class="file-preview-name">${encodeHTML(file.name)}</span>
        <button type="button" class="file-remove-btn" onclick="removeFile('visa')">✕</button>
      </div>
    `;
  } else {
    pendingDlFile = file;
    // Update UI for single DL file
    dropArea.classList.add("has-file");
    previewEl.innerHTML = `
      <div class="file-preview-item">
        <span class="file-preview-name">${encodeHTML(file.name)}</span>
        <button type="button" class="file-remove-btn" onclick="removeFile('dl')">✕</button>
      </div>
    `;
  }
  
  if (dropArea) dropArea.classList.add("has-file");
}

// Update resume preview to show all files with title inputs
function updateResumePreview() {
  if (!resumePreview) return;
  
  if (pendingResumeFiles.length === 0) {
    resumePreview.innerHTML = "";
    if (resumeDropArea) resumeDropArea.classList.remove("has-file");
    return;
  }
  
  if (resumeDropArea) resumeDropArea.classList.add("has-file");
  
  let html = "";
  
  if (pendingResumeFiles.length > 1) {
    html = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;font-weight:500;">${pendingResumeFiles.length} files - Enter title for each resume:</div>`;
  }
  
  html += pendingResumeFiles.map((item, index) => `
    <div class="file-preview-item" style="flex-direction:column;align-items:stretch;gap:6px;padding:8px;background:var(--color-surface);border-radius:6px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="file-preview-name" style="font-weight:500;">${encodeHTML(item.file.name)}</span>
        <button type="button" class="file-remove-btn" onclick="removeResumeFile(${index})">✕</button>
      </div>
      <input type="text" 
        class="resume-title-input" 
        data-resume-index="${index}"
        placeholder="Enter title for this resume (e.g., Java Developer)" 
        value="${encodeHTML(item.title || '')}"
        onchange="updateResumeTitle(${index}, this.value)"
        style="width:100%;padding:6px 10px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;background:var(--color-card);"
      />
    </div>
  `).join("");
  
  resumePreview.innerHTML = html;
}

// Update title for a specific resume
window.updateResumeTitle = function(index, title) {
  if (pendingResumeFiles[index]) {
    pendingResumeFiles[index].title = title;
    console.log(`Resume ${index + 1} title set to: "${title}"`);
  }
};

// Global function to remove file
window.removeFile = function(type) {
  if (type === "resume") {
    pendingResumeFiles = [];
    if (resumeDropArea) resumeDropArea.classList.remove("has-file");
    if (resumePreview) resumePreview.innerHTML = "";
    if (resumeFileInput) resumeFileInput.value = "";
  } else if (type === "visa") {
    pendingVisaFile = null;
    if (visaDropArea) visaDropArea.classList.remove("has-file");
    if (visaPreview) visaPreview.innerHTML = "";
    if (visaFileInput) visaFileInput.value = "";
  } else {
    pendingDlFile = null;
    if (dlDropArea) dlDropArea.classList.remove("has-file");
    if (dlPreview) dlPreview.innerHTML = "";
    if (dlFileInput) dlFileInput.value = "";
  }
};

// Remove specific resume file by index
window.removeResumeFile = function(index) {
  pendingResumeFiles.splice(index, 1);
  updateResumePreview();
  if (resumeFileInput) resumeFileInput.value = "";
};

// Initialize file uploads
setupFileUpload(resumeFileInput, resumeDropArea, resumePreview, resumeHidden, "resume");
setupFileUpload(dlFileInput, dlDropArea, dlPreview, dlHidden, "dl");
setupFileUpload(visaFileInput, visaDropArea, visaPreview, visaHidden, "visa");

// Show existing file link
function showExistingFile(url, previewEl, dropArea, type) {
  if (!url || !previewEl) return;
  
  if (dropArea) dropArea.classList.add("has-file");
  previewEl.innerHTML = `
    <div class="file-preview-item">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <a href="${encodeHTML(url)}" target="_blank" class="file-preview-link">View existing file</a>
      <button type="button" class="file-remove-btn" onclick="clearExistingFile('${type}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;
}

window.clearExistingFile = function(type) {
  if (type === "resume") {
    if (resumeHidden) resumeHidden.value = "";
    if (resumeDropArea) resumeDropArea.classList.remove("has-file");
    if (resumePreview) resumePreview.innerHTML = "";
  } else {
    if (dlHidden) dlHidden.value = "";
    if (dlDropArea) dlDropArea.classList.remove("has-file");
    if (dlPreview) dlPreview.innerHTML = "";
  }
};

/* ---------------- Sheet Sync Helper ---------------- */
async function syncToSheet(table, action, record) {
  console.log("=== SHEET SYNC ===");
  console.log("Table:", table);
  console.log("Action:", action);
  console.log("Record:", JSON.stringify(record));
  
  try {
    const payload = { table, action, record };
    const payloadStr = JSON.stringify(payload);
    console.log("Payload:", payloadStr);
    
    // Try direct fetch first
    try {
      const response = await fetch(EDGE_SHEET_URL, {
        method: "POST",
        redirect: "follow",
        body: payloadStr,
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log("Sheet sync response:", result);
        return result;
      }
    } catch (fetchErr) {
      console.log("Direct fetch failed, trying no-cors:", fetchErr.message);
    }
    
    // Fallback to no-cors
    await fetch(EDGE_SHEET_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: payloadStr,
    });
    
    console.log("Sheet sync sent (no-cors mode)");
  } catch (err) {
    console.error("Sheet sync failed:", err);
  }
}

/* ---------------- Connection Test ---------------- */
async function testConnection() {
  try {
    const { count, error } = await db
      .from("Email_Atm")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    setStatusOk(`Connected (${count})`);
  } catch (e) {
    setStatusErr("Disconnected");
  }
}

/* ---------------- Load Candidates ---------------- */
async function loadData() {
  console.log("Loading data from Supabase...");
  console.log("URL:", SUPABASE_URL);
  
  try {
    const { data, error } = await db.from("Email_Atm").select("*");
    
    if (error) {
      console.error("Supabase error:", error.message, error.details, error.hint);
      alert("Database error: " + error.message);
      setStatusErr("Query failed");
      return;
    }
    
    console.log("Data loaded:", data?.length, "records");
    allRows = data || [];
    candidatesMap = new Map();
    allRows.forEach((r) => {
      candidatesMap.set(String(r.Unique ?? ""), r["Candidate Name"] ?? "");
    });
    renderTable(allRows);
    updateStats();
    setStatusOk("Connected (" + allRows.length + ")");
  } catch (err) {
    console.error("loadData error:", err);
    alert("Failed to load data: " + err.message);
    setStatusErr("Error");
  }
}

/* ---------------- Render Table ---------------- */
function renderTable(rows) {
  console.log("Rendering table with", rows.length, "rows");
  if (!tableBody) {
    console.error("tableBody element not found!");
    return;
  }
  // Sort by ID ascending (1, 2, 3... oldest first)
  rows = rows.sort((a, b) => Number(a.Unique) - Number(b.Unique));
  tableBody.innerHTML = "";
  
  console.log("First 3 rows:", rows.slice(0, 3).map(r => ({ id: r.Unique, name: r["Candidate Name"] })));

  rows.forEach((row) => {
    const skillsRaw = row.Skills || "";
    const skills = skillsRaw ? encodeHTML(skillsRaw.substring(0, 50)) + (skillsRaw.length > 50 ? "..." : "") : "-";
    
    // Helper to create file link - check if it's a valid URL or placeholder
    const createFileLink = (url, label, icon) => {
      if (!url) return '<span class="no-file">-</span>';
      // Check if it's a placeholder like "[Uploaded: filename]"
      if (url.startsWith("[Uploaded:")) {
        const filename = url.replace("[Uploaded:", "").replace("]", "").trim();
        return `<span class="file-pending" title="File uploaded but link unavailable. Check Google Drive.">${encodeHTML(filename)}</span>`;
      }
      // Check if it's a valid URL
      if (url.startsWith("http")) {
        return `<a href="${encodeHTML(url)}" target="_blank" class="file-link">${label}</a>`;
      }
      return `<span class="no-file">${encodeHTML(url)}</span>`;
    };
    
    const resumeLink = createFileLink(row.Resume, "Resume", "");
    const dlLink = createFileLink(row.DL, "DL", "");
    const visaLink = createFileLink(row["Visa Copy"], "Visa", "");
    const isActive = row.Active === "Yes" || row.Active === true || row.Active === "true";
    const statusBadge = isActive 
      ? `<span class="status-badge active" data-id="${row.Unique}" title="Click to deactivate"><span class="status-dot"></span>Active</span>`
      : `<span class="status-badge inactive" data-id="${row.Unique}" title="Click to activate"><span class="status-dot"></span>Inactive</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span style="color: var(--accent-purple); font-weight: 600;">#${row.Unique}</span></td>
      <td>${statusBadge}</td>
      <td><strong>${encodeHTML(row["Candidate Name"] || "-")}</strong></td>
      <td>${encodeHTML(row["Contact No"] || "-")}</td>
      <td>${encodeHTML(row.Email || "-")}</td>
      <td title="${encodeHTML(skillsRaw)}">${skills}</td>
      <td><span class="badge">${encodeHTML(row["Visa status"] || "-")}</span></td>
      <td>${encodeHTML(row["Current Location"] || "-")}</td>
      <td>${encodeHTML(row.Title || "-")}</td>
      <td>${encodeHTML(row["Total Exp"] || "-")}</td>
      <td><strong style="color: var(--accent-green);">${encodeHTML(row.Rate || "-")}</strong></td>
      <td>${encodeHTML(row["Recruiter name"] || "-")}</td>
      <td>${resumeLink}</td>
      <td>${dlLink}</td>
      <td>${visaLink}</td>
      <td class="actions">
        <button class="btn-edit" data-id="${row.Unique}">Edit</button>
        <button class="btn-delete" data-id="${row.Unique}" data-name="${encodeHTML(row["Candidate Name"] || "")}">Delete</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
  
  if (tableCountEl) tableCountEl.textContent = `${rows.length} records`;
}

/* ---------------- Search ---------------- */
if (searchEl) {
  searchEl.addEventListener("input", () => {
    const q = (searchEl.value || "").toLowerCase();
    if (!q) return renderTable(allRows);
    const filtered = allRows.filter((r) => {
      return [r["Candidate Name"], r.Email, r.Skills, r.Title, r["Recruiter name"], r["Current Location"]]
        .map((v) => (v || "").toString().toLowerCase())
        .some((v) => v.includes(q));
    });
    renderTable(filtered);
  });
}

/* ---------------- Form Toggle ---------------- */
function resetForm() {
  if (form) form.reset();
  editingId = null;
  pendingResumeFiles = []; // Clear all pending resume files
  pendingDlFile = null;
  pendingVisaFile = null;
  if (resumeDropArea) resumeDropArea.classList.remove("has-file");
  if (dlDropArea) dlDropArea.classList.remove("has-file");
  if (visaDropArea) visaDropArea.classList.remove("has-file");
  if (resumePreview) resumePreview.innerHTML = "";
  if (dlPreview) dlPreview.innerHTML = "";
  if (visaPreview) visaPreview.innerHTML = "";
  if (resumeFileInput) resumeFileInput.value = "";
  if (dlFileInput) dlFileInput.value = "";
  if (visaFileInput) visaFileInput.value = "";
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

if (openFormBtn) {
  openFormBtn.addEventListener("click", () => {
    if (!formCard.classList.contains("hidden")) {
      formCard.classList.add("hidden");
      resetForm();
      return;
    }
    resetForm();
    formCard.classList.remove("hidden");
    formCard.scrollIntoView({ behavior: "smooth" });
  });
}

if (closeFormBtn) {
  closeFormBtn.addEventListener("click", () => {
    formCard.classList.add("hidden");
    resetForm();
  });
}

if (cancelBtn) {
  cancelBtn.addEventListener("click", () => {
    formCard.classList.add("hidden");
    resetForm();
  });
}

/* ---------------- Status Toggle Click Handler ---------------- */
document.addEventListener("click", async (e) => {
  const statusBadge = e.target.closest(".status-badge");
  if (statusBadge) {
    const id = Number(statusBadge.dataset.id);
    if (!id) return;
    
    const isCurrentlyActive = statusBadge.classList.contains("active");
    const newStatus = isCurrentlyActive ? "No" : "Yes";
    
    try {
      // Update in Supabase
      const { data, error } = await db
        .from("Email_Atm")
        .update({ Active: newStatus })
        .eq("Unique", id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Sync to Google Sheet
      await syncToSheet("Email_Atm", "update", data);
      console.log(`Status updated to ${newStatus} for candidate ${id}`);
      
      // Update local data and re-render
      const row = allRows.find(r => r.Unique === id);
      if (row) row.Active = newStatus;
      renderTable(allRows);
      
      // If candidate becomes inactive, remove from all Title Maps
      if (newStatus === "No") {
        console.log(`Candidate ${id} is now inactive, removing from Title Maps...`);
        await removeFromAllTitleMaps(String(id));
      }
      
    } catch (err) {
      console.error("Status toggle failed:", err);
      alert("Failed to update status: " + err.message);
    }
    return;
  }
});

// Helper: Remove candidate from all Title Maps
async function removeFromAllTitleMaps(candidateId) {
  try {
    console.log("Removing candidate", candidateId, "from all Title Maps...");
    
    // Get all title maps from Supabase
    const { data: titleMaps, error } = await db
      .from("Title_Map")
      .select("*");
    
    if (error) {
      console.error("Error fetching title maps:", error);
      throw error;
    }
    
    console.log("Found", titleMaps.length, "title maps to check");
    
    // Check each title map and remove the candidate if present
    for (const tm of titleMaps) {
      const currentIds = tm.ids ? tm.ids.split(",").map(s => s.trim()).filter(Boolean) : [];
      console.log(`Title "${tm.title}" has IDs:`, currentIds);
      
      if (currentIds.includes(candidateId)) {
        const newIds = currentIds.filter(id => id !== candidateId);
        console.log(`Removing ${candidateId} from "${tm.title}". New IDs:`, newIds);
        
        // Update in Supabase
        const { error: updateError } = await db
          .from("Title_Map")
          .update({ ids: newIds.join(",") })
          .eq("titleid", tm.titleid);
        
        if (updateError) {
          console.error(`Error updating title map ${tm.titleid}:`, updateError);
        } else {
          console.log(`Successfully removed candidate ${candidateId} from title "${tm.title}"`);
          
          // Sync to Google Sheet - send ids as comma-separated string
          await syncToSheet("Title_Map", "update", {
            id: tm.titleid,
            ids: newIds.join(","),  // Convert array to string for sheet
            title: tm.title
          });
          console.log("Sheet sync triggered for Title_Map update");
        }
      }
    }
    
    // Reload titles to reflect changes
    await loadTitles();
    console.log("Title Maps reloaded");
    
  } catch (err) {
    console.error("Error removing from title maps:", err);
  }
}

/* ---------------- Edit/Delete Click Handlers ---------------- */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  // Edit button
  if (btn.classList.contains("btn-edit") && btn.closest("tr")) {
    const id = Number(btn.dataset.id);
    if (!id) return;
    
    const { data, error } = await db
      .from("Email_Atm")
      .select("*")
      .eq("Unique", id)
      .single();
      
    if (error) return alert("Error loading record: " + error.message);
    
    resetForm();
    editingId = id; // Set AFTER resetForm() so it doesn't get cleared
    formCard.classList.remove("hidden");
    
    const set = (sel, v) => {
      const el = document.getElementById(sel);
      if (el) el.value = v || "";
    };
    
    set("candidateName", data["Candidate Name"]);
    set("contactNo", data["Contact No"]);
    set("email", data.Email);
    set("skills", data.Skills);
    set("visaStatus", data["Visa status"]);
    set("skypeId", data["Skype ID"]);
    set("currentLocation", data["Current Location"]);
    set("dob", data["DOB(MM/DD)"]);
    set("relocation", data["Relocation (Yes/No)"]);
    set("onsiteRemote", data["Onsite or Remote:"]);
    set("bachelor", data["Bachelor: University//year of completion"]);
    set("masters", data["Master's /university/ year of completion"]);
    set("ssn", data["SSN no. last 4 digit"]);
    set("linkedin", data.LinkedIn);
    set("ppNo", data["PP No"]);
    set("totalExp", data["Total Exp"]);
    set("expUS", data["Total years of Exp in US"]);
    set("availProject", data["Availability for Project"]);
    set("availInterview", data["Availability for Interview"]);
    set("bestTime", data["Best Time to reach"]);
    set("resume", data.Resume);
    set("dl", data.DL);
    set("visaCopy", data["Visa Copy"]);
    set("title", data.Title);
    set("rate", data.Rate);
    set("recruiterName", data["Recruiter name"]);
    set("recruiterEmail", data["Recruiter email"]);
    set("recruiterPhone", data["Recruiter Phone"]);
    set("match", data.Match);
    
    // Set Active status
    const activeCheckbox = document.getElementById("candidateActive");
    const statusLabel = document.getElementById("statusLabel");
    if (activeCheckbox) {
      const isActive = data.Active === "Yes" || data.Active === true || data.Active === "true";
      activeCheckbox.checked = isActive;
      if (statusLabel) statusLabel.textContent = isActive ? "Active" : "Inactive";
    }
    
    // Show existing files
    if (data.Resume) showExistingFile(data.Resume, resumePreview, resumeDropArea, "resume");
    if (data.DL) showExistingFile(data.DL, dlPreview, dlDropArea, "dl");
    if (data["Visa Copy"]) showExistingFile(data["Visa Copy"], visaPreview, visaDropArea, "visa");
    
    if (submitBtn) submitBtn.innerHTML = "Update Candidate";
    if (cancelBtn) cancelBtn.classList.remove("hidden");
    formCard.scrollIntoView({ behavior: "smooth" });
    return;
  }

  // Delete button
  if (btn.classList.contains("btn-delete") && btn.closest("tr")) {
    const id = Number(btn.dataset.id);
    const name = btn.dataset.name || "this candidate";
    const modal = document.getElementById("deleteModal");
    document.getElementById("deleteText").textContent = `Are you sure you want to delete "${name}"?`;
    modal.classList.remove("hidden");
    modal.dataset.pendingDelete = id;
    return;
  }
});

/* ---------------- Delete Confirmation ---------------- */
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener("click", async () => {
    const modal = document.getElementById("deleteModal");
    const id = Number(modal.dataset.pendingDelete);
    if (!id) return;
    
    // Close modal immediately for fast UX
    modal.classList.add("hidden");
    
    // Remove from local data immediately (optimistic update)
    allRows = allRows.filter(r => Number(r.Unique) !== id);
    renderTable(allRows);
    updateStats();
    
    // Delete from database in background
    try {
      const { error } = await db.from("Email_Atm").delete().eq("Unique", id);
      if (error) console.error("Delete error:", error);
      
      // Sync to sheet in background (don't wait)
      syncToSheet("Email_Atm", "delete", { Unique: id }).catch(e => console.log("Sheet sync:", e));
      
      // Reload titles in background
      loadTitles().catch(e => console.log("Titles reload:", e));
    } catch (err) {
      console.error("Delete failed:", err);
      // Reload to restore state if delete failed
      loadData();
    }
  });
}

const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener("click", () => {
    document.getElementById("deleteModal").classList.add("hidden");
  });
}

/* ---------------- Helper: Get Next Sequential ID ---------------- */
async function getNextSequentialId() {
  try {
    // Get the MAXIMUM existing ID (not count, since IDs may have gaps)
    const { data, error } = await db
      .from("Email_Atm")
      .select("Unique")
      .order("Unique", { ascending: false })
      .limit(1);
    
    if (error) {
      console.error("Error getting max ID:", error);
      // Fallback: try counting
      const { count } = await db
        .from("Email_Atm")
        .select("*", { count: "exact", head: true });
      return (count || 0) + 100; // Add buffer to avoid conflicts
    }
    
    const maxId = data && data.length > 0 ? Number(data[0].Unique) : 0;
    const nextId = maxId + 1;
    console.log("Next ID will be:", nextId, "(max existing ID:", maxId, ")");
    return nextId;
    
  } catch (err) {
    console.error("Error getting next ID:", err);
    return Date.now(); // Fallback to timestamp
  }
}

/* ---------------- Form Submit (Insert/Update) ---------------- */
console.log("Form element found:", form);
console.log("FormCard element found:", formCard);

// Add submit handler - support both form submit and button click
const handleFormSubmit = async (e) => {
  if (e) e.preventDefault();
  console.log("=== Form submitted! ===");
    
    const candidateName = document.getElementById("candidateName")?.value.trim() || "";
    const existingResume = document.getElementById("resume")?.value || "";
    
    // Validate name is required
    if (!candidateName) {
      alert("Candidate name is required!");
      return;
    }
    
    console.log("Candidate name:", candidateName);
    console.log("Pending resume files:", pendingResumeFiles.length);
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span> Saving...';

    const getVal = (id) => document.getElementById(id)?.value.trim() || "";

    try {
      // Upload DL if new file selected (same for all records)
      const candidateTitle = getVal("title");
      
      let dlUrl = getVal("dl");
      if (pendingDlFile) {
        if (dlPreview) dlPreview.innerHTML = '<div class="file-uploading"><span class="spinner"></span> Uploading DL...</div>';
        const uploadedUrl = await uploadFileToDrive(pendingDlFile, candidateName, candidateTitle);
        if (uploadedUrl && uploadedUrl !== "UPLOADED_CHECK_DRIVE") {
          dlUrl = uploadedUrl;
        } else if (uploadedUrl === "UPLOADED_CHECK_DRIVE") {
          dlUrl = `[Uploaded: ${pendingDlFile.name}]`;
        }
      }

      // Upload Visa if new file selected
      let visaUrl = getVal("visaCopy");
      if (pendingVisaFile) {
        if (visaPreview) visaPreview.innerHTML = '<div class="file-uploading"><span class="spinner"></span> Uploading Visa...</div>';
        const uploadedUrl = await uploadFileToDrive(pendingVisaFile, candidateName, candidateTitle);
        if (uploadedUrl && uploadedUrl !== "UPLOADED_CHECK_DRIVE") {
          visaUrl = uploadedUrl;
        } else if (uploadedUrl === "UPLOADED_CHECK_DRIVE") {
          visaUrl = `[Uploaded: ${pendingVisaFile.name}]`;
        }
      }

      // Build base record (same for all resume records)
      const baseRecord = {
        "Candidate Name": candidateName,
      "Contact No": getVal("contactNo"),
      Email: getVal("email"),
      Skills: getVal("skills"),
      "Visa status": getVal("visaStatus"),
      "Skype ID": getVal("skypeId"),
      "Current Location": getVal("currentLocation"),
      "DOB(MM/DD)": getVal("dob"),
      "Relocation (Yes/No)": getVal("relocation"),
      "Onsite or Remote:": getVal("onsiteRemote"),
      "Bachelor: University//year of completion": getVal("bachelor"),
      "Master's /university/ year of completion": getVal("masters"),
      "SSN no. last 4 digit": getVal("ssn"),
      LinkedIn: getVal("linkedin"),
      "PP No": getVal("ppNo"),
      "Total Exp": getVal("totalExp"),
      "Total years of Exp in US": getVal("expUS"),
      "Availability for Project": getVal("availProject"),
      "Availability for Interview": getVal("availInterview"),
      "Best Time to reach": getVal("bestTime"),
        DL: dlUrl,
      Title: getVal("title"),
      Rate: getVal("rate"),
      "Recruiter name": getVal("recruiterName"),
      "Recruiter email": getVal("recruiterEmail"),
      "Recruiter Phone": getVal("recruiterPhone"),
      Match: getVal("match"),
        "Visa Copy": visaUrl,
        Active: document.getElementById("candidateActive")?.checked ? "Yes" : "No",
    };

      let savedRecords = [];

      if (editingId) {
        // UPDATE: Single record update
        let resumeUrl = getVal("resume");
        if (pendingResumeFiles.length > 0) {
          if (resumePreview) resumePreview.innerHTML = '<div class="file-uploading"><span class="spinner"></span> Uploading resume...</div>';
          const uploadedUrl = await uploadFileToDrive(pendingResumeFiles[0], candidateName, candidateTitle);
          if (uploadedUrl && uploadedUrl !== "UPLOADED_CHECK_DRIVE") {
            resumeUrl = uploadedUrl;
          } else if (uploadedUrl === "UPLOADED_CHECK_DRIVE") {
            resumeUrl = `[Uploaded: ${pendingResumeFiles[0].name}]`;
          }
        }
        
        const record = { ...baseRecord, Resume: resumeUrl };
        const { data, error } = await db
          .from("Email_Atm")
          .update(record)
          .eq("Unique", editingId)
          .select()
          .single();
        if (error) throw error;
        savedRecords.push(data);
        await syncToSheet("Email_Atm", "update", data);
        // Updated successfully - no alert needed
      } else {
        // INSERT NEW CANDIDATE(S)
        console.log("Creating new candidate(s)...");
        
        // Get starting ID
        let nextId = await getNextSequentialId();
        console.log("Next ID:", nextId);
        
        // If multiple resume files, create one record per file (each with its own title)
        // If no resume files, create one record with the form's title
        const filesToProcess = pendingResumeFiles.length > 0 ? pendingResumeFiles : [{ file: null, title: candidateTitle }];
        
        for (let i = 0; i < filesToProcess.length; i++) {
          const item = filesToProcess[i];
          const file = item?.file || null;
          // Use individual resume title, or fall back to form's title
          const resumeTitle = item?.title?.trim() || candidateTitle;
          let resumeUrl = getVal("resume") || "";
          
          // Upload resume file if exists
          if (file) {
            console.log(`Uploading resume ${i + 1}/${filesToProcess.length}: ${file.name} with title: "${resumeTitle}"`);
            if (resumePreview) {
              resumePreview.innerHTML = `<div class="file-uploading"><span class="spinner"></span> Uploading ${i + 1}/${filesToProcess.length}...</div>`;
            }
            try {
              // Use the individual resume's title for file naming
              const uploadedUrl = await uploadFileToDrive(file, candidateName, resumeTitle, i + 1);
              if (uploadedUrl && uploadedUrl !== "UPLOADED_CHECK_DRIVE") {
                resumeUrl = uploadedUrl;
              } else if (uploadedUrl === "UPLOADED_CHECK_DRIVE") {
                resumeUrl = `[Uploaded: ${file.name}]`;
              }
            } catch (uploadErr) {
              console.error("Upload error:", uploadErr);
              resumeUrl = `[Upload failed: ${file.name}]`;
            }
          }
          
          // Create record with unique sequential ID and individual title
          const record = {
            ...baseRecord,
            "Unique": nextId,
            Resume: resumeUrl,
            Title: resumeTitle,  // Each record gets its own title
          };
          
          console.log("Inserting candidate with ID:", nextId);
          console.log("Record data:", JSON.stringify(record, null, 2));

        const { data, error } = await db
          .from("Email_Atm")
          .insert([record])
          .select()
          .single();

          if (error) {
            console.error("Supabase insert error:", error);
            alert("Database error: " + error.message + "\n\nHint: " + (error.hint || "none"));
            nextId++;
            continue;
          }
          
          console.log("Successfully inserted! Data:", data);
          savedRecords.push(data);
          
          // Sync to Google Sheet
          try {
            await syncToSheet("Email_Atm", "insert", data);
            console.log("Synced to sheet");
          } catch (syncErr) {
            console.warn("Sheet sync failed:", syncErr);
          }
          
          nextId++;
        }
        
        if (savedRecords.length === 0) {
          throw new Error("Failed to save candidate. Check console for details.");
        }
        // Success - no alert needed
      }

      formCard.classList.add("hidden");
      resetForm();
      await loadData();
      await loadTitles();
    } catch (err) {
      alert("Error saving candidate: " + (err.message || err));
      console.error("Save error:", err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg> Save Candidate`;
    }
};

// Attach to form submit
if (form) {
  form.addEventListener("submit", handleFormSubmit);
} else {
  console.error("Form element not found! Check if id='candidateFormInner' exists in HTML");
}

// Also attach to submit button click as backup
if (submitBtn) {
  submitBtn.addEventListener("click", (e) => {
    if (!form) {
      e.preventDefault();
      handleFormSubmit(e);
    }
  });
}

/* ============================================
   TITLE MAP LOGIC
   ============================================ */

if (titleMapBtn) {
  titleMapBtn.addEventListener("click", async () => {
    await loadData();
    await loadTitles();
    titleMapPopup.classList.remove("hidden");
  });
}

if (closeTitleMap) {
  closeTitleMap.addEventListener("click", () => {
    titleMapPopup.classList.add("hidden");
  });
}

// Add Title Modal
if (openAddBtnTM) {
  openAddBtnTM.addEventListener("click", () => {
    modalBackTM.innerHTML = `
      <div class="modal-backdrop" onclick="document.getElementById('modalBack').classList.add('hidden')"></div>
      <div class="modal-container modal-sm">
        <h3 class="modal-title">Add New Title</h3>
        <div class="row">
          <label>Title Name</label>
          <input id="modalNewTitle" class="input" placeholder="e.g., Data Engineer" />
        </div>
        <div class="modal-buttons">
          <button id="modalCancel" class="btn btn-ghost">Cancel</button>
          <button id="modalSaveTitle" class="btn btn-primary">Save</button>
      </div>
    </div>
  `;
    modalBackTM.classList.remove("hidden");

    document.getElementById("modalCancel").addEventListener("click", () => {
      modalBackTM.classList.add("hidden");
    });
    
    document.getElementById("modalSaveTitle").addEventListener("click", async () => {
      const name = (document.getElementById("modalNewTitle").value || "").trim();
      if (!name) return alert("Please enter a title name");
      
        try {
          const { data, error } = await db
            .from("Title_Map")
            .insert([{ title: name, ids: "" }])
            .select()
            .single();
          if (error) throw error;
        
        // Sync to sheet with correct format: TitleID, IDs, Title
        await syncToSheet("Title_Map", "insert", {
          id: data.titleid,
          ids: [],
          title: name
        });
        
          modalBackTM.classList.add("hidden");
          await loadTitles();
        // Title added successfully - no alert needed
        } catch (err) {
        alert("Failed: " + (err.message || err));
        }
      });
  });
}

// Load Titles
async function loadTitles() {
  if (!listEl) return;
  listEl.innerHTML = '<div class="muted">Loading...</div>';
  
  try {
    const { data, error } = await db
      .from("Title_Map")
      .select("*")
      .order("titleid");
      
    if (error) {
      listEl.innerHTML = `<div class="muted">Error: ${error.message}</div>`;
      return;
    }
    
    titles = (data || []).map((t) => ({
      titleid: t.titleid,
      title: t.title || "",
      ids: t.ids || "",
    }));
    
    renderTitles();
    updateStats();
  } catch (err) {
    listEl.innerHTML = '<div class="muted">Error loading titles</div>';
  }
}

// Render Titles - matching your format: TitleID | IDs | Title
function renderTitles(filter = "") {
  if (!listEl) return;
  listEl.innerHTML = "";
  
  const filtered = titles.filter((t) =>
    (t.title || "").toLowerCase().includes(filter.toLowerCase())
  );
  
  if (!filtered.length) {
    listEl.innerHTML = '<div class="muted">No titles found</div>';
    return;
  }

  filtered.forEach((t) => {
    const card = document.createElement("div");
    card.className = "tile";
    
    const idsArr = (t.ids || "").toString().split(",").map((s) => s.trim()).filter(Boolean);
    const candidateCount = idsArr.length;
    
    // Build candidate names list
    const itemsHtml = idsArr.length > 0 ? idsArr.map((id) => {
      const name = candidatesMap.get(String(id)) || `ID: ${id}`;
      return `
        <div class="tm-item">
          <span>${encodeHTML(name)}</span>
          <button class="btn-delete small btn-delete-item" data-unique="${id}" data-titleid="${t.titleid}">Remove</button>
        </div>
      `;
    }).join("") : '<div class="muted">No candidates assigned</div>';

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
    <div>
          <div class="title-name">${encodeHTML(t.title)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
            Candidates: <strong style="color:var(--accent-blue);">${idsArr.length}</strong>
      </div>
    </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm btn-toggle" data-titleid="${t.titleid}">Details</button>
          <button class="btn btn-primary btn-sm btn-add-item" data-titleid="${t.titleid}">+ Add</button>
          <button class="btn-edit small edit-title-btn" data-id="${t.titleid}">Edit</button>
          <button class="btn-delete small delete-title-btn" data-id="${t.titleid}">Delete</button>
      </div>
    </div>
      <div class="tm-items" data-titleid="${t.titleid}" style="display:none;">
        ${itemsHtml}
  </div>
`;
    listEl.appendChild(card);
  });
}

// Title search
if (searchInputTM) {
  searchInputTM.addEventListener("input", () => {
    renderTitles(searchInputTM.value);
  });
}

// Title list click handlers
if (listEl) {
  listEl.addEventListener("click", async (e) => {
    const el = e.target;

    // Toggle details
    const toggleBtn = el.closest(".btn-toggle");
    if (toggleBtn) {
      const titleid = toggleBtn.dataset.titleid;
      const itemsDiv = listEl.querySelector(`.tm-items[data-titleid="${titleid}"]`);
      if (itemsDiv) itemsDiv.style.display = itemsDiv.style.display === "none" ? "block" : "none";
      return;
    }

    // Add candidate
    const addBtn = el.closest(".btn-add-item");
    if (addBtn) {
      openMultiSelectForTitle(Number(addBtn.dataset.titleid));
      return;
    }

    // Delete title
    const delTitle = el.closest(".delete-title-btn");
    if (delTitle) {
      const id = Number(delTitle.dataset.id);
      if (!confirm("Delete this title?")) return;
      try {
        const { error } = await db.from("Title_Map").delete().eq("titleid", id);
        if (error) throw error;
        await syncToSheet("Title_Map", "delete", { id });
        await loadTitles();
      } catch (err) {
        alert("Delete failed: " + (err.message || err));
      }
      return;
    }

    // Edit title
    const editTitle = el.closest(".edit-title-btn");
    if (editTitle) {
      const id = Number(editTitle.dataset.id);
      const t = titles.find((x) => x.titleid === id);
      if (!t) return;
      currentEdit = { type: "title", id };
      editFields.innerHTML = `
        <div class="row">
          <label>Title Name</label>
          <input id="editTitleInput" class="input" value="${encodeHTML(t.title)}" />
        </div>
    `;
      editBackTM.classList.remove("hidden");
      return;
    }

    // Remove candidate from title
    const deleteItem = el.closest(".btn-delete-item");
    if (deleteItem) {
      const titleid = Number(deleteItem.dataset.titleid);
      const unique = String(deleteItem.dataset.unique);
      if (!confirm("Remove this candidate?")) return;
      try {
        const { data: tdata } = await db.from("Title_Map").select("ids, title").eq("titleid", titleid).single();
        const existing = tdata.ids ? tdata.ids.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const newArr = existing.filter((x) => x !== unique);
        await db.from("Title_Map").update({ ids: newArr.join(",") }).eq("titleid", titleid);
        await syncToSheet("Title_Map", "update", { id: titleid, ids: newArr, title: tdata.title });
        await loadTitles();
      } catch (err) {
        alert("Failed: " + (err.message || err));
      }
      return;
    }
  });
}

// Edit modal handlers
if (editCancel) {
  editCancel.addEventListener("click", () => {
    editBackTM.classList.add("hidden");
    currentEdit = null;
  });
}

if (editSave) {
  editSave.addEventListener("click", async () => {
    if (!currentEdit) return;
    const titleVal = document.getElementById("editTitleInput").value.trim();
    const t = titles.find((x) => x.titleid === currentEdit.id);
    try {
      await db.from("Title_Map").update({ title: titleVal }).eq("titleid", currentEdit.id);
      const idsArray = t.ids ? t.ids.split(",").map((s) => s.trim()).filter(Boolean) : [];
      await syncToSheet("Title_Map", "update", { id: currentEdit.id, ids: idsArray, title: titleVal });
      editBackTM.classList.add("hidden");
      currentEdit = null;
      await loadTitles();
    } catch (err) {
      alert("Update failed: " + (err.message || err));
    }
  });
}

// Multi-select modal
function openMultiSelectForTitle(titleId) {
  const titleObj = titles.find((t) => t.titleid === titleId);
  if (!titleObj) return;

  const currentIds = (titleObj.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
  
  // Filter to show only active candidates
  const activeCandidates = allRows.filter(r => r.Active === "Yes" || r.Active === true || r.Active === "true");
  
  modalBackTM.innerHTML = `
    <div class="modal-backdrop" onclick="document.getElementById('modalBack').classList.add('hidden')"></div>
    <div class="modal-container" style="max-width:600px;padding:24px;">
      <h3 class="modal-title" style="margin-bottom:8px;">Add Candidates to: ${encodeHTML(titleObj.title)}</h3>
      <p style="font-size:13px;color:#64748b;margin-bottom:16px;">Only showing active candidates (${activeCandidates.length} available)</p>
      <div style="margin-bottom:12px;">
        <input id="multiSearch" class="input" placeholder="Search candidates..." style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;" />
      </div>
      <div id="multiList" style="max-height:350px;overflow:auto;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        ${activeCandidates.length > 0 ? activeCandidates.map((r) => {
          const uid = String(r.Unique ?? "");
          const name = r["Candidate Name"] ?? "";
            const checked = currentIds.includes(uid) ? "checked" : "";
            return `
            <label data-uid="${uid}" style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e2e8f0;cursor:pointer;background:#fff;transition:background 0.15s;">
              <input type="checkbox" class="multi-check" value="${uid}" ${checked} style="width:18px;height:18px;accent-color:#3b82f6;" />
              <span style="flex:1;font-size:14px;"><strong style="color:#3b82f6;">#${uid}</strong> - ${encodeHTML(name)}</span>
            </label>
          `;
        }).join("") : '<div style="padding:24px;text-align:center;color:#94a3b8;">No active candidates available. Mark candidates as Active first.</div>'}
      </div>
      <div class="modal-buttons" style="margin-top:20px;">
        <button id="multiCancel" class="btn btn-ghost">Cancel</button>
        <button id="multiSave" class="btn btn-primary">Save Selection</button>
      </div>
    </div>
  `;
  modalBackTM.classList.remove("hidden");

  const multiSearch = document.getElementById("multiSearch");
  const multiList = document.getElementById("multiList");
  
  if (multiSearch) {
    multiSearch.addEventListener("input", () => {
      const q = multiSearch.value.toLowerCase();
      multiList.querySelectorAll("label").forEach((lbl) => {
        lbl.style.display = !q || lbl.textContent.toLowerCase().includes(q) ? "flex" : "none";
      });
    });
  }

  document.getElementById("multiCancel").addEventListener("click", () => modalBackTM.classList.add("hidden"));

  document.getElementById("multiSave").addEventListener("click", async () => {
    const selected = Array.from(multiList.querySelectorAll(".multi-check:checked")).map((i) => i.value);
    try {
      await db.from("Title_Map").update({ ids: selected.join(",") }).eq("titleid", titleId);
      await syncToSheet("Title_Map", "update", { id: titleId, ids: selected, title: titleObj.title });
      modalBackTM.classList.add("hidden");
      await loadTitles();
    } catch (err) {
      alert("Failed: " + (err.message || err));
    }
  });
}

/* ============================================
   STATUS TOGGLE LABEL UPDATE
   ============================================ */
const activeCheckbox = document.getElementById("candidateActive");
const statusLabel = document.getElementById("statusLabel");
if (activeCheckbox && statusLabel) {
  activeCheckbox.addEventListener("change", () => {
    statusLabel.textContent = activeCheckbox.checked ? "Active" : "Inactive";
    statusLabel.style.color = activeCheckbox.checked ? "#16a34a" : "#dc2626";
  });
}

/* ============================================
   INITIALIZATION
   ============================================ */
(async function init() {
  await testConnection();
  await loadData();
  await loadTitles();
  updateStats();
})();


// // ============================================
// // CANDIDATE DASHBOARD - SCRIPT.JS
// // With Google Drive File Upload for Resume/DL
// // ============================================

// /* ---------------- Supabase Config ---------------- */
// const SUPABASE_URL = "https://wltbgkbljjhkwmomosxo.supabase.co";
// const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsdGJna2Jsampoa3dtb21vc3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzIzNjMsImV4cCI6MjA3OTMwODM2M30.eXiy1rQKCeYIGOtayYTXF3kQU5iTCt3iMuhhTC_oyLg";

// const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
//   auth: { persistSession: false },
// });

// /* ---------------- Google Apps Script Webhook ---------------- */
// // This handles file uploads AND sheet sync
// const EDGE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzi22VaAvIn6NCvDISJ3tsfJEymmTQLKmDhPqyxU2u8f4zIDHPNZYZhRi_jmDkZ9kldYg/exec";

// /* ---------------- DOM References ---------------- */
// const statusEl = document.getElementById("connectionStatus");
// const tableBody = document.querySelector("#dataTable tbody");
// const formCard = document.getElementById("candidateForm"); // The card container
// const form = document.getElementById("candidateFormInner"); // The actual form element
// const submitBtn = document.getElementById("submitBtn");
// const cancelBtn = document.getElementById("cancelEditBtn");
// const searchEl = document.getElementById("searchInput");
// const openFormBtn = document.getElementById("openFormBtn");
// const closeFormBtn = document.getElementById("closeFormBtn");

// // File upload elements
// const resumeFileInput = document.getElementById("resumeFile");
// const dlFileInput = document.getElementById("dlFile");
// const resumeDropArea = document.getElementById("resumeDropArea");
// const dlDropArea = document.getElementById("dlDropArea");
// const resumePreview = document.getElementById("resumePreview");
// const dlPreview = document.getElementById("dlPreview");
// const visaFileInput = document.getElementById("visaFile");
// const visaDropArea = document.getElementById("visaDropArea");
// const visaPreview = document.getElementById("visaPreview");
// const resumeHidden = document.getElementById("resume");
// const dlHidden = document.getElementById("dl");
// const visaHidden = document.getElementById("visaCopy");

// // Stats elements
// const totalCandidatesEl = document.getElementById("totalCandidates");
// const totalTitlesEl = document.getElementById("totalTitles");
// const todayDateEl = document.getElementById("todayDate");
// const tableCountEl = document.getElementById("tableCount");

// // Title Map UI refs
// const titleMapBtn = document.getElementById("navTitleMap");
// const titleMapPopup = document.getElementById("titleMapPopup");
// const closeTitleMap = document.getElementById("closeTitleMap");
// const listEl = document.getElementById("list");
// const searchInputTM = document.getElementById("searchInputTM");
// const openAddBtnTM = document.getElementById("openAddBtnTM");
// const modalBackTM = document.getElementById("modalBack");
// const editBackTM = document.getElementById("editBack");
// const editFields = document.getElementById("editFields");
// const editSave = document.getElementById("editSave");
// const editCancel = document.getElementById("editCancel");

// /* ---------------- State ---------------- */
// let allRows = [];
// let editingId = null;
// let titles = [];
// let currentEdit = null;
// let candidatesMap = new Map();

// // File upload state - support multiple resumes with individual titles
// let pendingResumeFiles = []; // Array of {file, title} objects for multiple resume files
// let pendingDlFile = null;
// let pendingVisaFile = null;

// /* ---------------- Helpers ---------------- */
// const encodeHTML = (str = "") =>
//   String(str).replace(/[&<>"'`=\/]/g, (s) => ({
//     "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
//     "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;",
//   }[s]));

// function setStatusOk(text) {
//   if (!statusEl) return;
//   statusEl.classList.remove("error");
//   statusEl.classList.add("ok");
//   const statusText = statusEl.querySelector(".status-text");
//   if (statusText) statusText.textContent = text;
// }

// function setStatusErr(text) {
//   if (!statusEl) return;
//   statusEl.classList.remove("ok");
//   statusEl.classList.add("error");
//   const statusText = statusEl.querySelector(".status-text");
//   if (statusText) statusText.textContent = text;
// }

// function updateStats() {
//   if (totalCandidatesEl) totalCandidatesEl.textContent = allRows.length;
//   if (totalTitlesEl) totalTitlesEl.textContent = titles.length;
//   if (todayDateEl) {
//     const today = new Date();
//     todayDateEl.textContent = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
//   }
//   if (tableCountEl) tableCountEl.textContent = `${allRows.length} records`;
// }

// /* ============================================
//    FILE UPLOAD TO GOOGLE DRIVE
//    ============================================ */

// // Convert file to base64
// function fileToBase64(file) {
//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();
//     reader.readAsDataURL(file);
//     reader.onload = () => {
//       const base64 = reader.result.split(",")[1];
//       resolve(base64);
//     };
//     reader.onerror = reject;
//   });
// }

// // Counter for unique file naming
// let fileUploadCounter = 1;

// // Upload file to Google Drive via Google Apps Script
// async function uploadFileToDrive(file, candidateName, title = "", fileIndex = 0) {
//   if (!file) return null;
  
//   try {
//     const base64 = await fileToBase64(file);
//     // Format: CandidateName_Title_Number.extension (e.g., Akhil_Java_1.pdf, Akhil_Java_2.pdf)
//     const namePart = (candidateName || 'NoName').replace(/[^a-zA-Z0-9]/g, '');
//     const titlePart = title ? '_' + title.replace(/[^a-zA-Z0-9]/g, '') : '';
//     const ext = file.name.split('.').pop();
//     // Add unique number to prevent overwriting
//     const uniqueNum = fileIndex > 0 ? `_${fileIndex}` : `_${fileUploadCounter++}`;
//     const fileName = `${namePart}${titlePart}${uniqueNum}.${ext}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    
//     const payload = JSON.stringify({
//       action: "upload",
//       file: {
//         name: fileName,
//         mimeType: file.type || 'application/octet-stream',
//         content: base64,
//       },
//     });
    
//     console.log("Uploading file:", fileName, "Size:", Math.round(base64.length / 1024), "KB");
    
//     // Method 1: Try direct fetch with redirect follow
//     try {
//       const response = await fetch(EDGE_SHEET_URL, {
//         method: "POST",
//         redirect: "follow",
//         body: payload,
//       });
      
//       if (response.ok) {
//         const result = await response.json();
//         console.log("Upload response:", result);
//         if (result.success && result.url) {
//           console.log("File uploaded successfully! URL:", result.url);
//           return result.url;
//         }
//       }
//     } catch (e) {
//       console.log("Direct fetch failed:", e.message);
//     }
    
//     // Method 2: Use iframe form submission (bypasses CORS completely)
//     console.log("Trying iframe upload method...");
//     const uploadResult = await uploadViaIframe(payload);
//     if (uploadResult && uploadResult !== "FAILED") {
//       return uploadResult;
//     }
    
//     // Method 3: Last resort - just log that upload needs manual check
//     console.warn("Could not confirm upload. File may or may not be in Drive.");
//     return null;
    
//   } catch (err) {
//     console.error("Upload error:", err);
//     return null;
//   }
// }

// // Upload via hidden iframe (bypasses CORS)
// function uploadViaIframe(payload) {
//   return new Promise((resolve) => {
//     const timeout = setTimeout(() => {
//       console.log("Iframe upload timeout - assuming success, check Drive");
//       cleanup();
//       resolve("UPLOADED_CHECK_DRIVE");
//     }, 15000); // 15 second timeout
    
//     const iframe = document.createElement("iframe");
//     iframe.style.display = "none";
//     iframe.name = "uploadFrame_" + Date.now();
    
//     const form = document.createElement("form");
//     form.method = "POST";
//     form.action = EDGE_SHEET_URL;
//     form.target = iframe.name;
//     form.style.display = "none";
    
//     const input = document.createElement("input");
//     input.type = "hidden";
//     input.name = "payload";
//     input.value = payload;
//     form.appendChild(input);
    
//     const cleanup = () => {
//       clearTimeout(timeout);
//       try {
//         document.body.removeChild(iframe);
//         document.body.removeChild(form);
//       } catch (e) {}
//     };
    
//     iframe.onload = () => {
//       // Try to read response from iframe
//       try {
//         const content = iframe.contentWindow.document.body.innerText;
//         console.log("Iframe response:", content);
//         const result = JSON.parse(content);
//         if (result.success && result.url) {
//           cleanup();
//           resolve(result.url);
//           return;
//         }
//       } catch (e) {
//         console.log("Could not read iframe response (CORS)");
//       }
//       cleanup();
//       resolve("UPLOADED_CHECK_DRIVE");
//     };
    
//     document.body.appendChild(iframe);
//     document.body.appendChild(form);
//     form.submit();
//   });
// }

// // Setup file input handlers
// function setupFileUpload(input, dropArea, previewEl, hiddenInput, type) {
//   if (!input || !dropArea) return;
  
//   // Click to select
//   dropArea.addEventListener("click", () => input.click());
  
//   // Drag and drop
//   dropArea.addEventListener("dragover", (e) => {
//     e.preventDefault();
//     dropArea.classList.add("dragover");
//   });
  
//   dropArea.addEventListener("dragleave", () => {
//     dropArea.classList.remove("dragover");
//   });
  
//   dropArea.addEventListener("drop", (e) => {
//     e.preventDefault();
//     dropArea.classList.remove("dragover");
//     const files = e.dataTransfer.files;
//     // Handle multiple files for resume, single for DL
//     if (type === "resume") {
//       for (let i = 0; i < files.length; i++) {
//         handleFileSelect(files[i], dropArea, previewEl, type);
//       }
//     } else if (files.length > 0) {
//       handleFileSelect(files[0], dropArea, previewEl, type);
//     }
//   });
  
//   // File input change
//   input.addEventListener("change", () => {
//     // Handle multiple files for resume
//     if (type === "resume") {
//       for (let i = 0; i < input.files.length; i++) {
//         handleFileSelect(input.files[i], dropArea, previewEl, type);
//       }
//     } else if (input.files.length > 0) {
//       handleFileSelect(input.files[0], dropArea, previewEl, type);
//     }
//   });
// }

// function handleFileSelect(file, dropArea, previewEl, type) {
//   // Validate file type
//   const allowedResume = [".pdf", ".doc", ".docx"];
//   const allowedDL = [".pdf", ".jpg", ".jpeg", ".png"];
//   const allowedVisa = [".pdf", ".jpg", ".jpeg", ".png"];
//   const allowed = type === "resume" ? allowedResume : (type === "visa" ? allowedVisa : allowedDL);
//   const ext = "." + file.name.split(".").pop().toLowerCase();
  
//   if (!allowed.includes(ext)) {
//     alert(`Invalid file type. Allowed: ${allowed.join(", ")}`);
//     return;
//   }
  
//   // Store pending file(s)
//   if (type === "resume") {
//     // Check if file already added
//     const exists = pendingResumeFiles.some(f => f.file.name === file.name && f.file.size === file.size);
//     if (!exists) {
//       // Store as object with file and title
//       pendingResumeFiles.push({ file: file, title: "" });
//     }
//     // Update preview to show all resume files with title inputs
//     updateResumePreview();
//   } else if (type === "visa") {
//     pendingVisaFile = file;
//     // Update UI for single Visa file
//     dropArea.classList.add("has-file");
//     previewEl.innerHTML = `
//       <div class="file-preview-item">
//         <span class="file-preview-name">${encodeHTML(file.name)}</span>
//         <button type="button" class="file-remove-btn" onclick="removeFile('visa')">✕</button>
//       </div>
//     `;
//   } else {
//     pendingDlFile = file;
//     // Update UI for single DL file
//     dropArea.classList.add("has-file");
//     previewEl.innerHTML = `
//       <div class="file-preview-item">
//         <span class="file-preview-name">${encodeHTML(file.name)}</span>
//         <button type="button" class="file-remove-btn" onclick="removeFile('dl')">✕</button>
//       </div>
//     `;
//   }
  
//   if (dropArea) dropArea.classList.add("has-file");
// }

// // Update resume preview to show all files with title inputs
// function updateResumePreview() {
//   if (!resumePreview) return;
  
//   if (pendingResumeFiles.length === 0) {
//     resumePreview.innerHTML = "";
//     if (resumeDropArea) resumeDropArea.classList.remove("has-file");
//     return;
//   }
  
//   if (resumeDropArea) resumeDropArea.classList.add("has-file");
  
//   let html = "";
  
//   if (pendingResumeFiles.length > 1) {
//     html = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;font-weight:500;">${pendingResumeFiles.length} files - Enter title for each resume:</div>`;
//   }
  
//   html += pendingResumeFiles.map((item, index) => `
//     <div class="file-preview-item" style="flex-direction:column;align-items:stretch;gap:6px;padding:8px;background:var(--color-surface);border-radius:6px;margin-bottom:6px;">
//       <div style="display:flex;justify-content:space-between;align-items:center;">
//         <span class="file-preview-name" style="font-weight:500;">${encodeHTML(item.file.name)}</span>
//         <button type="button" class="file-remove-btn" onclick="removeResumeFile(${index})">✕</button>
//       </div>
//       <input type="text" 
//         class="resume-title-input" 
//         data-resume-index="${index}"
//         placeholder="Enter title for this resume (e.g., Java Developer)" 
//         value="${encodeHTML(item.title || '')}"
//         onchange="updateResumeTitle(${index}, this.value)"
//         style="width:100%;padding:6px 10px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;background:var(--color-card);"
//       />
//     </div>
//   `).join("");
  
//   resumePreview.innerHTML = html;
// }

// // Update title for a specific resume
// window.updateResumeTitle = function(index, title) {
//   if (pendingResumeFiles[index]) {
//     pendingResumeFiles[index].title = title;
//     console.log(`Resume ${index + 1} title set to: "${title}"`);
//   }
// };

// // Global function to remove file
// window.removeFile = function(type) {
//   if (type === "resume") {
//     pendingResumeFiles = [];
//     if (resumeDropArea) resumeDropArea.classList.remove("has-file");
//     if (resumePreview) resumePreview.innerHTML = "";
//     if (resumeFileInput) resumeFileInput.value = "";
//   } else if (type === "visa") {
//     pendingVisaFile = null;
//     if (visaDropArea) visaDropArea.classList.remove("has-file");
//     if (visaPreview) visaPreview.innerHTML = "";
//     if (visaFileInput) visaFileInput.value = "";
//   } else {
//     pendingDlFile = null;
//     if (dlDropArea) dlDropArea.classList.remove("has-file");
//     if (dlPreview) dlPreview.innerHTML = "";
//     if (dlFileInput) dlFileInput.value = "";
//   }
// };

// // Remove specific resume file by index
// window.removeResumeFile = function(index) {
//   pendingResumeFiles.splice(index, 1);
//   updateResumePreview();
//   if (resumeFileInput) resumeFileInput.value = "";
// };

// // Initialize file uploads
// setupFileUpload(resumeFileInput, resumeDropArea, resumePreview, resumeHidden, "resume");
// setupFileUpload(dlFileInput, dlDropArea, dlPreview, dlHidden, "dl");
// setupFileUpload(visaFileInput, visaDropArea, visaPreview, visaHidden, "visa");

// // Show existing file link
// function showExistingFile(url, previewEl, dropArea, type) {
//   if (!url || !previewEl) return;
  
//   if (dropArea) dropArea.classList.add("has-file");
//   previewEl.innerHTML = `
//     <div class="file-preview-item">
//       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
//         <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
//         <polyline points="14 2 14 8 20 8"/>
//       </svg>
//       <a href="${encodeHTML(url)}" target="_blank" class="file-preview-link">View existing file</a>
//       <button type="button" class="file-remove-btn" onclick="clearExistingFile('${type}')">
//         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
//           <path d="M18 6L6 18M6 6l12 12"/>
//         </svg>
//       </button>
//     </div>
//   `;
// }

// window.clearExistingFile = function(type) {
//   if (type === "resume") {
//     if (resumeHidden) resumeHidden.value = "";
//     if (resumeDropArea) resumeDropArea.classList.remove("has-file");
//     if (resumePreview) resumePreview.innerHTML = "";
//   } else {
//     if (dlHidden) dlHidden.value = "";
//     if (dlDropArea) dlDropArea.classList.remove("has-file");
//     if (dlPreview) dlPreview.innerHTML = "";
//   }
// };

// /* ---------------- Sheet Sync Helper ---------------- */
// async function syncToSheet(table, action, record) {
//   console.log("=== SHEET SYNC ===");
//   console.log("Table:", table);
//   console.log("Action:", action);
//   console.log("Record:", JSON.stringify(record));
  
//   try {
//     const payload = { table, action, record };
//     const payloadStr = JSON.stringify(payload);
//     console.log("Payload:", payloadStr);
    
//     // Try direct fetch first
//     try {
//       const response = await fetch(EDGE_SHEET_URL, {
//         method: "POST",
//         redirect: "follow",
//         body: payloadStr,
//       });
      
//       if (response.ok) {
//         const result = await response.json();
//         console.log("Sheet sync response:", result);
//         return result;
//       }
//     } catch (fetchErr) {
//       console.log("Direct fetch failed, trying no-cors:", fetchErr.message);
//     }
    
//     // Fallback to no-cors
//     await fetch(EDGE_SHEET_URL, {
//       method: "POST",
//       mode: "no-cors",
//       headers: { "Content-Type": "text/plain" },
//       body: payloadStr,
//     });
    
//     console.log("Sheet sync sent (no-cors mode)");
//   } catch (err) {
//     console.error("Sheet sync failed:", err);
//   }
// }

// /* ---------------- Connection Test ---------------- */
// async function testConnection() {
//   try {
//     const { count, error } = await supabase
//       .from("Email_Atm")
//       .select("*", { count: "exact", head: true });
//     if (error) throw error;
//     setStatusOk(`Connected (${count})`);
//   } catch (e) {
//     setStatusErr("Disconnected");
//   }
// }

// /* ---------------- Load Candidates ---------------- */
// async function loadData() {
//   console.log("Loading data from Supabase...");
//   console.log("URL:", SUPABASE_URL);
  
//   try {
//     const { data, error } = await supabase.from("Email_Atm").select("*");
    
//     if (error) {
//       console.error("Supabase error:", error.message, error.details, error.hint);
//       alert("Database error: " + error.message);
//       setStatusErr("Query failed");
//       return;
//     }
    
//     console.log("Data loaded:", data?.length, "records");
//     allRows = data || [];
//     candidatesMap = new Map();
//     allRows.forEach((r) => {
//       candidatesMap.set(String(r.Unique ?? ""), r["Candidate Name"] ?? "");
//     });
//     renderTable(allRows);
//     updateStats();
//     setStatusOk("Connected (" + allRows.length + ")");
//   } catch (err) {
//     console.error("loadData error:", err);
//     alert("Failed to load data: " + err.message);
//     setStatusErr("Error");
//   }
// }

// /* ---------------- Render Table ---------------- */
// function renderTable(rows) {
//   console.log("Rendering table with", rows.length, "rows");
//   if (!tableBody) {
//     console.error("tableBody element not found!");
//     return;
//   }
//   // Sort by ID ascending (1, 2, 3... oldest first)
//   rows = rows.sort((a, b) => Number(a.Unique) - Number(b.Unique));
//   tableBody.innerHTML = "";
  
//   console.log("First 3 rows:", rows.slice(0, 3).map(r => ({ id: r.Unique, name: r["Candidate Name"] })));

//   rows.forEach((row) => {
//     const skillsRaw = row.Skills || "";
//     const skills = skillsRaw ? encodeHTML(skillsRaw.substring(0, 50)) + (skillsRaw.length > 50 ? "..." : "") : "-";
    
//     // Helper to create file link - check if it's a valid URL or placeholder
//     const createFileLink = (url, label, icon) => {
//       if (!url) return '<span class="no-file">-</span>';
//       // Check if it's a placeholder like "[Uploaded: filename]"
//       if (url.startsWith("[Uploaded:")) {
//         const filename = url.replace("[Uploaded:", "").replace("]", "").trim();
//         return `<span class="file-pending" title="File uploaded but link unavailable. Check Google Drive.">${encodeHTML(filename)}</span>`;
//       }
//       // Check if it's a valid URL
//       if (url.startsWith("http")) {
//         return `<a href="${encodeHTML(url)}" target="_blank" class="file-link">${label}</a>`;
//       }
//       return `<span class="no-file">${encodeHTML(url)}</span>`;
//     };
    
//     const resumeLink = createFileLink(row.Resume, "Resume", "");
//     const dlLink = createFileLink(row.DL, "DL", "");
//     const visaLink = createFileLink(row["Visa Copy"], "Visa", "");
//     const isActive = row.Active === "Yes" || row.Active === true || row.Active === "true";
//     const statusBadge = isActive 
//       ? `<span class="status-badge active" data-id="${row.Unique}" title="Click to deactivate"><span class="status-dot"></span>Active</span>`
//       : `<span class="status-badge inactive" data-id="${row.Unique}" title="Click to activate"><span class="status-dot"></span>Inactive</span>`;

//     const tr = document.createElement("tr");
//     tr.innerHTML = `
//       <td><span style="color: var(--accent-purple); font-weight: 600;">#${row.Unique}</span></td>
//       <td>${statusBadge}</td>
//       <td><strong>${encodeHTML(row["Candidate Name"] || "-")}</strong></td>
//       <td>${encodeHTML(row["Contact No"] || "-")}</td>
//       <td>${encodeHTML(row.Email || "-")}</td>
//       <td title="${encodeHTML(skillsRaw)}">${skills}</td>
//       <td><span class="badge">${encodeHTML(row["Visa status"] || "-")}</span></td>
//       <td>${encodeHTML(row["Current Location"] || "-")}</td>
//       <td>${encodeHTML(row.Title || "-")}</td>
//       <td>${encodeHTML(row["Total Exp"] || "-")}</td>
//       <td><strong style="color: var(--accent-green);">${encodeHTML(row.Rate || "-")}</strong></td>
//       <td>${encodeHTML(row["Recruiter name"] || "-")}</td>
//       <td>${resumeLink}</td>
//       <td>${dlLink}</td>
//       <td>${visaLink}</td>
//       <td class="actions">
//         <button class="btn-edit" data-id="${row.Unique}">Edit</button>
//         <button class="btn-delete" data-id="${row.Unique}" data-name="${encodeHTML(row["Candidate Name"] || "")}">Delete</button>
//       </td>
//     `;
//     tableBody.appendChild(tr);
//   });
  
//   if (tableCountEl) tableCountEl.textContent = `${rows.length} records`;
// }

// /* ---------------- Search ---------------- */
// if (searchEl) {
//   searchEl.addEventListener("input", () => {
//     const q = (searchEl.value || "").toLowerCase();
//     if (!q) return renderTable(allRows);
//     const filtered = allRows.filter((r) => {
//       return [r["Candidate Name"], r.Email, r.Skills, r.Title, r["Recruiter name"], r["Current Location"]]
//         .map((v) => (v || "").toString().toLowerCase())
//         .some((v) => v.includes(q));
//     });
//     renderTable(filtered);
//   });
// }

// /* ---------------- Form Toggle ---------------- */
// function resetForm() {
//   if (form) form.reset();
//   editingId = null;
//   pendingResumeFiles = []; // Clear all pending resume files
//   pendingDlFile = null;
//   pendingVisaFile = null;
//   if (resumeDropArea) resumeDropArea.classList.remove("has-file");
//   if (dlDropArea) dlDropArea.classList.remove("has-file");
//   if (visaDropArea) visaDropArea.classList.remove("has-file");
//   if (resumePreview) resumePreview.innerHTML = "";
//   if (dlPreview) dlPreview.innerHTML = "";
//   if (visaPreview) visaPreview.innerHTML = "";
//   if (resumeFileInput) resumeFileInput.value = "";
//   if (dlFileInput) dlFileInput.value = "";
//   if (visaFileInput) visaFileInput.value = "";
//   if (cancelBtn) cancelBtn.classList.add("hidden");
// }

// if (openFormBtn) {
//   openFormBtn.addEventListener("click", () => {
//     if (!formCard.classList.contains("hidden")) {
//       formCard.classList.add("hidden");
//       resetForm();
//       return;
//     }
//     resetForm();
//     formCard.classList.remove("hidden");
//     formCard.scrollIntoView({ behavior: "smooth" });
//   });
// }

// if (closeFormBtn) {
//   closeFormBtn.addEventListener("click", () => {
//     formCard.classList.add("hidden");
//     resetForm();
//   });
// }

// if (cancelBtn) {
//   cancelBtn.addEventListener("click", () => {
//     formCard.classList.add("hidden");
//     resetForm();
//   });
// }

// /* ---------------- Status Toggle Click Handler ---------------- */
// document.addEventListener("click", async (e) => {
//   const statusBadge = e.target.closest(".status-badge");
//   if (statusBadge) {
//     const id = Number(statusBadge.dataset.id);
//     if (!id) return;
    
//     const isCurrentlyActive = statusBadge.classList.contains("active");
//     const newStatus = isCurrentlyActive ? "No" : "Yes";
    
//     try {
//       // Update in Supabase
//       const { data, error } = await supabase
//         .from("Email_Atm")
//         .update({ Active: newStatus })
//         .eq("Unique", id)
//         .select()
//         .single();
      
//       if (error) throw error;
      
//       // Sync to Google Sheet
//       await syncToSheet("Email_Atm", "update", data);
//       console.log(`Status updated to ${newStatus} for candidate ${id}`);
      
//       // Update local data and re-render
//       const row = allRows.find(r => r.Unique === id);
//       if (row) row.Active = newStatus;
//       renderTable(allRows);
      
//       // If candidate becomes inactive, remove from all Title Maps
//       if (newStatus === "No") {
//         console.log(`Candidate ${id} is now inactive, removing from Title Maps...`);
//         await removeFromAllTitleMaps(String(id));
//       }
      
//     } catch (err) {
//       console.error("Status toggle failed:", err);
//       alert("Failed to update status: " + err.message);
//     }
//     return;
//   }
// });

// // Helper: Remove candidate from all Title Maps
// async function removeFromAllTitleMaps(candidateId) {
//   try {
//     console.log("Removing candidate", candidateId, "from all Title Maps...");
    
//     // Get all title maps from Supabase
//     const { data: titleMaps, error } = await supabase
//       .from("Title_Map")
//       .select("*");
    
//     if (error) {
//       console.error("Error fetching title maps:", error);
//       throw error;
//     }
    
//     console.log("Found", titleMaps.length, "title maps to check");
    
//     // Check each title map and remove the candidate if present
//     for (const tm of titleMaps) {
//       const currentIds = tm.ids ? tm.ids.split(",").map(s => s.trim()).filter(Boolean) : [];
//       console.log(`Title "${tm.title}" has IDs:`, currentIds);
      
//       if (currentIds.includes(candidateId)) {
//         const newIds = currentIds.filter(id => id !== candidateId);
//         console.log(`Removing ${candidateId} from "${tm.title}". New IDs:`, newIds);
        
//         // Update in Supabase
//         const { error: updateError } = await supabase
//           .from("Title_Map")
//           .update({ ids: newIds.join(",") })
//           .eq("titleid", tm.titleid);
        
//         if (updateError) {
//           console.error(`Error updating title map ${tm.titleid}:`, updateError);
//         } else {
//           console.log(`Successfully removed candidate ${candidateId} from title "${tm.title}"`);
          
//           // Sync to Google Sheet - send ids as comma-separated string
//           await syncToSheet("Title_Map", "update", {
//             id: tm.titleid,
//             ids: newIds.join(","),  // Convert array to string for sheet
//             title: tm.title
//           });
//           console.log("Sheet sync triggered for Title_Map update");
//         }
//       }
//     }
    
//     // Reload titles to reflect changes
//     await loadTitles();
//     console.log("Title Maps reloaded");
    
//   } catch (err) {
//     console.error("Error removing from title maps:", err);
//   }
// }

// /* ---------------- Edit/Delete Click Handlers ---------------- */
// document.addEventListener("click", async (e) => {
//   const btn = e.target.closest("button");
//   if (!btn) return;

//   // Edit button
//   if (btn.classList.contains("btn-edit") && btn.closest("tr")) {
//     const id = Number(btn.dataset.id);
//     if (!id) return;
    
//     const { data, error } = await supabase
//       .from("Email_Atm")
//       .select("*")
//       .eq("Unique", id)
//       .single();
      
//     if (error) return alert("Error loading record: " + error.message);
    
//     resetForm();
//     editingId = id; // Set AFTER resetForm() so it doesn't get cleared
//     formCard.classList.remove("hidden");
    
//     const set = (sel, v) => {
//       const el = document.getElementById(sel);
//       if (el) el.value = v || "";
//     };
    
//     set("candidateName", data["Candidate Name"]);
//     set("contactNo", data["Contact No"]);
//     set("email", data.Email);
//     set("skills", data.Skills);
//     set("visaStatus", data["Visa status"]);
//     set("skypeId", data["Skype ID"]);
//     set("currentLocation", data["Current Location"]);
//     set("dob", data["DOB(MM/DD)"]);
//     set("relocation", data["Relocation (Yes/No)"]);
//     set("onsiteRemote", data["Onsite or Remote:"]);
//     set("bachelor", data["Bachelor: University//year of completion"]);
//     set("masters", data["Master's /university/ year of completion"]);
//     set("ssn", data["SSN no. last 4 digit"]);
//     set("linkedin", data.LinkedIn);
//     set("ppNo", data["PP No"]);
//     set("totalExp", data["Total Exp"]);
//     set("expUS", data["Total years of Exp in US"]);
//     set("availProject", data["Availability for Project"]);
//     set("availInterview", data["Availability for Interview"]);
//     set("bestTime", data["Best Time to reach"]);
//     set("resume", data.Resume);
//     set("dl", data.DL);
//     set("visaCopy", data["Visa Copy"]);
//     set("title", data.Title);
//     set("rate", data.Rate);
//     set("recruiterName", data["Recruiter name"]);
//     set("recruiterEmail", data["Recruiter email"]);
//     set("recruiterPhone", data["Recruiter Phone"]);
//     set("match", data.Match);
    
//     // Set Active status
//     const activeCheckbox = document.getElementById("candidateActive");
//     const statusLabel = document.getElementById("statusLabel");
//     if (activeCheckbox) {
//       const isActive = data.Active === "Yes" || data.Active === true || data.Active === "true";
//       activeCheckbox.checked = isActive;
//       if (statusLabel) statusLabel.textContent = isActive ? "Active" : "Inactive";
//     }
    
//     // Show existing files
//     if (data.Resume) showExistingFile(data.Resume, resumePreview, resumeDropArea, "resume");
//     if (data.DL) showExistingFile(data.DL, dlPreview, dlDropArea, "dl");
//     if (data["Visa Copy"]) showExistingFile(data["Visa Copy"], visaPreview, visaDropArea, "visa");
    
//     if (submitBtn) submitBtn.innerHTML = "Update Candidate";
//     if (cancelBtn) cancelBtn.classList.remove("hidden");
//     formCard.scrollIntoView({ behavior: "smooth" });
//     return;
//   }

//   // Delete button
//   if (btn.classList.contains("btn-delete") && btn.closest("tr")) {
//     const id = Number(btn.dataset.id);
//     const name = btn.dataset.name || "this candidate";
//     const modal = document.getElementById("deleteModal");
//     document.getElementById("deleteText").textContent = `Are you sure you want to delete "${name}"?`;
//     modal.classList.remove("hidden");
//     modal.dataset.pendingDelete = id;
//     return;
//   }
// });

// /* ---------------- Delete Confirmation ---------------- */
// const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
// if (confirmDeleteBtn) {
//   confirmDeleteBtn.addEventListener("click", async () => {
//     const modal = document.getElementById("deleteModal");
//     const id = Number(modal.dataset.pendingDelete);
//     if (!id) return;
    
//     // Close modal immediately for fast UX
//     modal.classList.add("hidden");
    
//     // Remove from local data immediately (optimistic update)
//     allRows = allRows.filter(r => Number(r.Unique) !== id);
//     renderTable(allRows);
//     updateStats();
    
//     // Delete from database in background
//     try {
//       const { error } = await supabase.from("Email_Atm").delete().eq("Unique", id);
//       if (error) console.error("Delete error:", error);
      
//       // Sync to sheet in background (don't wait)
//       syncToSheet("Email_Atm", "delete", { Unique: id }).catch(e => console.log("Sheet sync:", e));
      
//       // Reload titles in background
//       loadTitles().catch(e => console.log("Titles reload:", e));
//     } catch (err) {
//       console.error("Delete failed:", err);
//       // Reload to restore state if delete failed
//       loadData();
//     }
//   });
// }

// const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
// if (cancelDeleteBtn) {
//   cancelDeleteBtn.addEventListener("click", () => {
//     document.getElementById("deleteModal").classList.add("hidden");
//   });
// }

// /* ---------------- Helper: Get Next Sequential ID ---------------- */
// async function getNextSequentialId() {
//   try {
//     // Get the MAXIMUM existing ID (not count, since IDs may have gaps)
//     const { data, error } = await supabase
//       .from("Email_Atm")
//       .select("Unique")
//       .order("Unique", { ascending: false })
//       .limit(1);
    
//     if (error) {
//       console.error("Error getting max ID:", error);
//       // Fallback: try counting
//       const { count } = await supabase
//         .from("Email_Atm")
//         .select("*", { count: "exact", head: true });
//       return (count || 0) + 100; // Add buffer to avoid conflicts
//     }
    
//     const maxId = data && data.length > 0 ? Number(data[0].Unique) : 0;
//     const nextId = maxId + 1;
//     console.log("Next ID will be:", nextId, "(max existing ID:", maxId, ")");
//     return nextId;
    
//   } catch (err) {
//     console.error("Error getting next ID:", err);
//     return Date.now(); // Fallback to timestamp
//   }
// }

// /* ---------------- Form Submit (Insert/Update) ---------------- */
// console.log("Form element found:", form);
// console.log("FormCard element found:", formCard);

// // Add submit handler - support both form submit and button click
// const handleFormSubmit = async (e) => {
//   if (e) e.preventDefault();
//   console.log("=== Form submitted! ===");
    
//     const candidateName = document.getElementById("candidateName")?.value.trim() || "";
//     const existingResume = document.getElementById("resume")?.value || "";
    
//     // Validate name is required
//     if (!candidateName) {
//       alert("Candidate name is required!");
//       return;
//     }
    
//     console.log("Candidate name:", candidateName);
//     console.log("Pending resume files:", pendingResumeFiles.length);
    
//     submitBtn.disabled = true;
//     submitBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span> Saving...';

//     const getVal = (id) => document.getElementById(id)?.value.trim() || "";

//     try {
//       // Upload DL if new file selected (same for all records)
//       const candidateTitle = getVal("title");
      
//       let dlUrl = getVal("dl");
//       if (pendingDlFile) {
//         if (dlPreview) dlPreview.innerHTML = '<div class="file-uploading"><span class="spinner"></span> Uploading DL...</div>';
//         const uploadedUrl = await uploadFileToDrive(pendingDlFile, candidateName, candidateTitle);
//         if (uploadedUrl && uploadedUrl !== "UPLOADED_CHECK_DRIVE") {
//           dlUrl = uploadedUrl;
//         } else if (uploadedUrl === "UPLOADED_CHECK_DRIVE") {
//           dlUrl = `[Uploaded: ${pendingDlFile.name}]`;
//         }
//       }

//       // Upload Visa if new file selected
//       let visaUrl = getVal("visaCopy");
//       if (pendingVisaFile) {
//         if (visaPreview) visaPreview.innerHTML = '<div class="file-uploading"><span class="spinner"></span> Uploading Visa...</div>';
//         const uploadedUrl = await uploadFileToDrive(pendingVisaFile, candidateName, candidateTitle);
//         if (uploadedUrl && uploadedUrl !== "UPLOADED_CHECK_DRIVE") {
//           visaUrl = uploadedUrl;
//         } else if (uploadedUrl === "UPLOADED_CHECK_DRIVE") {
//           visaUrl = `[Uploaded: ${pendingVisaFile.name}]`;
//         }
//       }

//       // Build base record (same for all resume records)
//       const baseRecord = {
//         "Candidate Name": candidateName,
//       "Contact No": getVal("contactNo"),
//       Email: getVal("email"),
//       Skills: getVal("skills"),
//       "Visa status": getVal("visaStatus"),
//       "Skype ID": getVal("skypeId"),
//       "Current Location": getVal("currentLocation"),
//       "DOB(MM/DD)": getVal("dob"),
//       "Relocation (Yes/No)": getVal("relocation"),
//       "Onsite or Remote:": getVal("onsiteRemote"),
//       "Bachelor: University//year of completion": getVal("bachelor"),
//       "Master's /university/ year of completion": getVal("masters"),
//       "SSN no. last 4 digit": getVal("ssn"),
//       LinkedIn: getVal("linkedin"),
//       "PP No": getVal("ppNo"),
//       "Total Exp": getVal("totalExp"),
//       "Total years of Exp in US": getVal("expUS"),
//       "Availability for Project": getVal("availProject"),
//       "Availability for Interview": getVal("availInterview"),
//       "Best Time to reach": getVal("bestTime"),
//         DL: dlUrl,
//       Title: getVal("title"),
//       Rate: getVal("rate"),
//       "Recruiter name": getVal("recruiterName"),
//       "Recruiter email": getVal("recruiterEmail"),
//       "Recruiter Phone": getVal("recruiterPhone"),
//       Match: getVal("match"),
//         "Visa Copy": visaUrl,
//         Active: document.getElementById("candidateActive")?.checked ? "Yes" : "No",
//     };

//       let savedRecords = [];

//       if (editingId) {
//         // UPDATE: Single record update
//         let resumeUrl = getVal("resume");
//         if (pendingResumeFiles.length > 0) {
//           if (resumePreview) resumePreview.innerHTML = '<div class="file-uploading"><span class="spinner"></span> Uploading resume...</div>';
//           const uploadedUrl = await uploadFileToDrive(pendingResumeFiles[0], candidateName, candidateTitle);
//           if (uploadedUrl && uploadedUrl !== "UPLOADED_CHECK_DRIVE") {
//             resumeUrl = uploadedUrl;
//           } else if (uploadedUrl === "UPLOADED_CHECK_DRIVE") {
//             resumeUrl = `[Uploaded: ${pendingResumeFiles[0].name}]`;
//           }
//         }
        
//         const record = { ...baseRecord, Resume: resumeUrl };
//         const { data, error } = await supabase
//           .from("Email_Atm")
//           .update(record)
//           .eq("Unique", editingId)
//           .select()
//           .single();
//         if (error) throw error;
//         savedRecords.push(data);
//         await syncToSheet("Email_Atm", "update", data);
//         // Updated successfully - no alert needed
//       } else {
//         // INSERT NEW CANDIDATE(S)
//         console.log("Creating new candidate(s)...");
        
//         // Get starting ID
//         let nextId = await getNextSequentialId();
//         console.log("Next ID:", nextId);
        
//         // If multiple resume files, create one record per file (each with its own title)
//         // If no resume files, create one record with the form's title
//         const filesToProcess = pendingResumeFiles.length > 0 ? pendingResumeFiles : [{ file: null, title: candidateTitle }];
        
//         for (let i = 0; i < filesToProcess.length; i++) {
//           const item = filesToProcess[i];
//           const file = item?.file || null;
//           // Use individual resume title, or fall back to form's title
//           const resumeTitle = item?.title?.trim() || candidateTitle;
//           let resumeUrl = getVal("resume") || "";
          
//           // Upload resume file if exists
//           if (file) {
//             console.log(`Uploading resume ${i + 1}/${filesToProcess.length}: ${file.name} with title: "${resumeTitle}"`);
//             if (resumePreview) {
//               resumePreview.innerHTML = `<div class="file-uploading"><span class="spinner"></span> Uploading ${i + 1}/${filesToProcess.length}...</div>`;
//             }
//             try {
//               // Use the individual resume's title for file naming
//               const uploadedUrl = await uploadFileToDrive(file, candidateName, resumeTitle, i + 1);
//               if (uploadedUrl && uploadedUrl !== "UPLOADED_CHECK_DRIVE") {
//                 resumeUrl = uploadedUrl;
//               } else if (uploadedUrl === "UPLOADED_CHECK_DRIVE") {
//                 resumeUrl = `[Uploaded: ${file.name}]`;
//               }
//             } catch (uploadErr) {
//               console.error("Upload error:", uploadErr);
//               resumeUrl = `[Upload failed: ${file.name}]`;
//             }
//           }
          
//           // Create record with unique sequential ID and individual title
//           const record = {
//             ...baseRecord,
//             "Unique": nextId,
//             Resume: resumeUrl,
//             Title: resumeTitle,  // Each record gets its own title
//           };
          
//           console.log("Inserting candidate with ID:", nextId);
//           console.log("Record data:", JSON.stringify(record, null, 2));

//         const { data, error } = await supabase
//           .from("Email_Atm")
//           .insert([record])
//           .select()
//           .single();

//           if (error) {
//             console.error("Supabase insert error:", error);
//             alert("Database error: " + error.message + "\n\nHint: " + (error.hint || "none"));
//             nextId++;
//             continue;
//           }
          
//           console.log("Successfully inserted! Data:", data);
//           savedRecords.push(data);
          
//           // Sync to Google Sheet
//           try {
//             await syncToSheet("Email_Atm", "insert", data);
//             console.log("Synced to sheet");
//           } catch (syncErr) {
//             console.warn("Sheet sync failed:", syncErr);
//           }
          
//           nextId++;
//         }
        
//         if (savedRecords.length === 0) {
//           throw new Error("Failed to save candidate. Check console for details.");
//         }
//         // Success - no alert needed
//       }

//       formCard.classList.add("hidden");
//       resetForm();
//       await loadData();
//       await loadTitles();
//     } catch (err) {
//       alert("Error saving candidate: " + (err.message || err));
//       console.error("Save error:", err);
//     } finally {
//       submitBtn.disabled = false;
//       submitBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px">
//         <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
//         <polyline points="17 21 17 13 7 13 7 21"/>
//         <polyline points="7 3 7 8 15 8"/>
//       </svg> Save Candidate`;
//     }
// };

// // Attach to form submit
// if (form) {
//   form.addEventListener("submit", handleFormSubmit);
// } else {
//   console.error("Form element not found! Check if id='candidateFormInner' exists in HTML");
// }

// // Also attach to submit button click as backup
// if (submitBtn) {
//   submitBtn.addEventListener("click", (e) => {
//     if (!form) {
//       e.preventDefault();
//       handleFormSubmit(e);
//     }
//   });
// }

// /* ============================================
//    TITLE MAP LOGIC
//    ============================================ */

// if (titleMapBtn) {
//   titleMapBtn.addEventListener("click", async () => {
//     await loadData();
//     await loadTitles();
//     titleMapPopup.classList.remove("hidden");
//   });
// }

// if (closeTitleMap) {
//   closeTitleMap.addEventListener("click", () => {
//     titleMapPopup.classList.add("hidden");
//   });
// }

// // Add Title Modal
// if (openAddBtnTM) {
//   openAddBtnTM.addEventListener("click", () => {
//     modalBackTM.innerHTML = `
//       <div class="modal-backdrop" onclick="document.getElementById('modalBack').classList.add('hidden')"></div>
//       <div class="modal-container modal-sm">
//         <h3 class="modal-title">Add New Title</h3>
//         <div class="row">
//           <label>Title Name</label>
//           <input id="modalNewTitle" class="input" placeholder="e.g., Data Engineer" />
//         </div>
//         <div class="modal-buttons">
//           <button id="modalCancel" class="btn btn-ghost">Cancel</button>
//           <button id="modalSaveTitle" class="btn btn-primary">Save</button>
//       </div>
//     </div>
//   `;
//     modalBackTM.classList.remove("hidden");

//     document.getElementById("modalCancel").addEventListener("click", () => {
//       modalBackTM.classList.add("hidden");
//     });
    
//     document.getElementById("modalSaveTitle").addEventListener("click", async () => {
//       const name = (document.getElementById("modalNewTitle").value || "").trim();
//       if (!name) return alert("Please enter a title name");
      
//         try {
//           const { data, error } = await supabase
//             .from("Title_Map")
//             .insert([{ title: name, ids: "" }])
//             .select()
//             .single();
//           if (error) throw error;
        
//         // Sync to sheet with correct format: TitleID, IDs, Title
//         await syncToSheet("Title_Map", "insert", {
//           id: data.titleid,
//           ids: [],
//           title: name
//         });
        
//           modalBackTM.classList.add("hidden");
//           await loadTitles();
//         // Title added successfully - no alert needed
//         } catch (err) {
//         alert("Failed: " + (err.message || err));
//         }
//       });
//   });
// }

// // Load Titles
// async function loadTitles() {
//   if (!listEl) return;
//   listEl.innerHTML = '<div class="muted">Loading...</div>';
  
//   try {
//     const { data, error } = await supabase
//       .from("Title_Map")
//       .select("*")
//       .order("titleid");
      
//     if (error) {
//       listEl.innerHTML = `<div class="muted">Error: ${error.message}</div>`;
//       return;
//     }
    
//     titles = (data || []).map((t) => ({
//       titleid: t.titleid,
//       title: t.title || "",
//       ids: t.ids || "",
//     }));
    
//     renderTitles();
//     updateStats();
//   } catch (err) {
//     listEl.innerHTML = '<div class="muted">Error loading titles</div>';
//   }
// }

// // Render Titles - matching your format: TitleID | IDs | Title
// function renderTitles(filter = "") {
//   if (!listEl) return;
//   listEl.innerHTML = "";
  
//   const filtered = titles.filter((t) =>
//     (t.title || "").toLowerCase().includes(filter.toLowerCase())
//   );
  
//   if (!filtered.length) {
//     listEl.innerHTML = '<div class="muted">No titles found</div>';
//     return;
//   }

//   filtered.forEach((t) => {
//     const card = document.createElement("div");
//     card.className = "tile";
    
//     const idsArr = (t.ids || "").toString().split(",").map((s) => s.trim()).filter(Boolean);
//     const candidateCount = idsArr.length;
    
//     // Build candidate names list
//     const itemsHtml = idsArr.length > 0 ? idsArr.map((id) => {
//       const name = candidatesMap.get(String(id)) || `ID: ${id}`;
//       return `
//         <div class="tm-item">
//           <span>${encodeHTML(name)}</span>
//           <button class="btn-delete small btn-delete-item" data-unique="${id}" data-titleid="${t.titleid}">Remove</button>
//         </div>
//       `;
//     }).join("") : '<div class="muted">No candidates assigned</div>';

//     card.innerHTML = `
//       <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
//     <div>
//           <div class="title-name">${encodeHTML(t.title)}</div>
//           <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
//             Candidates: <strong style="color:var(--accent-blue);">${idsArr.length}</strong>
//       </div>
//     </div>
//         <div style="display:flex;gap:8px;flex-wrap:wrap;">
//           <button class="btn btn-secondary btn-sm btn-toggle" data-titleid="${t.titleid}">Details</button>
//           <button class="btn btn-primary btn-sm btn-add-item" data-titleid="${t.titleid}">+ Add</button>
//           <button class="btn-edit small edit-title-btn" data-id="${t.titleid}">Edit</button>
//           <button class="btn-delete small delete-title-btn" data-id="${t.titleid}">Delete</button>
//       </div>
//     </div>
//       <div class="tm-items" data-titleid="${t.titleid}" style="display:none;">
//         ${itemsHtml}
//   </div>
// `;
//     listEl.appendChild(card);
//   });
// }

// // Title search
// if (searchInputTM) {
//   searchInputTM.addEventListener("input", () => {
//     renderTitles(searchInputTM.value);
//   });
// }

// // Title list click handlers
// if (listEl) {
//   listEl.addEventListener("click", async (e) => {
//     const el = e.target;

//     // Toggle details
//     const toggleBtn = el.closest(".btn-toggle");
//     if (toggleBtn) {
//       const titleid = toggleBtn.dataset.titleid;
//       const itemsDiv = listEl.querySelector(`.tm-items[data-titleid="${titleid}"]`);
//       if (itemsDiv) itemsDiv.style.display = itemsDiv.style.display === "none" ? "block" : "none";
//       return;
//     }

//     // Add candidate
//     const addBtn = el.closest(".btn-add-item");
//     if (addBtn) {
//       openMultiSelectForTitle(Number(addBtn.dataset.titleid));
//       return;
//     }

//     // Delete title
//     const delTitle = el.closest(".delete-title-btn");
//     if (delTitle) {
//       const id = Number(delTitle.dataset.id);
//       if (!confirm("Delete this title?")) return;
//       try {
//         const { error } = await supabase.from("Title_Map").delete().eq("titleid", id);
//         if (error) throw error;
//         await syncToSheet("Title_Map", "delete", { id });
//         await loadTitles();
//       } catch (err) {
//         alert("Delete failed: " + (err.message || err));
//       }
//       return;
//     }

//     // Edit title
//     const editTitle = el.closest(".edit-title-btn");
//     if (editTitle) {
//       const id = Number(editTitle.dataset.id);
//       const t = titles.find((x) => x.titleid === id);
//       if (!t) return;
//       currentEdit = { type: "title", id };
//       editFields.innerHTML = `
//         <div class="row">
//           <label>Title Name</label>
//           <input id="editTitleInput" class="input" value="${encodeHTML(t.title)}" />
//         </div>
//     `;
//       editBackTM.classList.remove("hidden");
//       return;
//     }

//     // Remove candidate from title
//     const deleteItem = el.closest(".btn-delete-item");
//     if (deleteItem) {
//       const titleid = Number(deleteItem.dataset.titleid);
//       const unique = String(deleteItem.dataset.unique);
//       if (!confirm("Remove this candidate?")) return;
//       try {
//         const { data: tdata } = await supabase.from("Title_Map").select("ids, title").eq("titleid", titleid).single();
//         const existing = tdata.ids ? tdata.ids.split(",").map((s) => s.trim()).filter(Boolean) : [];
//         const newArr = existing.filter((x) => x !== unique);
//         await supabase.from("Title_Map").update({ ids: newArr.join(",") }).eq("titleid", titleid);
//         await syncToSheet("Title_Map", "update", { id: titleid, ids: newArr, title: tdata.title });
//         await loadTitles();
//       } catch (err) {
//         alert("Failed: " + (err.message || err));
//       }
//       return;
//     }
//   });
// }

// // Edit modal handlers
// if (editCancel) {
//   editCancel.addEventListener("click", () => {
//     editBackTM.classList.add("hidden");
//     currentEdit = null;
//   });
// }

// if (editSave) {
//   editSave.addEventListener("click", async () => {
//     if (!currentEdit) return;
//     const titleVal = document.getElementById("editTitleInput").value.trim();
//     const t = titles.find((x) => x.titleid === currentEdit.id);
//     try {
//       await supabase.from("Title_Map").update({ title: titleVal }).eq("titleid", currentEdit.id);
//       const idsArray = t.ids ? t.ids.split(",").map((s) => s.trim()).filter(Boolean) : [];
//       await syncToSheet("Title_Map", "update", { id: currentEdit.id, ids: idsArray, title: titleVal });
//       editBackTM.classList.add("hidden");
//       currentEdit = null;
//       await loadTitles();
//     } catch (err) {
//       alert("Update failed: " + (err.message || err));
//     }
//   });
// }

// // Multi-select modal
// function openMultiSelectForTitle(titleId) {
//   const titleObj = titles.find((t) => t.titleid === titleId);
//   if (!titleObj) return;

//   const currentIds = (titleObj.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
  
//   // Filter to show only active candidates
//   const activeCandidates = allRows.filter(r => r.Active === "Yes" || r.Active === true || r.Active === "true");
  
//   modalBackTM.innerHTML = `
//     <div class="modal-backdrop" onclick="document.getElementById('modalBack').classList.add('hidden')"></div>
//     <div class="modal-container" style="max-width:600px;padding:24px;">
//       <h3 class="modal-title" style="margin-bottom:8px;">Add Candidates to: ${encodeHTML(titleObj.title)}</h3>
//       <p style="font-size:13px;color:#64748b;margin-bottom:16px;">Only showing active candidates (${activeCandidates.length} available)</p>
//       <div style="margin-bottom:12px;">
//         <input id="multiSearch" class="input" placeholder="Search candidates..." style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;" />
//       </div>
//       <div id="multiList" style="max-height:350px;overflow:auto;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
//         ${activeCandidates.length > 0 ? activeCandidates.map((r) => {
//           const uid = String(r.Unique ?? "");
//           const name = r["Candidate Name"] ?? "";
//             const checked = currentIds.includes(uid) ? "checked" : "";
//             return `
//             <label data-uid="${uid}" style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e2e8f0;cursor:pointer;background:#fff;transition:background 0.15s;">
//               <input type="checkbox" class="multi-check" value="${uid}" ${checked} style="width:18px;height:18px;accent-color:#3b82f6;" />
//               <span style="flex:1;font-size:14px;"><strong style="color:#3b82f6;">#${uid}</strong> - ${encodeHTML(name)}</span>
//             </label>
//           `;
//         }).join("") : '<div style="padding:24px;text-align:center;color:#94a3b8;">No active candidates available. Mark candidates as Active first.</div>'}
//       </div>
//       <div class="modal-buttons" style="margin-top:20px;">
//         <button id="multiCancel" class="btn btn-ghost">Cancel</button>
//         <button id="multiSave" class="btn btn-primary">Save Selection</button>
//       </div>
//     </div>
//   `;
//   modalBackTM.classList.remove("hidden");

//   const multiSearch = document.getElementById("multiSearch");
//   const multiList = document.getElementById("multiList");
  
//   if (multiSearch) {
//     multiSearch.addEventListener("input", () => {
//       const q = multiSearch.value.toLowerCase();
//       multiList.querySelectorAll("label").forEach((lbl) => {
//         lbl.style.display = !q || lbl.textContent.toLowerCase().includes(q) ? "flex" : "none";
//       });
//     });
//   }

//   document.getElementById("multiCancel").addEventListener("click", () => modalBackTM.classList.add("hidden"));

//   document.getElementById("multiSave").addEventListener("click", async () => {
//     const selected = Array.from(multiList.querySelectorAll(".multi-check:checked")).map((i) => i.value);
//     try {
//       await supabase.from("Title_Map").update({ ids: selected.join(",") }).eq("titleid", titleId);
//       await syncToSheet("Title_Map", "update", { id: titleId, ids: selected, title: titleObj.title });
//       modalBackTM.classList.add("hidden");
//       await loadTitles();
//     } catch (err) {
//       alert("Failed: " + (err.message || err));
//     }
//   });
// }

// /* ============================================
//    STATUS TOGGLE LABEL UPDATE
//    ============================================ */
// const activeCheckbox = document.getElementById("candidateActive");
// const statusLabel = document.getElementById("statusLabel");
// if (activeCheckbox && statusLabel) {
//   activeCheckbox.addEventListener("change", () => {
//     statusLabel.textContent = activeCheckbox.checked ? "Active" : "Inactive";
//     statusLabel.style.color = activeCheckbox.checked ? "#16a34a" : "#dc2626";
//   });
// }

// /* ============================================
//    INITIALIZATION
//    ============================================ */
// (async function init() {
//   await testConnection();
//   await loadData();
//   await loadTitles();
//   updateStats();
// })();


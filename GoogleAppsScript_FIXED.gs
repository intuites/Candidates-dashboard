/**************************************************************
 *       GOOGLE APPS SCRIPT - WITH DRIVE FILE UPLOAD
 *       Handles: Email_Atm + Title_Map + File Uploads
 *       
 *       SETUP:
 *       1. Go to script.google.com
 *       2. Create new project
 *       3. Paste this code
 *       4. Update SPREADSHEET_ID and FOLDER_ID below
 *       5. Deploy > New deployment > Web app
 *       6. Execute as: Me, Access: Anyone
 *       7. Copy the URL and update your script.js
 *
 *       FOR DRIVE UPLOAD:
 *       - Create a folder in Google Drive for uploads
 *       - Right-click folder > Share > Anyone with link can view
 *       - Copy the folder ID from URL and paste below
 **************************************************************/

// YOUR GOOGLE SPREADSHEET ID
const SPREADSHEET_ID = "1ECM_v1UsLDirfs8Hc3YMgs2K0qOXoE2BpVl_ofCTrC0";

// YOUR GOOGLE DRIVE FOLDER ID FOR FILE UPLOADS
// Create a folder in Drive, copy the ID from URL: https://drive.google.com/drive/folders/FOLDER_ID_HERE
const FOLDER_ID = "YOUR_FOLDER_ID_HERE"; // <-- REPLACE THIS!

/**************************************************************
 *                    REQUEST HANDLERS
 **************************************************************/

function doGet(e) {
  // Handle JSONP callback for CORS workaround
  const callback = e.parameter.callback;
  const response = JSON.stringify({ status: "ok", message: "Webhook is running!" });
  
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + response + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(response)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e.postData ? e.postData.contents : "";
    if (!raw) {
      return jsonResponse({ error: "No payload" });
    }

    const body = JSON.parse(raw);
    
    // Handle file upload
    if (body.action === "upload" && body.file) {
      return handleFileUpload(body.file);
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Handle Email_Atm (Candidates)
    if (body.table === "Email_Atm") {
      return handleEmailAtm(ss, body.action, body.record);
    }
    
    // Handle Title_Map
    if (body.table === "Title_Map") {
      return handleTitleMap(ss, body.action, body.record);
    }

    return jsonResponse({ error: "Unknown request" });

  } catch (err) {
    Logger.log("Error: " + err.message);
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(obj) {
  // Return JSON with proper content type
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**************************************************************
 *                FILE UPLOAD TO GOOGLE DRIVE
 **************************************************************/

function handleFileUpload(fileData) {
  try {
    // Decode base64 file content
    const decoded = Utilities.base64Decode(fileData.content);
    const blob = Utilities.newBlob(decoded, fileData.mimeType, fileData.name);
    
    // Get or create upload folder
    let folder;
    try {
      folder = DriveApp.getFolderById(FOLDER_ID);
    } catch (e) {
      // If folder ID is invalid, use root folder
      folder = DriveApp.getRootFolder();
    }
    
    // Create file in Drive
    const file = folder.createFile(blob);
    
    // Make file publicly accessible (anyone with link can view)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Get the shareable link
    const fileId = file.getId();
    const viewUrl = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";
    
    return jsonResponse({
      success: true,
      url: viewUrl,
      fileId: fileId,
      fileName: file.getName()
    });
    
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

/**************************************************************
 *            EMAIL_ATM (CANDIDATES) HANDLER
 **************************************************************/

function handleEmailAtm(ss, action, record) {
  let sh = ss.getSheetByName("Email_Atm");
  if (!sh) sh = ss.getSheetByName("Candidates");
  
  if (!sh) {
    sh = ss.insertSheet("Email_Atm");
    const headers = [
      "Unique", "Candidate Name", "Contact No", "Email", "Skills",
      "Visa status", "Skype ID", "Current Location", "DOB(MM/DD)",
      "Relocation (Yes/No)", "Onsite or Remote:",
      "Bachelor: University//year of completion",
      "Master's /university/ year of completion",
      "SSN no. last 4 digit", "LinkedIn", "PP No", "Total Exp",
      "Total years of Exp in US", "Availability for Project",
      "Availability for Interview", "Best Time to reach",
      "Resume", "DL", "Title", "Rate", "Recruiter name",
      "Recruiter email", "Recruiter Phone", "Match"
    ];
    sh.appendRow(headers);
  }

  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const colUnique = headers.indexOf("Unique");
  
  // Find row by Unique ID
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colUnique]) === String(record.Unique)) {
      row = i + 1;
      break;
    }
  }

  const rowData = headers.map(h => record[h] !== undefined ? record[h] : "");

  // DELETE
  if (action === "delete") {
    if (row !== -1) {
      sh.deleteRow(row);
      return jsonResponse({ success: true, action: "deleted" });
    }
    return jsonResponse({ success: false, message: "Not found" });
  }

  // INSERT
  if (action === "insert") {
    if (row === -1) {
      sh.appendRow(rowData);
      return jsonResponse({ success: true, action: "inserted" });
    }
    // Update if exists
    for (let i = 0; i < headers.length; i++) {
      sh.getRange(row, i + 1).setValue(rowData[i]);
    }
    return jsonResponse({ success: true, action: "updated" });
  }

  // UPDATE
  if (action === "update") {
    if (row !== -1) {
      for (let i = 0; i < headers.length; i++) {
        sh.getRange(row, i + 1).setValue(rowData[i]);
      }
      return jsonResponse({ success: true, action: "updated" });
    }
    sh.appendRow(rowData);
    return jsonResponse({ success: true, action: "inserted" });
  }

  return jsonResponse({ error: "Unknown action" });
}

/**************************************************************
 *                 TITLE_MAP HANDLER
 *    Sheet format: TitleID | IDs | Title (matching your example)
 **************************************************************/

function handleTitleMap(ss, action, record) {
  let sh = ss.getSheetByName("Title_Map");
  
  if (!sh) {
    sh = ss.insertSheet("Title_Map");
    // Headers match your format: TitleID, IDs, Title
    sh.appendRow(["TitleID", "IDs", "Title"]);
  }

  const values = sh.getDataRange().getValues();
  const headers = values[0];
  
  // Column indices matching your format
  const colID = 0;     // TitleID
  const colIDs = 1;    // IDs (comma-separated candidate IDs)
  const colTitle = 2;  // Title name

  const id = String(record.id);
  const title = record.title || "";
  // Handle ids as array or string
  const idsJoined = Array.isArray(record.ids) ? record.ids.join(",") : (record.ids || "");

  // Find existing row
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colID]) === id) {
      row = i + 1;
      break;
    }
  }

  // DELETE
  if (action === "delete") {
    if (row !== -1) {
      sh.deleteRow(row);
      return jsonResponse({ success: true, action: "deleted" });
    }
    return jsonResponse({ success: false, message: "Not found" });
  }

  // INSERT - format: TitleID, IDs, Title
  if (action === "insert") {
    if (row === -1) {
      sh.appendRow([id, idsJoined, title]);
      return jsonResponse({ success: true, action: "inserted" });
    }
    // Update if exists
    sh.getRange(row, colIDs + 1).setValue(idsJoined);
    sh.getRange(row, colTitle + 1).setValue(title);
    return jsonResponse({ success: true, action: "updated" });
  }

  // UPDATE
  if (action === "update") {
    if (row !== -1) {
      sh.getRange(row, colIDs + 1).setValue(idsJoined);
      sh.getRange(row, colTitle + 1).setValue(title);
      return jsonResponse({ success: true, action: "updated" });
    }
    sh.appendRow([id, idsJoined, title]);
    return jsonResponse({ success: true, action: "inserted" });
  }

  return jsonResponse({ error: "Unknown action" });
}

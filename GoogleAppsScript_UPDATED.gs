/**************************************************************
 *       GOOGLE APPS SCRIPT - WITH DRIVE FILE UPLOAD
 *       UPDATED VERSION - Handles Form Submissions + JSON
 *       
 *       SETUP:
 *       1. Go to script.google.com
 *       2. Create new project (or open existing)
 *       3. DELETE ALL OLD CODE and paste this entire file
 *       4. Update SPREADSHEET_ID and FOLDER_ID below
 *       5. Deploy > New deployment > Web app
 *       6. Execute as: Me, Access: Anyone
 *       7. Copy the NEW URL and update your script.js
 **************************************************************/

// YOUR GOOGLE SPREADSHEET ID
const SPREADSHEET_ID = "1ECM_v1UsLDirfs8Hc3YMgs2K0qOXoE2BpVl_ofCTrC0";

// YOUR GOOGLE DRIVE FOLDER ID FOR FILE UPLOADS
const FOLDER_ID = "1iTKNjPX0BT5ESUBv-V1qxIb0pJtPpGnO";

/**************************************************************
 *                    REQUEST HANDLERS
 **************************************************************/
function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok", message: "Webhook is running!", timestamp: new Date().toISOString() })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    let body;
    
    // Handle different content types
    if (e.postData && e.postData.contents) {
      // JSON body
      try {
        body = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        // Maybe it's URL encoded
        body = null;
      }
    }
    
    // Handle form data (from iframe submission)
    if (!body && e.parameter && e.parameter.payload) {
      try {
        body = JSON.parse(e.parameter.payload);
      } catch (parseErr) {
        return jsonResponse({ error: "Invalid payload format" });
      }
    }
    
    if (!body) {
      return jsonResponse({ error: "No valid payload received" });
    }
    
    // Log incoming request for debugging
    console.log("Received request:", JSON.stringify(body).substring(0, 500));
    
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
    
    return jsonResponse({ error: "Unknown request type" });
    
  } catch (err) {
    console.error("doPost error:", err);
    return jsonResponse({ error: err.message, stack: err.stack });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**************************************************************
 *                FILE UPLOAD TO GOOGLE DRIVE
 **************************************************************/
function handleFileUpload(fileData) {
  try {
    if (!fileData.content || !fileData.name) {
      return jsonResponse({ success: false, error: "Missing file content or name" });
    }
    
    console.log("Uploading file:", fileData.name);
    
    // Decode base64 file content
    const decoded = Utilities.base64Decode(fileData.content);
    const blob = Utilities.newBlob(decoded, fileData.mimeType || 'application/octet-stream', fileData.name);
    
    // Get upload folder
    let folder;
    try {
      folder = DriveApp.getFolderById(FOLDER_ID);
    } catch (e) {
      console.error("Folder not found, using root:", e);
      folder = DriveApp.getRootFolder();
    }
    
    // Create file in Drive
    const file = folder.createFile(blob);
    console.log("File created:", file.getName(), file.getId());
    
    // Make file publicly accessible
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Get the shareable link
    const fileId = file.getId();
    const viewUrl = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";
    
    console.log("Upload successful:", viewUrl);
    
    return jsonResponse({
      success: true,
      url: viewUrl,
      fileId: fileId,
      fileName: file.getName()
    });
    
  } catch (err) {
    console.error("File upload error:", err);
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
 **************************************************************/
function handleTitleMap(ss, action, record) {
  let sh = ss.getSheetByName("Title_Map");
  
  if (!sh) {
    sh = ss.insertSheet("Title_Map");
    sh.appendRow(["TitleID", "IDs", "Title"]);
  }
  
  const values = sh.getDataRange().getValues();
  const colID = 0;
  const colIDs = 1;
  const colTitle = 2;
  
  const id = String(record.id);
  const title = record.title || "";
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
  
  // INSERT
  if (action === "insert") {
    if (row === -1) {
      sh.appendRow([id, idsJoined, title]);
      return jsonResponse({ success: true, action: "inserted" });
    }
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

/**************************************************************
 *                 TEST FUNCTION
 *    Run this to test if the script can access Drive and Sheets
 **************************************************************/
function testAccess() {
  try {
    // Test Spreadsheet access
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    console.log("✅ Spreadsheet access OK:", ss.getName());
    
    // Test Drive folder access
    const folder = DriveApp.getFolderById(FOLDER_ID);
    console.log("✅ Drive folder access OK:", folder.getName());
    
    // Test creating a test file
    const testBlob = Utilities.newBlob("Test content", "text/plain", "test_" + Date.now() + ".txt");
    const testFile = folder.createFile(testBlob);
    console.log("✅ File creation OK:", testFile.getName());
    
    // Clean up test file
    testFile.setTrashed(true);
    console.log("✅ Test file cleaned up");
    
    return "All tests passed!";
  } catch (err) {
    console.error("❌ Test failed:", err);
    return "Test failed: " + err.message;
  }
}


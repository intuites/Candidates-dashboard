// ============================================
// SIMPLE GOOGLE APPS SCRIPT - COPY THIS EXACTLY
// ============================================

const SPREADSHEET_ID = "1ECM_v1UsLDirfs8Hc3YMgs2K0qOXoE2BpVl_ofCTrC0";
const FOLDER_ID = "1iTKNjPX0BT5ESUBv-V1qxIb0pJtPpGnO";

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok", message: "Running!" })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = null;
    
    // Try JSON body
    if (e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch(x) {}
    }
    
    // Try form parameter
    if (!body && e.parameter && e.parameter.payload) {
      try { body = JSON.parse(e.parameter.payload); } catch(x) {}
    }
    
    if (!body) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: "No data" })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    
    // File upload
    if (body.action === "upload" && body.file) {
      return uploadFile(body.file);
    }
    
    // Spreadsheet operations
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    if (body.table === "Email_Atm") {
      return handleCandidates(ss, body.action, body.record);
    }
    
    if (body.table === "Title_Map") {
      return handleTitleMap(ss, body.action, body.record);
    }
    
    return ContentService.createTextOutput(
      JSON.stringify({ error: "Unknown" })
    ).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function uploadFile(fileData) {
  try {
    var decoded = Utilities.base64Decode(fileData.content);
    var blob = Utilities.newBlob(decoded, fileData.mimeType || "application/octet-stream", fileData.name);
    
    var folder;
    try {
      folder = DriveApp.getFolderById(FOLDER_ID);
    } catch(x) {
      folder = DriveApp.getRootFolder();
    }
    
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var url = "https://drive.google.com/file/d/" + file.getId() + "/view?usp=sharing";
    
    return ContentService.createTextOutput(
      JSON.stringify({ success: true, url: url, fileName: file.getName() })
    ).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleCandidates(ss, action, record) {
  var sh = ss.getSheetByName("Email_Atm") || ss.getSheetByName("Candidates");
  
  if (!sh) {
    sh = ss.insertSheet("Email_Atm");
    sh.appendRow([
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
    ]);
  }
  
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var row = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(record.Unique)) {
      row = i + 1;
      break;
    }
  }
  
  var rowData = headers.map(function(h) { return record[h] || ""; });
  
  if (action === "delete" && row > 0) {
    sh.deleteRow(row);
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "insert") {
    if (row < 0) sh.appendRow(rowData);
    else for (var j = 0; j < headers.length; j++) sh.getRange(row, j + 1).setValue(rowData[j]);
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "update") {
    if (row > 0) for (var k = 0; k < headers.length; k++) sh.getRange(row, k + 1).setValue(rowData[k]);
    else sh.appendRow(rowData);
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ success: false })).setMimeType(ContentService.MimeType.JSON);
}

function handleTitleMap(ss, action, record) {
  var sh = ss.getSheetByName("Title_Map");
  if (!sh) {
    sh = ss.insertSheet("Title_Map");
    sh.appendRow(["TitleID", "IDs", "Title"]);
  }
  
  var data = sh.getDataRange().getValues();
  var id = String(record.id);
  var title = record.title || "";
  var ids = Array.isArray(record.ids) ? record.ids.join(",") : (record.ids || "");
  var row = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      row = i + 1;
      break;
    }
  }
  
  if (action === "delete" && row > 0) {
    sh.deleteRow(row);
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "insert" || action === "update") {
    if (row > 0) {
      sh.getRange(row, 2).setValue(ids);
      sh.getRange(row, 3).setValue(title);
    } else {
      sh.appendRow([id, ids, title]);
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ success: false })).setMimeType(ContentService.MimeType.JSON);
}

// Test function - run this first!
function testScript() {
  Logger.log("Testing...");
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log("Spreadsheet: " + ss.getName());
  var folder = DriveApp.getFolderById(FOLDER_ID);
  Logger.log("Folder: " + folder.getName());
  Logger.log("SUCCESS!");
}


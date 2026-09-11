/**
 * SKIPQ — Backend (Google Apps Script)
 * ------------------------------------------------------------
 * This script is bound to a specific spreadsheet by ID (below), so it works
 * whether you paste it into a standalone Apps Script project or into
 * Extensions > Apps Script inside the Sheet itself.
 *
 * Deploy: Deploy > New deployment > type: Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Copy the resulting Web App URL — you'll paste it into frontend/config.js
 *
 * Your Google Sheet MUST have these 3 tabs (exact names, exact header row):
 *
 * Shops   | shop_id | shop_name | username | password | created_at | is_open
 * Items   | item_id | shop_id | name | image_url | price | unit_type | quantity | created_at
 * Orders  | order_id | shop_id | customer_name | items_json | status | created_at
 * ------------------------------------------------------------
 */

const SPREADSHEET_ID = '1xy6bxl1lpawuJMubWAWqFm4bW880WYR3_DorgAlFGao';

const SHEET_SHOPS = 'Shops';
const SHEET_ITEMS = 'Items';
const SHEET_ORDERS = 'Orders';

function doGet(e) {
  return handle(e);
}
function doPost(e) {
  return handle(e);
}

function handle(e) {
  try {
    const params = e.parameter || {};
    let body = {};
    if (e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
    }
    const input = Object.assign({}, params, body);
    const action = input.action;

    let result;
    switch (action) {
      case 'signup':        result = signupShop(input); break;
      case 'login':         result = loginShop(input); break;
      case 'addItem':       result = addItem(input); break;
      case 'uploadImage':   result = uploadImage(input); break;
      case 'deleteItem':    result = deleteItem(input); break;
      case 'getItems':      result = getItems(input); break;
      case 'getShop':       result = getShopById(input); break;
      case 'setShopStatus': result = setShopStatus(input); break;
      case 'placeOrder':    result = placeOrder(input); break;
      case 'getOrders':     result = getOrders(input); break;
      case 'updateOrderStatus': result = updateOrderStatus(input); break;
      default:
        result = {
          ok: false,
          error: 'Unknown action: ' + action,
          debug: {
            hasPostData: !!(e.postData && e.postData.contents),
            postDataType: e.postData ? e.postData.type : null,
            rawBodySnippet: e.postData ? String(e.postData.contents).slice(0, 200) : null,
            queryParams: params,
          },
        };
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- helpers ---------------- */

function sheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet tab: ' + name);
  return sh;
}

function rowsToObjects(sh) {
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);
    out.push(obj);
  }
  return out;
}

function nextId(prefix) {
  return prefix + '_' + Utilities.getUuid().slice(0, 8);
}

function simpleHash(str) {
  // Lightweight obfuscation only — NOT cryptographic security.
  // Good enough for an MVP prototype, not for storing real user passwords long-term.
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str);
  return raw.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

/* ---------------- shops ---------------- */

function signupShop(input) {
  const { shop_name, username, password } = input;
  if (!shop_name || !username || !password) {
    return { ok: false, error: 'shop_name, username, and password are required' };
  }
  const sh = sheet(SHEET_SHOPS);
  const existing = rowsToObjects(sh);
  if (existing.some(r => String(r.username).toLowerCase() === String(username).toLowerCase())) {
    return { ok: false, error: 'That username is already taken' };
  }
  const shop_id = nextId('shop');
  const created_at = new Date().toISOString();
  sh.appendRow([shop_id, shop_name, username, simpleHash(password), created_at, 'TRUE']);
  return { ok: true, shop_id, shop_name, is_open: true };
}

function loginShop(input) {
  const { username, password } = input;
  const sh = sheet(SHEET_SHOPS);
  const rows = rowsToObjects(sh);
  const match = rows.find(r => String(r.username).toLowerCase() === String(username).toLowerCase());
  if (!match || match.password !== simpleHash(password)) {
    return { ok: false, error: 'Invalid username or password' };
  }
  return { ok: true, shop_id: match.shop_id, shop_name: match.shop_name, is_open: isOpenValue(match.is_open) };
}

function getShopById(input) {
  const { shop_id } = input;
  const rows = rowsToObjects(sheet(SHEET_SHOPS));
  const match = rows.find(r => r.shop_id === shop_id);
  if (!match) return { ok: false, error: 'Shop not found' };
  return { ok: true, shop_id: match.shop_id, shop_name: match.shop_name, is_open: isOpenValue(match.is_open) };
}

function setShopStatus(input) {
  const { shop_id, is_open } = input;
  const sh = sheet(SHEET_SHOPS);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idIdx = headers.indexOf('shop_id');
  let statusIdx = headers.indexOf('is_open');
  if (statusIdx === -1) {
    // Column doesn't exist yet in this sheet — add it as a new header.
    statusIdx = headers.length;
    sh.getRange(1, statusIdx + 1).setValue('is_open');
  }
  for (let i = 1; i < values.length; i++) {
    if (values[i][idIdx] === shop_id) {
      sh.getRange(i + 1, statusIdx + 1).setValue(is_open ? 'TRUE' : 'FALSE');
      return { ok: true, is_open: !!is_open };
    }
  }
  return { ok: false, error: 'Shop not found' };
}

// Missing/blank is_open is treated as OPEN, so existing rows created before
// this column existed keep working without needing manual backfill.
function isOpenValue(v) {
  if (v === '' || v === undefined || v === null) return true;
  return String(v).toUpperCase() === 'TRUE';
}

/* ---------------- items ---------------- */

const IMAGE_FOLDER_NAME = 'SkipQ Item Photos';

function getOrCreateImageFolder() {
  const folders = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(IMAGE_FOLDER_NAME);
}

// Accepts a base64-encoded photo from the browser (already resized/compressed
// client-side), saves it to a Drive folder, makes it publicly viewable via
// link, and returns a URL usable directly in an <img> tag.
function uploadImage(input) {
  const { shop_id, file_data, mime_type, file_name } = input;
  if (!shop_id || !file_data || !mime_type) {
    return { ok: false, error: 'shop_id, file_data, and mime_type are required' };
  }
  try {
    const folder = getOrCreateImageFolder();
    const bytes = Utilities.base64Decode(file_data);
    const blob = Utilities.newBlob(bytes, mime_type, file_name || (shop_id + '_' + Date.now() + '.jpg'));
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const image_url = 'https://lh3.googleusercontent.com/d/' + file.getId();
    return { ok: true, image_url: image_url };
  } catch (err) {
    return { ok: false, error: 'Photo upload failed: ' + String(err) };
  }
}

function addItem(input) {
  const { shop_id, name, image_url, price, unit_type, quantity } = input;
  if (!shop_id || !name || price === undefined || !unit_type) {
    return { ok: false, error: 'shop_id, name, price, and unit_type are required' };
  }
  const sh = sheet(SHEET_ITEMS);
  const item_id = nextId('item');
  const created_at = new Date().toISOString();
  sh.appendRow([item_id, shop_id, name, image_url || '', Number(price), unit_type, Number(quantity) || 0, created_at]);
  return { ok: true, item_id };
}

function deleteItem(input) {
  const { shop_id, item_id } = input;
  const sh = sheet(SHEET_ITEMS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === item_id) {
      if (values[i][1] !== shop_id) {
        return { ok: false, error: 'You do not own this item' };
      }
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Item not found' };
}

function getItems(input) {
  const { shop_id } = input;
  if (!shop_id) return { ok: false, error: 'shop_id is required' };
  const rows = rowsToObjects(sheet(SHEET_ITEMS)).filter(r => r.shop_id === shop_id);
  const now = new Date();
  rows.forEach(r => {
    const created = new Date(r.created_at);
    r.is_new = (now - created) < 24 * 60 * 60 * 1000;
  });
  // newest first
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return { ok: true, items: rows };
}

/* ---------------- orders ---------------- */

function placeOrder(input) {
  const { shop_id, customer_name, items_json } = input;
  if (!shop_id || !customer_name || !items_json) {
    return { ok: false, error: 'shop_id, customer_name, and items_json are required' };
  }
  const shopRows = rowsToObjects(sheet(SHEET_SHOPS));
  const shop = shopRows.find(r => r.shop_id === shop_id);
  if (!shop) return { ok: false, error: 'Shop not found' };
  if (!isOpenValue(shop.is_open)) {
    return { ok: false, error: 'This shop is currently closed and not accepting orders right now.' };
  }
  const sh = sheet(SHEET_ORDERS);
  const order_id = nextId('order');
  const created_at = new Date().toISOString();
  sh.appendRow([order_id, shop_id, customer_name, items_json, 'pending', created_at]);
  return { ok: true, order_id };
}

function getOrders(input) {
  const { shop_id } = input;
  if (!shop_id) return { ok: false, error: 'shop_id is required' };
  const rows = rowsToObjects(sheet(SHEET_ORDERS)).filter(r => r.shop_id === shop_id);
  rows.forEach(r => { try { r.items = JSON.parse(r.items_json); } catch (e) { r.items = []; } });
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return { ok: true, orders: rows };
}

function updateOrderStatus(input) {
  const { shop_id, order_id, status } = input;
  const sh = sheet(SHEET_ORDERS);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idIdx = headers.indexOf('order_id');
  const shopIdx = headers.indexOf('shop_id');
  const statusIdx = headers.indexOf('status');
  for (let i = 1; i < values.length; i++) {
    if (values[i][idIdx] === order_id) {
      if (values[i][shopIdx] !== shop_id) return { ok: false, error: 'You do not own this order' };
      sh.getRange(i + 1, statusIdx + 1).setValue(status);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Order not found' };
}

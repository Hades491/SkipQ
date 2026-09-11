# SkipQ — Full Setup Guide

Scan a shop's QR code, see what's on the shelf right now, order ahead, skip the line.

Your spreadsheet is already wired into the backend code below —
**Spreadsheet ID:** `1xy6bxl1lpawuJMubWAWqFm4bW880WYR3_DorgAlFGao`

---

## Step 1 — Set up the Google Sheet tabs

Open your spreadsheet: https://docs.google.com/spreadsheets/d/1xy6bxl1lpawuJMubWAWqFm4bW880WYR3_DorgAlFGao/edit

Rename/create tabs so you end up with **exactly these 3**, spelled and capitalized exactly like this (tab names are case-sensitive and the backend looks them up by exact name):

**Tab `Shops`** — row 1 headers:
```
shop_id | shop_name | username | password | created_at | is_open
```
(`is_open` is new — it powers the Open/Close Store toggle. If you already set up your sheet before this feature, just add `is_open` as a new column **F**, after `created_at` — don't reorder the existing columns. Rows without a value in this column are treated as open by default, so nothing breaks for shops that signed up before this column existed.)

**Tab `Items`** — row 1 headers:
```
item_id | shop_id | name | image_url | price | unit_type | quantity | created_at
```

**Tab `Orders`** — row 1 headers:
```
order_id | shop_id | customer_name | items_json | status | created_at
```

How to rename a tab: double-click the tab name at the bottom → type the new name → Enter.
How to add a tab: click the `+` next to the tabs at the bottom.
Delete any extra empty tabs (like `Sheet2`) so only these 3 remain.
Leave row 2 onward empty — the backend appends rows automatically as people sign up, add items, and place orders.

---

## Step 2 — Deploy the backend (Google Apps Script)

You can do this two ways — pick whichever is easier for you:

**Option A — bound to the sheet (simplest):**
1. Inside your spreadsheet: **Extensions → Apps Script**.
2. Delete any starter code in the editor.
3. Paste in the full contents of `backend/Code.gs` (below).
4. Click **Save** (disk icon).

**Option B — standalone script:**
1. Go to https://script.google.com/create
2. Delete the starter code, paste in `backend/Code.gs`.
3. Save.

Either way, the script already points at your spreadsheet by ID, so both options work identically.

**Now deploy it as a Web App:**
1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. It will ask you to authorize permissions — click through and allow it. This is expected: the script needs permission to read/write your specific spreadsheet, and now also to save files to your Google Drive (that's where uploaded item photos get stored).
6. Copy the **Web app URL** shown (it ends in `/exec`). You'll need this in Step 3.

If you ever edit `Code.gs` later, you must **Deploy → Manage deployments → edit (pencil) → New version** for changes to go live — saving alone isn't enough.

---

## Step 3 — Connect the frontend to your backend

Open `frontend/config.js` and replace the placeholder with the Web App URL from Step 2.6:

```js
const API_URL = "https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec";
```

---

## Step 4 — Host the frontend

The `frontend/` folder is a static site. Any of these work, free:

**GitHub Pages (recommended, free):**
1. Create a new GitHub repo.
2. Upload everything inside `frontend/` (index.html, app.js, config.js, styles.css, manifest.json, sw.js, icon.svg) to the repo root.
3. Repo → **Settings → Pages** → Source: `main` branch, `/ (root)` folder → Save.
4. GitHub gives you a URL like `https://yourusername.github.io/your-repo/` — that's your live SkipQ site.

**Netlify (also easy):**
1. Go to https://app.netlify.com/drop
2. Drag the `frontend/` folder in.
3. It gives you a live URL instantly.

---

## Step 5 — Test the full flow end to end

1. Visit your hosted URL → **Create an account** → make a test shop (any username/password).
2. You'll land on the dashboard → **"+ New item"** → add 2-3 items with prices and quantities.
3. Click the **"Your QR code"** tab — this is what gets printed and stuck at the shop counter.
4. Open the QR's link on your phone (or scan it with your camera app) → you land on that shop's public storefront. Your phone will offer "Add to Home Screen" — accepting it installs a shortcut named after the shop, using the SkipQ icon.
5. On the storefront: tap `+` on a couple items → **"Review order"** → enter a name → **Place order**.
6. Back on the dashboard (logged in as the shop owner) → **Orders** tab → the order appears → mark it **"ready"**, then **"picked up"** as it moves along.
7. Open your Google Sheet — you'll see the new rows appear live in `Shops`, `Items`, and `Orders` as you do all of the above.

---

## Full source code

### `backend/Code.gs`
Paste this into Apps Script (Step 2).

*(see attached file — already wired to your spreadsheet ID)*

### `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `frontend/config.js`, `frontend/manifest.json`, `frontend/sw.js`, `frontend/icon.svg`
Upload these together, unmodified except for `config.js` where you paste your Web App URL (Step 3).

---

## How access control works

- Each shop owner logs in with their own username/password.
- Every add/delete/order-update request includes the logged-in shop's ID, and the backend checks that the item or order actually belongs to that shop before making any change — one shop owner can never edit or delete another shop's data, even by guessing IDs.
- Customers browsing via the QR link get a read-only storefront — no edit/delete controls exist for them at all, not just hidden by CSS but never sent by the backend to their session.

## Open / Close Store

- The dashboard now has an **Open/Close Store** toggle next to the Log out button.
- When a shop is closed, the storefront shows a "currently closed" banner and removes the ordering controls (no add-to-cart steppers), so customers can browse but not order.
- This is enforced **server-side** too — even if someone bypassed the UI, `placeOrder` on the backend checks the shop's status and rejects orders while closed. The UI lockout is a convenience; the real boundary is in `Code.gs`.

## How item photos work

- When a shop owner adds an item, they upload a photo straight from their phone's gallery or camera — no need to know what a "URL" is or how to host an image.
- The browser resizes/compresses the photo before sending it (so a multi-MB phone photo becomes a small, fast upload), then the backend saves it to a Google Drive folder called **"SkipQ Item Photos"** (created automatically the first time it's needed) and sets sharing to "anyone with the link can view."
- The `image_url` column in your `Items` sheet still just stores a plain URL — it's generated automatically now instead of the owner having to find/paste one themselves. Nothing about how the storefront displays images changed.

## Order notifications for the shop owner

- On the dashboard's **Orders** tab, there's a "🔔 Enable order notifications" button. Once granted, the browser will show a native notification the moment a new order comes in.
- **Important limitation:** this only works while the dashboard tab is open (even in the background) — it polls for new orders every 20 seconds. It is **not** a true push notification system that works when the site/tab is fully closed. Building that would require a real notification server with VAPID keys, which is a different, heavier piece of infrastructure than what Apps Script + a static frontend can do. If you outgrow this later, that's the next step — for now, keeping the dashboard open in a tab (or a pinned browser tab) is the practical way to use it.

## Known limitations (worth knowing, not blockers)

- **Password storage:** hashed with SHA-256 before being stored in the Sheet — fine for a prototype, but not a substitute for a real auth provider before a public launch. Consider Firebase Auth or Supabase Auth later.
- **Google Sheets as a database:** works fine for early testing with a handful of shops. It'll slow down and can hit write-conflict issues with many shops updating inventory concurrently — migrating to Firestore or Postgres is the natural next step once you outgrow it.
- **"Add to Home Screen" per shop:** the manifest swaps dynamically per shop so the installed icon is named after that shop. Works on most modern mobile browsers; iOS Safari is stricter about exactly when it offers the install prompt — test on real target phones.
- **Inventory isn't reserved:** if two customers order the last unit at the same moment, both orders go through — the shop owner resolves it manually while prepping. A "reserve on order" system is a good v2 feature.
- **Payment:** pay-in-person at pickup, as designed. In-app payment (UPI/Stripe) would be a separate future step.

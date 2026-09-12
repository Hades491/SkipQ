/* ------------------------------------------------------------------
   SkipQ frontend logic
   ------------------------------------------------------------------ */

const app = document.getElementById('app');
const topnav = document.getElementById('topnav');
let shopOpenState = true;

/* ---------------- API wrapper ---------------- */
const API = {
  async call(action, data = {}) {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action }, data)),
    });
    return res.json();
  },
};

/* ---------------- session ---------------- */
const Session = {
  get shopId() { return localStorage.getItem('sq_shop_id'); },
  get shopName() { return localStorage.getItem('sq_shop_name'); },
  set(shop_id, shop_name) {
    localStorage.setItem('sq_shop_id', shop_id);
    localStorage.setItem('sq_shop_name', shop_name);
  },
  clear() {
    localStorage.removeItem('sq_shop_id');
    localStorage.removeItem('sq_shop_name');
  },
  isLoggedIn() { return !!this.shopId; },
};

/* ---------------- router ---------------- */
const Router = {
  goHome() {
    const params = new URLSearchParams(location.search);
    const storeShop = params.get('shop');
    if (storeShop) return this.showStorefront(storeShop);
    return this.showLanding();
  },
  init() {
    this.renderNav();
    this.goHome();
  },
  renderNav() {
    topnav.innerHTML = '';
    if (Session.isLoggedIn() && !isCustomerView() && currentView === 'dashboard') {
      const toggle = document.createElement('button');
      toggle.className = 'store-toggle ' + (shopOpenState ? 'is-open' : 'is-closed');
      toggle.textContent = shopOpenState ? 'Close store' : 'Open store';
      toggle.onclick = async () => {
        toggle.disabled = true;
        const next = !shopOpenState;
        const res = await API.call('setShopStatus', { shop_id: Session.shopId, is_open: next });
        toggle.disabled = false;
        if (res.ok) {
          shopOpenState = res.is_open;
          Router.renderNav();
          const statusText = document.getElementById('shop-status-text');
          if (statusText) {
            statusText.textContent = shopOpenState ? 'Open — accepting orders' : 'Closed — not accepting orders';
            statusText.className = 'status-dot ' + (shopOpenState ? 'is-open' : 'is-closed');
          }
        }
      };
      const span = document.createElement('span');
      span.className = 'pill';
      span.textContent = Session.shopName;
      const out = document.createElement('button');
      out.textContent = 'Log out';
      out.onclick = () => { Session.clear(); stopOrderPolling(); Router.showLanding(); };
      topnav.append(toggle, span, out);
    }
  },
  showLanding() { currentView = 'landing'; renderLanding(); this.renderNav(); },
  showDirectory() { currentView = 'directory'; renderShopDirectory(); this.renderNav(); },
  showLogin() { currentView = 'login'; renderLogin(); this.renderNav(); },
  showSignup() { currentView = 'signup'; renderSignup(); this.renderNav(); },
  showDashboard() { currentView = 'dashboard'; renderDashboard(); this.renderNav(); },
  showStorefront(shopId) { currentView = 'storefront'; renderStorefront(shopId); this.renderNav(); },
};

let currentView = 'landing';

function isCustomerView() {
  return new URLSearchParams(location.search).has('shop');
}

/* ---------------- landing / intro page ---------------- */
function renderLanding() {
  app.innerHTML = `
    <div class="landing">
      <section class="hero-video-section">
        <video class="hero-video" autoplay muted loop playsinline preload="auto">
          <source src="media/hero-bg.mp4" type="video/mp4">
        </video>
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <div class="landing-badge">Built for local shops</div>
          <h1 class="landing-title light">SkipQ</h1>
          <p class="landing-sub light">See what's on the shelf before you walk in.</p>

          <div class="intro-cards">
            <div class="intro-card">
              <div class="step-icon">${scanIconSvg()}</div>
              <h3>Scan the QR</h3>
              <p>No app. No signup. Just point your camera.</p>
            </div>
            <div class="intro-card">
              <div class="step-icon">${basketIconSvg()}</div>
              <h3>See what's in stock</h3>
              <p>Real inventory, updated live by the shop.</p>
            </div>
            <div class="intro-card">
              <div class="step-icon">${checkIconSvg()}</div>
              <h3>Skip the line</h3>
              <p>Order ahead, walk in, pay, and go.</p>
            </div>
          </div>

          <div class="landing-cta-row">
            <button class="btn landing-cta" id="enter-app-btn">Take me there →</button>
            <button class="btn landing-cta ghost" id="browse-shops-btn">Browse shops near you</button>
          </div>
        </div>
      </section>
    </div>
  `;
  document.getElementById('enter-app-btn').onclick = () => {
    if (Session.isLoggedIn()) Router.showDashboard();
    else Router.showLogin();
  };
  document.getElementById('browse-shops-btn').onclick = () => Router.showDirectory();
}

/* ---------------- shop directory (customer-facing browse + search) ---------------- */
let allShopsCache = null;

async function renderShopDirectory() {
  app.innerHTML = `
    <div class="directory">
      <h1 class="directory-title">Shops on SkipQ</h1>
      <p class="directory-sub">Browse every shop connected to SkipQ, or search by name.</p>
      <input type="text" id="shop-search" class="shop-search-input" placeholder="Search shops by name…" autocomplete="off" />
      <div id="shop-directory-list"><p style="color:#6b6152;">Loading shops…</p></div>
      <p class="switch-line"><a href="#" id="back-to-landing">&larr; Back</a></p>
    </div>
  `;
  document.getElementById('back-to-landing').onclick = (e) => { e.preventDefault(); Router.showLanding(); };

  const listEl = document.getElementById('shop-directory-list');
  try {
    const res = await API.call('listShops', {});
    if (!res.ok) {
      listEl.innerHTML = `<div class="error-msg">${escapeHtml(res.error)}</div>`;
      return;
    }
    allShopsCache = res.shops;
    renderShopDirectoryList(allShopsCache);
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><div class="glyph">✕</div>Couldn't load shops — check your connection and try again.</div>`;
    return;
  }

  document.getElementById('shop-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = !q ? allShopsCache : allShopsCache.filter(s => s.shop_name.toLowerCase().startsWith(q));
    renderShopDirectoryList(filtered);
  });
}

function renderShopDirectoryList(shops) {
  const listEl = document.getElementById('shop-directory-list');
  if (!shops || shops.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="glyph">◇</div>No shops match that search.</div>`;
    return;
  }
  listEl.innerHTML = shops.map(s => `
    <div class="shop-directory-row" data-id="${s.shop_id}">
      <div class="sdr-icon">${basketIconSvg()}</div>
      <div class="sdr-info">
        <div class="sdr-name">${escapeHtml(s.shop_name)}</div>
      </div>
      <span class="status-badge ${s.is_open ? 'status-ready' : 'status-done'}">${s.is_open ? 'Open' : 'Closed'}</span>
    </div>
  `).join('');
  listEl.querySelectorAll('.shop-directory-row').forEach(row => {
    row.onclick = () => {
      // Navigate to the exact same URL that shop's printed QR code encodes,
      // so the experience is identical either way.
      window.location.href = `${location.origin}${location.pathname}?shop=${row.dataset.id}`;
    };
  });
}

function scanIconSvg() {
  return `<svg viewBox="0 0 48 48" fill="none">
    <path d="M6 16V10C6 7.8 7.8 6 10 6H16" stroke="#E3A93C" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 6H38C40.2 6 42 7.8 42 10V16" stroke="#E3A93C" stroke-width="4" stroke-linecap="round"/>
    <path d="M42 32V38C42 40.2 40.2 42 38 42H32" stroke="#E3A93C" stroke-width="4" stroke-linecap="round"/>
    <path d="M16 42H10C7.8 42 6 40.2 6 38V32" stroke="#E3A93C" stroke-width="4" stroke-linecap="round"/>
    <rect x="17" y="17" width="14" height="14" rx="2" fill="#E3A93C"/>
  </svg>`;
}

function basketIconSvg() {
  return `<svg viewBox="0 0 48 48" fill="none">
    <path d="M14 20 C14 10, 34 10, 34 20" stroke="#E3A93C" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M9 20 L39 20 L34 40 C34 42, 32 43, 30 43 L18 43 C16 43, 14 42, 14 40 Z"
          fill="#E3A93C" stroke="#C7601F" stroke-width="2" stroke-linejoin="round"/>
    <line x1="19" y1="20" x2="17" y2="43" stroke="#C7601F" stroke-width="2"/>
    <line x1="24" y1="20" x2="24" y2="43" stroke="#C7601F" stroke-width="2"/>
    <line x1="29" y1="20" x2="31" y2="43" stroke="#C7601F" stroke-width="2"/>
  </svg>`;
}

function checkIconSvg() {
  return `<svg viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="19" stroke="#1B4332" stroke-width="4"/>
    <path d="M15 24.5L21 30.5L33 17.5" stroke="#1B4332" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---------------- login / signup ---------------- */
function renderLogin() {
  app.innerHTML = `
    <div class="auth-card">
      <h1>Welcome back</h1>
      <p class="sub">Log in to manage your shop's storefront.</p>
      <div id="auth-msg"></div>
      <form id="login-form">
        <div class="field"><label>Username</label><input name="username" required autocomplete="username"/></div>
        <div class="field"><label>Password</label><input name="password" type="password" required autocomplete="current-password"/></div>
        <button class="btn" type="submit">Log in</button>
      </form>
      <p class="switch-line">New shop? <a href="#" id="to-signup">Create an account</a></p>
      <p class="switch-line"><a href="#" id="to-landing">&larr; Back</a></p>
    </div>`;
  document.getElementById('to-signup').onclick = (e) => { e.preventDefault(); Router.showSignup(); };
  document.getElementById('to-landing').onclick = (e) => { e.preventDefault(); Router.showLanding(); };
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await API.call('login', { username: fd.get('username'), password: fd.get('password') });
    if (res.ok) {
      Session.set(res.shop_id, res.shop_name);
      Router.showDashboard();
    } else {
      showMsg('auth-msg', res.error, 'error', res.debug);
    }
  };
}

function renderSignup() {
  app.innerHTML = `
    <div class="auth-card">
      <h1>Set up your shop</h1>
      <p class="sub">Takes a minute. You'll get a QR code to print for your counter.</p>
      <div id="auth-msg"></div>
      <form id="signup-form">
        <div class="field"><label>Shop name</label><input name="shop_name" required/></div>
        <div class="field"><label>Username</label><input name="username" required autocomplete="username"/></div>
        <div class="field"><label>Password</label><input name="password" type="password" required autocomplete="new-password"/></div>
        <button class="btn" type="submit">Create shop</button>
      </form>
      <p class="switch-line">Already have a shop? <a href="#" id="to-login">Log in</a></p>
      <p class="switch-line"><a href="#" id="to-landing">&larr; Back</a></p>
    </div>`;
  document.getElementById('to-login').onclick = (e) => { e.preventDefault(); Router.showLogin(); };
  document.getElementById('to-landing').onclick = (e) => { e.preventDefault(); Router.showLanding(); };
  document.getElementById('signup-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await API.call('signup', {
      shop_name: fd.get('shop_name'), username: fd.get('username'), password: fd.get('password'),
    });
    if (res.ok) {
      Session.set(res.shop_id, res.shop_name);
      Router.showDashboard();
    } else {
      showMsg('auth-msg', res.error, 'error', res.debug);
    }
  };
}

function showMsg(elId, text, kind, debug) {
  const el = document.getElementById(elId);
  const debugHtml = debug ? `<pre style="font-size:0.72rem;white-space:pre-wrap;margin-top:8px;opacity:0.75;">${escapeHtml(JSON.stringify(debug, null, 2))}</pre>` : '';
  el.innerHTML = `<div class="${kind === 'error' ? 'error-msg' : 'ok-msg'}">${escapeHtml(text)}${debugHtml}</div>`;
}

/* ---------------- owner dashboard ---------------- */
let dashTab = 'items';

async function renderDashboard() {
  if (!Session.isLoggedIn()) return Router.showLogin();
  const shopId = Session.shopId;
  const storeUrl = `${location.origin}${location.pathname}?shop=${shopId}`;

  const shopInfo = await API.call('getShop', { shop_id: shopId });
  shopOpenState = shopInfo.ok ? shopInfo.is_open : true;
  Router.renderNav();
  startOrderPolling(shopId);

  app.innerHTML = `
    <div class="dash-head">
      <div>
        <h1>${escapeHtml(Session.shopName)}</h1>
        <div class="shop-tag">
          Your storefront dashboard ·
          <span id="shop-status-text" class="status-dot ${shopOpenState ? 'is-open' : 'is-closed'}">${shopOpenState ? 'Open — accepting orders' : 'Closed — not accepting orders'}</span>
        </div>
      </div>
    </div>
    <div class="tabs">
      <div class="tab ${dashTab === 'items' ? 'active' : ''}" data-tab="items">Store items</div>
      <div class="tab ${dashTab === 'orders' ? 'active' : ''}" data-tab="orders">Orders</div>
      <div class="tab ${dashTab === 'qr' ? 'active' : ''}" data-tab="qr">Your QR code</div>
    </div>
    <div id="dash-body"></div>
  `;
  app.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => { dashTab = t.dataset.tab; renderDashboard(); };
  });

  const body = document.getElementById('dash-body');

  if (dashTab === 'qr') {
    body.innerHTML = `
      <div class="qr-box">
        <div id="qr-canvas-holder" class="qr-canvas-holder">Generating QR…</div>
        <div class="qr-link">${escapeHtml(storeUrl)}</div>
        <div class="qr-actions">
          <button class="btn secondary" id="download-qr-btn">Download QR</button>
          <button class="btn" id="share-qr-btn">Share QR</button>
        </div>
      </div>
      <p style="color:#6b6152;font-size:0.9rem;">Print this and stick it at your counter. When a customer scans it, they'll be prompted to add your shop as a shortcut on their home screen — no app store needed. The SkipQ basket is baked into every QR you download or share.</p>
    `;
    await mountShopQr(storeUrl);
    return;
  }

  if (dashTab === 'items') {
    body.innerHTML = `
      <button class="fab" id="show-add">+ New item</button>
      <div id="add-form-wrap"></div>
      <div id="items-list"><p>Loading items…</p></div>
    `;
    document.getElementById('show-add').onclick = () => renderAddForm();
    loadOwnerItems(shopId);
    return;
  }

  if (dashTab === 'orders') {
    body.innerHTML = `
      <div id="notify-row"></div>
      <div id="orders-list"><p>Loading orders…</p></div>
    `;
    renderNotifyRow();
    loadOwnerOrders(shopId);
  }
}

/* ---------------- QR code generation (with logo baked in) ---------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Generates a QR code locally (high error-correction) and stamps the SkipQ
// basket logo in the center on a white pad, so downloaded/shared QR images
// always carry the brand mark and stay reliably scannable.
// Generates a QR code with the SkipQ logo baked in, plus a branded text
// band underneath naming the shop — so the downloaded/shared image reads as
// "[Shop]'s online ordering," not just a bare unlabeled QR code.
async function generateQrWithLogo(text, size = 280, shopName = '') {
  const bandHeight = shopName ? Math.round(size * 0.32) : 0;
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-9999px';
  document.body.appendChild(holder);

  new QRCode(holder, {
    text,
    width: size,
    height: size,
    correctLevel: QRCode.CorrectLevel.H,
  });
  const qrCanvas = holder.querySelector('canvas');

  const composite = document.createElement('canvas');
  composite.width = size;
  composite.height = size + bandHeight;
  const ctx = composite.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, composite.width, composite.height);
  ctx.drawImage(qrCanvas, 0, 0, size, size);

  try {
    const logo = await loadImage('icon.svg');
    const logoSize = size * 0.20;
    const pad = size * 0.035;
    const boxW = logoSize + pad * 2;
    const boxH = logoSize + pad * 2;
    const boxX = (size - boxW) / 2;
    const boxY = (size - boxH) / 2;
    ctx.fillStyle = '#FFFFFF';
    roundRectPath(ctx, boxX, boxY, boxW, boxH, size * 0.02);
    ctx.fill();
    roundRectPath(ctx, (size - logoSize) / 2 - pad * 0.4, (size - logoSize) / 2 - pad * 0.4, logoSize + pad * 0.8, logoSize + pad * 0.8, size * 0.015);
    ctx.save();
    ctx.clip();
    ctx.drawImage(logo, (size - logoSize) / 2, (size - logoSize) / 2, logoSize, logoSize);
    ctx.restore();
  } catch (e) {
    // Logo failed to load (e.g. offline) — the plain QR still works fine without it.
  }

  if (shopName) {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    const bandY = size;
    ctx.fillStyle = '#1B4332';
    ctx.fillRect(0, bandY, size, bandHeight);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FAF7EF';
    ctx.font = `700 ${Math.round(size * 0.072)}px Fraunces, Georgia, serif`;
    ctx.fillText(truncateForCanvas(ctx, shopName, size * 0.9), size / 2, bandY + bandHeight * 0.42);
    ctx.fillStyle = '#E3A93C';
    ctx.font = `600 ${Math.round(size * 0.05)}px Inter, sans-serif`;
    ctx.fillText('Scan for online ordering', size / 2, bandY + bandHeight * 0.72);
  }

  document.body.removeChild(holder);
  return composite;
}

function truncateForCanvas(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

async function mountShopQr(storeUrl) {
  const holder = document.getElementById('qr-canvas-holder');
  const canvas = await generateQrWithLogo(storeUrl, 280, Session.shopName);
  canvas.className = 'qr-canvas';
  holder.innerHTML = '';
  holder.appendChild(canvas);

  const fileNameBase = (Session.shopName || 'shop').replace(/[^a-z0-9]+/gi, '_');

  document.getElementById('download-qr-btn').onclick = () => {
    const a = document.createElement('a');
    a.download = `${fileNameBase}_QR.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  document.getElementById('share-qr-btn').onclick = () => {
    canvas.toBlob(async (blob) => {
      const file = new File([blob], `${fileNameBase}_QR.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${Session.shopName} on SkipQ`,
            text: `Scan to see what's fresh at ${Session.shopName} — order ahead and skip the line.`,
          });
        } catch (e) { /* user cancelled the share sheet */ }
      } else {
        // Desktop / unsupported browsers: fall back to a direct download.
        const a = document.createElement('a');
        a.download = `${fileNameBase}_QR.png`;
        a.href = URL.createObjectURL(blob);
        a.click();
      }
    }, 'image/png');
  };
}

function renderAddForm() {
  const wrap = document.getElementById('add-form-wrap');
  wrap.innerHTML = `
    <div class="add-form">
      <h3>Add a new item</h3>
      <div id="add-msg"></div>
      <form id="add-item-form">
        <div class="field"><label>Item name</label><input name="name" required/></div>
        <div class="field">
          <label>Photo (optional)</label>
          <input type="file" id="item-image-input" accept="image/*" capture="environment" />
          <div id="image-preview" class="image-preview"></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Price</label><input name="price" type="number" step="0.01" min="0" required/></div>
          <div class="field">
            <label>Unit</label>
            <select name="unit_type">
              <option value="per_gram">per gram</option>
              <option value="per_kg">per kg</option>
              <option value="per_item">per item</option>
            </select>
          </div>
        </div>
        <button class="btn" type="submit">Add to store</button>
      </form>
    </div>
  `;

  const fileInput = document.getElementById('item-image-input');
  fileInput.addEventListener('change', () => {
    const preview = document.getElementById('image-preview');
    const f = fileInput.files[0];
    if (!f) { preview.innerHTML = ''; return; }
    const reader = new FileReader();
    reader.onload = (ev) => { preview.innerHTML = `<img src="${ev.target.result}" alt="Preview"/>`; };
    reader.readAsDataURL(f);
  });

  document.getElementById('add-item-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const submitBtn = e.target.querySelector('button[type=submit]');
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;

    try {
      let image_url = '';
      const file = fileInput.files[0];
      if (file) {
        submitBtn.textContent = 'Uploading photo…';
        const dataUrl = await resizeImageFile(file, 900, 0.82);
        const base64 = dataUrl.split(',')[1];
        const uploadRes = await API.call('uploadImage', {
          shop_id: Session.shopId,
          file_data: base64,
          mime_type: 'image/jpeg',
          file_name: `${Session.shopId}_${Date.now()}.jpg`,
        });
        if (!uploadRes.ok) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
          showMsg('add-msg', uploadRes.error || 'Photo upload failed.', 'error');
          return;
        }
        image_url = uploadRes.image_url;
      }

      submitBtn.textContent = 'Adding item…';
      const res = await API.call('addItem', {
        shop_id: Session.shopId,
        name: fd.get('name'),
        image_url,
        price: fd.get('price'),
        unit_type: fd.get('unit_type'),
      });
      if (res.ok) {
        wrap.innerHTML = '';
        loadOwnerItems(Session.shopId);
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        showMsg('add-msg', res.error, 'error', res.debug);
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
      showMsg('add-msg', 'Something went wrong — check your connection and try again.', 'error');
    }
  };
}

// Resizes + compresses a photo client-side before upload, so a phone camera
// shot (often several MB) becomes a small, fast-to-upload JPEG.
function resizeImageFile(file, maxDim = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

async function loadOwnerItems(shopId) {
  const res = await API.call('getItems', { shop_id: shopId });
  const list = document.getElementById('items-list');
  if (!res.ok) { list.innerHTML = `<div class="error-msg">${escapeHtml(res.error)}</div>`; return; }
  if (res.items.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="glyph">◇</div>No items yet — add your first one above.</div>`;
    return;
  }
  list.innerHTML = res.items.map(item => `
    <div class="item-row ${item.in_stock ? '' : 'out-of-stock-row'}">
      <div class="thumb-wrap">
        ${item.image_url
          ? `<img class="thumb" src="${escapeAttr(item.image_url)}" alt="" onerror="this.style.display='none'"/>`
          : `<div class="item-thumb-fallback">◇</div>`}
        ${item.in_stock ? '' : '<div class="stock-stamp">OUT OF STOCK</div>'}
      </div>
      <div class="item-info">
        <div class="name">${escapeHtml(item.name)}${item.is_new ? '<span class="new-badge">New</span>' : ''}</div>
        <div class="meta">₹${Number(item.price).toFixed(2)} ${unitLabel(item.unit_type)}</div>
      </div>
      <button class="stock-toggle-btn ${item.in_stock ? '' : 'is-out'}" data-id="${item.item_id}" data-next="${item.in_stock ? 'false' : 'true'}">
        ${item.in_stock ? 'Mark out of stock' : 'Mark in stock'}
      </button>
      <button class="del-btn" data-id="${item.item_id}" title="Delete item">✕</button>
    </div>
  `).join('');
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this item?')) return;
      await API.call('deleteItem', { shop_id: shopId, item_id: btn.dataset.id });
      loadOwnerItems(shopId);
    };
  });
  list.querySelectorAll('.stock-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      await API.call('setItemStock', { shop_id: shopId, item_id: btn.dataset.id, in_stock: btn.dataset.next === 'true' });
      loadOwnerItems(shopId);
    };
  });
}

async function loadOwnerOrders(shopId) {
  const res = await API.call('getOrders', { shop_id: shopId });
  const list = document.getElementById('orders-list');
  if (!res.ok) { list.innerHTML = `<div class="error-msg">${escapeHtml(res.error)}</div>`; return; }
  if (res.orders.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="glyph">◇</div>No orders yet.</div>`;
    return;
  }
  list.innerHTML = res.orders.map(o => `
    <div class="order-card">
      <div class="oc-top">
        <span class="oc-name">${escapeHtml(o.customer_name)}</span>
        <span class="status-badge status-${statusClass(o.status)}">${escapeHtml(o.status)}</span>
      </div>
      <div class="oc-items">${(o.items || []).map(i => `${escapeHtml(i.name)} × ${i.qty}`).join(', ')}</div>
      <div class="oc-actions">
        ${o.status === 'pending' ? `<button class="primary" data-id="${o.order_id}" data-status="ready">Mark ready</button>` : ''}
        ${o.status !== 'done' ? `<button data-id="${o.order_id}" data-status="done">Mark picked up</button>` : ''}
      </div>
    </div>
  `).join('');
  list.querySelectorAll('button[data-status]').forEach(btn => {
    btn.onclick = async () => {
      await API.call('updateOrderStatus', { shop_id: shopId, order_id: btn.dataset.id, status: btn.dataset.status });
      loadOwnerOrders(shopId);
    };
  });
}

/* ---------------- order notifications (owner side) ----------------
   There's no true push infrastructure here (that needs a real backend with
   VAPID keys, which Apps Script doesn't do) — so this polls for new orders
   every 20s while the dashboard tab is open, and fires a browser
   Notification the moment a new one shows up. It won't fire if the tab/site
   is fully closed, only while it's open (even in the background). */
let pollIntervalId = null;
let knownOrderIds = null;

async function startOrderPolling(shopId) {
  if (pollIntervalId) return; // already running for this session
  try {
    const res = await API.call('getOrders', { shop_id: shopId });
    knownOrderIds = new Set(res.ok ? res.orders.map(o => o.order_id) : []);
  } catch (e) {
    knownOrderIds = new Set();
  }
  pollIntervalId = setInterval(() => pollForNewOrders(shopId), 20000);
}

function stopOrderPolling() {
  if (pollIntervalId) { clearInterval(pollIntervalId); pollIntervalId = null; }
  knownOrderIds = null;
}

async function pollForNewOrders(shopId) {
  try {
    const res = await API.call('getOrders', { shop_id: shopId });
    if (!res.ok) return;
    const currentIds = new Set(res.orders.map(o => o.order_id));
    const newOnes = res.orders.filter(o => knownOrderIds && !knownOrderIds.has(o.order_id));
    knownOrderIds = currentIds;

    if (newOnes.length === 0) return;

    if ('Notification' in window && Notification.permission === 'granted') {
      newOnes.forEach(o => {
        const itemsSummary = (o.items || []).map(i => `${i.name} × ${i.qty}`).join(', ');
        const n = new Notification(`New order — ${Session.shopName}`, {
          body: `${o.customer_name}: ${itemsSummary}`,
          icon: 'icon.svg',
        });
        n.onclick = () => { window.focus(); };
      });
    }
    if (dashTab === 'orders' && document.getElementById('orders-list')) {
      loadOwnerOrders(shopId);
    }
  } catch (e) { /* transient network error — try again on next poll */ }
}

function renderNotifyRow() {
  const row = document.getElementById('notify-row');
  if (!row) return;
  if (!('Notification' in window)) { row.innerHTML = ''; return; }
  if (Notification.permission === 'granted') {
    row.innerHTML = `<div class="notify-status">🔔 Order notifications are on — you'll be alerted while this tab is open.</div>`;
  } else if (Notification.permission === 'denied') {
    row.innerHTML = `<div class="notify-status muted">Notifications are blocked in your browser settings for this site.</div>`;
  } else {
    row.innerHTML = `<button class="btn secondary notify-btn" id="enable-notify-btn">🔔 Enable order notifications</button>`;
    document.getElementById('enable-notify-btn').onclick = async () => {
      await Notification.requestPermission();
      renderNotifyRow();
    };
  }
}

function statusClass(s) {
  if (s === 'pending') return 'pending';
  if (s === 'ready') return 'ready';
  return 'done';
}

/* ---------------- customer storefront ---------------- */
let cart = {}; // item_id -> { name, price, unit_type, qty }
let storeShopId = null;
let storeItems = [];
let storeIsOpen = true;

async function renderStorefront(shopId) {
  storeShopId = shopId;
  cart = {};
  registerDynamicManifest(shopId);

  app.innerHTML = `<p>Loading store…</p>`;
  let shopRes, itemsRes;
  try {
    shopRes = await API.call('getShop', { shop_id: shopId });
    itemsRes = await API.call('getItems', { shop_id: shopId });
  } catch (err) {
    app.innerHTML = `<div class="empty-state"><div class="glyph">✕</div>Couldn't reach the store — check your connection and reload.</div>`;
    return;
  }
  if (!shopRes.ok) {
    app.innerHTML = `<div class="empty-state"><div class="glyph">✕</div>${escapeHtml(shopRes.error)}</div>`;
    return;
  }
  storeItems = itemsRes.ok ? itemsRes.items : [];
  storeIsOpen = shopRes.is_open;

  app.innerHTML = `
    <div class="store-head">
      <h1>${escapeHtml(shopRes.shop_name)}</h1>
      <div class="tagline">What's available right now</div>
    </div>
    ${storeIsOpen ? '' : `<div class="closed-banner">This shop is currently <strong>closed</strong> and not accepting orders right now. You can still browse what they carry.</div>`}
    <div id="install-banner-slot"></div>
    <div id="store-grid"></div>
  `;
  renderGrid();
  initInstallBanner(shopRes.shop_name);
}

function renderGrid() {
  const grid = document.getElementById('store-grid');
  if (storeItems.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="glyph">◇</div>This shop hasn't added items yet.</div>`;
    return;
  }
  grid.className = 'grid';
  grid.innerHTML = storeItems.map(item => {
    const outOfStock = !item.in_stock;
    return `
    <div class="product-card ${outOfStock ? 'out-of-stock' : ''}">
      <div class="img-wrap">
        ${item.image_url
          ? `<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.name)}" onerror="this.parentElement.innerHTML='<div class=ph-fallback>◇</div>'"/>`
          : `<div class="ph-fallback">◇</div>`}
        ${outOfStock ? '<div class="stock-stamp">OUT OF STOCK</div>' : ''}
      </div>
      <div class="pc-body">
        <div class="pc-name">${escapeHtml(item.name)}${item.is_new ? '<span class="new-badge">New</span>' : ''}</div>
        <div class="pc-price">₹${Number(item.price).toFixed(2)} ${unitLabel(item.unit_type)}</div>
        ${!storeIsOpen ? `<div class="qty-stepper disabled">Not accepting orders</div>`
          : outOfStock ? `<div class="qty-stepper disabled">Out of stock</div>`
          : `
          <div class="qty-stepper" data-id="${item.item_id}">
            <button data-action="minus">−</button>
            <span class="count">0</span>
            <button data-action="plus">+</button>
          </div>
        `}
      </div>
    </div>
  `;
  }).join('');

  if (!storeIsOpen) return; // no ordering controls to wire up while closed

  grid.querySelectorAll('.qty-stepper:not(.disabled)').forEach(stepper => {
    const itemId = stepper.dataset.id;
    const item = storeItems.find(i => i.item_id === itemId);
    const countEl = stepper.querySelector('.count');
    stepper.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        const delta = btn.dataset.action === 'plus' ? 1 : -1;
        const current = cart[itemId]?.qty || 0;
        const next = Math.max(0, current + delta);
        if (next === 0) delete cart[itemId];
        else cart[itemId] = { name: item.name, price: item.price, unit_type: item.unit_type, qty: next, item_id: itemId };
        countEl.textContent = next;
        renderCartBar();
      };
    });
  });
  renderCartBar();
}

function renderCartBar() {
  let bar = document.getElementById('cart-bar');
  const totalItems = Object.values(cart).reduce((s, c) => s + c.qty, 0);
  if (totalItems === 0) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cart-bar';
    bar.className = 'cart-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <button id="review-order">Review order</button>
    <span class="cart-count">${totalItems} item${totalItems > 1 ? 's' : ''} in cart</span>
  `;
  document.getElementById('review-order').onclick = openCartModal;
}

function openCartModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Your order</h3>
      <div class="cart-list">
        ${Object.entries(cart).map(([id, c]) => `
          <div class="cart-item"><span>${escapeHtml(c.name)} × ${c.qty}</span><span>₹${(c.price * c.qty).toFixed(2)}</span></div>
        `).join('')}
      </div>
      <div id="order-msg"></div>
      <div class="field"><label>Your name</label><input id="customer-name" placeholder="So the shop knows who to prep for"/></div>
      <button class="btn" id="place-order-btn">Place order</button>
      <button class="btn secondary" id="close-modal" style="margin-top:8px;">Keep browsing</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  document.getElementById('close-modal').onclick = () => backdrop.remove();
  document.getElementById('place-order-btn').onclick = async () => {
    const name = document.getElementById('customer-name').value.trim();
    if (!name) { showMsg('order-msg', 'Please enter your name', 'error'); return; }

    const placeBtn = document.getElementById('place-order-btn');
    placeBtn.disabled = true;
    placeBtn.textContent = 'Placing order…';

    const itemsPayload = Object.values(cart).map(c => ({ name: c.name, qty: c.qty, item_id: c.item_id }));
    try {
      const res = await API.call('placeOrder', {
        shop_id: storeShopId,
        customer_name: name,
        items_json: JSON.stringify(itemsPayload),
      });
      if (res.ok) {
        backdrop.querySelector('.modal').innerHTML = `
          <h3>Order sent ✓</h3>
          <p style="color:#6b6152;">The shop will start preparing your order. Just walk in, pay, and go.</p>
          <button class="btn" id="done-btn">Done</button>
        `;
        document.getElementById('done-btn').onclick = () => { backdrop.remove(); cart = {}; renderGrid(); };
      } else {
        placeBtn.disabled = false;
        placeBtn.textContent = 'Place order';
        showMsg('order-msg', res.error || 'Something went wrong placing your order.', 'error', res.debug);
      }
    } catch (err) {
      placeBtn.disabled = false;
      placeBtn.textContent = 'Place order';
      showMsg('order-msg', 'Could not reach the store — check your connection and try again.', 'error');
    }
  };
}

/* ---------------- dynamic per-shop manifest (Add to Home Screen) ---------------- */
function registerDynamicManifest(shopId) {
  const shopName = document.title;
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'getShop', shop_id: shopId }),
  }).then(r => r.json()).then(res => {
    const name = res.ok ? res.shop_name : 'SkipQ';
    const manifest = {
      name: name,
      short_name: name.length > 12 ? name.slice(0, 12) : name,
      start_url: `${location.pathname}?shop=${shopId}`,
      display: 'standalone',
      background_color: '#FAF7EF',
      theme_color: '#1B4332',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    document.getElementById('manifest-link').setAttribute('href', url);
  });
}

/* ---------------- "Add to Home Screen" banner ----------------
   No browser fires an automatic install popup just from having a manifest.
   Chrome/Android will let a page trigger its OWN install prompt if we
   capture the `beforeinstallprompt` event — so we show our own banner and
   button instead of waiting for the browser's unreliable built-in one.
   iOS Safari has no install-prompt API at all — the only path there is the
   manual Share -> Add to Home Screen, so we show instructions instead. */
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  renderInstallBannerIfPresent();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const slot = document.getElementById('install-banner-slot');
  if (slot) slot.innerHTML = '';
});

function isStandaloneDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

let pendingInstallShopName = null;

function initInstallBanner(shopName) {
  pendingInstallShopName = shopName;
  if (isStandaloneDisplay()) return; // already installed/opened as an app — no banner needed
  renderInstallBannerIfPresent();
}

function renderInstallBannerIfPresent() {
  const slot = document.getElementById('install-banner-slot');
  if (!slot || isStandaloneDisplay()) return;
  const shopName = pendingInstallShopName || 'this shop';

  if (deferredInstallPrompt) {
    slot.innerHTML = `
      <div class="install-banner">
        <span>Add <strong>${escapeHtml(shopName)}</strong> to your home screen for one-tap access next time.</span>
        <button id="install-btn">Add</button>
        <button id="dismiss-install" class="dismiss">✕</button>
      </div>`;
    document.getElementById('install-btn').onclick = async () => {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      slot.innerHTML = '';
    };
    document.getElementById('dismiss-install').onclick = () => { slot.innerHTML = ''; };
  } else if (isIOS()) {
    slot.innerHTML = `
      <div class="install-banner">
        <span>Add <strong>${escapeHtml(shopName)}</strong> to your home screen: tap the Share icon <strong>⬆</strong> below, then "Add to Home Screen."</span>
        <button id="dismiss-install" class="dismiss">✕</button>
      </div>`;
    document.getElementById('dismiss-install').onclick = () => { slot.innerHTML = ''; };
  }
}

/* ---------------- utils ---------------- */
function unitLabel(u) {
  return { per_gram: '/ gram', per_kg: '/ kg', per_item: '/ item' }[u] || '';
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

/* ---------------- boot ---------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
Router.init();

// onedrive-picker.js — OneDrive file browser for the app (website only, no extension).
// Exposes window.__ptOneDrivePicker with:
//   configure({ supabase, extractText })  — call once at boot
//   pick() -> Promise<{ text, name, warning } | { error } | null>
//
// Unlike Google Drive, there's no lightweight embeddable OneDrive widget that reuses
// an existing OAuth session without a second app registration / redirect URI. So this
// builds a small self-contained modal directly against the Microsoft Graph API using
// the same access token Supabase already holds from Microsoft sign-in — no extra
// picker SDK, no extra API key. Navigation: "My files" (OneDrive root + folder
// drill-down, breadcrumb trail) and "Shared with me".
//
// Requires:
//   a Supabase client where the teacher signed in with provider 'azure'
//   (provides session.provider_token = a Microsoft Graph access token)
//
// Scope: Files.Read (delegated), requested incrementally the first time the teacher
// opens the picker — mirrors the Drive picker's incremental drive.file consent.
//
// Files picked are downloaded as their native bytes (Word docs on OneDrive are
// already .docx, so — unlike Google Docs — no export step is needed) and handed to
// the same __ptFileExtract module used everywhere else, which already parses .docx
// via mammoth.js.

(function () {
  'use strict';

  var cfg = { supabase: null, extractText: null };
  var GRAPH = 'https://graph.microsoft.com/v1.0';
  var GRANTED_KEY = 'pt_od_granted';
  // Microsoft's v2 endpoint resolves bare short-form scope names against a default
  // resource, which is unreliable once OIDC scopes (openid/email/profile) are mixed with
  // a Graph API permission scope — especially for personal/consumer (MSA) accounts. The
  // fix is to fully qualify Graph scopes with their resource URI; bare 'Files.Read' was
  // silently granting a token WITHOUT Files.Read, so hasFilesScope()'s probe kept failing
  // and requestFilesScope() kept re-triggering — an infinite reconsent loop even after the
  // teacher approved the consent screen each time.
  var FILES_SCOPE = 'https://graph.microsoft.com/Files.Read';
  var SELECTABLE_EXT = /\.(docx|pdf|txt|md)$/i;

  function configure(o) { Object.assign(cfg, o || {}); }

  async function getMicrosoftAccessToken() {
    if (!cfg.supabase) return null;
    var res = await cfg.supabase.auth.getSession();
    return (res && res.data && res.data.session && res.data.session.provider_token) || null;
  }

  // Incremental consent to add Files.Read. Redirects away and returns the teacher
  // to the same page with a Files-capable provider_token.
  async function requestFilesScope() {
    if (!cfg.supabase) return;
    await cfg.supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: 'openid email profile offline_access ' + FILES_SCOPE,
        queryParams: { prompt: 'consent' },
      },
    });
  }

  // Verify the current token can reach OneDrive. sessionStorage flag short-circuits
  // repeat checks; otherwise a lightweight /me/drive probe confirms.
  async function hasFilesScope() {
    if (sessionStorage.getItem(GRANTED_KEY) === '1') return true;
    var token = await getMicrosoftAccessToken();
    if (!token) return false;
    try {
      var resp = await fetch(GRAPH + '/me/drive', { headers: { Authorization: 'Bearer ' + token } });
      if (resp.ok) { sessionStorage.setItem(GRANTED_KEY, '1'); return true; }
    } catch (e) { /* fall through */ }
    return false;
  }

  // ── Graph calls ──────────────────────────────────────────────────────────────
  async function graphGet(token, path) {
    var resp = await fetch(GRAPH + path, { headers: { Authorization: 'Bearer ' + token } });
    if (resp.status === 401 || resp.status === 403) {
      sessionStorage.removeItem(GRANTED_KEY);
      throw new Error('Your Microsoft OneDrive access expired. Click OneDrive again to reconnect.');
    }
    if (!resp.ok) throw new Error('OneDrive request failed (' + resp.status + ').');
    return resp.json();
  }

  function isSelectable(item) {
    if (item.folder) return true;
    return SELECTABLE_EXT.test(item.name || '');
  }

  async function listChildren(token, driveId, itemId) {
    var base = driveId ? '/drives/' + encodeURIComponent(driveId) : '/me/drive';
    var path = itemId
      ? base + '/items/' + encodeURIComponent(itemId) + '/children'
      : base + '/root/children';
    var data = await graphGet(token, path + '?$top=200&$select=id,name,file,folder,parentReference,remoteItem');
    return (data.value || []).filter(isSelectable);
  }

  async function listSharedWithMe(token) {
    var data = await graphGet(token, '/me/drive/sharedWithMe?$select=id,name,file,folder,remoteItem');
    return (data.value || []).filter(isSelectable);
  }

  // Download a picked item's bytes, then extract text via the shared module.
  async function fetchItemAsText(item, token) {
    var name = item.name || 'file';
    // Items from "Shared with me" carry their real location under remoteItem.
    var remote = item.remoteItem;
    var driveId = remote ? remote.parentReference && remote.parentReference.driveId : null;
    var itemId = remote ? remote.id : item.id;
    var base = driveId ? '/drives/' + encodeURIComponent(driveId) : '/me/drive';
    var url = GRAPH + base + '/items/' + encodeURIComponent(itemId) + '/content';

    var resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
      sessionStorage.removeItem(GRANTED_KEY);
      return { error: 'Your Microsoft OneDrive access expired. Click OneDrive again to reconnect.' };
    }
    if (!resp.ok) return { error: 'OneDrive download failed (' + resp.status + ').' };

    var contentType = (item.file && item.file.mimeType) || 'application/octet-stream';
    var blob = await resp.blob();
    var file = new File([blob], name, { type: contentType });
    var extracted = await cfg.extractText(file); // -> { text, warning, error }
    if (extracted.error) return { error: extracted.error };
    return { text: extracted.text, name: name, warning: extracted.warning };
  }

  // ── Modal UI ─────────────────────────────────────────────────────────────────
  var STYLE_ID = 'pt-od-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.pt-od-overlay{position:fixed;inset:0;background:rgba(26,34,53,.45);z-index:9999;' +
        'display:flex;align-items:center;justify-content:center;font-family:inherit}' +
      '.pt-od-modal{background:#fff;border-radius:14px;width:min(560px,92vw);max-height:80vh;' +
        'display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden}' +
      '.pt-od-head{padding:16px 18px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;gap:10px}' +
      '.pt-od-head h3{margin:0;font-size:1rem;flex:1}' +
      '.pt-od-close{background:none;border:none;font-size:1.2rem;cursor:pointer;color:#666;line-height:1;padding:4px}' +
      '.pt-od-tabs{display:flex;gap:6px;padding:10px 18px 0}' +
      '.pt-od-tab{background:none;border:none;padding:8px 10px;border-radius:8px 8px 0 0;cursor:pointer;' +
        'font-size:.86rem;color:#555;border-bottom:2px solid transparent}' +
      '.pt-od-tab.active{color:#2a7a6b;border-bottom-color:#2a7a6b;font-weight:600}' +
      '.pt-od-crumbs{padding:8px 18px;font-size:.8rem;color:#777;border-bottom:1px solid #e4e7ec}' +
      '.pt-od-crumbs button{background:none;border:none;color:#2a7a6b;cursor:pointer;padding:0;font-size:inherit}' +
      '.pt-od-list{overflow-y:auto;padding:6px;flex:1;min-height:180px}' +
      '.pt-od-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:.9rem}' +
      '.pt-od-row:hover{background:#f2f6f5}' +
      '.pt-od-row .ic{width:20px;text-align:center}' +
      '.pt-od-empty,.pt-od-loading,.pt-od-error{padding:30px 18px;text-align:center;color:#888;font-size:.88rem}' +
      '.pt-od-error{color:#b3432a}';
    document.head.appendChild(s);
  }

  // Renders the picker modal and resolves with the chosen item (or null on cancel).
  function openModal(token) {
    ensureStyle();
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'pt-od-overlay';
      overlay.innerHTML =
        '<div class="pt-od-modal" role="dialog" aria-label="Choose a file from OneDrive">' +
          '<div class="pt-od-head"><h3>☁️ OneDrive</h3><button class="pt-od-close" type="button" aria-label="Close">✕</button></div>' +
          '<div class="pt-od-tabs">' +
            '<button class="pt-od-tab active" data-tab="mine">My files</button>' +
            '<button class="pt-od-tab" data-tab="shared">Shared with me</button>' +
          '</div>' +
          '<div class="pt-od-crumbs" hidden></div>' +
          '<div class="pt-od-list"><div class="pt-od-loading">Loading…</div></div>' +
        '</div>';
      document.body.appendChild(overlay);

      var listEl = overlay.querySelector('.pt-od-list');
      var crumbsEl = overlay.querySelector('.pt-od-crumbs');
      var tabs = overlay.querySelectorAll('.pt-od-tab');
      var activeTab = 'mine';
      var path = []; // [{id, name}] breadcrumb stack for "My files"

      function finish(item) {
        document.body.removeChild(overlay);
        resolve(item || null);
      }
      overlay.querySelector('.pt-od-close').addEventListener('click', function () { finish(null); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(null); });

      function iconFor(item) { return item.folder ? '📁' : '📄'; }

      function renderCrumbs() {
        if (activeTab !== 'mine' || !path.length) { crumbsEl.hidden = true; return; }
        crumbsEl.hidden = false;
        var html = '<button data-idx="-1">My files</button>';
        path.forEach(function (p, i) { html += ' / <button data-idx="' + i + '">' + escapeHtml(p.name) + '</button>'; });
        crumbsEl.innerHTML = html;
        crumbsEl.querySelectorAll('button').forEach(function (b) {
          b.addEventListener('click', function () {
            var idx = parseInt(b.getAttribute('data-idx'), 10);
            path = idx < 0 ? [] : path.slice(0, idx + 1);
            loadMine();
          });
        });
      }

      function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function renderList(items) {
        if (!items.length) { listEl.innerHTML = '<div class="pt-od-empty">Nothing here.</div>'; return; }
        listEl.innerHTML = items.map(function (item, i) {
          return '<div class="pt-od-row" data-i="' + i + '"><span class="ic">' + iconFor(item) + '</span>' +
            '<span>' + escapeHtml(item.name) + '</span></div>';
        }).join('');
        listEl.querySelectorAll('.pt-od-row').forEach(function (row) {
          row.addEventListener('click', function () {
            var item = items[parseInt(row.getAttribute('data-i'), 10)];
            if (item.folder) {
              if (activeTab === 'mine') { path.push({ id: item.id, name: item.name }); loadMine(); }
              // Shared folders aren't drilled into in this first pass — pick a file instead.
              return;
            }
            finish(item);
          });
        });
      }

      function showError(msg) { listEl.innerHTML = '<div class="pt-od-error">' + escapeHtml(msg) + '</div>'; }

      function loadMine() {
        renderCrumbs();
        listEl.innerHTML = '<div class="pt-od-loading">Loading…</div>';
        var cur = path.length ? path[path.length - 1] : null;
        listChildren(token, null, cur ? cur.id : null).then(renderList).catch(function (e) { showError(e.message); });
      }

      function loadShared() {
        crumbsEl.hidden = true;
        listEl.innerHTML = '<div class="pt-od-loading">Loading…</div>';
        listSharedWithMe(token).then(renderList).catch(function (e) { showError(e.message); });
      }

      tabs.forEach(function (t) {
        t.addEventListener('click', function () {
          tabs.forEach(function (x) { x.classList.remove('active'); });
          t.classList.add('active');
          activeTab = t.getAttribute('data-tab');
          if (activeTab === 'mine') { path = []; loadMine(); } else { loadShared(); }
        });
      });

      loadMine();
    });
  }

  async function pick() {
    if (!cfg.supabase || !cfg.extractText) return { error: 'OneDrive picker isn’t configured.' };
    var token = await getMicrosoftAccessToken();
    if (!token || !(await hasFilesScope())) {
      // Kick off incremental consent; the page redirects and returns.
      await requestFilesScope();
      return { error: 'Connecting to OneDrive — you’ll be brought right back. Click OneDrive again once you return.' };
    }

    var item = await openModal(token);
    if (!item) return null;

    try {
      return await fetchItemAsText(item, token);
    } catch (e) {
      return { error: 'OneDrive import failed: ' + ((e && e.message) || 'error') };
    }
  }

  window.__ptOneDrivePicker = { configure: configure, pick: pick };
})();

// drive-picker.js — Google Drive Picker for the app, adapted from papertrail-write.
// Exposes window.__ptDrivePicker with:
//   configure({ supabase, extractText, developerKey, appId })  — call once at boot
//   pick()  -> Promise<{ text, name, warning } | { error } | null>
//
// The picked file is downloaded/exported to a File, then run through the shared
// __ptFileExtract module so a Google Doc / PDF / DOCX all come back as plain text
// ready to drop into a box. Navigation mirrors papertrail-write: My Drive /
// Shared with me / Shared drives tabs, folders shown, LIST view, last-folder memory.
//
// Requires (loaded by the host page):
//   https://apis.google.com/js/api.js   (gapi)
//   a Supabase client where the teacher signed in with Google (provides provider_token)
//
// Drive scope: https://www.googleapis.com/auth/drive.file  (per-file, least-privilege).
// It is requested incrementally the first time the teacher opens the picker.

(function () {
  'use strict';

  var cfg = { supabase: null, extractText: null, developerKey: '', appId: '' };
  var _pickerReady = false;
  var LAST_FOLDER_KEY = 'pt_drive_last_folder_id';
  var GRANTED_KEY = 'pt_drive_granted';
  var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

  function configure(o) { Object.assign(cfg, o || {}); }

  async function getGoogleAccessToken() {
    if (!cfg.supabase) return null;
    var res = await cfg.supabase.auth.getSession();
    return (res && res.data && res.data.session && res.data.session.provider_token) || null;
  }

  // Incremental OAuth to add the Drive scope. Redirects away and returns the
  // teacher to the same page with a Drive-capable provider_token.
  async function requestDriveScope() {
    if (!cfg.supabase) return;
    await cfg.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: 'openid email profile ' + DRIVE_SCOPE,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
  }

  // Verify the current token can reach Drive. sessionStorage flag short-circuits
  // repeat checks; otherwise a lightweight about.get probe confirms.
  async function hasDriveScope() {
    if (sessionStorage.getItem(GRANTED_KEY) === '1') return true;
    var token = await getGoogleAccessToken();
    if (!token) return false;
    try {
      var resp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (resp.ok) { sessionStorage.setItem(GRANTED_KEY, '1'); return true; }
    } catch (e) { /* fall through */ }
    return false;
  }

  function loadGapiPicker() {
    return new Promise(function (resolve, reject) {
      if (_pickerReady) { resolve(); return; }
      if (typeof gapi === 'undefined') { reject(new Error('Google API not loaded yet — try again in a moment.')); return; }
      gapi.load('picker', function () { _pickerReady = true; resolve(); });
    });
  }

  // Google Workspace native docs must be exported (not alt=media). We only care
  // about text-bearing types for essays: Docs → .docx, plus native PDF/DOCX/TXT.
  var EXPORT_MAP = {
    'application/vnd.google-apps.document':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  var SELECTABLE_MIMES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.google-apps.document',
    'text/plain',
  ].join(',');

  function buildPicker(token, onPicked) {
    var lastFolderId = null;
    try { lastFolderId = localStorage.getItem(LAST_FOLDER_KEY); } catch (e) { /* ignore */ }

    var myDriveView = new google.picker.DocsView()
      .setLabel('My Drive')
      .setOwnedByMe(true)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(google.picker.DocsViewMode.LIST);
    if (lastFolderId) myDriveView.setParent(lastFolderId);

    var sharedView = new google.picker.DocsView()
      .setLabel('Shared with me')
      .setOwnedByMe(false)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(google.picker.DocsViewMode.LIST);

    // Shared drives must be its own view — can't combine with setOwnedByMe/setParent.
    var sharedDrivesView = new google.picker.DocsView()
      .setLabel('Shared drives')
      .setEnableDrives(true)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(google.picker.DocsViewMode.LIST);

    return new google.picker.PickerBuilder()
      .addView(myDriveView)
      .addView(sharedView)
      .addView(sharedDrivesView)
      .setSelectableMimeTypes(SELECTABLE_MIMES)
      .setOAuthToken(token)
      .setOrigin(window.location.origin)
      .setAppId(cfg.appId)
      .setDeveloperKey(cfg.developerKey)
      .setCallback(onPicked)
      .build();
  }

  // Download or export the picked doc to a File, then extract text from it.
  async function fetchDocAsText(doc, token) {
    var nonDownloadable = ['application/vnd.google-apps.folder', 'application/vnd.google-apps.shortcut'];
    if (nonDownloadable.indexOf(doc.mimeType) !== -1) return { error: 'Please select a file, not a folder.' };

    if (doc.parentId) { try { localStorage.setItem(LAST_FOLDER_KEY, doc.parentId); } catch (e) { /* ignore */ } }

    var name = doc.name || doc.id;
    var exportMime = EXPORT_MAP[doc.mimeType];
    var url, contentType, fileName;
    if (exportMime) {
      url = 'https://www.googleapis.com/drive/v3/files/' + doc.id + '/export?mimeType=' + encodeURIComponent(exportMime) + '&supportsAllDrives=true';
      contentType = exportMime;
      fileName = /\.docx$/i.test(name) ? name : name + '.docx';
    } else {
      url = 'https://www.googleapis.com/drive/v3/files/' + doc.id + '?alt=media&supportsAllDrives=true';
      contentType = doc.mimeType;
      fileName = name;
    }

    var resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
      sessionStorage.removeItem(GRANTED_KEY);
      return { error: 'Your Google Drive access expired. Click Drive again to reconnect.' };
    }
    if (!resp.ok) return { error: 'Drive download failed (' + resp.status + ').' };

    var blob = await resp.blob();
    var file = new File([blob], fileName, { type: contentType });
    var extracted = await cfg.extractText(file);   // -> { text, warning, error }
    if (extracted.error) return { error: extracted.error };
    return { text: extracted.text, name: fileName, warning: extracted.warning };
  }

  async function pick() {
    if (!cfg.supabase || !cfg.extractText) return { error: 'Drive picker isn’t configured.' };
    if (!cfg.developerKey || !cfg.appId) {
      return { error: 'Google Drive isn’t set up yet (missing Picker API key / app id). Use “Choose file” or paste for now.' };
    }
    var token = await getGoogleAccessToken();
    if (!token || !(await hasDriveScope())) {
      // Kick off incremental consent; the page redirects and returns.
      await requestDriveScope();
      return { error: 'Connecting to Google Drive — you’ll be brought right back. Click Drive again once you return.' };
    }

    try { await loadGapiPicker(); } catch (e) { return { error: e.message }; }

    return await new Promise(function (resolve) {
      var picker = buildPicker(token, function (data) {
        if (!data || data.action === google.picker.Action.CANCEL) { resolve(null); return; }
        if (data.action !== google.picker.Action.PICKED) return;
        var doc = data.docs && data.docs[0];
        if (!doc) { resolve(null); return; }
        fetchDocAsText(doc, token).then(resolve).catch(function (err) {
          resolve({ error: 'Drive import failed: ' + ((err && err.message) || 'error') });
        });
      });
      picker.setVisible(true);
    });
  }

  window.__ptDrivePicker = { configure: configure, pick: pick };
})();

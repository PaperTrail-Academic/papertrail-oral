# Google Drive Picker — Setup

The Verify app's "▾ Google Drive" buttons load student work straight from Drive.
Google **sign-in** (authentication) does NOT set this up on its own — the Picker
needs the Picker API, a separate API key, and the Drive API. Follow the steps below.

Which Google Cloud project? The one backing the **verify** Supabase project's
Google provider (verify = `ktzrdhiqhidexunucuqp`, a *different* Supabase project
than papertrail-write). Find its OAuth client in Supabase → Authentication →
Providers → Google; that client's project is the one you configure here.

---

## 1. Enable two APIs
GCP console → APIs & Services → **Library**, enable both:
- **Google Picker API**
- **Google Drive API**

(Sign-in doesn't enable either of these.)

## 2. Create an API key (the `developerKey`)
APIs & Services → **Credentials** → Create credentials → **API key**.
- **Application restrictions:** HTTP referrers → add the app's origin(s), e.g.
  `https://oral.papertrailacademic.com/*` (and any other host that serves app.html).
- **API restrictions:** restrict to **Google Picker API** (add Drive API too if you
  restrict by API).
- Copy the key → this is `GOOGLE_PICKER_API_KEY` in app.html.

## 3. Get the project number (the `appId`)
GCP console → project picker / Dashboard → **Project number** (all digits, not the
project *ID*). → this is `GOOGLE_APP_ID` in app.html.

## 4. Add the scope to the OAuth consent screen
APIs & Services → **OAuth consent screen** → Data access → **Add scopes** →
add `https://www.googleapis.com/auth/drive.file`.
- `drive.file` is a **non-sensitive / recommended** scope (per-file access only),
  so it does **not** require Google's security assessment or app verification.
- If the app is in **Testing**, make sure your teacher accounts are Test users.

## 5. OAuth client — origins (usually already set for sign-in)
APIs & Services → Credentials → your **OAuth 2.0 Client ID**:
- **Authorized JavaScript origins:** must include the app origin(s).
- **Authorized redirect URIs:** the Supabase auth callback
  (`https://ktzrdhiqhidexunucuqp.supabase.co/auth/v1/callback`) — already there if
  Google sign-in works.

## 6. Fill the two constants in app.html
Near the top of the module script:
```js
const GOOGLE_PICKER_API_KEY = ''  // from step 2
const GOOGLE_APP_ID = ''          // from step 3
```
Until both are non-empty, the Drive button shows "not set up yet" and is harmless.

## 7. Deploy, then reconnect once
Deploy `app.html` + `lib/drive-picker.js` + `lib/file-extract.js`. On first click of
the Drive button, each teacher is redirected once to grant `drive.file` (their old
sign-in didn't include it). After returning, click Drive again — the picker opens.

---

## What to expect / known behaviour
- **Re-consent on first use** and **occasional reconnect**: Supabase does not
  persist or refresh Google's `provider_token` (it lives ~1 hour). When it's
  missing/expired the module runs the reconnect redirect, then the picker opens on
  the next click. This is normal.
- **Navigation**: three tabs (My Drive / Shared with me / Shared drives), folders
  shown, list view, and it reopens the last-used folder.
- **What comes back as text**: Google Docs are exported to .docx then extracted;
  PDFs (text-based) and .docx download and extract directly; scanned/image PDFs
  return the "paste the text instead" warning (no OCR).

## Quick test
1. Sign into the app with Google.
2. Open Verify Citations, click **▾ Google Drive**, approve the consent, return.
3. Click **▾ Google Drive** again → pick a Google Doc or PDF → its text lands in the
   box with a "Loaded … — N words" note.

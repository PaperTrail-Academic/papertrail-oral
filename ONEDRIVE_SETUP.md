# Microsoft sign-in + OneDrive import — Setup

Website only (dashboard.html, app.html, report.html) — the Chrome extension is untouched.

The code is already written and deployed-ready:
- **Sign-in:** "Sign in with Microsoft" buttons in dashboard.html, app.html, report.html
  (`supabase.auth.signInWithOAuth({ provider: 'azure' })` — same pattern as the existing
  Google button).
- **Import:** the "☁️ OneDrive" buttons next to "📁 Drive" in app.html (Verify Compare
  and the shared Submitted Work box), backed by `lib/onedrive-picker.js`. Unlike Google
  Drive, this does **not** use a separate picker SDK or API key — it's a small custom
  file browser built directly against the Microsoft Graph API, reusing the same
  Microsoft sign-in token Supabase already holds. One fewer credential to manage than
  the Drive setup.

None of this works until the Azure app + Supabase provider below are configured. Until
then the Microsoft button will show a generic Supabase "provider not enabled" error, and
the OneDrive button says "isn't connected yet."

You do **not** need an Office 365 / Word license for any of this. A free Microsoft
account (outlook.com/hotmail, or one you already have) gives you 5GB of OneDrive and
free Word Online — enough to fully test sign-in → pick a file → extract → analyze.

---

## 1. Register an app in Microsoft Entra ID (Azure AD)

Free — just needs a Microsoft/Azure account (portal.azure.com).

1. Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. **Name:** PaperTrail Academic (or similar — teachers never see this name).
3. **Supported account types:** choose **"Accounts in any organizational directory and
   personal Microsoft accounts"**. This is important — it's what lets both work/school
   Microsoft 365 accounts *and* personal @outlook.com accounts sign in and use OneDrive.
   A narrower "single tenant" option would lock out personal accounts.
4. **Redirect URI:** platform **Web**, value:
   `https://ktzrdhiqhidexunucuqp.supabase.co/auth/v1/callback`
   (the same Supabase auth callback the Google provider already uses — just registered
   under this new Azure app too).
5. Click **Register**.

## 2. Create a client secret

**Certificates & secrets** → **New client secret** → any description/expiry → **Add**.
Copy the **Value** immediately (not the Secret ID) — it's only shown once.

## 3. Add API permissions

**API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated
permissions** → add:
- `openid`, `email`, `profile`, `offline_access` (sign-in — some are pre-added by default)
- `Files.Read` (for the OneDrive picker; requested incrementally on first OneDrive use,
  same pattern as the Drive picker's `drive.file` scope — teachers who never click
  OneDrive are never asked to grant it)

No admin consent should be required for these — they're all standard delegated,
non-admin scopes. If Azure shows "Grant admin consent," click it once for your own
tenant/testing account; end users still get their own per-user consent prompt.

## 4. Copy the two values you need

- **Application (client) ID** — Overview page.
- **Client secret value** — from step 2.

## 5. Enable the Azure provider in Supabase

Supabase Dashboard → the **verify** project (`ktzrdhiqhidexunucuqp`) → **Authentication**
→ **Providers** → **Azure** → enable, paste:
- **Client ID** = Application (client) ID
- **Client Secret** = the secret value
- Leave the Azure Tenant URL/endpoint at its default (`common`) so both personal and
  work/school accounts can sign in — a specific tenant ID here would restrict sign-in to
  one organization only.

Save. Supabase will display its own callback URL — confirm it matches the redirect URI
registered in step 1 (it should, since both point at the same Supabase project).

## 6. Deploy and test

Deploy `dashboard.html`, `app.html`, `report.html`, and the new
`lib/onedrive-picker.js`.

1. Sign into the app with **Sign in with Microsoft** (use a free outlook.com account if
   you don't have a work one handy).
2. Open Verify Compare, click **☁️ OneDrive**. First click redirects for `Files.Read`
   consent (incremental — separate from sign-in), then returns you to the page.
3. Click **☁️ OneDrive** again → the browser modal opens (My files / Shared with me) →
   pick a `.docx`, `.pdf`, `.txt`, or `.md` file → its text lands in the box with a
   "Loaded … — N words" note.

---

## What to expect / known behaviour

- **Re-consent on first use**, same as Drive: Supabase doesn't persist or refresh the
  Microsoft `provider_token` (it lives ~1 hour). When it's missing/expired, the module
  redirects for consent, then the picker opens on the next click.
- **No export step needed:** Word files on OneDrive are already `.docx`, so — unlike
  Google Docs, which get exported to `.docx` first — the picker downloads the file's
  native bytes directly and hands them straight to the existing mammoth-based extractor.
- **Graph API CORS:** Microsoft Graph generally supports direct browser `fetch()` calls
  with a bearer token (no server proxy needed) for the endpoints this uses
  (`/me/drive`, `/me/drive/root/children`, `/me/drive/items/{id}/content`,
  `/me/drive/sharedWithMe`). If you hit a CORS error in testing, the fallback is to
  proxy those three Graph calls through a Supabase edge function instead of calling
  Graph directly from the page — flag it here if that happens rather than debugging
  Azure app settings first.
- **"Shared with me" folders:** the current picker treats shared *files* as pickable but
  doesn't drill into shared *folders* (Graph's sharedWithMe items need a slightly
  different traversal). Fine for the common case — a teacher opens a shared essay
  directly — but worth expanding later if shared folder browsing turns out to matter.
- **Old `.doc` (not `.docx`), scanned PDFs:** same limits as everywhere else in the app —
  not supported; the extractor returns a "paste the text instead" message.

## Troubleshooting

**"Selected user account does not exist in tenant 'Microsoft Services' and cannot access
the application '&lt;client id&gt;' in that tenant. The account needs to be added as an
external user in the tenant first."**

This means the app registration's "Supported account types" reverted to (or was never
changed from) single-tenant. "Microsoft Services" is Azure's internal tenant for personal
Microsoft accounts (including ones registered with a Gmail address) — a single-tenant app
treats that as a foreign tenant and refuses it. Fix:
1. Entra ID → App registrations → the app → **Authentication** → "Supported account
   types" → select "Accounts in any organizational directory and personal Microsoft
   accounts." If that control isn't there, use **Manifest** → set
   `"signInAudience": "AzureADandPersonalMicrosoftAccount"` → Save.
2. Confirm Supabase's Azure provider **Azure Tenant URL** field is blank (default
   `common` endpoint) — a specific tenant ID there forces single-tenant behaviour too.
3. Sign out and retry; the manifest change can take a couple minutes to propagate.

**OneDrive button loops forever asking to reconnect, even right after granting consent
each time** (as opposed to the normal ~1-hour-expiry reconnect described above): the
`Files.Read` scope requested in `lib/onedrive-picker.js` was a bare short-form name
(`Files.Read`). Microsoft's v2 endpoint can silently grant a token *without* that
permission when a bare Graph scope is mixed with OIDC scopes (openid/email/profile) —
this shows up especially with personal/consumer (MSA) accounts. The teacher approves the
consent screen every time, but the resulting token never actually has Files.Read, so
`hasFilesScope()`'s probe keeps failing and the button re-triggers the redirect forever.
Fixed 2026-07-19 by fully qualifying the scope as `https://graph.microsoft.com/Files.Read`
in `requestFilesScope()` — if this resurfaces, check that the scope string there is still
resource-qualified and not reverted to the bare form.

## Quick test checklist
- [ ] Microsoft button appears and doesn't error before Azure/Supabase config (shows a
      clear "provider not enabled" message, not a silent failure)
- [ ] Sign-in with a personal @outlook.com account works
- [ ] Sign-in with a work/school Microsoft 365 account works (if you have access to test
      one — not required to ship)
- [ ] OneDrive button → consent redirect → picker opens
- [ ] Picking a `.docx` loads its text with a correct word count
- [ ] Picking a `.pdf` / `.txt` / `.md` also works
- [ ] Cancelling the picker doesn't leave the box in a broken state

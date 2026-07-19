# PaperTrail Oral + Teacher web app — site

Static site (no build step). This ONE repo/Vercel project serves TWO domains:

- **`oral.papertrailacademic.com`** — student recording page ONLY (`/session/:token`). Historically
  (Phase 1) this domain also hosted the teacher dashboard and report pages, but as of 2026-07-19
  those are canonically on `app.*` (see below) — `oral.*` just redirects `/dashboard` and
  `/report/:id` there now. Nothing on this domain requires a teacher to be signed in.
- **`app.papertrailacademic.com`** — the teacher-facing surface for everything: Verify Single,
  Verify Compare, Verify Citations, and Oral Defense (send + full session/report history) for
  teachers WITHOUT the Chrome extension. Paste-in text, same edge functions, same shared
  PaperTrail Token wallet, Lemon Squeezy checkout links.

Why the split moved: `dashboard.html`/`report.html` were originally built as part of the Oral
Defense project (Phase 1, before `app.html` existed), so they shipped on `oral.*`. Once `app.html`
became the primary teacher app, having the session dashboard on a different subdomain meant a
second, redundant Supabase sign-in (session storage is per-origin — `oral.*` and `app.*` don't
share it even though they're the same Supabase project and the same Vercel deployment). Both
domains have always served the identical file set via un-conditioned rewrites, so no new pages had
to be built — this was just a matter of pointing links at `app.*` instead of `oral.*`, plus two
host-conditioned redirects so `oral.*` bounces there instead of serving its own copy. (The repo/
Vercel project is still named `papertrail-oral` for historical reasons — that's cosmetic and worth
renaming at some point, but it doesn't affect any of the above; users only ever see the domains.)

## Files
- `session.html` — student recording page. Reads the token from `/session/{token}`, calls
  `oral-get-session`, records each answer with `MediaRecorder` (WebM/MP4), submits raw audio to
  `oral-submit-response`. Anon key embedded is a public client key (safe to ship).
- `dashboard.html` — **teacher sign-in + session list**. Teacher signs in (email/password or
  Google) via Supabase Auth; lists the teacher's own oral sessions (RLS-scoped) with status; each
  ready report links to `/report/{id}`.
- `report.html` — **teacher report detail**. Renders per-question markers (Accounted for / Brief /
  Couldn't account / Not answered), evidence, transcripts, on-demand audio playback
  (`oral-get-audio-url`), overall read, follow-up triage, and the fixed disclaimer. Has an inline
  sign-in so the "report ready" email link works even when the teacher isn't signed in yet.
  "Print / save PDF" has no side effects; "Export & finalize" calls `oral-download-report`, which
  saves a copy **and permanently deletes the student audio** (delete-on-download).
- `index.html` — public front door for `oral.papertrailacademic.com/`; links to teacher sign-in
  (points at `app.papertrailacademic.com` now — see the domain-split note above).
- `app.html` — **teacher web app** (`app.papertrailacademic.com`). Sign-in AND sign-up (non-extension
  teachers are the audience) + three tabs: 🔬 Verify Single, ⚖️ Verify Compare, 🎙️ Oral Defense.
  One shared "Submitted work" textarea reparents between tabs (same mechanic as the extension
  panel). Verify posts to `generate-report` and polls the `reports` row (fast/slow two-phase,
  privacy-PATCH of `report_json` after fetch); Compare computes `algorithmicScores` in-browser via
  `lib/stylematch.js`. Oral is the same generate → curate → send flow as the extension's `oral.js`
  (pool-aware Back button, 10-question cap, 4–6 nudge, Gmail compose). Reports render via
  `lib/reports.js` into a popup and are cached (last 5) in `localStorage`.
- `lib/stylematch.js`, `lib/reports.js` — **verbatim copies of the extension modules**
  (`papertrail-3.4.0/stylematch.js`, `reports.js`). ⚠ When either changes in the extension,
  re-copy it here — treat the extension as the single source of truth.
- `vercel.json` — `app.papertrailacademic.com/` uses a host-conditioned **redirect** to `/app`
  (NOT a rewrite: Vercel checks the filesystem before rewrites, so `/` always wins as
  `index.html`; redirects run first). `/app` then rewrites to `/app.html` on any host — which is
  also the pre-DNS test URL on vercel.app. Other rewrites: `/session/:token` → `/session.html`,
  `/report/:id` → `/report.html`, `/dashboard` → `/dashboard.html`. These two rewrites are NOT
  host-conditioned, so `/dashboard` and `/report/:id` resolve on either domain — that's what makes
  the redirect below cheap (no new pages, just routing). Two more host-conditioned **redirects**:
  `oral.papertrailacademic.com/dashboard` → `https://app.papertrailacademic.com/dashboard`, and
  `oral.papertrailacademic.com/report/:id` → `https://app.papertrailacademic.com/report/:id` — so
  anyone who lands on the old `oral.*` teacher URLs (bookmarks, old links) is bounced to the
  origin that actually shares their signed-in session.

The dashboard/report pages read their data directly from Supabase under RLS
(`auth.uid() = teacher_id` on `oral_sessions` / `oral_reports`; responses via session ownership).
Audio and export go through the two teacher edge functions, which verify ownership server-side.

## Deploy (Vercel, Git-connected)
1. Create a new GitHub repo: `papertrail-oral`. Add these files, push to `main`.
2. Vercel → Add New → Project → import `papertrail-oral`. Framework preset: **Other**. No build
   command, no env vars needed. Deploy.
3. Test on the `*.vercel.app` URL first (no DNS needed):
   `https://<project>.vercel.app/session/<token>`
   (Fallback that works even without the rewrite: `.../session.html?token=<token>`)
4. Add the domain: Vercel project → Settings → Domains → add `oral.papertrailacademic.com`.
   In your DNS provider, add a **CNAME** `oral` → `cname.vercel-dns.com` (Vercel shows the exact
   target). Set it **DNS-only (grey cloud)** in Cloudflare so its proxy doesn't fight Vercel's cert.
   Wait for it to verify.
5. Test the dashboard at `https://<project>.vercel.app/dashboard` and a report at
   `.../report/<report-id>` (fallback without the rewrite: `.../report.html?id=<report-id>`).

### Adding the teacher web app domain (Phase 2)
1. Test first on `https://<project>.vercel.app/app` (no DNS needed).
2. Vercel project → Settings → Domains → add `app.papertrailacademic.com`.
3. Cloudflare: CNAME `app` → the Vercel-shown project-specific target, **DNS-only (grey cloud)**
   (same as `oral` — the proxy fights Vercel's cert otherwise).
4. Supabase → Authentication → URL Configuration → Redirect URLs: add
   `https://app.papertrailacademic.com/app` and `https://<project>.vercel.app/app`
   — the `/app` path matters: entries are exact-match (wildcard `/*` also works), and a
   redirectTo that isn't allowlisted silently falls back to the Site URL (Google sign-in,
   sign-up confirmation, and password reset all redirect here).

## Required Supabase Auth config (one-time — needed for sign-in on the website)
Supabase → Authentication → URL Configuration (checked 2026-07-19, already correct — nothing to
change here):
- **Site URL** is `https://papertrailacademic.com` (the marketing root, not `oral.*`). This is only
  the fallback used when a `redirectTo` isn't in the allow-list below and the base URL for auth
  emails — since every redirect this app uses is already allow-listed (see below), there's no need
  to change it, and doing so would alter confirmation/password-reset email links for unrelated
  flows. Leave as-is.
- **Redirect URLs** already include `https://app.papertrailacademic.com/*` (wildcard — covers
  `/app`, `/dashboard`, `/report/*`, anything else on that origin) plus the Vercel preview host
  equivalents. The old `oral.papertrailacademic.com/dashboard` and `/report/*` entries can stay
  (harmless) or be removed — `oral.*` now redirects those paths before Supabase Auth ever sees
  them, so they're only reachable if someone bypasses the redirect (e.g. hitting the vercel.app
  preview URL directly).
- Google provider is already enabled (the extension uses it); Azure (Microsoft) provider is now
  enabled too (added 2026-07-19) — see `ONEDRIVE_SETUP.md`. For any provider, make sure the
  Supabase callback (`https://ktzrdhiqhidexunucuqp.supabase.co/auth/v1/callback`) is listed as an
  authorized redirect
  URI in that provider's console. Without the redirect URLs above, sign-in/password reset will
  bounce back to the Site URL instead of the intended page.

Teachers who originally signed up with Google can use **Forgot password?** on the dashboard to set
a password, or just use the Google button.

## Security headers (vercel.json)
All routes ship HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy no-referrer (session
tokens and report ids live in URLs — never leak them via outbound links), a Permissions-Policy
that allows ONLY the microphone (session.html recording) and denies camera/geolocation/payment,
COOP same-origin-allow-popups, and a Content-Security-Policy. The CSP allowlist is exactly:
self + esm.sh (supabase-js) + cdnjs.cloudflare.com (mammoth, pdf.js) + apis.google.com (gapi,
Drive Picker) for scripts, Google Fonts for styles/fonts, the Supabase project + cdnjs +
www.googleapis.com/content.googleapis.com (Drive scope probe, file download/export) for
connect, media from the Supabase project, worker-src self+blob (pdf.js), frame-src
docs.google.com/apis.google.com/content.googleapis.com (the Picker renders in a Google
iframe), papertrailacademic.com + gstatic + drive-thirdparty.googleusercontent.com for images.
(2026-07-06: the Google/cdnjs entries were MISSING and silently broke both the Drive picker
and file upload on the deployed app — this allowlist expansion was the fix.)
⚠ Referrer-Policy: the global `no-referrer` (protects session tokens / report ids in URLs)
BREAKS referrer-restricted Google API keys — the Picker fails with "The API developer key is
invalid" because Google never sees a referrer. Fix (2026-07-06): /app and /app.html override to
`strict-origin-when-cross-origin` (sends the bare origin only cross-origin — no path, no
tokens; /app's URL carries no secrets). session.html and report.html keep no-referrer — never
relax those.
`'unsafe-inline'` for scripts is required by the inline module scripts and the report popup's
inline handlers — the CSP still blocks any injected EXTERNAL script/exfil origin, plus framing
and plugin content. ⚠ If a page adds a new external resource (CDN, image host, API), it must be
added to the CSP or it will be silently blocked — check the browser console after deploying
page changes.

## Notes
- Backend lives in the **papertrail-verify** Supabase project (`ktzrdhiqhidexunucuqp`).
- iOS Safari records `audio/mp4`; the page sends the blob's real MIME so the backend stores the
  right extension.
- Signed audio URLs live ~5 minutes; `report.html` loads them on demand and refreshes if stale.
- Report-ready emails (`oral-ownership-report`) currently say "open your dashboard" with no link.
  Once this is live, point that button at `https://app.papertrailacademic.com/report/{id}`
  (not `oral.*` — go straight to the shared-session origin, no need for the extra redirect hop)
  and redeploy the edge fn (`--no-verify-jwt`). Same for the deletion-warning email in
  `oral-maintenance`.

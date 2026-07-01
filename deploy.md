# PaperTrail Oral — site (Phase 1)

Static site (no build step). Student recording page + teacher report dashboard, all on
`oral.papertrailacademic.com`.

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
- `index.html` — public front door for `oral.papertrailacademic.com/`; links to teacher sign-in.
- `vercel.json` — rewrites `/session/:token` → `/session.html`, `/report/:id` → `/report.html`,
  `/dashboard` → `/dashboard.html`.

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

## Required Supabase Auth config (one-time — needed for sign-in on the website)
Supabase → Authentication → URL Configuration:
- **Site URL**: `https://oral.papertrailacademic.com`
- **Redirect URLs** (add all that apply): `https://oral.papertrailacademic.com/dashboard`,
  `https://oral.papertrailacademic.com/report/*`, and the Vercel preview host
  `https://<project>.vercel.app/dashboard`, `https://<project>.vercel.app/report/*`.
- Google provider is already enabled (the extension uses it). For web sign-in, make sure the
  Supabase callback (`https://ktzrdhiqhidexunucuqp.supabase.co/auth/v1/callback`) is listed as an
  authorized redirect URI in the Google Cloud OAuth client. Without the redirect URLs above,
  Google/password reset will bounce back to the Site URL instead of the intended page.

Teachers who originally signed up with Google can use **Forgot password?** on the dashboard to set
a password, or just use the Google button.

## Notes
- Backend lives in the **papertrail-verify** Supabase project (`ktzrdhiqhidexunucuqp`).
- iOS Safari records `audio/mp4`; the page sends the blob's real MIME so the backend stores the
  right extension.
- Signed audio URLs live ~5 minutes; `report.html` loads them on demand and refreshes if stale.
- Report-ready emails (`oral-ownership-report`) currently say "open your dashboard" with no link.
  Once this is live, point that button at `https://oral.papertrailacademic.com/report/{id}` and
  redeploy the edge fn (`--no-verify-jwt`). Same for the deletion-warning email in
  `oral-maintenance`.

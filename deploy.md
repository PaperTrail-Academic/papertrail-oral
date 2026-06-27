# PaperTrail Oral — student site (Phase 1)

Static site (no build step). `session.html` is the student recording page; `index.html` is a
placeholder root that the teacher dashboard will replace later.

## Files
- `session.html` — student recording page. Reads the token from `/session/{token}`, calls
  `oral-get-session`, records each answer with `MediaRecorder` (WebM/MP4), submits raw audio to
  `oral-submit-response`. Anon key embedded is a public client key (safe to ship).
- `index.html` — placeholder for `oral.papertrailacademic.com/`.
- `vercel.json` — rewrites `/session/:token` → `/session.html`.

## Deploy (Vercel, Git-connected)
1. Create a new GitHub repo: `papertrail-oral`. Add these files, push to `main`.
2. Vercel → Add New → Project → import `papertrail-oral`. Framework preset: **Other**. No build
   command, no env vars needed. Deploy.
3. Test on the `*.vercel.app` URL first (no DNS needed):
   `https://<project>.vercel.app/session/<token>`
   (Fallback that works even without the rewrite: `.../session.html?token=<token>`)
4. Add the domain: Vercel project → Settings → Domains → add `oral.papertrailacademic.com`.
   In your DNS provider, add a **CNAME** `oral` → `cname.vercel-dns.com` (Vercel shows the exact
   target). Wait for it to verify.

## Notes
- Backend lives in the **papertrail-verify** Supabase project (`ktzrdhiqhidexunucuqp`).
- iOS Safari records `audio/mp4`; the page sends the blob's real MIME so the backend stores the
  right extension.

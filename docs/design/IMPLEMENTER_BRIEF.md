# Implementer brief (phase 2)

You implement; the design lead decides. The design is in `docs/design/DESIGN.md`: read sections
1 to 5 and 7 to 10 fully, then your screen sections in 6, before writing code. Follow it exactly
(tokens, type, spacing, copy, states, behaviour). Where it is silent, choose the simplest option
consistent with it and list the choice in your report. Backend contract:
`docs/design/BACKEND_CONTRACT.md`; voice: `docs/design/VOICE_API.md`.

## Rules
- Work only in your own git worktree and branch (given in your task). Commit early with clear
  messages. Do not push, do not touch other branches or worktrees. Never write Claude/AI
  authorship anywhere (no Co-Authored-By, no "generated with").
- Do not modify backend code: `frontend/src/app/api/**`, server logic in `frontend/src/lib/**`,
  `frontend/prisma/**`, `ai-service/**`. Reuse existing libs (jobs polling, chat events and
  citations, uploads, quiz helpers, exam timing and autosave, learning markdown, voice
  turn-client).
- Other agents are building other screens in parallel from the same base. Keep the shared
  foundation stable: do not edit `src/components/ui/**`, `src/components/shell/**`,
  `src/app/globals.css`, `src/config/**`, `src/lib/api/**`, `src/server/session.ts`,
  `package.json` unless it is unavoidable. If it is, make the smallest additive change (a new
  prop, a new file) and list it in your report. Put new server read models in new files under
  `src/server/queries/<area>.ts`, feature code under `src/features/<area>/`.
- No new npm dependencies unless essential; if you add one, say why.
- Copy: sentence case, plain warm language, no em or en dashes, no emojis, no exclamation marks.

## Dev environment
- Shared services already running (do not stop or restart them, do not run `dev.sh`): mock AI
  service on `127.0.0.1:8700`, Postgres `postgresql://postgres@127.0.0.1:5544/sb_design`.
- Run your own Next dev server from your worktree's `frontend/` on your port:
  `setsid nohup env DATABASE_URL=postgresql://postgres@127.0.0.1:5544/sb_design
  AI_SERVICE_URL=http://127.0.0.1:8700 AI_INTERNAL_TOKEN=dev-token
  NEXTAUTH_URL=http://localhost:<port> NEXTAUTH_SECRET=dev-secret-dev-secret-dev-secret-32
  ENABLE_GCS_STORAGE=false LOCAL_UPLOADS_DIR=/tmp/sb-design/uploads ENVIRONMENT=development
  npx next dev -p <port> > /tmp/sb-design/logs/<area>-web.log 2>&1 &` and record the PID; stop
  it by PID when you finish (never broad pkill patterns).
- Demo account: `demo@studymargins.com` / `study-buddy-demo`. Seeded ids are in
  `/tmp/sb-design/seed-ids.json` (course "CS 161 Algorithms" has 4 topics with all content, a
  quiz attempt, a graded mock exam and a chat thread; "Organic Chemistry" is at setup). The
  database is shared with other agents: never delete the demo courses or their topics. For
  destructive or setup-state testing, create your own user (`<area>-test@studymargins.com`) and
  courses through the API. Generating content, taking quizzes and exams on the demo course is
  fine (the LLM is a mock, it costs nothing). Test files: `/tmp/sb-e2e/files/algorithms.pdf`,
  `/tmp/sb-e2e/files/hashing.docx`.
- Screenshots: `node /tmp/sb-design/shots.mjs --base http://localhost:<port> --label <area>
  <routes...>` writes 1440 and 390 px, light and dark, to `/tmp/sb-design/shots/<area>/`. Look at
  every screenshot yourself and fix deviations from DESIGN.md before reporting. Also capture the
  important states (empty, loading skeleton, generating, error, results) by setting up data or
  adding capture hooks in the script (extend it in a copy, `/tmp/sb-design/shots-<area>.mjs`).

## Before you report
- `npx tsc --noEmit`, `npm run lint` (0 errors, 0 warnings), `npm test`, `npm run build` all pass.
- A Playwright spec `frontend/tests/e2e/<area>.spec.ts` covering your main flows passes against
  your dev server (`PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test
  tests/e2e/<area>.spec.ts`; check `playwright.config.ts` for how the base URL is read and adapt
  if needed without breaking the existing smoke spec).
- Your dev server is stopped.
- Report (concise): what you built (files), decisions where the spec was silent, any change to
  shared files, check outputs with counts, screenshot paths, known gaps.

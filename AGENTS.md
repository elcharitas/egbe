# Working on Egbe

Egbe is a low-data learning-circle proof of concept, not a production service.

- Use Node 24 LTS (`.node-version`), npm >=11, and package-lock.json.
- `npm ci` installs dependencies.
- `npm run cf-typegen` regenerates Workers binding types.
  It reads the comment-only `.env.example`, not local credentials.
- `npm run db:migrate` applies D1 migrations locally only. Use `CI=true` for
  non-interactive migration confirmation.
- `npm run dev` runs Vite in the Workers runtime on port 5173.
- `npm run build` then `npm run preview` previews the production Worker on 3000.
  Ports are strict; parallel verification may pass `-- --port <free-port>`.
- Run `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm test`, and `npm run build` before a completed milestone commit.

## Architecture and boundaries

- `src/routes` holds TanStack Start routes; `src/components` holds learner UI.
- `src/domain` holds resource guidance, validation, and durable outbox rules.
- `src/client` owns in-page state and revision-checked account autosaves.
- `src/server` holds server functions and D1 access. DB is the only binding.
- Students bring links, excerpts, or small UTF-8 files to study circles.
  Never fetch external lesson URLs on the server or imply links are downloaded.
  Goals, notes, drafts, saved copies, and retry queues are private account data
  in D1. Never use localStorage, sessionStorage, or IndexedDB for learner work.
- Keep draft circle/material context and fixed retry IDs through failures.
  Publish materials before check-ins that reference them. Removed items retain
  scrubbed retry markers. Existing preset-path work must remain accessible.
- Google OIDC is required. Use GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI, and
  server-only GOOGLE_CLIENT_SECRET from ignored local configuration or Worker
  secrets, never source. No Google tokens are retained; sessions are hashed in
  D1 with an opaque HttpOnly cookie.
- Built-in study assistance uses the OpenAI Responses API from the Worker.
  OPENAI_API_KEY is a server-only secret; OPENAI_MODEL defaults to
  gpt-4.1-mini. Send only a learner-reviewed question and excerpt, never
  private goals or notes automatically. No external lesson fetching or tools.
  Keep provider responses private in D1, label AI output, and verify it
  against the source. store:false does not promise zero provider retention.
  Assistance history is private account work, like saved copies and notes:
  material removal does not recall it. New calls always check current access.
  Reserve fixed request IDs and enforce account/global caps before paid
  calls. Never silently retry an uncertain provider request.
- Every circle read and write checks the account and circle visibility.
  Private circles require membership, including material detail reads.
  Invitations use rotating hashed tokens; links carry tokens in fragments.
- Runtime types are module imports to avoid mixing Workers and DOM globals.
  Generate binding-only types. Vite configuration is JavaScript, validated by
  lint/build; application TypeScript is strict with library checking enabled.
- `migrations` holds local D1 SQL. The all-zero database ID is a placeholder,
  not a provisioned resource. Live Google sign-in needs a registered web client.
- No service worker or persistent offline lesson cache is installed. On a
  failed save, retain in-page work and warn that unsaved edits cannot survive
  reload. Never display account confirmation before a successful D1 response.
- Workspace revisions prevent silent overwrites between devices or tabs.
  Cancellations and acknowledgements retain retry IDs until confirmed by D1.
- Shared posts persist in their circle until removed. Removal scrubs text but
  retains a minimal retry marker. Do not remove that protection or bypass the
  D1 cap.

Keep domain rules and persistence in their existing sources of truth.
Prefer coherent functions, explicit flow, and lines around 80 characters.
Validate input, storage, and network boundaries; preserve failed work and
report failures honestly. Do not add speculative abstractions.

Only genuinely complex utilities get focused automated tests. Do not commit
journey, component-behavior, or simple-utility suites. Use temporary Playwright
scripts to inspect the actual local Cloudflare app, including failed saves,
cross-device account persistence, private-circle access, keyboard use, and
narrow layouts. Disclose test-seeded sessions; do not claim live Google success
without exercising the registered provider flow.

Obtain independent product, code/security, and real-condition reviews at major
milestones. Fix blockers and important friction, rerun checks, and re-review.
Isolated reviewers may reuse installed dependencies read-only when disk is low;
do not install another full copy or delete files outside their own worktree.
Worker agents must remove task-created dependency symlinks before finishing,
so those symlinks are not merged into the parent worktree.
Inspect full diffs and stage only related files for local milestone commits.
Commit messages are one line, <=80 characters, with no body.

Never commit secrets, README files, specs, plans, docs directories, browser
artifacts, or local database data. Keep evidence in the conversation.
Do not deploy, provision, push, or open PRs without new authorization.

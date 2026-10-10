# Working on Egbe

Egbe is a low-data learning-circle proof of concept, not a production service.

- Use Node 24 LTS (`.node-version`), npm >=11, and package-lock.json.
- `npm ci` installs dependencies.
- `npm run cf-typegen` regenerates Workers binding types.
- `npm run db:migrate` applies D1 migrations locally only. Use `CI=true` for
  non-interactive migration confirmation.
- `npm run dev` runs Vite in the Workers runtime on port 5173.
- `npm run build` then `npm run preview` previews the production Worker on 3000.
  Separate origins keep the production service worker out of development.
  Ports are strict; parallel verification may pass `-- --port <free-port>`.
- Run `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm test`, and `npm run build` before a completed milestone commit.

## Architecture and boundaries

- `src/routes` holds TanStack Start routes; `src/components` holds learner UI.
- `src/domain` holds resource guidance, validation, and durable outbox rules.
- `src/client` owns browser persistence and offline/sync lifecycle.
- `src/server` holds server functions and D1 access. DB is the only binding.
- Students bring links, excerpts, or small UTF-8 text files to public circles.
  Never fetch external lesson URLs on the server or imply links are downloaded.
  Text copies are saved offline explicitly. Private work remains browser-local.
- Keep draft circle/material context and fixed retry IDs through failures.
  Publish materials before check-ins that reference them. Removed items retain
  scrubbed retry markers. Existing preset-path work must remain accessible.
- Optional ChatGPT identity uses approved client configuration only:
  `OPENAI_CLIENT_ID`, `OPENAI_REDIRECT_URI`, `OPENAI_TOKEN_AUTH_METHOD`, and
  server-only `OPENAI_CLIENT_SECRET` when required. No provider secrets in files
  or browser storage. No hosted plan/credit usage without its approved contract.
- Runtime types are module imports to avoid mixing Workers and DOM globals.
  Generate binding-only types. Vite configuration is JavaScript, validated by
  lint/build; application TypeScript is strict with library checking enabled.
- `migrations` holds local D1 SQL. The all-zero database ID is a placeholder,
  not a provisioned resource. No credentials are needed for local workflows.
- `public/sw.js` caches the production shell, never server-function responses
  or external lesson content. Development is not an offline-ready build.
- Goals and practice stay on this browser. The public demo circle uses an
  opaque HttpOnly cookie; do not add personal profiling or fake peer activity.
- Use one learning tab at a time. Device save failures must retain in-page
  work, and cancellations/acknowledgements must retain retry IDs until durable.
- Shared posts persist publicly until removed. Removal scrubs text but retains
  a minimal retry marker. Do not remove that protection or bypass the D1 cap.

Keep domain rules and persistence in their existing sources of truth.
Prefer coherent functions, explicit flow, and lines around 80 characters.
Validate input, storage, and network boundaries; preserve failed work and
report failures honestly. Do not add speculative abstractions.

Only genuinely complex utilities get focused automated tests. Do not commit
journey, component-behavior, or simple-utility suites. Use temporary Playwright
scripts to inspect the actual local Cloudflare app, including offline reloads,
two-context circle interactions, keyboard use, and narrow layouts.

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

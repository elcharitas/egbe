# Working on Egbe

Egbe is a low-data learning-circle proof of concept, not a production service.

- Use npm >=11 and the committed package-lock.json. Use Node 24 LTS or 22.13+.
- `npm ci` installs dependencies.
- `npm run cf-typegen` regenerates Workers binding types.
- `npm run db:migrate` applies D1 migrations locally only.
- `npm run dev` runs Vite with the Cloudflare Workers runtime on port 3000.
- `npm run build` then `npm run preview` previews the production Worker.
- Run `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm test`, and `npm run build` before a completed milestone commit.

## Architecture and boundaries

- `src/routes` holds TanStack Start routes; `src/components` holds learner UI.
- `src/domain` holds resource guidance, validation, and durable outbox rules.
- `src/client` owns browser persistence and offline/sync lifecycle.
- `src/server` holds server functions and D1 access. DB is the only binding.
- Runtime types are module imports to avoid mixing Workers and DOM globals.
  Generate binding-only types. Vite configuration is JavaScript, validated by
  lint/build; application TypeScript is strict with library checking enabled.
- `migrations` holds local D1 SQL. The all-zero database ID is a placeholder,
  not a provisioned resource. No credentials are needed for local workflows.
- `public/sw.js` caches the production shell, never server-function responses
  or external lesson content. Development is not an offline-ready build.
- Goals and practice stay on this browser. The public demo circle uses an
  opaque HttpOnly cookie; do not add personal profiling or fake peer activity.

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
Inspect full diffs and stage only related files for local milestone commits.
Commit messages are one line, <=80 characters, with no body.

Never commit secrets, README files, specs, plans, docs directories, browser
artifacts, or local database data. Keep evidence in the conversation.
Do not deploy, provision, push, or open PRs without new authorization.

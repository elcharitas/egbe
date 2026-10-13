# Egbe

Egbe helps students turn their own learning materials into small study sessions
and peer conversations. It combines private account-saved goals and notes,
public or private circles, and learner-approved AI assistance. It is a working
proof of concept, not a production service or a validated learning intervention.

Prepared for the **Andela x OpenAI x Miva Codex Accelerator**. Documentation
describes source at `8d9edda` and was written after implementation.

## What is implemented today

- Required Google sign-in and private work saved in Cloudflare D1.
- Public/private circles, replaceable invitations, attributed materials, and
  deliberately shared check-ins.
- Revisitable **Read → Explain → Discuss** steps, flexible goals and session
  times, private notes, and account-saved text/link copies.
- Built-in **Study assistant**, enabled by configured OpenAI API access.
- Four attributed starter links and earlier web/numeracy practice paths.
- Save feedback, revision-conflict protection, retry IDs, and in-page export.

## Product walkthrough

Prerequisites: migrated local D1, configured Google sign-in, two consenting
accounts, and permitted sample text. AI also requires configured API access
and permission to spend the owner's credits. This is a walkthrough, not a new
verification run.

1. **Continue with Google → Browse circles → Create circle**. Choose
   **Private — invited members only**.
2. Use **Invite classmates → Create / replace invitation**. In a second browser
   profile, sign in and choose **Join invited circle**.
3. Select **+ Bring material**. Add title, attribution, and self-written text
   such as “50% means half. Half of 200 is 100.” Confirm permission and choose
   **Share material with circle**; wait for shared confirmation.
4. **Open & study**. Enter a goal, session time, and **My private notes**.
   Choose **I explored this step**. After **Saved to your account**, reload:
   private work should return without appearing in the peer's account.
5. In **Study assistant**, enter “What does 50% of 200 mean?” in **My study
   question**, review the prefilled excerpt, confirm sending, and select
   **Get study help**. Check the labelled answer against the source.
6. **Prepare check-in → Share check-in**. The peer uses **Refresh & sync** to
   see the material-linked post. Only deliberately shared text is posted.

## Quick start

Use **Node 24 LTS and npm ≥11**, with the committed lockfile.

```sh
npm ci
test -f .dev.vars || cp .env.example .dev.vars
```

The example is comment-only. Fill configuration in ignored `.dev.vars`, never
in source or shared messages. On Unix, restrict access with `chmod 600 .dev.vars`.

| Configuration          | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Registered Google web client.                     |
| `GOOGLE_CLIENT_SECRET` | Server-only code-exchange secret.                 |
| `GOOGLE_REDIRECT_URI`  | Exact callback on the active origin.              |
| `OPENAI_API_KEY`       | Server-only credential for paid study assistance. |
| `OPENAI_MODEL`         | Defaults to `gpt-4.1-mini`.                       |

Create a Google **Web application** OAuth client with suitable consent/audience
settings ([official setup](https://developers.google.com/identity/protocols/oauth2/web-server)).
For development, register and configure
`http://127.0.0.1:5173/auth/google/callback`; use that same host in the browser.
An origin mismatch disables sign-in. A fresh clone contains no credentials.

```sh
CI=true npm run db:migrate
npm run dev
```

Open **http://127.0.0.1:5173/**. Migrations are local only. The `DB` binding in
[wrangler.jsonc](wrangler.jsonc) uses a placeholder remote database ID; this is
not a provisioned deployment.

For production-build preview, first register/configure
`http://127.0.0.1:3000/auth/google/callback`, then:

```sh
npm run build
npm run preview
```

Open **http://127.0.0.1:3000/**. Ports are strict. Rebuild after changing preview
configuration. Build output can contain ignored `dist/server/.dev.vars`;
never distribute that credential-bearing file. Hosted use needs separately
authorized D1 provisioning, migrations, HTTPS callbacks, and Worker secrets.

Verification commands:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run cf-typegen -- --check
npm run build
```

`npm run cf-typegen` regenerates binding types from the comment-only example.
The [separate Vitest config](vitest.config.js) runs domain tests without loading
Worker/provider configuration.

## How it works

- [Routes](src/routes/) and [workspace UI](src/components/Egbe.tsx):
  TanStack Start/React, served by Cloudflare Workers.
- [Google OIDC](src/server/google.ts): verified code flow; opaque HttpOnly
  session cookie, with its hash in D1. Google tokens/email are not retained.
- [Learner store](src/client/learner-store.ts) and
  [workspace functions](src/server/workspace.functions.ts): in-memory edits,
  revision-checked D1 account saves, and fixed mutation IDs.
- [Circle functions](src/server/circle.functions.ts): D1 materials, membership,
  and check-ins with visibility/ownership checks.
- [Assistance functions](src/server/assistant.functions.ts): reserve a request
  in D1, call the [OpenAI adapter](src/server/assistant.server.ts), store the
  private result. Vite, Wrangler, Vitest, and Playwright are development tools.

## Privacy, connectivity, and AI boundaries

Private work lives in D1, not localStorage, sessionStorage, or IndexedDB.
Failed saves retain edits only in the open page: retry or export before reload.
Revision conflicts require recovery, not automatic merging. There is no
persistent offline lesson cache or export-import restoration screen.

Saving link details does not download the lesson. Imported `.txt`/`.md` content
must be UTF-8, at most 32,768 bytes and 12,000 characters; PDF/image upload and
external lesson fetching are absent. Student materials are unverified;
[starter-link access notes](src/components/Resources.tsx) can become stale.

AI sends only the reviewed question/excerpt plus material title/attribution,
not private goals or notes automatically. Edits reset review confirmation.
Question/excerpt limits are 1,000/6,000 characters. Attempts—including failures—
are capped at 20/account/UTC day, 100/app/UTC day, and 10,000 retained records.
These are not monetary guarantees. **Check earlier request** recovers a record
without another provider call; replacement can incur another charge.

Requests use the owner's OpenAI API account, not ChatGPT subscription credits.
Model/billing/regional eligibility remains operator-dependent. `store: false`
does not promise zero provider retention or accurate answers. Removing shared
material cannot recall account copies, notes, or earlier private assistance.
Replacing an invitation does not remove existing members.

## Built with Codex

Development records show AI agents implementing features, investigating runtime
issues, running checks/temporary Playwright workflows, and reviewing changes.
The owner set the engagement focus and corrected direction toward student
materials, Google identity, account-only storage, private circles, and a wider
compact UI. Exact Codex client/model attribution needs owner confirmation.

Commit **`809c951`** corrected Google's fetch handling from `redirect: 'error'`
to `manual`, while retaining rejection of non-success responses
([current helper](src/server/google.ts)). The owner reported repeated redirects;
an agent reviewed the correction. The diff proves the change, not who diagnosed
it or a subsequent live-provider success. Real-runtime review mattered;
measured time savings and learning improvements are not established.

## Verification, limitations, and next steps

Documentation preparation executed lint, strict typecheck, and **10 utility
tests**, all passing under Node 24.21.0/npm 11.6.2. Document formatting and links
were checked. Earlier browser reviews used seeded sessions; AI integration used
a mocked OpenAI boundary. No fresh browser/provider/build/migration run occurred.

Limits include English-only guidance, unmoderated circles, no account-erasure
UI, no grading, and no persistent offline reload. Live provider/deployment
readiness, screen-reader coverage, and learner validation remain outstanding.
Proposed next month: authorized live demonstration, accessibility/AI-quality
checks, and a consented learner pilot with retention/moderation decisions.

Screenshot pending. No project license is included.
See [product brief](PRODUCT_BRIEF.md) and [as-built specification](CAPSTONE_SPEC.md).

# Egbe — as-built capstone specification

Prepared after implementation for the **Andela x OpenAI x Miva Codex
Accelerator**, against source `8d9edda`. This is reconstructed current-state
documentation, not the original plan or an invented delivery chronology.

## 1. Problem and intended outcome

Help students restart interrupted study, retain context, and ask peers useful
questions. The illustrative target is a student studying from their own
materials in short sessions, often on a phone. User validation is outstanding.
The intended journey is **material → study step → peer check-in**; sustained
engagement is the primary challenge track, not a measured outcome.

## 2. Scope and non-goals

Implemented: Google accounts, public/private circles, invitations, attributed
links/text, private goals/notes/progress, account copies, check-ins, reviewed
OpenAI assistance, and web/numeracy starter tools.

Absent: persistent offline reload, PDF/image uploads, automated lesson fetching,
grading, moderation, translation, notifications, account-erasure UI, and
ChatGPT identity/credit sharing. No MCP server or scheduled runtime job exists.
Deployment is outside the prototype's completed scope.

## 3. Acceptance criteria

**Evidence labels:** “source” means inspected implementation, not a runtime
pass; “prior” means development-thread evidence; “executed” means a check run
during documentation preparation.

### AC1 — Private circle access

- **Preconditions:** migrated D1, configured Google client, owner/member/nonmember
  accounts.
- **Action:** create a private circle, invite a peer, then replace its invitation.
- **Expected:** members can read; nonmembers cannot list/read its materials.
  Old links stop new joins without evicting existing members.
- **Method:** separate browser profiles and known-ID/old-token request replays.
- **References:** [circle functions](src/server/circle.functions.ts),
  [material access](src/server/material-access.server.ts).
- **Evidence:** source; prior seeded-session Chrome/D1 joining, directory hiding,
  and resumption. Live Google and full rotation/direct-read replay are outstanding.

### AC2 — Study and resume private work

- **Preconditions:** signed-in circle member, permitted text, and another member.
- **Action:** share attributed material; Open & study; set goal/time/notes; mark
  a step; wait for Saved to your account; reopen in another same-account browser.
- **Expected:** private work returns; the peer sees shared material, not those
  notes. Steps remain revisitable; saved links are not downloaded articles.
- **Method:** reload, same-account second browser, and peer comparison.
- **References:** [reader](src/components/MaterialReader.tsx),
  [workspace](src/server/workspace.functions.ts).
- **Evidence:** source; prior seeded-account notes/resumption checks. Complete
  fresh-checkout journey not rerun during documentation.

### AC3 — Deliberate, recoverable check-in

- **Preconditions:** member, visible material, question ≤600 characters, peer.
- **Action:** Prepare check-in, review, Share check-in; drop its reply and retry.
- **Expected:** one post per fixed ID, correct material, no automatic note
  disclosure. Material publishes first; failed acknowledgement retains its ID.
- **Method:** two-account browser check plus real-D1 dropped-reply replay.
- **References:** [discussion](src/components/Discussion.tsx),
  [outbox tests](src/domain/outbox.test.ts), [server](src/server/circle.functions.ts).
- **Evidence:** source; five outbox tests executed and passed. Earlier browser
  replays predate Google accounts; current full integration remains outstanding.

### AC4 — Failed/concurrent saves

- **Preconditions:** loaded workspace, two same-account tabs, controllable failure.
- **Action:** edit during failed/in-flight saving; separately save conflicting
  revisions.
- **Expected:** in-page edits remain without false confirmation; mutation IDs
  survive retry; older work cannot silently overwrite newer work. Export/reload
  resolves recovery manually. Cancellation IDs remain until confirmed.
- **Method:** utility tests, D1 failure injection, and two-tab inspection.
- **References:** [sync tests](src/domain/account-sync.test.ts),
  [sync rules](src/domain/account-sync.ts), [workspace](src/server/workspace.functions.ts).
- **Evidence:** five synchronization tests executed and passed; current-browser
  fault/conflict integration not rerun. Old browser-storage tests do not apply.

### AC5 — Reviewed AI assistance

- **Preconditions:** account, accessible material, API access and spend permission;
  disclose any provider mock.
- **Action:** review question/excerpt, Get study help; drop reply, then use Check
  earlier request. Edit either field before another submission.
- **Expected:** edits reset confirmation; D1 marker precedes invocation.
  Provider receives title/attribution/question/excerpt, not private goals/notes
  automatically. Answer is private and labelled; recovery makes no repeat call.
  Wrong-account/inaccessible-material new requests are rejected before invocation.
- **Method:** Worker/D1 with boundary payload capture; separately authorized live
  answer/source review.
- **References:** [UI](src/components/StudyAssistant.tsx),
  [ledger/functions](src/server/assistant.functions.ts),
  [adapter](src/server/assistant.server.ts).
- **Evidence:** source; prior Chrome/Worker/ephemeral-D1 review with seeded
  sessions and only OpenAI mocked verified these boundaries. Live provider,
  answer quality, and exhaustive usage-cap checks remain outstanding.

## 4. Architecture and data flow

[TanStack Start routes](src/routes/) render React through
[Cloudflare's Vite plugin](vite.config.js). The Worker handles:

- [Google OIDC](src/server/google.ts): browser-bound state, PKCE/nonce, verified
  identity, and hashed D1 sessions with an opaque HttpOnly cookie.
- [Account saves](src/server/workspace.functions.ts): validated workspace JSON
  from [in-memory edits](src/client/learner-store.ts), checked by revision/ID.
- [Circles](src/server/circle.functions.ts): D1 memberships, materials, and posts.
- [Assistance](src/server/assistant.functions.ts): reserve D1 request, invoke
  Responses once, save result; recovery reads D1.

Workers/D1 are runtime infrastructure; Google/OpenAI provide identity/inference.
Vite, Wrangler, TypeScript, ESLint, Prettier, Vitest, and Playwright are tooling.

## 5. Sources, configuration, and limits

Learners supply permitted text/links and attribution. No independent credibility
or copyright check occurs. [Four starter links](src/domain/catalog.ts) attribute
MDN, Math is Fun, and SkillsYouNeed; access notes are not live verification.

Use [README setup](README.md#quick-start): Google client ID/secret and exact-origin
`GOOGLE_REDIRECT_URI`; server-only `OPENAI_API_KEY`; optional `OPENAI_MODEL`,
default `gpt-4.1-mini`. Fresh local setup applies all [migrations](migrations/).
[DB configuration](wrangler.jsonc) has a placeholder remote ID, not a deployment.
Google eligibility and OpenAI billing/model/regional access need operator
confirmation.

| Boundary        | Source-defined limit                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Material        | Text 12,000 characters; UTF-8 import 32,768 bytes; title 120, attribution 160, URL 2,000 characters.                          |
| Private work    | Goal 120, notes 4,000 characters; time 5–60 minutes; workspace 512 KiB; 20 saved copies; queues 10 materials/50 posts.        |
| Sharing         | Circle title 80, description 300; posts 600 characters; creation 3/account/hour; materials 5/owner/hour; posts 10/owner/hour. |
| Circle totals   | 100 circles; 100 members/circle; 100 retained materials/circle. Removed rows count where caps query them.                     |
| AI              | Question/excerpt 1,000/6,000 characters; 700 requested output tokens; accepted answer 8,000 characters; body 256 KiB.         |
| AI reservations | 20/account/UTC day; 100/app/day; 10,000 retained records; recent pending request blocks another for 90 seconds.               |

AI day limits use UTC. A pending request blocks another reservation only while
it is less than 90 seconds old.

Sources: [schemas](src/domain/learner.ts), [material validation](src/domain/study-circle.ts),
[circle SQL](src/server/circle.functions.ts), and [AI adapter](src/server/assistant.server.ts).
Failures/uncertain AI calls count; limits are not monetary budgets or provider
quotas. Client RPC deadlines are 15 seconds, assistance 45 seconds; provider
fetch abort signal is 30 seconds. Auth flows expire in ten minutes, sessions in
30 days, with ten sessions/account.

## 6. Privacy, security, and failure behavior

Source controls include session-derived ownership, membership checks,
[same-origin mutations](src/server/request-security.ts), HTTPS outside loopback,
private/no-store responses, hashed invitations/sessions, and owner-only removal.
Google subject/display name are retained; email/provider tokens are not.
These are implemented protections, not complete security assurance.

Private work is in D1, not persistent browser storage. Failed edits remain only
in the open page; export/retry before reload. Conflicts stop overwrites, not merge
them. No export-import restoration is implemented.

New AI calls require current material access and reviewed content; fixed IDs
prevent automatic provider retries. Redirects/refusals/incomplete output are
rejected; answers render as text. Accuracy and prompt-injection resistance are
not guaranteed; `store: false` does not promise zero provider retention.

Removal scrubs shared text but cannot recall saved copies, notes, or earlier
private assistance, whose owner-filtered archive shows five recent records per
material. Replacing invitations does not revoke membership.

## 7. Verification and demonstration

Documentation preparation ran **lint, strict typecheck, and ten utility tests**:
all passed on Node 24.21.0/npm 11.6.2. Scoped document formatting/link checks passed.
No build, migration, browser journey, credential read, or provider call was run.

Prior development evidence includes seeded-session Chrome/D1 private-note and
circle checks; mocked-OpenAI recovery/payload checks; and custom-select keyboard
checks at 320/1280px. Disabled-state, screen-reader, live-provider, hosted, and
current-version network benchmarks remain unverified. Older offline-shell
evidence does not establish current offline capability.

Follow the [README walkthrough](README.md#product-walkthrough) using two profiles,
permitted invented text, configured providers, and approval for paid calls.
Commands are in [package.json](package.json). Build/preview were source-checked,
not rerun; build can copy credentials and rewrite generated files.

## 8. Reconstructed milestones and backlog

Current-state planning, **not historical chronology**:

| Deliverable              | Dependency              | Completion check                                | Status                                                   |
| ------------------------ | ----------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Foundation               | Node/npm                | Build and Worker render                         | Implemented; prior builds, current static checks.        |
| Accounts/private work    | Google client, D1       | Live sign-in, persisted notes/conflicts         | Implemented; seeded/utility evidence, live gap.          |
| Material study           | Account/membership      | Share → study → reload                          | Implemented; partial prior browser evidence.             |
| Peer circles             | Material/accounts       | Two-account replay/rotation                     | Implemented; full current replay outstanding.            |
| Study assistant          | API/model access        | Payload/recovery/live answer checks             | Implemented; mocked-provider evidence only.              |
| Connection/accessibility | App                     | Failures, keyboard/screen readers               | Controls implemented; Chrome/unit evidence, gaps remain. |
| Hosted demonstration     | Authorization/resources | Full live journey                               | Proposed; not provisioned/verified here.                 |
| Learner pilot            | Stable demo/consent     | Observe restart, journey, privacy comprehension | Proposed; no learner results.                            |

## 9. Risks and next-month priorities

Risks: unmoderated content, forwarded invitations, misleading AI answers, stale
links, finite ledgers, and loss of unconfirmed edits. English-only guidance and
mandatory Google identity may exclude learners. Legacy
[practice copy](src/components/Learning.tsx) incorrectly says no account is needed;
the actual workspace is gated.

Owner confirmations: Codex attribution, demo/client eligibility, API billing and
spend permission, hosted resources, licensing, retention/deletion/moderation,
copyright, and pilot consent. Screenshot pending; no project license exists.

**Proposed next month:** authorized live demonstration; accessibility and
source-grounded AI review; consented learner pilot. Measure returns to saved
work and completed check-in journeys before claiming educational impact.

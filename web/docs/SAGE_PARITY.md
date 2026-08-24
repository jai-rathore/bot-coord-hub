# Sage parity tracker

Last reviewed: 2026-08-23

## Definition of complete parity

Every core HoneyMatcha workflow must work with Sage and no external agent.
Connected agents are an optional operator choice, not a feature unlock gate.
Parity means the same useful outcome, not the same authority: introductions,
calendar bookings, disclosures, approvals, and other consequential actions stay
human-gated.

A milestone is complete only when all three columns below say **Complete**:

1. **Code**: the implementation and automated tests are merged.
2. **Production**: every required service, migration, secret, and feature flag is live.
3. **Verified**: the real signed-in workflow has passed end to end in production.

## Current production status

| Milestone | Code | Production | Verified | Current gap |
| --- | --- | --- | --- | --- |
| Shared capability boundary | Complete | Complete | Partial | Ten bounded Sage capabilities are deployed. A live-worker synthetic passed event coordination, hosted event chat, guest requests, people, and activity; signed-in browser verification remains. |
| Durable Sage queue | Complete | Complete | Complete | Postgres jobs, encrypted private payloads/results, redacted telemetry, leases, retries, and idempotency are live. Concurrent claims, idempotent enqueue, expired-lease recovery, and audited requeue passed in production. |
| Sage worker | Complete | Complete | Complete | The worker is live, reaches production Postgres, polls without errors, and the pre-worker queue was confirmed empty. |
| Scheduling | Complete | Complete | Not verified | Structured Sage requests exist; real-calendar duplicate and approval behavior still needs production dogfooding. |
| Dating discovery | Complete | Complete | Partial | Encrypted conversational intake, clarification, location choice, snapshot preparation, anonymous search, staged introductions, and post-decision job continuation are live. The production worker and full dual-approval lifecycle passed; signed-in browser activation remains. |
| Recruiting discovery | Complete | Complete | Partial | Conversational hiring intake plus replay-safe private guest creation and response monitoring are live. The worker path passed a production synthetic; a real candidate response and signed-in review remain. |
| Local meetup discovery | Complete | Complete | Partial | Conversational meetup intake, opt-in recurring search, and durable anonymous recommendations are live. A scheduled search passed through the production worker; signed-in cadence review remains. |
| Events | Complete | Complete | Partial | Durable, replay-safe coordination and hosted event chat passed through the production worker and Gemini. Signed-in organizer and participant dogfooding remains. |
| People and invitations | Complete | Complete | Partial | Sage can review people and create a private, unsent invitation link, and the production worker path passed. Signed-in review remains; approval, revocation, and relationship-policy changes stay human-controlled. |
| Inbox and follow-up | Complete | Complete | Partial | Sage reviews activity, inbox, sessions, and event boards. Operator-safe automatic routing is live and passed both Sage-primary delivery and external-primary suppression; signed-in continuation dogfooding remains. |
| Operations and scale | Complete | Partial | Partial | Indexed candidate scanning, provider retries/circuits/concurrency/budgets, dead-letter recovery, notification leases, retention, metrics, live heartbeats, and restart safety are production-proven. The worker has no email or SMS delivery credentials, and signed-in admin review remains. |

## Architecture invariants

- Models interpret requests; deterministic domain services own permissions and state.
- Sage calls domain services in-process. It never impersonates an API key or calls HoneyMatcha's MCP endpoint.
- Every durable action has an owner, trigger, idempotency key, attempt, lease, run, and redacted step record.
- Dating, hiring, and local-meetup searches never reveal identity or raw private claims.
- Introductions, calendar bookings, and other consequential actions remain human-gated.
- A per-user operator preference prevents Sage and a connected agent from racing.
- A checked task means merged, deployed, and verified unless its text explicitly says code-only.

## Work queue

### Latest production evidence

- PRs 71 through 73 are merged and the web and worker services run the same
  production schema and Sage discovery code.
- A production synthetic dating turn completed through the durable queue,
  Gemini, canonical location resolution, encrypted message storage, and run
  telemetry. Its temporary user and all cascaded data were deleted afterward.
- PR 75 is merged and deployed to both the web and worker services. Migration
  0030, production preflight, the full event database suite, and the encrypted
  queue/guest/invitation/session suite passed.
- PRs 76 and 77 are merged and deployed. Production job
  `job-da5q05m417fc738a3j60` passed event coordination, hosted event chat through
  Gemini, guest requests, connection management, and activity review through
  the live worker. All synthetic records were removed after the run.
- That production proof exposed two real configuration gaps before succeeding:
  the worker was missing `ENABLE_EVENTS`, and guest email binding depended on a
  web-only pepper. The feature flag is now present and guest email binding uses
  the shared encryption key with legacy-hash compatibility.
- PRs 78 and 79 are merged and deployed. Production job
  `job-da5qambncjis739p28mg` proved one deadline inbox created exactly one Sage
  job for a Sage-primary account, while an external-primary account retained
  its inbox item and created no duplicate Sage job. The same run repeated all
  five cross-stream proofs and removed every synthetic row.
- PR 80 is merged and deployed to both services. Production job
  `job-da5qn7jm8hqs73djgujg` proved an opted-in cadence produced a durable
  anonymous recommendation through the live worker without exposing the
  candidate id or email, then removed every synthetic row. Regression job
  `job-da5qniqjobas73fk12fg` repeated all five cross-stream proofs plus Sage and
  external-primary routing after the cadence release.
- PRs 82 and 83 are merged and deployed across the web, worker, events cron,
  and cleanup cron. Production job `job-da5r5r0u01pc7387h78g` passed concurrent
  idempotent enqueue, single-winner queue and outbox claims, expired-lease
  recovery, audited dead-letter requeue through the live worker, retention,
  and operational metrics, then removed every synthetic row. Regression job
  `job-da5r66jbc2fs73a0nl00` repeated the cross-stream proof afterward.
- The scheduled events cron emitted a clean `[sage-metrics]` snapshot and ran
  the leased outbox drain at 03:00 UTC. The scheduled cleanup cron then called
  the protected production endpoint and returned successful discovery and Sage
  retention results at 03:01 UTC.
- Deployment verification found and repaired a previously skipped API-key
  migration. Preflight now checks the complete credential shape and the Sage
  queue and conversation tables.
- Signed-in browser dogfooding is still required before conversational
  discovery can be called completely verified.
- PRs 85 through 89 are merged. Migrations 0033 and 0034 are live across the
  web, worker, events cron, and cleanup cron services. The actual web and
  worker services have explicit provider retry, concurrency, circuit, lease,
  and 100,000-token daily per-person limits.
- Production job `job-da5ru60u01pc7389v7j0` proved the indexed discovery query
  plan, provider retry, fleet concurrency, shared circuit opening, token and
  configured-cost budget enforcement, queue and outbox races, dead-letter
  recovery, retention, metrics, alerts, and synthetic cleanup.
- Production job `job-da5rufrm8hqs73dn3geg` passed the full deterministic
  discovery suite, including anonymous cards, requester confirmation,
  recipient acceptance, completed Sage continuation state, selective
  disclosure, safety controls, and retention cleanup.
- Production jobs `job-da5ruprbc2fs73a32png` and
  `job-da5rvoqjobas73fnmfg0` repeated event coordination, Gemini event chat,
  guest recruiting requests, connection review, activity review, proactive
  Sage routing, and external-primary suppression through the live worker.
- Production job `job-da5s3kajobas73fo0va0` passed conversational Sage
  discovery through Gemini and the live worker. Controlled jobs
  `job-da5s9fojo6nc73didgi0` and `job-da5sa3rm8hqs73do4u50` emitted successful
  lease heartbeats, survived rolling worker restarts, completed, and cleaned
  up. Render did not expose a process-level `SIGTERM` drain log, so that exact
  signal assertion remains open.
- Safe environment probes confirmed neither the web nor worker currently has
  Resend or Twilio credentials. The worker-owned notification loop is live but
  real email or SMS delivery cannot be marked verified until credentials are
  configured.
- This Codex session had no callable authenticated browser connection. Signed-in
  scheduling, discovery, and admin UX dogfooding remain open instead of being
  inferred from backend proof.

### Active implementation slice

| Work item | Code | Database test | Production | Next proof |
| --- | --- | --- | --- | --- |
| Indexed rotating discovery sampling and composite candidate cursor index | Complete | Passed | Deployed | Production query plan passed in `job-da5ru60u01pc7389v7j0` |
| Shared provider retries, circuit breaker, concurrency leases, and per-person token/cost budgets | Complete | Passed | Deployed | Provider race, retry, circuit, token, and configured-cost proofs passed in `job-da5ru60u01pc7389v7j0` |
| Worker-owned leased notification draining with cron fallback | Complete | Lease race passed | Partial | Configure worker delivery secrets and prove worker-owned external delivery |
| Sage introduction continuation after requester and recipient decisions | Complete | Passed | Deployed | Full request, dual decision, completed job, privacy, and cleanup proof passed in `job-da5rufrm8hqs73dn3geg` |
| Observable worker heartbeat and graceful drain state | Complete | Passed | Partial | Heartbeat and rolling-restart survival passed; capture the process-level drain signal if Render exposes it |
| Encrypt private Sage inputs and owner-visible results; redact operational payloads and steps | Complete | Passed | Deployed | Signed-in owner API/UI result check |
| Replay-safe event creation | Complete | Passed | Deployed | Signed-in event creation dogfood |
| `coordinate_event` create/list/review and lifecycle mutations | Complete | Passed | Deployed | Signed-in organizer lifecycle dogfood |
| `run_guest_request` create/list/review | Complete | Passed | Deployed | Real candidate response and signed-in review |
| `manage_connections` review and private invite creation | Complete | Passed | Deployed | Signed-in People comparison |
| `review_activity` inbox/session overview | Complete | Passed | Deployed | Signed-in activity comparison |
| Hosted event chat through encrypted Sage jobs and redacted run steps | Complete | Passed | Deployed | Signed-in organizer and participant chat dogfood |
| Operator-safe inbox, approval, session, and event-deadline triggers plus visible Sage updates | Complete | Passed | Deployed | Signed-in approval and session continuation comparison |
| Opt-in discovery cadence, per-user budget, notification choice, and durable anonymous recommendations | Complete | Passed | Deployed | Signed-in cadence setup, notification, dismissal, and introduction review |
| Operations UI and recovery tooling | Complete | Passed | Deployed | Signed-in admin console, real alert delivery, and requeue review |

This workstation did not have a usable local PostgreSQL environment for the
slice, so database evidence came from isolated production one-off jobs against
the live schema. Synthetic rows were explicitly cleaned up after each passing
run. The full unit suite, lint, type checks, build, route rendering checks, and
GitHub CI also passed.

### P0: make the existing Sage path operational

- [x] Provision `honeymatcha-sage-worker` in the live Render workspace.
- [x] Confirm the worker uses the production database and `ENABLE_SAGE_JOBS=true`.
- [x] Inspect jobs queued before the worker existed; the production queue was empty.
- [x] Run a synthetic discovery turn through the production worker, Gemini, location resolver, encryption, and cleanup.
- [x] Run a hosted Sage discovery job through Gemini and the production worker.
- [ ] Run authenticated signed-in scheduling and discovery from the production UI.
- [x] **Automated production proof:** Verify concurrent claims, expired-lease recovery, retry history, and idempotent replay.
- [x] Verify live lease heartbeats and completion across a rolling worker restart.
- [ ] Capture the process-level drain signal during an active job if Render exposes it.

### P1: complete conversational discovery

- [x] Add a narrow request interpreter that produces one typed capability request.
- [x] Give the model only the selected capability schema, never the entire MCP catalog.
- [x] Persist conversation and clarification state for missing or ambiguous enrollment fields.
- [x] Let Sage explain discovery purposes and prepare enrollment drafts.
- [x] Let Sage resolve locations and present ambiguous choices to the human.
- [x] Require snapshot approval before activating agent-prepared enrollment data.
- [x] Let Sage run a search and explain anonymous results without exposing private dimensions.
- [x] Let Sage stage an introduction request for human approval.
- [x] Resume the workflow after requester and recipient decisions.
- [x] Add and production-prove provider retry, circuit breaker, concurrency, and token/cost budgets.

### P2: cover the remaining product streams

- [x] **Code-only:** Add an outcome-level `coordinate_event` capability for creation, options, responses, notes, reminders, deadlines, and notification preferences.
- [x] **Automated production proof:** Deploy and verify replay-safe event create/list/review through the live worker.
- [x] **Code-only:** Wrap hosted event turns in encrypted Sage jobs, runs, and redacted steps.
- [x] **Code-only:** Preserve event role-specific tool allowlists, human-only action boundaries, and deterministic deadline resolution.
- [x] **Code-only:** Add a `run_guest_request` capability for recruiting and other no-account structured requests.
- [x] **Automated production proof:** Deploy and verify privacy-preserving guest creation and response monitoring through the live worker.
- [x] **Code-only:** Let Sage monitor guest responses and return privacy-preserving human-review summaries.
- [x] **Code-only:** Add a `manage_connections` capability for people review and private, unsent invitations; approvals, revocation, and relationship policy remain human-controlled.
- [x] **Automated production proof:** Deploy and verify connection and met-person review through the live worker.
- [x] **Code-only:** Add a `review_activity` capability for inbox, sessions, event boards, acknowledgement, and safe review.
- [x] **Automated production proof:** Deploy and verify inbox and session review through the live worker.
- [ ] Dogfood all P2 flows in a real signed-in production browser session.

### P3: proactive operation

- [x] **Code-only:** Wire inbox events to one selected operator through an idempotent trigger bridge.
- [x] **Code-only:** Wire approval results and peer session activity to continuation jobs.
- [x] **Code-only:** Wire event deadlines and pending-response notifications to event review jobs.
- [x] **Code-only:** Show recent proactive Sage work on the signed-in home page.
- [x] **Code-only:** Add opt-in, user-controlled discovery cadence and notification preferences.
- [x] **Code-only:** Persist anonymous recommendations for 30 days independently from short-lived discovery handles.
- [x] **Code-only:** Enqueue periodic discovery only after applying operator preference, active enrollment, safety status, and a one-search-per-user daily budget.
- [x] **Code-only:** Route automatic callbacks only to the selected operator so Sage and a connected agent do not receive the same automatic trigger.
- [x] **Automated production proof:** Verify the proactive trigger slice against the live worker and an external-primary account.
- [x] **Automated production proof:** Deploy migration 0031 and prove recurring discovery creates a durable anonymous recommendation through the live worker.

### P4: reliability, operations, and scale

- [x] **Automated production proof:** Verify idempotent enqueue races, concurrent queue and outbox claims, expired leases, audited requeue, and retention.
- [x] **Code-only:** Add an internal dead-letter and requeue console with append-only audit records.
- [x] **Code-only:** Add retention cleanup for completed jobs, runs, steps, recommendations, expired handles, and notification history.
- [x] **Code-only:** Lease notification outbox rows before sending so multiple drainers cannot send concurrently.
- [x] **Code-only:** Emit queue age, run latency, attempts, outcomes, provider tokens, and configurable provider cost metrics.
- [x] **Code-only:** Alert configured administrators on queue age, repeated retries, dead letters, and repeated provider failures.
- [x] **Automated production proof:** Deploy migration 0032 and pass the Sage operations production race and recovery proof.
- [x] Replace randomized candidate sampling with an indexed rotating cursor before fleet-wide scans.
- [x] Move notification draining to a leased worker path while retaining cron as fallback.
- [ ] Configure worker email or SMS credentials and prove real worker-owned delivery.

## Rollout gates

1. Worker is live and both structured capabilities pass production end-to-end tests.
2. Conversational input cannot bypass schema validation, privacy, or approval boundaries.
3. Dating, recruiting, and meetup flows each pass anonymous-card and dual-approval dogfooding.
4. Event and guest workflows produce the same outcomes with Sage as with a connected agent.
5. Proactive triggers respect operator selection, idempotency, budgets, and notification preferences.
6. Dead letters, queue age, provider failures, and retention are visible and operable before traffic is increased.

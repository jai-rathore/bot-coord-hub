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
| Shared capability boundary | Partial | Complete | Partial | Ten bounded Sage capabilities now exist in code. Event, guest, people, activity, and hosted event-chat additions still need deployment and production verification. |
| Durable Sage queue | Complete | Complete | Partial | Postgres jobs, runs, steps, leases, retries, and idempotency are live; concurrency recovery still needs database integration coverage. |
| Sage worker | Complete | Complete | Complete | The worker is live, reaches production Postgres, polls without errors, and the pre-worker queue was confirmed empty. |
| Scheduling | Complete | Complete | Not verified | Structured Sage requests exist; real-calendar duplicate and approval behavior still needs production dogfooding. |
| Dating discovery | Partial | Complete | Partial | Encrypted conversational intake, clarification, location choice, snapshot preparation, anonymous search, and staged introductions are live. Signed-in activation and dual-approval dogfooding remain. |
| Recruiting discovery | Partial | Complete | Not verified | Conversational hiring intake is live. Replay-safe private guest creation and response monitoring are implemented locally; deployment and production verification remain. |
| Local meetup discovery | Partial | Complete | Not verified | Conversational meetup intake is live; recurring search and persistent recommendations remain. |
| Events | Partial | Complete | Partial | Durable, replay-safe create/list/review, options, responses, notes, reminders, deadlines, notification preferences, and hosted chat jobs are implemented locally. Deployment and dogfooding remain. |
| People and invitations | Partial | Not deployed | Not verified | Sage can review people and create a private, unsent invitation link in code. Approval, revocation, and relationship-policy changes remain human-controlled. |
| Inbox and follow-up | Partial | Not deployed | Not verified | Sage can review inbox and sessions in code. Trigger producers, continuations, acknowledgements, and safe follow-up remain. |
| Operations and scale | Partial | Partial | Not verified | No dead-letter console, requeue action, alerts, retention job, persistent recommendations, or indexed discovery scan. |

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
- Deployment verification found and repaired a previously skipped API-key
  migration. Preflight now checks the complete credential shape and the Sage
  queue and conversation tables.
- Signed-in browser dogfooding is still required before conversational
  discovery can be called completely verified.

### Active implementation slice

| Work item | Code | Database test | Production | Next proof |
| --- | --- | --- | --- | --- |
| Encrypt private Sage inputs and owner-visible results; redact operational payloads and steps | Complete locally | Pending | Not deployed | Migration, replay integration, and signed-in API result check |
| Replay-safe event creation | Complete locally | Pending | Not deployed | Create the same job twice and prove one event with one dimension set |
| `coordinate_event` create/list/review and lifecycle mutations | Complete locally | Pending | Not deployed | Replay each effect, then dogfood the signed-in event UI |
| `run_guest_request` create/list/review | Complete locally | Pending | Not deployed | Replay one private link, then review a privacy-preserving response |
| `manage_connections` review and private invite creation | Complete locally | Pending | Not deployed | Replay one invite and compare the signed-in People result |
| `review_activity` inbox/session overview | Complete locally | Pending | Not deployed | Signed-in activity result comparison |
| Hosted event chat through encrypted Sage jobs and redacted run steps | Complete locally | Pending | Not deployed | Replay one turn and prove one model call, one transcript pair, and one counted turn |
| Proactive triggers, relationship changes, and operations UI | Not started | Not started | Not deployed | Implement operator-safe producers, human gates, and dead-letter controls |

Local PostgreSQL integration is marked pending because this workstation has no
PostgreSQL server or project environment file. It will not be counted complete
until the migration is deployed and the database suites pass against the live
schema.

### P0: make the existing Sage path operational

- [x] Provision `honeymatcha-sage-worker` in the live Render workspace.
- [x] Confirm the worker uses the production database and `ENABLE_SAGE_JOBS=true`.
- [x] Inspect jobs queued before the worker existed; the production queue was empty.
- [x] Run a synthetic discovery turn through the production worker, Gemini, location resolver, encryption, and cleanup.
- [ ] Run an authenticated scheduling job and discovery job end to end.
- [ ] Verify lease heartbeats, graceful shutdown, retry, and idempotent replay in production.

### P1: complete conversational discovery

- [x] Add a narrow request interpreter that produces one typed capability request.
- [x] Give the model only the selected capability schema, never the entire MCP catalog.
- [x] Persist conversation and clarification state for missing or ambiguous enrollment fields.
- [x] Let Sage explain discovery purposes and prepare enrollment drafts.
- [x] Let Sage resolve locations and present ambiguous choices to the human.
- [x] Require snapshot approval before activating agent-prepared enrollment data.
- [x] Let Sage run a search and explain anonymous results without exposing private dimensions.
- [x] Let Sage stage an introduction request for human approval.
- [ ] Resume the workflow after requester and recipient decisions.
- [ ] Add provider retry, circuit breaker, concurrency, and token/cost budgets.

### P2: cover the remaining product streams

- [x] **Code-only:** Add an outcome-level `coordinate_event` capability for creation, options, responses, notes, reminders, deadlines, and notification preferences.
- [ ] Deploy and verify the completed code slice for replay-safe event create/list/review.
- [x] **Code-only:** Wrap hosted event turns in encrypted Sage jobs, runs, and redacted steps.
- [x] **Code-only:** Preserve event role-specific tool allowlists, human-only action boundaries, and deterministic deadline resolution.
- [x] **Code-only:** Add a `run_guest_request` capability for recruiting and other no-account structured requests.
- [ ] Deploy and verify the completed code slice for privacy-preserving guest response monitoring.
- [x] **Code-only:** Let Sage monitor guest responses and return privacy-preserving human-review summaries.
- [x] **Code-only:** Add a `manage_connections` capability for people review and private, unsent invitations; approvals, revocation, and relationship policy remain human-controlled.
- [ ] Deploy and verify the completed code slice for connection and met-person review.
- [x] **Code-only:** Add a `review_activity` capability for inbox, sessions, event boards, acknowledgement, and safe review.
- [ ] Deploy and verify the completed code slice for inbox and session review.

### P3: proactive operation

- [ ] Wire inbox events to the selected operator.
- [ ] Wire approval results and scheduling state changes to continuation jobs.
- [ ] Wire event deadlines and pending responses to continuation jobs.
- [ ] Add user-controlled discovery cadence and notification preferences.
- [ ] Persist recommendations independently from short-lived discovery handles.
- [ ] Enqueue periodic discovery only after applying operator preference, safety status, and per-user budget.
- [ ] Prevent Sage and a connected agent from acting on the same trigger.

### P4: reliability, operations, and scale

- [ ] Add database integration tests for concurrent claiming, expired leases, retries, and idempotency races.
- [ ] Add an internal dead-letter and requeue console with append-only audit records.
- [ ] Add retention cleanup for completed jobs, runs, steps, recommendations, and expired discovery handles.
- [ ] Lease notification outbox rows before sending so multiple drainers cannot double-send.
- [ ] Emit queue age, run latency, attempts, outcomes, provider tokens, and provider cost metrics.
- [ ] Alert on queue age, repeated retries, dead letters, and unavailable providers.
- [ ] Replace randomized candidate sampling with indexed buckets or cursors before fleet-wide scans.
- [ ] Move notification draining to a leased worker path while retaining cron as a trigger only.

## Rollout gates

1. Worker is live and both structured capabilities pass production end-to-end tests.
2. Conversational input cannot bypass schema validation, privacy, or approval boundaries.
3. Dating, recruiting, and meetup flows each pass anonymous-card and dual-approval dogfooding.
4. Event and guest workflows produce the same outcomes with Sage as with a connected agent.
5. Proactive triggers respect operator selection, idempotency, budgets, and notification preferences.
6. Dead letters, queue age, provider failures, and retention are visible and operable before traffic is increased.

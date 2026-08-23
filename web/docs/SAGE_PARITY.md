# Sage parity plan

## Product rule

Every core HoneyMatcha workflow must work with Sage and no external agent.
Connected agents are an optional operator choice, not a feature-unlock gate.
Both operators use the same server-side capability definitions, policies,
domain services, idempotency rules, and human approval boundaries.

## Architecture invariants

- Models interpret requests; deterministic domain services own permissions and state.
- Sage calls domain services in-process. It never impersonates an API key or calls HoneyMatcha's MCP endpoint.
- Every durable action has an owner, trigger, idempotency key, attempt, lease, run, and redacted step record.
- Dating, hiring, and local-meetup searches never reveal identity or raw private claims.
- Introductions, calendar bookings, and other consequential actions remain human-gated.
- A per-user operator preference prevents Sage and a connected agent from racing.

## Delivery phases

### Phase 1 — shared control plane and functional parity

- [x] Add durable `sage_jobs`, `sage_runs`, and `sage_steps` records.
- [x] Add Postgres leasing with `FOR UPDATE SKIP LOCKED`, retries, backoff, dead-letter state, heartbeats, and per-user/capability concurrency.
- [x] Distinguish hosted Sage from external agents in audit records.
- [x] Add Sage-primary, connected-agent-primary-with-fallback, and Sage-only preferences.
- [x] Route Sage and external scheduling/discovery through shared capability definitions.
- [x] Let a signed-in user ask Sage to schedule a meeting.
- [x] Let Sage search approved dating, hiring, and local-meetup enrollments.
- [x] Preserve human confirmation before booking or requesting an introduction.
- [x] Add a graceful long-running Render worker and controlled production feature flag.

### Phase 2 — reliability and operations

- [ ] Add database-backed integration tests for concurrent claiming, expired leases, retries, and idempotency races.
- [ ] Add an internal dead-letter/requeue view and alerting.
- [ ] Add retention cleanup for completed jobs, runs, and expired discovery handles.
- [ ] Lease notification outbox rows before sending so multiple drainers cannot double-send.
- [ ] Emit run latency, queue age, attempt count, outcome, and provider-cost metrics.

### Phase 3 — conversational Sage

- [ ] Add a narrow request interpreter that produces one typed capability request.
- [ ] Give each run only the selected capability schema, never the entire MCP catalog.
- [ ] Add clarification and correction states without allowing the model to bypass validation.
- [ ] Add provider retry, circuit breaker, concurrency, and fallback budgets.

### Phase 4 — proactive discovery

- [ ] Persist recommendations independently from short-lived discovery handles.
- [ ] Add user-controlled search cadence and notification preferences.
- [ ] Replace randomized candidate sampling with indexed buckets/cursors before fleet-wide scans.
- [ ] Enqueue periodic searches only after applying the operator preference and per-user budget.

### Phase 5 — consolidate events

- [ ] Wrap hosted event chat turns in the shared run/step envelope.
- [ ] Keep event role-specific tool allowlists and deterministic deadline resolution unchanged.
- [ ] Move notification draining to a leased worker path while retaining cron as a trigger only.

## Rollout gates

1. Apply the migration and deploy the worker with `ENABLE_SAGE_JOBS=true`.
2. Dogfood scheduling with real connected calendars and confirm duplicate submissions remain idempotent.
3. Dogfood one discovery intent at a time; verify anonymous cards and dual approval.
4. Monitor queue age, lease recovery, retry counts, and failed jobs before increasing traffic.
5. Add conversational input only after structured workflows are stable.

-- Indexes for hot query paths that had none.
--
-- drizzle-kit generate could not be used as-is here: the snapshot chain skips
-- 0023 and 0024 (both hand-written), so it diffed against a stale base and
-- re-emitted an existing table. The accompanying snapshot does record the full
-- current schema, so it repairs that drift for future generates.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: the migrator runs inside a
-- transaction, which CONCURRENTLY forbids. These tables are small enough that
-- the brief write lock is not a concern.

-- listSessionsForUser and getHomeStatus filter by one user column and sort by
-- updated_at; the single-column indexes left that as an in-memory sort.
CREATE INDEX "sessions_initiator_updated_idx" ON "sessions" USING btree ("initiator_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "sessions_peer_updated_idx" ON "sessions" USING btree ("peer_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "sessions_link_id_idx" ON "sessions" USING btree ("link_id");--> statement-breakpoint

-- listConfirmsForUser: where user_id [+ status] order by created_at.
CREATE INDEX "confirms_user_status_created_idx" ON "confirms" USING btree ("user_id","status","created_at");--> statement-breakpoint

-- Session messages are always read for one session, in creation order.
CREATE INDEX "session_messages_session_created_idx" ON "session_messages" USING btree ("session_id","created_at");--> statement-breakpoint

-- Every events page sorts by created_at, which had no index at all.
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");--> statement-breakpoint

-- listLinksForUser matches either side of the relationship and sorts by created_at.
CREATE INDEX "links_from_created_idx" ON "links" USING btree ("from_user_id","created_at");--> statement-breakpoint
CREATE INDEX "links_to_created_idx" ON "links" USING btree ("to_user_id","created_at");--> statement-breakpoint

-- Both outbox foreign keys are filtered and joined on, and this is the
-- fastest-growing table in the schema.
CREATE INDEX "notification_outbox_user_idx" ON "notification_outbox" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_outbox_event_idx" ON "notification_outbox" USING btree ("event_id");--> statement-breakpoint

-- Enrollment revoke and the hourly discovery cleanup filter on these columns
-- directly; without an index both full-scanned discovery_interests.
CREATE INDEX "discovery_interests_requester_enrollment_idx" ON "discovery_interests" USING btree ("requester_enrollment_id");--> statement-breakpoint
CREATE INDEX "discovery_interests_recipient_enrollment_idx" ON "discovery_interests" USING btree ("recipient_enrollment_id");--> statement-breakpoint

-- Interest cleanup matches agent_inbox rows by a value inside the JSON body as
-- well as by the column. That half of the OR could not use any index, so it
-- scanned the whole table once per interest, inside an open transaction.
CREATE INDEX "agent_inbox_body_interest_idx" ON "agent_inbox" USING btree ((("body" ->> 'interestId')));

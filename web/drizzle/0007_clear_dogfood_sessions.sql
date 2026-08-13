-- Clear leftover dogfood coordination so Activity and Recent tasks start fresh.
-- Idempotent: only touches unbooked sessions for the two current testers.
WITH dogfood AS (
  SELECT id
  FROM users
  WHERE lower(email) IN (
    'jaiadityarathore@gmail.com',
    'sharmarishav5540@gmail.com'
  )
),
target AS (
  SELECT s.id
  FROM sessions s
  WHERE s.status IN ('open', 'proposed', 'accepted')
    AND (
      s.initiator_user_id IN (SELECT id FROM dogfood)
      OR s.peer_user_id IN (SELECT id FROM dogfood)
      OR EXISTS (
        SELECT 1
        FROM session_participants sp
        WHERE sp.session_id = s.id
          AND sp.user_id IN (SELECT id FROM dogfood)
      )
    )
),
stopped AS (
  UPDATE sessions
  SET
    status = 'cancelled',
    updated_at = NOW(),
    payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
      'phase', 'stopped',
      'stoppedReason', 'Cleared leftover test coordination so the board can start fresh.'
    )
  WHERE id IN (SELECT id FROM target)
  RETURNING id
),
denied AS (
  UPDATE confirms
  SET status = 'denied', decided_at = NOW()
  WHERE status = 'pending'
    AND session_id IN (SELECT id FROM stopped)
  RETURNING id
),
acked AS (
  UPDATE agent_inbox
  SET acked_at = NOW()
  WHERE acked_at IS NULL
    AND session_id IN (SELECT id FROM stopped)
  RETURNING id
),
revoked AS (
  UPDATE guest_tasks
  SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
  WHERE status = 'open'
    AND session_id IN (SELECT id FROM stopped)
  RETURNING id
)
SELECT
  (SELECT count(*) FROM stopped) AS sessions_stopped,
  (SELECT count(*) FROM denied) AS confirms_denied,
  (SELECT count(*) FROM acked) AS inbox_acked,
  (SELECT count(*) FROM revoked) AS guest_tasks_revoked;

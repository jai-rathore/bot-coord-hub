/**
 * Text notifications are offered only when a Twilio From number is set.
 * Unset the number to hide Text in the UI and skip SMS in the outbox.
 * Setting it again (and redeploying) turns texts back on.
 */
export function smsOffered(): boolean {
  return Boolean(process.env.TWILIO_FROM_NUMBER?.trim());
}

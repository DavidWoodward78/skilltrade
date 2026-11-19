/**
 * PHASE 2 STUB: due-date nudges by DM.
 * "Your trade with X is due Friday. Mark it done?" with a [Mark done] button.
 *
 * Plan:
 * - Schedule: pg_cron daily -> outbox rows (kind 'due_nudge', dedupe_key 'nudge:<trade>:<due_date>')
 *   for active trades due in 2 days where the member hasn't confirmed the other side's delivery.
 * - Button action_id 'skilltrade_mark_done' -> server-only RPC that re-checks the community and
 *   that the clicker is in the trade, then runs the same logic as confirm_delivery().
 *   (confirm_delivery uses auth.uid(), so it needs a service-role twin, like slack_respond_card.)
 */
export type DueNudge = { orgId: string; tradeId: string; userId: string; partnerName: string; dueDate: string };

export function dueNudgeBlocks(_n: DueNudge): never {
  throw new Error("Due-date nudges are Phase 2");
}

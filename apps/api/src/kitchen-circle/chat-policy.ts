/**
 * Phase 6 chat policy: decides, for each typed action interpreted from a chat message, whether it
 * applies straight away or waits for a member's confirmation. Interpretation (and any ambiguity
 * question) comes from the intelligence service; this policy is the API's own guarantee.
 *
 *   clear low-risk edit to an unlocked day → apply and log
 *   change to a locked day                 → confirmation
 *   bulk week change (3+ day edits)        → confirmation (reviewed as a set)
 *   recurring rule create/update           → confirmation
 *   grocery list / cart action             → explicit confirmation
 *   auto-fill request                      → apply (it only creates a proposal to review)
 *   AI recipe request                      → apply (it only writes a draft; planning it needs a review)
 *   dish not safe for everyone eating      → confirmation (decided by the chat service's fit check)
 */

export type ChatActionType =
  | 'SET_MEAL' | 'CLEAR_DAY' | 'SET_DAY_STATUS' | 'SET_SERVINGS' | 'SET_ATTENDANCE' | 'LOCK_SLOT' | 'UNLOCK_SLOT'
  | 'CREATE_RECURRING_RULE' | 'UPDATE_RECURRING_RULE' | 'REQUEST_AUTOFILL' | 'CREATE_GROCERY_SNAPSHOT' | 'CREATE_RECIPE';

export interface ChatAction {
  type: ChatActionType;
  slot_id?: string | null;
  planned_for?: string | null;
  recipe_id?: string | null;
  recipe_version_id?: string | null;
  meal_title?: string | null;
  /** CREATE_RECIPE: dish to write a recipe for. */
  dish?: string | null;
  /** SET_MEAL: the meal it replaces on that day. */
  replaces?: string | null;
  state?: 'leftovers' | 'no_cook' | 'household_out' | null;
  servings?: number | null;
  status?: 'attending' | 'absent' | null;
  rule_id?: string | null;
  weekday?: number | null;
  strength?: 'hard' | 'preference' | 'contextual' | null;
  category?: string | null;
  constraint?: Record<string, unknown> | null;
  active?: boolean | null;
  scope?: 'week' | 'day' | null;
  /** CREATE_RECURRING_RULE only: applies to the current plan's week instead of recurring. */
  this_week_only?: boolean | null;
  summary?: string;
}

export interface PolicyDecision {
  decision: 'apply' | 'confirm';
  policy: 'low_risk' | 'self_attendance' | 'review_proposal' | 'locked_day' | 'bulk_change' | 'recurring_rule' | 'order_action'
    | 'ai_recipe_draft' | 'ai_recipe_review' | 'hard_constraint';
  note: string | null;
}

/** Day edits that change what the household eats; counted for the bulk rule. */
export const DAY_EDITS: ReadonlySet<ChatActionType> = new Set(['SET_MEAL', 'CLEAR_DAY', 'SET_DAY_STATUS', 'SET_SERVINGS', 'UNLOCK_SLOT']);
export const BULK_THRESHOLD = 3;

/** What one message's actions add up to: how many different days they edit, and how many meals each day gets. */
export function messageShape(actions: ReadonlyArray<Pick<ChatAction, 'type' | 'slot_id' | 'planned_for'>>) {
  const day = (a: Pick<ChatAction, 'slot_id' | 'planned_for'>) => a.slot_id ?? a.planned_for ?? null;
  const edits = actions.filter((a) => DAY_EDITS.has(a.type));
  const meals = new Map<string, number>();
  for (const a of actions) if (a.type === 'SET_MEAL' && day(a)) meals.set(day(a)!, (meals.get(day(a)!) ?? 0) + 1);
  return {
    // Distinct days; an edit with no day counts on its own.
    dayEditsInMessage: new Set(edits.map((a, i) => day(a) ?? `#${i}`)).size,
    mealsOnSameDay: (a: Pick<ChatAction, 'slot_id' | 'planned_for'>) => (day(a) ? meals.get(day(a)!) ?? 0 : 0),
  };
}

export function decide(action: ChatAction, ctx: { slotLocked: boolean; dayEditsInMessage: number; mealsOnSameDay?: number }): PolicyDecision {
  switch (action.type) {
    case 'CREATE_GROCERY_SNAPSHOT':
      return { decision: 'confirm', policy: 'order_action', note: 'Grocery lists need an explicit confirmation.' };
    case 'CREATE_RECURRING_RULE':
    case 'UPDATE_RECURRING_RULE':
      return { decision: 'confirm', policy: 'recurring_rule', note: 'Rules affect every future week, so a member confirms them.' };
    case 'REQUEST_AUTOFILL':
      return { decision: 'apply', policy: 'review_proposal', note: 'Suggestions are created for review; nothing on the plan changes yet.' };
    case 'CREATE_RECIPE':
      return { decision: 'apply', policy: 'ai_recipe_draft', note: 'An AI-written draft: nothing goes on the plan until someone checks it.' };
    case 'SET_ATTENDANCE':
      return { decision: 'apply', policy: 'self_attendance', note: null };
    case 'LOCK_SLOT':
      return { decision: 'apply', policy: 'low_risk', note: null };
    default:
      break;
  }
  if (ctx.slotLocked) return { decision: 'confirm', policy: 'locked_day', note: 'This day is locked, so the change needs confirmation.' };
  // A day holds one meal: several for the same day in one message means only one can stay, so a member picks.
  if (action.type === 'SET_MEAL' && (ctx.mealsOnSameDay ?? 1) > 1) {
    return { decision: 'confirm', policy: 'bulk_change', note: `${ctx.mealsOnSameDay} meals were suggested for this day. Confirm the one you want.` };
  }
  if (DAY_EDITS.has(action.type) && ctx.dayEditsInMessage >= BULK_THRESHOLD) {
    return { decision: 'confirm', policy: 'bulk_change', note: `This message changes ${ctx.dayEditsInMessage} days, so please review it first.` };
  }
  return { decision: 'apply', policy: 'low_risk', note: null };
}

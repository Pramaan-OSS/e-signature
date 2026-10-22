/** Local capacity limits, independent of hosted subscriptions. */
export const DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT = 100;
export const DEFAULT_RECIPIENT_COUNT = 100;
export const PAID_PLAN_LIMITS = { documents: Number.MAX_SAFE_INTEGER, templates: Number.MAX_SAFE_INTEGER, recipients: 100, directTemplates: Number.MAX_SAFE_INTEGER };
export const localLimits = () => ({ quota: { ...PAID_PLAN_LIMITS }, remaining: { ...PAID_PLAN_LIMITS }, maximumEnvelopeItemCount: DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT });
export const getServerLimits = async (_context?: unknown) => localLimits();
export const limitsHandler = async (_request: Request) => Response.json(localLimits());

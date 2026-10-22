/** Former subscription endpoints are disabled; this template has no license gate. */
const removed = async (..._args: unknown[]): Promise<never> => {
  throw new Error('Subscription billing is not configured for this template.');
};
export const createCustomer = removed;
export const createCheckoutSession = removed;
export const getPortalSession = removed;
export const getSubscription = removed;
export const syncBillingCustomerSubscription = removed;
export const billingWebhookHandler = removed;
export const getInvoices = async (..._args: unknown[]) => [];
export const getInternalClaimPlans = async (): Promise<
  Record<string, { id: string; monthlyPrice: null; yearlyPrice: null }>
> => ({});
export type InternalClaimPlans = Awaited<ReturnType<typeof getInternalClaimPlans>>;
export const syncMemberCountWithBillingSeatPlan = async (..._args: unknown[]) => {
  if (process.env.NEXT_PUBLIC_FEATURE_BILLING_ENABLED === 'true') {
    throw new Error('Subscription billing is unavailable.');
  }
};
export const assertMemberCountWithinCap = async (..._args: unknown[]) => {};

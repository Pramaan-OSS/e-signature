/** Tracking is opt-in; old receipts and platform-sender receipts cannot be queried. */
export const emailDeliveryTrackable = (result: unknown): boolean =>
  Boolean(result && typeof result === 'object' && 'trackable' in result && result.trackable === true);

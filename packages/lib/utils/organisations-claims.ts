import {
  DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT,
  DEFAULT_RECIPIENT_COUNT,
} from '@e-sign/lib/template/limits';
import type { SubscriptionClaim } from '@prisma/client';

export const generateDefaultSubscriptionClaim = (): Omit<
  SubscriptionClaim,
  'id' | 'organisation' | 'createdAt' | 'updatedAt' | 'originalSubscriptionClaimId'
> => {
  return {
    name: '',
    teamCount: 100,
    memberCount: 100,
    envelopeItemCount: DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT,
    recipientCount: DEFAULT_RECIPIENT_COUNT,
    locked: false,
    flags: { unlimitedDocuments: true, allowCustomBranding: true, hidePoweredBy: true, emailDomains: true, embedAuthoring: true, embedSigning: true, signingReminders: true },

    documentRateLimits: [],
    documentQuota: null,
    emailRateLimits: [],
    emailQuota: null,
    apiRateLimits: [],
    apiQuota: null,
    emailTransportId: null,
  };
};

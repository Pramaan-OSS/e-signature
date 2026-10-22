import { generateDefaultSubscriptionClaim } from '../../utils/organisations-claims';
import { prisma } from '@e-sign/prisma';
import type { SubscriptionClaim } from '@prisma/client';
import { AppError, AppErrorCode } from '../../errors/app-error';

export const getSubscriptionClaim = async (
  claimId: string,
): Promise<Omit<SubscriptionClaim, 'createdAt' | 'updatedAt'>> => {
  const subscriptionClaim = await prisma.subscriptionClaim.findFirst({
    where: { id: claimId },
  });

  if (!subscriptionClaim) {
    return prisma.subscriptionClaim.upsert({ where: { id: claimId }, create: { id: claimId, ...generateDefaultSubscriptionClaim() }, update: {} });
  }

  return subscriptionClaim;
};

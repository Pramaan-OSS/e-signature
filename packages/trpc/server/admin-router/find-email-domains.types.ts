import { ZFindResultResponse, ZFindSearchParamsSchema } from '@e-sign/lib/types/search-params';
import EmailDomainStatusSchema from '@e-sign/prisma/generated/zod/inputTypeSchemas/EmailDomainStatusSchema';
import EmailDomainSchema from '@e-sign/prisma/generated/zod/modelSchema/EmailDomainSchema';
import OrganisationSchema from '@e-sign/prisma/generated/zod/modelSchema/OrganisationSchema';
import { z } from 'zod';

export const ZFindEmailDomainsRequestSchema = ZFindSearchParamsSchema.extend({
  status: EmailDomainStatusSchema.optional(),
});

export const ZFindEmailDomainsResponseSchema = ZFindResultResponse.extend({
  data: EmailDomainSchema.pick({
    id: true,
    domain: true,
    status: true,
    selector: true,
    createdAt: true,
    updatedAt: true,
    lastVerifiedAt: true,
  })
    .extend({
      organisation: OrganisationSchema.pick({
        id: true,
        name: true,
        url: true,
      }),
      _count: z.object({
        emails: z.number(),
      }),
    })
    .array(),
});

export type TFindEmailDomainsRequest = z.infer<typeof ZFindEmailDomainsRequestSchema>;
export type TFindEmailDomainsResponse = z.infer<typeof ZFindEmailDomainsResponseSchema>;

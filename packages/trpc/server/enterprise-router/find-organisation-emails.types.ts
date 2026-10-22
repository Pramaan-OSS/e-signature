import { ZOrganisationEmailManySchema } from '@e-sign/lib/types/organisation-email';
import { ZFindResultResponse, ZFindSearchParamsSchema } from '@e-sign/lib/types/search-params';
import { z } from 'zod';

export const ZFindOrganisationEmailsRequestSchema = ZFindSearchParamsSchema.extend({
  organisationId: z.string(),
  emailDomainId: z.string().optional(),
});

export const ZFindOrganisationEmailsResponseSchema = ZFindResultResponse.extend({
  data: ZOrganisationEmailManySchema.array(),
});

export type TFindOrganisationEmailsResponse = z.infer<typeof ZFindOrganisationEmailsResponseSchema>;

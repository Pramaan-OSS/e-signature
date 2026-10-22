import { OrganisationMemberRoleSchema } from '@e-sign/prisma/generated/zod/inputTypeSchemas/OrganisationMemberRoleSchema';
import { TeamMemberRoleSchema } from '@e-sign/prisma/generated/zod/inputTypeSchemas/TeamMemberRoleSchema';
import OrganisationGlobalSettingsSchema from '@e-sign/prisma/generated/zod/modelSchema/OrganisationGlobalSettingsSchema';
import OrganisationMemberInviteSchema from '@e-sign/prisma/generated/zod/modelSchema/OrganisationMemberInviteSchema';
import OrganisationMemberSchema from '@e-sign/prisma/generated/zod/modelSchema/OrganisationMemberSchema';
import OrganisationSchema from '@e-sign/prisma/generated/zod/modelSchema/OrganisationSchema';
import TeamEmailSchema from '@e-sign/prisma/generated/zod/modelSchema/TeamEmailSchema';
import TeamGlobalSettingsSchema from '@e-sign/prisma/generated/zod/modelSchema/TeamGlobalSettingsSchema';
import TeamSchema from '@e-sign/prisma/generated/zod/modelSchema/TeamSchema';
import UserSchema from '@e-sign/prisma/generated/zod/modelSchema/UserSchema';
import { z } from 'zod';

export const ZGetAdminTeamRequestSchema = z.object({
  teamId: z.number().min(1),
});

export const ZGetAdminTeamResponseSchema = TeamSchema.extend({
  organisation: OrganisationSchema.pick({
    id: true,
    name: true,
    url: true,
    ownerUserId: true,
  }).extend({
    organisationGlobalSettings: OrganisationGlobalSettingsSchema,
  }),
  teamEmail: TeamEmailSchema.nullable(),
  teamGlobalSettings: TeamGlobalSettingsSchema.nullable(),
  memberCount: z.number(),
  teamMembers: OrganisationMemberSchema.pick({
    id: true,
    userId: true,
    createdAt: true,
  })
    .extend({
      user: UserSchema.pick({
        id: true,
        email: true,
        name: true,
      }),
      teamRole: TeamMemberRoleSchema,
      organisationRole: OrganisationMemberRoleSchema,
    })
    .array(),
  pendingInvites: OrganisationMemberInviteSchema.pick({
    id: true,
    email: true,
    createdAt: true,
    organisationRole: true,
    status: true,
  }).array(),
});

export type TGetAdminTeamRequest = z.infer<typeof ZGetAdminTeamRequestSchema>;
export type TGetAdminTeamResponse = z.infer<typeof ZGetAdminTeamResponseSchema>;

import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@e-sign/lib/constants/organisations';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { getMemberOrganisationRole } from '@e-sign/lib/server-only/team/get-member-roles';
import { buildOrganisationWhereQuery, isOrganisationRoleWithinUserHierarchy } from '@e-sign/lib/utils/organisations';
import { prisma } from '@e-sign/prisma';

import { authenticatedProcedure } from '../trpc';
import {
  ZDeleteOrganisationMemberInvitesRequestSchema,
  ZDeleteOrganisationMemberInvitesResponseSchema,
} from './delete-organisation-member-invites.types';

export const deleteOrganisationMemberInvitesRoute = authenticatedProcedure
  //   .meta(deleteOrganisationMemberInvitesMeta)
  .input(ZDeleteOrganisationMemberInvitesRequestSchema)
  .output(ZDeleteOrganisationMemberInvitesResponseSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId, invitationIds } = input;
    const userId = ctx.user.id;

    ctx.logger.info({
      input: {
        organisationId,
        invitationIds,
      },
    });

    const organisation = await prisma.organisation.findFirst({
      where: buildOrganisationWhereQuery({
        organisationId,
        userId,
        roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_ORGANISATION'],
      }),
    });

    if (!organisation) {
      throw new AppError(AppErrorCode.NOT_FOUND);
    }

    const currentOrganisationMemberRole = await getMemberOrganisationRole({
      organisationId: organisation.id,
      reference: {
        type: 'User',
        id: userId,
      },
    });

    const invitesToDelete = await prisma.organisationMemberInvite.findMany({
      where: {
        id: {
          in: invitationIds,
        },
        organisationId: organisation.id,
      },
      select: {
        id: true,
        organisationRole: true,
      },
    });

    const hasUnauthorizedRoleAccess = invitesToDelete.some(
      (invite) => !isOrganisationRoleWithinUserHierarchy(currentOrganisationMemberRole, invite.organisationRole),
    );

    if (hasUnauthorizedRoleAccess) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'User does not have permission to delete invitations for higher roles',
      });
    }

    await prisma.organisationMemberInvite.deleteMany({
      where: {
        id: {
          in: invitationIds,
        },
        organisationId,
      },
    });
  });

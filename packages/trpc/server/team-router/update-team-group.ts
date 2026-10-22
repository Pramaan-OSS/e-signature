import { TEAM_MEMBER_ROLE_PERMISSIONS_MAP } from '@e-sign/lib/constants/teams';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { getMemberRoles } from '@e-sign/lib/server-only/team/get-member-roles';
import { buildTeamWhereQuery, isTeamRoleWithinUserHierarchy } from '@e-sign/lib/utils/teams';
import { prisma } from '@e-sign/prisma';
import { OrganisationGroupType } from '@e-sign/prisma/generated/types';

import { authenticatedProcedure } from '../trpc';
import { ZUpdateTeamGroupRequestSchema, ZUpdateTeamGroupResponseSchema } from './update-team-group.types';

export const updateTeamGroupRoute = authenticatedProcedure
  // .meta(updateTeamGroupMeta)
  .input(ZUpdateTeamGroupRequestSchema)
  .output(ZUpdateTeamGroupResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { id, data } = input;
    const { user } = ctx;

    ctx.logger.info({
      input: {
        id,
        data: {
          teamRole: data.teamRole,
        },
      },
    });

    const teamGroup = await prisma.teamGroup.findFirst({
      where: {
        id,
        team: buildTeamWhereQuery({
          teamId: undefined,
          userId: user.id,
          roles: TEAM_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_TEAM'],
        }),
      },
      include: {
        organisationGroup: true,
      },
    });

    if (!teamGroup) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Team group not found',
      });
    }

    if (
      teamGroup.organisationGroup.type === OrganisationGroupType.INTERNAL_ORGANISATION ||
      teamGroup.organisationGroup.type === OrganisationGroupType.INTERNAL_TEAM
    ) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'You are not allowed to update internal groups',
      });
    }

    const { teamRole: currentUserTeamRole } = await getMemberRoles({
      teamId: teamGroup.teamId,
      reference: {
        type: 'User',
        id: user.id,
      },
    });

    if (!isTeamRoleWithinUserHierarchy(currentUserTeamRole, teamGroup.teamRole)) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'You are not allowed to update this team group',
      });
    }

    if (!isTeamRoleWithinUserHierarchy(currentUserTeamRole, data.teamRole)) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'You are not allowed to set a team role higher than your own',
      });
    }

    await prisma.teamGroup.update({
      where: {
        id,
      },
      data: {
        teamRole: data.teamRole,
      },
    });
  });

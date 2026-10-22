import { useUpdateSearchParams } from '@e-sign/lib/client-only/hooks/use-update-search-params';
import { useCurrentOrganisation } from '@e-sign/lib/client-only/providers/organisation';
import { EXTENDED_TEAM_MEMBER_ROLE_MAP } from '@e-sign/lib/constants/teams-translations';
import { ZUrlSearchParamsSchema } from '@e-sign/lib/types/search-params';
import { extractInitials } from '@e-sign/lib/utils/recipient-formatter';
import { isTeamRoleWithinUserHierarchy } from '@e-sign/lib/utils/teams';
import { trpc } from '@e-sign/trpc/react';
import { AnimateGenericFadeInOut } from '@e-sign/ui/components/animate/animate-generic-fade-in-out';
import { AvatarWithText } from '@e-sign/ui/primitives/avatar';
import type { DataTableColumnDef } from '@e-sign/ui/primitives/data-table';
import { DataTable } from '@e-sign/ui/primitives/data-table';
import { DataTablePagination } from '@e-sign/ui/primitives/data-table-pagination';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@e-sign/ui/primitives/dropdown-menu';
import { Skeleton } from '@e-sign/ui/primitives/skeleton';
import { TableCell } from '@e-sign/ui/primitives/table';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { OrganisationGroupType, OrganisationMemberRole } from '@prisma/client';
import { EditIcon, MoreHorizontal, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useCurrentTeam } from '~/providers/team';

import { TeamMemberDeleteDialog, type TeamMemberDeleteDisableReason } from '../dialogs/team-member-delete-dialog';
import { TeamMemberUpdateDialog } from '../dialogs/team-member-update-dialog';
import { TeamInheritMemberAlert } from '../general/teams/team-inherit-member-alert';

export const TeamMembersTable = () => {
  const { _ } = useLingui();

  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const organisation = useCurrentOrganisation();
  const team = useCurrentTeam();

  const parsedSearchParams = ZUrlSearchParamsSchema.parse(Object.fromEntries(searchParams ?? []));

  const groupQuery = trpc.team.group.find.useQuery({
    teamId: team.id,
    types: [OrganisationGroupType.INTERNAL_ORGANISATION, OrganisationGroupType.INTERNAL_TEAM],
    organisationRoles: [OrganisationMemberRole.MEMBER],
    perPage: 100, // Lets hope this is enough.
  });

  const { data, isLoading, isLoadingError } = trpc.team.member.find.useQuery(
    {
      teamId: team.id,
      query: parsedSearchParams.query,
      page: parsedSearchParams.page,
      perPage: parsedSearchParams.perPage,
    },
    {
      placeholderData: (previousData) => previousData,
    },
  );

  const onPaginationChange = (page: number, perPage: number) => {
    updateSearchParams({
      page,
      perPage,
    });
  };

  const results = data ?? {
    data: [],
    perPage: 10,
    currentPage: 1,
    totalPages: 1,
  };

  const groups = groupQuery.data?.data ?? [];

  const memberAccessTeamGroup = groups.find(
    (group) =>
      group.organisationGroupType === OrganisationGroupType.INTERNAL_ORGANISATION &&
      group.teamRole === OrganisationMemberRole.MEMBER,
  );

  const columns = useMemo(() => {
    // A member is a direct team member when they belong to one of the team's
    // INTERNAL_TEAM groups. Otherwise they are inherited from an organisation or
    // custom group and cannot be managed directly from this team.
    const isMemberPartOfInternalTeamGroup = (memberId: string) =>
      groups.some(
        (group) =>
          group.organisationGroupType === OrganisationGroupType.INTERNAL_TEAM &&
          group.members.some((member) => member.id === memberId),
      );

    // Determine why a member can't be removed from the team (if at all). The delete
    // dialog uses this to explain the reason instead of attempting a removal that
    // would fail.
    const getDeleteDisableReason = (member: (typeof results)['data'][number]): TeamMemberDeleteDisableReason | null => {
      if (organisation.ownerUserId === member.userId) {
        return 'TEAM_OWNER';
      }

      if (!isTeamRoleWithinUserHierarchy(team.currentTeamRole, member.teamRole)) {
        return 'HIGHER_ROLE';
      }

      if (memberAccessTeamGroup !== undefined) {
        return 'INHERIT_MEMBER_ENABLED';
      }

      if (!isMemberPartOfInternalTeamGroup(member.id)) {
        return 'INHERITED_MEMBER';
      }

      return null;
    };

    return [
      {
        header: _(msg`Team Member`),
        cell: ({ row }) => {
          const avatarFallbackText = row.original.name
            ? extractInitials(row.original.name)
            : row.original.email.slice(0, 1).toUpperCase();

          return (
            <AvatarWithText
              avatarClass="h-12 w-12"
              avatarFallback={avatarFallbackText}
              primaryText={<span className="font-semibold text-foreground/80">{row.original.name}</span>}
              secondaryText={row.original.email}
            />
          );
        },
      },
      {
        header: _(msg`Role`),
        accessorKey: 'role',
        cell: ({ row }) => _(EXTENDED_TEAM_MEMBER_ROLE_MAP[row.original.teamRole]),
      },
      {
        header: _(msg`Source`),
        cell: ({ row }) => (isMemberPartOfInternalTeamGroup(row.original.id) ? _(msg`Member`) : _(msg`Group`)),
      },
      {
        header: _(msg`Actions`),
        cell: ({ row }) => (
          <TeamMemberActions member={row.original} disableReason={getDeleteDisableReason(row.original)} />
        ),
      },
    ] satisfies DataTableColumnDef<(typeof results)['data'][number]>[];
  }, [groups]);

  return (
    <div className="space-y-8">
      <DataTable
        columns={columns}
        data={results.data}
        perPage={results.perPage}
        currentPage={results.currentPage}
        totalPages={results.totalPages}
        onPaginationChange={onPaginationChange}
        error={{
          enable: isLoadingError,
        }}
        skeleton={{
          enable: isLoading || groupQuery.isPending,
          rows: 3,
          component: (
            <>
              <TableCell className="w-1/2 py-4 pr-4">
                <div className="flex w-full flex-row items-center">
                  <Skeleton className="h-12 w-12 flex-shrink-0 rounded-full" />

                  <div className="ml-2 flex flex-grow flex-col">
                    <Skeleton className="h-4 w-1/3 max-w-[8rem]" />
                    <Skeleton className="mt-1 h-4 w-1/2 max-w-[12rem]" />
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-6 rounded-full" />
              </TableCell>
            </>
          ),
        }}
      >
        {(table) => <DataTablePagination additionalInformation="VisibleCount" table={table} />}
      </DataTable>

      <AnimateGenericFadeInOut key={groupQuery.isPending ? 'pending' : 'fetched'}>
        {!groupQuery.isPending && <TeamInheritMemberAlert memberAccessTeamGroup={memberAccessTeamGroup || null} />}
      </AnimateGenericFadeInOut>
    </div>
  );
};

const TeamMemberActions = ({
  member,
  disableReason,
}: {
  member: {
    id: string;
    userId: number;
    name?: string | null;
    email: string;
    teamRole: import('@prisma/client').TeamMemberRole;
  };
  disableReason?: TeamMemberDeleteDisableReason | null;
}) => {
  const team = useCurrentTeam();
  const organisation = useCurrentOrganisation();
  const [action, setAction] = useState<'edit' | 'remove' | null>(null);
  const canUpdate =
    organisation.ownerUserId !== member.userId && isTeamRoleWithinUserHierarchy(team.currentTeamRole, member.teamRole);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52" align="start">
          <DropdownMenuLabel>
            <Trans>Actions</Trans>
          </DropdownMenuLabel>
          <DropdownMenuItem disabled={!canUpdate} onSelect={() => setTimeout(() => setAction('edit'), 0)}>
            <EditIcon className="mr-2 h-4 w-4" />
            <Trans>Update role</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTimeout(() => setAction('remove'), 0)}>
            <Trash2Icon className="mr-2 h-4 w-4" />
            <Trans>Remove</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TeamMemberUpdateDialog
        currentUserTeamRole={team.currentTeamRole}
        teamId={team.id}
        memberId={member.id}
        memberName={member.name ?? ''}
        memberTeamRole={member.teamRole}
        open={action === 'edit'}
        onOpenChange={(open) => setAction(open ? 'edit' : null)}
      />
      <TeamMemberDeleteDialog
        teamId={team.id}
        teamName={team.name}
        memberId={member.id}
        memberName={member.name ?? ''}
        memberEmail={member.email}
        disableReason={disableReason}
        open={action === 'remove'}
        onOpenChange={(open) => setAction(open ? 'remove' : null)}
      />
    </>
  );
};

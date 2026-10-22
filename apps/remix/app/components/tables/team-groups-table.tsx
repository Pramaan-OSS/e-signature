import { useUpdateSearchParams } from '@e-sign/lib/client-only/hooks/use-update-search-params';
import { EXTENDED_TEAM_MEMBER_ROLE_MAP } from '@e-sign/lib/constants/teams-translations';
import { ZUrlSearchParamsSchema } from '@e-sign/lib/types/search-params';
import { trpc } from '@e-sign/trpc/react';
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
import { OrganisationGroupType } from '@prisma/client';
import { EditIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useCurrentTeam } from '~/providers/team';

import { TeamGroupDeleteDialog } from '../dialogs/team-group-delete-dialog';
import { TeamGroupUpdateDialog } from '../dialogs/team-group-update-dialog';

export const TeamGroupsTable = () => {
  const { _ } = useLingui();

  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const team = useCurrentTeam();

  const parsedSearchParams = ZUrlSearchParamsSchema.parse(Object.fromEntries(searchParams ?? []));

  const { data, isLoading, isLoadingError } = trpc.team.group.find.useQuery(
    {
      teamId: team.id,
      query: parsedSearchParams.query,
      page: parsedSearchParams.page,
      perPage: parsedSearchParams.perPage,
      types: [OrganisationGroupType.CUSTOM],
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

  const columns = useMemo(() => {
    return [
      {
        header: _(msg`Group`),
        accessorKey: 'name',
      },
      {
        header: _(msg`Role`),
        accessorKey: 'teamRole',
        cell: ({ row }) => _(EXTENDED_TEAM_MEMBER_ROLE_MAP[row.original.teamRole]),
      },
      {
        header: _(msg`Members`),
        accessorKey: 'members',
        cell: ({ row }) => row.original.members.length,
      },
      {
        header: _(msg`Actions`),
        cell: ({ row }) => <TeamGroupActions group={row.original} />,
      },
    ] satisfies DataTableColumnDef<(typeof results)['data'][number]>[];
  }, []);

  return (
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
      emptyState={
        <div className="flex h-60 flex-col items-center justify-center gap-y-4 text-muted-foreground/60">
          <p>
            <Trans>No team groups found</Trans>
          </p>
        </div>
      }
      skeleton={{
        enable: isLoading,
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
      {(table) => results.totalPages > 1 && <DataTablePagination additionalInformation="VisibleCount" table={table} />}
    </DataTable>
  );
};

const TeamGroupActions = ({
  group,
}: {
  group: { id: string; name?: string | null; teamRole: import('@prisma/client').TeamMemberRole };
}) => {
  const [action, setAction] = useState<'edit' | 'remove' | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <MoreHorizontalIcon className="h-5 w-5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52" align="start">
          <DropdownMenuLabel>
            <Trans>Actions</Trans>
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setTimeout(() => setAction('edit'), 0)}>
            <EditIcon className="mr-2 h-4 w-4" />
            <Trans>Update role</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTimeout(() => setAction('remove'), 0)}>
            <Trash2Icon className="mr-2 h-4 w-4" />
            <Trans>Remove</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TeamGroupUpdateDialog
        teamGroupId={group.id}
        teamGroupName={group.name ?? ''}
        teamGroupRole={group.teamRole}
        open={action === 'edit'}
        onOpenChange={(open) => setAction(open ? 'edit' : null)}
      />
      <TeamGroupDeleteDialog
        teamGroupId={group.id}
        teamGroupName={group.name ?? ''}
        teamGroupRole={group.teamRole}
        open={action === 'remove'}
        onOpenChange={(open) => setAction(open ? 'remove' : null)}
      />
    </>
  );
};

import { useUpdateSearchParams } from '@e-sign/lib/client-only/hooks/use-update-search-params';
import { useCurrentOrganisation } from '@e-sign/lib/client-only/providers/organisation';
import { EXTENDED_ORGANISATION_MEMBER_ROLE_MAP } from '@e-sign/lib/constants/organisations-translations';
import { ZUrlSearchParamsSchema } from '@e-sign/lib/types/search-params';
import { isOrganisationRoleWithinUserHierarchy } from '@e-sign/lib/utils/organisations';
import { extractInitials } from '@e-sign/lib/utils/recipient-formatter';
import { trpc } from '@e-sign/trpc/react';
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
import { OrganisationGroupType, type OrganisationMemberRole } from '@prisma/client';
import { Edit, MoreHorizontal, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { OrganisationMemberDeleteDialog } from '~/components/dialogs/organisation-member-delete-dialog';
import { OrganisationMemberUpdateDialog } from '~/components/dialogs/organisation-member-update-dialog';

export const OrganisationMembersDataTable = () => {
  const { _, i18n } = useLingui();

  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const organisation = useCurrentOrganisation();

  const parsedSearchParams = ZUrlSearchParamsSchema.parse(Object.fromEntries(searchParams ?? []));

  const { data, isLoading, isLoadingError } = trpc.organisation.member.find.useQuery(
    {
      organisationId: organisation.id,
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

  const columns = useMemo(() => {
    return [
      {
        header: _(msg`Organisation Member`),
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
        cell: ({ row }) =>
          organisation.ownerUserId === row.original.userId
            ? _(msg`Owner`)
            : _(EXTENDED_ORGANISATION_MEMBER_ROLE_MAP[row.original.currentOrganisationRole]),
      },
      {
        header: _(msg`Member Since`),
        accessorKey: 'createdAt',
        cell: ({ row }) => i18n.date(row.original.createdAt),
      },
      {
        header: _(msg`Groups`),
        cell: ({ row }) => row.original.groups.filter((group) => group.type === OrganisationGroupType.CUSTOM).length,
      },
      {
        header: _(msg`Actions`),
        cell: ({ row }) => <OrganisationMemberActions member={row.original} />,
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

const OrganisationMemberActions = ({
  member,
}: {
  member: {
    id: string;
    userId: number;
    name?: string | null;
    email: string;
    currentOrganisationRole: OrganisationMemberRole;
  };
}) => {
  const organisation = useCurrentOrganisation();
  const [action, setAction] = useState<'edit' | 'remove' | null>(null);
  const canManage =
    organisation.ownerUserId !== member.userId &&
    isOrganisationRoleWithinUserHierarchy(organisation.currentOrganisationRole, member.currentOrganisationRole);
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
          <DropdownMenuItem disabled={!canManage} onSelect={() => setTimeout(() => setAction('edit'), 0)}>
            <Edit className="mr-2 h-4 w-4" />
            <Trans>Update role</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canManage} onSelect={() => setTimeout(() => setAction('remove'), 0)}>
            <Trash2 className="mr-2 h-4 w-4" />
            <Trans>Remove</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <OrganisationMemberUpdateDialog
        currentUserOrganisationRole={organisation.currentOrganisationRole}
        organisationId={organisation.id}
        organisationMemberId={member.id}
        organisationMemberName={member.name ?? ''}
        organisationMemberRole={member.currentOrganisationRole}
        open={action === 'edit'}
        onOpenChange={(open) => setAction(open ? 'edit' : null)}
      />
      <OrganisationMemberDeleteDialog
        organisationMemberId={member.id}
        organisationMemberName={member.name ?? ''}
        organisationMemberEmail={member.email}
        open={action === 'remove'}
        onOpenChange={(open) => setAction(open ? 'remove' : null)}
      />
    </>
  );
};

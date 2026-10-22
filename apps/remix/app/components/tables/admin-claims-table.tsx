import { useUpdateSearchParams } from '@e-sign/lib/client-only/hooks/use-update-search-params';
import type { TLicenseClaim } from '@e-sign/lib/types/license';
import { ZUrlSearchParamsSchema } from '@e-sign/lib/types/search-params';
import { SUBSCRIPTION_CLAIM_FEATURE_FLAGS } from '@e-sign/lib/types/subscription';
import { trpc } from '@e-sign/trpc/react';
import { CopyTextButton } from '@e-sign/ui/components/common/copy-text-button';
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
import { useToast } from '@e-sign/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { EditIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { type ComponentProps, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { ClaimDeleteDialog } from '../dialogs/claim-delete-dialog';
import { ClaimUpdateDialog } from '../dialogs/claim-update-dialog';

type AdminClaimsTableProps = {
  licenseFlags?: TLicenseClaim;
};

export const AdminClaimsTable = ({ licenseFlags }: AdminClaimsTableProps) => {
  const { t } = useLingui();
  const { toast } = useToast();

  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const parsedSearchParams = ZUrlSearchParamsSchema.parse(Object.fromEntries(searchParams ?? []));

  const { data, isLoading, isLoadingError } = trpc.admin.claims.find.useQuery({
    query: parsedSearchParams.query,
    page: parsedSearchParams.page,
    perPage: parsedSearchParams.perPage,
  });

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
        header: t`ID`,
        accessorKey: 'id',
        maxSize: 50,
        cell: ({ row }) => (
          <CopyTextButton value={row.original.id} onCopySuccess={() => toast({ title: t`ID copied to clipboard` })} />
        ),
      },
      {
        header: t`Name`,
        accessorKey: 'name',
        cell: ({ row }) => <Link to={`/admin/organisations?query=claim:${row.original.id}`}>{row.original.name}</Link>,
      },
      {
        header: t`Allowed teams`,
        accessorKey: 'teamCount',
        cell: ({ row }) => {
          if (row.original.teamCount === 0) {
            return <p className="text-muted-foreground">{t`Unlimited`}</p>;
          }

          return <p className="text-muted-foreground">{row.original.teamCount}</p>;
        },
      },
      {
        header: t`Feature Flags`,
        cell: ({ row }) => {
          const flags = Object.values(SUBSCRIPTION_CLAIM_FEATURE_FLAGS).filter(({ key }) => row.original.flags[key]);

          if (flags.length === 0) {
            return <p className="text-muted-foreground text-xs">{t`None`}</p>;
          }

          return (
            <ul className="list-disc space-y-1 text-muted-foreground text-xs">
              {flags.map(({ key, label }) => (
                <li key={key}>{label}</li>
              ))}
            </ul>
          );
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => <ClaimActions row={row} licenseFlags={licenseFlags} />,
      },
    ] satisfies DataTableColumnDef<(typeof results)['data'][number]>[];
  }, []);

  return (
    <div>
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
              <TableCell className="py-4 pr-4">
                <Skeleton className="h-4 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12 rounded-full" />
              </TableCell>
              <TableCell>
                <div className="flex flex-row justify-end space-x-2">
                  <Skeleton className="h-2 w-6 rounded" />
                </div>
              </TableCell>
            </>
          ),
        }}
      >
        {(table) => <DataTablePagination additionalInformation="VisibleCount" table={table} />}
      </DataTable>
    </div>
  );
};

const ClaimActions = ({
  row,
  licenseFlags,
}: {
  row: { original: ComponentProps<typeof ClaimUpdateDialog>['claim'] };
  licenseFlags?: ComponentProps<typeof ClaimUpdateDialog>['licenseFlags'];
}) => {
  const [activeDialog, setActiveDialog] = useState<'edit' | 'delete' | null>(null);
  return (
    <>
      {' '}
      <DropdownMenu>
        <DropdownMenuTrigger>
          <MoreHorizontalIcon className="h-5 w-5 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-52" align="start" forceMount>
          <DropdownMenuLabel>
            <Trans>Actions</Trans>
          </DropdownMenuLabel>

          <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('edit'), 0)}>
            <EditIcon className="mr-2 h-4 w-4" />
            <Trans>Update</Trans>
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('delete'), 0)}>
            <Trash2Icon className="mr-2 h-4 w-4" />
            <Trans>Delete</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ClaimUpdateDialog
        claim={row.original}
        licenseFlags={licenseFlags}
        open={activeDialog === 'edit'}
        onOpenChange={(open) => setActiveDialog(open ? 'edit' : null)}
      />
      <ClaimDeleteDialog
        claimId={row.original.id}
        claimName={row.original.name}
        claimLocked={row.original.locked}
        open={activeDialog === 'delete'}
        onOpenChange={(open) => setActiveDialog(open ? 'delete' : null)}
      />
    </>
  );
};

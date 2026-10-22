import { useCurrentOrganisation } from '@e-sign/lib/client-only/providers/organisation';
import { trpc } from '@e-sign/trpc/react';
import type { TGetOrganisationEmailDomainResponse } from '@e-sign/trpc/server/enterprise-router/get-organisation-email-domain.types';
import { Alert, AlertDescription, AlertTitle } from '@e-sign/ui/primitives/alert';
import { Button } from '@e-sign/ui/primitives/button';
import { DataTable, type DataTableColumnDef } from '@e-sign/ui/primitives/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@e-sign/ui/primitives/dropdown-menu';
import { SpinnerBox } from '@e-sign/ui/primitives/spinner';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { EditIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { OrganisationEmailCreateDialog } from '~/components/dialogs/organisation-email-create-dialog';
import { OrganisationEmailDeleteDialog } from '~/components/dialogs/organisation-email-delete-dialog';
import { OrganisationEmailDomainDeleteDialog } from '~/components/dialogs/organisation-email-domain-delete-dialog';
import { OrganisationEmailDomainRecordsDialog } from '~/components/dialogs/organisation-email-domain-records-dialog';
import { OrganisationEmailUpdateDialog } from '~/components/dialogs/organisation-email-update-dialog';
import { GenericErrorLayout } from '~/components/general/generic-error-layout';
import { SettingsHeader } from '~/components/general/settings-header';

import type { Route } from './+types/o.$orgUrl.settings.email-domains.$id';

export default function OrganisationEmailDomainSettingsPage({ params }: Route.ComponentProps) {
  const { t } = useLingui();

  const organisation = useCurrentOrganisation();

  const emailDomainId = params.id;

  const { data: emailDomain, isLoading: isLoadingEmailDomain } = trpc.enterprise.organisation.emailDomain.get.useQuery(
    {
      emailDomainId,
    },
    {
      enabled: !!emailDomainId,
    },
  );

  const emailColumns = useMemo(() => {
    return [
      {
        header: t`Name`,
        accessorKey: 'emailName',
      },
      {
        header: t`Email`,
        accessorKey: 'email',
      },
      {
        header: t`Actions`,
        cell: ({ row }) => <EmailActions email={row.original} />,
      },
    ] satisfies DataTableColumnDef<TGetOrganisationEmailDomainResponse['emails'][number]>[];
  }, [organisation]);

  const pageHeader = t`Email Domain Settings`;
  const pageSubtitle = t`Manage your email domain settings.`;

  if (isLoadingEmailDomain) {
    return <SpinnerBox className="py-32" />;
  }

  // Todo: Update UI, currently out of place.
  if (!emailDomain) {
    return (
      <GenericErrorLayout
        errorCode={404}
        errorCodeMap={{
          404: {
            heading: msg`Email domain not found`,
            subHeading: msg`404 Email domain not found`,
            message: msg`The email domain you are looking for may have been removed, renamed or may have never existed.`,
          },
        }}
        primaryButton={
          <Button asChild>
            <Link to={`/o/${organisation.url}/settings/email-domains`}>
              <Trans>Go back</Trans>
            </Link>
          </Button>
        }
        secondaryButton={null}
      />
    );
  }

  const records = emailDomain.records;

  return (
    <div>
      <SettingsHeader hideDivider title={pageHeader} subtitle={pageSubtitle}>
        <OrganisationEmailCreateDialog emailDomain={emailDomain} />
      </SettingsHeader>

      <div className="mt-4">
        <label className="font-medium text-sm leading-none">
          <Trans>Emails</Trans>
        </label>

        <div className="my-2">
          <DataTable columns={emailColumns} data={emailDomain.emails} />
        </div>
      </div>

      <Alert className="mt-6 flex flex-col justify-between p-6 sm:flex-row sm:items-center" variant="neutral">
        <div className="mb-4 sm:mb-0">
          <AlertTitle>
            <Trans>DNS Records</Trans>
          </AlertTitle>

          <AlertDescription className="mr-2">
            <Trans>View the DNS records for this email domain</Trans>
          </AlertDescription>
        </div>

        <OrganisationEmailDomainRecordsDialog
          records={records}
          trigger={
            <Button variant="outline">
              <Trans>View DNS Records</Trans>
            </Button>
          }
        />
      </Alert>

      <Alert className="mt-6 flex flex-col justify-between p-6 sm:flex-row sm:items-center" variant="neutral">
        <div className="mb-4 sm:mb-0">
          <AlertTitle>
            <Trans>Delete email domain</Trans>
          </AlertTitle>

          <AlertDescription className="mr-2">
            <Trans>This will remove all emails associated with this email domain</Trans>
          </AlertDescription>
        </div>

        <OrganisationEmailDomainDeleteDialog
          emailDomainId={emailDomainId}
          emailDomain={emailDomain.domain}
          trigger={
            <Button variant="destructive" title={t`Remove email domain`}>
              <Trans>Delete Email Domain</Trans>
            </Button>
          }
        />
      </Alert>
    </div>
  );
}

const EmailActions = ({ email }: { email: TGetOrganisationEmailDomainResponse['emails'][number] }) => {
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
            <Trans>Update</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTimeout(() => setAction('remove'), 0)}>
            <Trash2Icon className="mr-2 h-4 w-4" />
            <Trans>Remove</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <OrganisationEmailUpdateDialog
        organisationEmail={email}
        open={action === 'edit'}
        onOpenChange={(open) => setAction(open ? 'edit' : null)}
      />
      <OrganisationEmailDeleteDialog
        emailId={email.id}
        email={email.email}
        open={action === 'remove'}
        onOpenChange={(open) => setAction(open ? 'remove' : null)}
      />
    </>
  );
};

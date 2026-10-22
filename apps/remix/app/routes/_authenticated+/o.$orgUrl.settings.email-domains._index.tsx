import { useCurrentOrganisation } from '@e-sign/lib/client-only/providers/organisation';
import { pramaanConfigured } from '@e-sign/lib/server-only/pramaan';
import { canExecuteOrganisationAction } from '@e-sign/lib/utils/organisations';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useLoaderData } from 'react-router';
import { OrganisationEmailDomainCreateDialog } from '~/components/dialogs/organisation-email-domain-create-dialog';
import { SettingsHeader } from '~/components/general/settings-header';
import { OrganisationEmailDomainsDataTable } from '~/components/tables/organisation-email-domains-table';
import { appMetaTags } from '~/utils/meta';
export function meta() {
  return appMetaTags(msg`Email Domains`);
}
export function loader() {
  return { enabled: pramaanConfigured() };
}
export default function OrganisationSettingsEmailDomains() {
  const { t } = useLingui();
  const organisation = useCurrentOrganisation();
  const { enabled } = useLoaderData<typeof loader>();
  return (
    <div>
      <SettingsHeader
        hideDivider
        title={t`Email Domains`}
        subtitle={t`Here you can add email domains to your organisation.`}
      >
        {enabled && canExecuteOrganisationAction('MANAGE_ORGANISATION', organisation.currentOrganisationRole) && (
          <OrganisationEmailDomainCreateDialog />
        )}
      </SettingsHeader>
      {!enabled && <p>Add your workspace connection key to manage email domains.</p>}
      <OrganisationEmailDomainsDataTable />
    </div>
  );
}

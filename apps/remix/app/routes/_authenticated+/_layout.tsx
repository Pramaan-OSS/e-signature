import { useChildRouteFlags } from '@e-sign/lib/client-only/hooks/use-child-route-flags';
import { OrganisationProvider } from '@e-sign/lib/client-only/providers/organisation';
import { useSession } from '@e-sign/lib/client-only/providers/session';
import { getSiteSettings } from '@e-sign/lib/server-only/site-settings/get-site-settings';
import { SITE_SETTINGS_BANNER_ID } from '@e-sign/lib/server-only/site-settings/schemas/banner';
import { cn } from '@e-sign/ui/lib/utils';
import { Button } from '@e-sign/ui/primitives/button';
import { InlineDialogHost } from '@e-sign/ui/primitives/dialog';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Link, Outlet } from 'react-router';

import { AppBanner } from '~/components/general/app-banner';
import { Header } from '~/components/general/app-header';
import { GenericErrorLayout } from '~/components/general/generic-error-layout';
import { OrganisationBillingBanner } from '~/components/general/organisations/organisation-billing-banner';
import { OrganisationQuotaBanner } from '~/components/general/organisations/organisation-quota-banner';
import { VerifyEmailBanner } from '~/components/general/verify-email-banner';
import { authenticatedMiddleware } from '~/middleware/authenticated';
import { TeamProvider } from '~/providers/team';

import type { Route } from './+types/_layout';

/**
 * Don't revalidate (run the loader on sequential navigations)
 *
 * Update values via providers.
 */
export const shouldRevalidate = () => false;

export const middleware = [authenticatedMiddleware];

export async function loader() {
  const banner = await getSiteSettings().then((settings) =>
    settings.find((setting) => setting.id === SITE_SETTINGS_BANNER_ID),
  );

  return {
    banner,
  };
}

export default function Layout({ loaderData, params, matches }: Route.ComponentProps) {
  const { banner } = loaderData;

  const { user, organisations, refreshError } = useSession();

  const { layoutMode } = useChildRouteFlags();

  const teamUrl = params.teamUrl;
  const orgUrl = params.orgUrl;

  const teams = organisations.flatMap((org) => org.teams);

  const extractCurrentOrganisation = () => {
    if (orgUrl) {
      return organisations.find((org) => org.url === orgUrl);
    }

    // Search organisations to find the team since we don't have access to the orgUrl in the URL.
    if (teamUrl) {
      return organisations.find((org) => org.teams.some((team) => team.url === teamUrl));
    }

    return null;
  };

  const currentTeam = teams.find((team) => team.url === teamUrl);
  const currentOrganisation = extractCurrentOrganisation() || null;

  const orgNotFound = params.orgUrl && !currentOrganisation;
  const teamNotFound = params.teamUrl && !currentTeam;

  // Hide the header for editor routes.
  const hideHeader = matches.some(
    (match) =>
      match?.id === 'routes/_authenticated+/t.$teamUrl+/documents.$id.edit' ||
      match?.id === 'routes/_authenticated+/t.$teamUrl+/templates.$id.edit',
  );

  if (orgNotFound || teamNotFound) {
    return (
      <GenericErrorLayout
        errorCode={404}
        errorCodeMap={{
          404: orgNotFound
            ? {
                heading: msg`Organisation not found`,
                subHeading: msg`404 Organisation not found`,
                message: msg`The organisation you are looking for may have been removed, renamed or may have never existed.`,
              }
            : {
                heading: msg`Team not found`,
                subHeading: msg`404 Team not found`,
                message: msg`The team you are looking for may have been removed, renamed or may have never existed.`,
              },
        }}
        primaryButton={
          <Button asChild>
            <Link to="/">
              <Trans>Go home</Trans>
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <OrganisationProvider organisation={currentOrganisation}>
      <TeamProvider team={currentTeam || null}>
        <div className="app-shell">
          <OrganisationBillingBanner />

          <OrganisationQuotaBanner />

          {!user.emailVerified && <VerifyEmailBanner email={user.email} />}

          {banner && !hideHeader && <AppBanner banner={banner} />}

          {!hideHeader && <Header fullWidth={layoutMode === 'settings'} />}

          <main
            data-thread-none="waiting"
            className={cn('view', {
              'mt-8 pb-8 md:mt-12 md:pb-12': !hideHeader && layoutMode !== 'settings',
              'md:flex md:min-h-0 md:flex-1 md:flex-col': layoutMode === 'settings',
            })}
          >
            {refreshError && (
              <p role="status" className="mb-4 text-muted-foreground text-sm">
                {refreshError}
              </p>
            )}
            <InlineDialogHost />
            <Outlet />
          </main>
        </div>
      </TeamProvider>
    </OrganisationProvider>
  );
}

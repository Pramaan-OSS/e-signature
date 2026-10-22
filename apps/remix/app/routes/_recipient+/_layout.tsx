import { useAnalytics } from '@e-sign/lib/client-only/hooks/use-analytics';
import { useOptionalSession } from '@e-sign/lib/client-only/providers/session';
import { cn } from '@e-sign/ui/lib/utils';
import { Button } from '@e-sign/ui/primitives/button';
import { InlineDialogHost } from '@e-sign/ui/primitives/dialog';
import { i18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { ChevronLeft } from 'lucide-react';
import { useEffect } from 'react';
import { isRouteErrorResponse, Link, Outlet } from 'react-router';
import { Header as AuthenticatedHeader } from '~/components/general/app-header';
import { GenericErrorLayout } from '~/components/general/generic-error-layout';
import type { Route } from './+types/_layout';

export function meta() {
  return [
    { title: i18n._(msg`Sign Document · e-sign`) },
    { name: 'robots', content: 'noindex, nofollow, noarchive, nosnippet, noimageindex' },
  ];
}

/**
 * A layout to handle scenarios where the user is a recipient of a given resource
 * where we do not care whether they are authenticated or not.
 *
 * Such as direct template access, or signing.
 */
export default function RecipientLayout({ matches }: Route.ComponentProps) {
  const { sessionData } = useOptionalSession();

  // Hide the header for signing routes.
  const hideHeader = matches.some(
    (match) =>
      match?.id === 'routes/_recipient+/sign.$token+/_index' || match?.id === 'routes/_recipient+/d.$token+/_index',
  );

  return (
    <div className="min-h-screen">
      {!hideHeader && sessionData?.user && <AuthenticatedHeader />}

      <main
        className={cn({
          'px-4 pt-24 pb-8 md:px-8 md:pb-12': !hideHeader,
        })}
      >
        <InlineDialogHost />
        <Outlet />
      </main>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const analytics = useAnalytics();

  const errorCode = isRouteErrorResponse(error) ? error.status : 500;

  useEffect(() => {
    analytics.captureException(error, { source: 'signing', location: 'recipient_layout_boundary' });
  }, [error]);

  return (
    <GenericErrorLayout
      errorCode={errorCode}
      secondaryButton={null}
      primaryButton={
        <Button asChild className="w-32">
          <Link to="/">
            <ChevronLeft className="mr-2 h-4 w-4" />
            <Trans>Go Back</Trans>
          </Link>
        </Button>
      }
    />
  );
}

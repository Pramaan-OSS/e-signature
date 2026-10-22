import { authClient } from '@e-sign/auth/client';
import { getOptionalSession } from '@e-sign/auth/server/lib/utils/get-session';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { enterpriseSignInConfigured } from '@e-sign/lib/server-only/pramaan/enterprise-auth';
import { prisma } from '@e-sign/prisma';
import { Button } from '@e-sign/ui/primitives/button';
import { Checkbox } from '@e-sign/ui/primitives/checkbox';
import { useToast } from '@e-sign/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { MailsIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { GenericErrorLayout } from '~/components/general/generic-error-layout';
import { appMetaTags } from '~/utils/meta';

import type { Route } from './+types/o.$orgUrl.signin';

export function meta() {
  return appMetaTags(msg`Sign In`);
}

export function ErrorBoundary() {
  return (
    <GenericErrorLayout
      errorCode={404}
      errorCodeMap={{
        404: {
          heading: msg`Authentication Portal Not Found`,
          subHeading: msg`404 Not Found`,
          message: msg`The organisation authentication portal does not exist, or is not configured`,
        },
      }}
      primaryButton={
        <Button asChild>
          <Link to={`/`}>
            <Trans>Go back</Trans>
          </Link>
        </Button>
      }
      secondaryButton={null}
    />
  );
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { session, user } = await getOptionalSession(request);

  // Embed sessions are rejected by the authenticated tree, so treat them as signed out here.
  const isAuthenticated = session !== null && !session.isEmbed;

  const orgUrl = params.orgUrl;

  const organisation = await prisma.organisation.findFirst({
    where: {
      url: orgUrl,
    },
    select: {
      name: true,
      enterpriseSignInConnection: { select: { status: true } },
      organisationAuthenticationPortal: {
        select: {
          enabled: true,
        },
      },
      members: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!organisation) {
    throw new AppError(AppErrorCode.NOT_FOUND);
  }
  const member = Boolean(isAuthenticated && user && organisation.members.some((m) => m.userId === user.id));
  return {
    organisationName: organisation.name,
    orgUrl,
    canStart: enterpriseSignInConfigured() && organisation.enterpriseSignInConnection?.status === 'ready',
    linking: member,
  };
}

export default function OrganisationSignIn({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();

  const { organisationName, orgUrl, canStart, linking } = loaderData;

  const { t } = useLingui();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmationChecked, setIsConfirmationChecked] = useState(false);

  const action = searchParams.get('action');

  const onSignInWithOIDCClick = async () => {
    setIsSubmitting(true);

    try {
      await authClient.oidc.org.signIn({
        orgUrl,
      });
    } catch (err) {
      toast({
        title: t`An unknown error occurred`,
        description: t`We encountered an unknown error while attempting to sign you In. Please try again later.`,
        variant: 'destructive',
      });
    }

    setIsSubmitting(false);
  };

  if (action === 'verification-required') {
    return (
      <div className="w-screen max-w-lg px-4">
        <div className="flex items-start">
          <div className="mt-1 mr-4 hidden md:block">
            <MailsIcon className="h-10 w-10 text-primary" strokeWidth={2} />
          </div>
          <div className="">
            <h2 className="font-bold text-2xl md:text-4xl">
              <Trans>Confirmation email sent</Trans>
            </h2>

            <p className="mt-4 text-muted-foreground">
              <Trans>
                To gain access to your account, please confirm your email address by clicking on the confirmation link
                from your inbox.
              </Trans>
            </p>

            <div className="mt-4 flex items-center gap-x-2">
              <Button asChild>
                <Link to={`/o/${orgUrl}/signin`} replace>
                  <Trans>Return</Trans>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen max-w-lg px-4">
      <div className="z-10 rounded-xl border border-border bg-neutral-100 p-6 dark:bg-background">
        <h1 className="font-semibold text-2xl">
          <Trans>Welcome to {organisationName}</Trans>
        </h1>

        <p className="mt-2 text-muted-foreground text-sm">
          <Trans>
            {linking
              ? 'Link this organisation sign-in to your current member account.'
              : 'Sign in using your linked organisation identity.'}
          </Trans>
        </p>

        {!canStart && (
          <p>
            Organisation sign-in needs a configured connection, a workspace key and an HTTPS app address. Use local
            sign-in.
          </p>
        )}
        {searchParams.get('error') && (
          <p role="alert">Sign-in was refused. Start again, or sign in locally to link your organisation identity.</p>
        )}
        <p>OIDC organisation sign-in is not yet live-verified. SAML is unavailable.</p>
        <hr className="-mx-6 my-4" />

        <div className="mb-4 flex items-center gap-x-2">
          <Checkbox
            id={`flag-3rd-party-service`}
            checked={isConfirmationChecked}
            onCheckedChange={(checked) => setIsConfirmationChecked(checked === 'indeterminate' ? false : checked)}
          />

          <label
            className="ml-2 flex flex-row items-center text-muted-foreground text-sm"
            htmlFor={`flag-3rd-party-service`}
          >
            <Trans>
              I approve using the sign-in connection configured by this organisation. If signed in locally, I approve
              linking this identity to my current member account.
            </Trans>
          </label>
        </div>

        <Button
          type="button"
          size="lg"
          variant="outline"
          className="w-full bg-background"
          loading={isSubmitting}
          disabled={!isConfirmationChecked || !canStart}
          onClick={onSignInWithOIDCClick}
        >
          <Trans>Sign In</Trans>
        </Button>

        <div className="relative mt-2 flex items-center justify-center gap-x-4 py-2 text-xs uppercase">
          <div className="h-px flex-1 bg-border" />
          <span className="bg-transparent text-muted-foreground">
            <Trans>OR</Trans>
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-1 flex items-center justify-center text-muted-foreground text-xs">
          <Link to="/signin">
            <Trans>Return to ESign sign in page here</Trans>
          </Link>
        </div>
      </div>
    </div>
  );
}

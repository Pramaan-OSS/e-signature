import { authClient } from '@e-sign/auth/client';
import { useIsFramed } from '@e-sign/lib/client-only/hooks/use-is-framed';
import { useOptionalSession } from '@e-sign/lib/client-only/providers/session';
import { formatPath } from '@e-sign/lib/constants/app';
import { Button } from '@e-sign/ui/primitives/button';
import { useToast } from '@e-sign/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

import { EmbedPopupAuth } from '~/components/embed/embed-popup-auth';

export type DocumentSigningAuthPageViewProps = {
  email?: string;
  emailHasAccount?: boolean;
};

export const DocumentSigningAuthPageView = ({ email, emailHasAccount }: DocumentSigningAuthPageViewProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();

  const isFramed = useIsFramed();

  const { sessionData } = useOptionalSession();

  const [isSigningOut, setIsSigningOut] = useState(false);

  const mismatchedUserEmail =
    sessionData?.user && email && sessionData.user.email !== email ? sessionData.user.email : undefined;

  const handleChangeAccount = async (email?: string) => {
    try {
      setIsSigningOut(true);

      let redirectPath = formatPath('/signin');

      if (email) {
        redirectPath = emailHasAccount ? formatPath(`/signin#email=${email}`) : formatPath(`/signup#email=${email}`);
      }

      await authClient.signOut({
        redirectPath,
      });
    } catch {
      toast({
        title: _(msg`Something went wrong`),
        description: _(msg`We were unable to log you out at this time.`),
        duration: 10000,
        variant: 'destructive',
      });
    }

    setIsSigningOut(false);
  };

  return (
    <div className="mx-auto flex h-[70vh] w-full max-w-md flex-col items-center justify-center">
      <div className="w-full">
        <h1 className="font-semibold text-3xl">
          <Trans>Authentication required</Trans>
        </h1>

        <p className="mt-2 text-muted-foreground text-sm">
          {email ? (
            <Trans>
              You need to be logged in as <strong>{email}</strong> to view this page.
            </Trans>
          ) : (
            <Trans>You need to be logged in to view this page.</Trans>
          )}
        </p>

        {isFramed ? (
          <EmbedPopupAuth
            className="mt-4"
            email={email || undefined}
            signedInAs={mismatchedUserEmail}
            onSuccess={() => window.location.reload()}
          />
        ) : (
          <Button
            className="mt-4 w-full"
            type="submit"
            onClick={async () => handleChangeAccount(email)}
            loading={isSigningOut}
          >
            {emailHasAccount ? <Trans>Login</Trans> : <Trans>Sign up</Trans>}
          </Button>
        )}
      </div>
    </div>
  );
};

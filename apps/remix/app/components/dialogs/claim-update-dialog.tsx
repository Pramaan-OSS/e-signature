import type { TLicenseClaim } from '@e-sign/lib/types/license';
import { trpc } from '@e-sign/trpc/react';
import type { TFindSubscriptionClaimsResponse } from '@e-sign/trpc/server/admin-router/find-subscription-claims.types';
import { Button } from '@e-sign/ui/primitives/button';
import { Checkbox } from '@e-sign/ui/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@e-sign/ui/primitives/dialog';
import { useToast } from '@e-sign/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { SubscriptionClaimForm } from '../forms/subscription-claim-form';

export type ClaimUpdateDialogProps = {
  claim: TFindSubscriptionClaimsResponse['data'][number];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  licenseFlags?: TLicenseClaim;
};

export const ClaimUpdateDialog = ({
  claim,
  trigger,
  licenseFlags,
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
}: ClaimUpdateDialogProps) => {
  const { t } = useLingui();
  const { toast } = useToast();

  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onControlledOpenChange?.(value);
  };
  const [backportEmailTransport, setBackportEmailTransport] = useState(false);

  const { mutateAsync: updateClaim, isPending } = trpc.admin.claims.update.useMutation({
    onSuccess: () => {
      toast({
        title: t`Subscription claim updated successfully.`,
      });

      setOpen(false);
    },
    onError: () => {
      toast({
        title: t`Failed to update subscription claim.`,
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
          {trigger}
        </DialogTrigger>
      )}

      <DialogContent className="scrollbar-hidden max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Trans>Update Subscription Claim</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Modify the details of the subscription claim.</Trans>
          </DialogDescription>
        </DialogHeader>

        <SubscriptionClaimForm
          subscriptionClaim={claim}
          onFormSubmit={async (data) =>
            await updateClaim({
              id: claim.id,
              data,
              backportEmailTransport,
            })
          }
          licenseFlags={licenseFlags}
          formSubmitTrigger={
            <>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="backport-email-transport"
                  checked={backportEmailTransport}
                  onCheckedChange={(checked) => setBackportEmailTransport(checked === true)}
                />
                <label htmlFor="backport-email-transport" className="text-muted-foreground text-sm">
                  <Trans>Backport email transport</Trans>
                </label>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                  <Trans>Cancel</Trans>
                </Button>

                <Button type="submit" loading={isPending}>
                  <Trans>Update Claim</Trans>
                </Button>
              </DialogFooter>
            </>
          }
        />
      </DialogContent>
    </Dialog>
  );
};

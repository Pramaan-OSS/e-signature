import { trpc as trpcReact } from '@e-sign/trpc/react';
import { Alert, AlertDescription } from '@e-sign/ui/primitives/alert';
import { Button } from '@e-sign/ui/primitives/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@e-sign/ui/primitives/dialog';
import { Label } from '@e-sign/ui/primitives/label';
import { Textarea } from '@e-sign/ui/primitives/textarea';
import { useToast } from '@e-sign/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';

export type EnvelopeCancelDialogProps = {
  id: string;
  title: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  onCancel?: () => Promise<void> | void;
};

export const EnvelopeCancelDialog = ({
  id,
  title,
  trigger,
  onCancel,
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
}: EnvelopeCancelDialogProps) => {
  const { toast } = useToast();
  const { t } = useLingui();
  const trpcUtils = trpcReact.useUtils();

  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onControlledOpenChange?.(value);
  };
  const [reason, setReason] = useState('');

  const { mutateAsync: cancelEnvelope, isPending } = trpcReact.envelope.cancel.useMutation({
    onSuccess: async () => {
      toast({
        title: t`Document cancelled`,
        description: t`"${title}" has been successfully cancelled`,
        duration: 5000,
      });

      await trpcUtils.document.findDocumentsInternal.invalidate();

      await onCancel?.();

      setOpen(false);
    },
    onError: () => {
      toast({
        title: t`Something went wrong`,
        description: t`This document could not be cancelled at this time. Please try again.`,
        variant: 'destructive',
        duration: 7500,
      });
    },
  });

  useEffect(() => {
    if (open) {
      setReason('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(value) => !isPending && setOpen(value)}>
      {controlledOpen === undefined && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Are you sure?</Trans>
          </DialogTitle>

          <DialogDescription>
            <Trans>
              You are about to cancel <strong>"{title}"</strong>
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <Alert variant="warning" className="-mt-1">
          <AlertDescription>
            <p>
              <Trans>Once confirmed, the following will occur:</Trans>
            </p>

            <ul className="mt-0.5 list-inside list-disc">
              <li>
                <Trans>The document signing process will be stopped</Trans>
              </li>
              <li>
                <Trans>Recipients will be notified that the document was cancelled</Trans>
              </li>
              <li>
                <Trans>The document will remain in your dashboard marked as Cancelled</Trans>
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cancel-reason">
            <Trans>Reason (optional)</Trans>
          </Label>

          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t`Add an optional reason for cancelling this document`}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isPending}>
              <Trans>Cancel</Trans>
            </Button>
          </DialogClose>

          <Button
            type="button"
            loading={isPending}
            onClick={() => void cancelEnvelope({ envelopeId: id, reason: reason || undefined })}
            variant="destructive"
          >
            <Trans>Cancel document</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

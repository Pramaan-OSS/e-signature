import { formatDocumentsPath, formatTemplatesPath } from '@e-sign/lib/utils/teams';
import { trpc } from '@e-sign/trpc/react';
import { Button } from '@e-sign/ui/primitives/button';
import { Checkbox } from '@e-sign/ui/primitives/checkbox';
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
import { useToast } from '@e-sign/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { EnvelopeType } from '@prisma/client';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { useCurrentTeam } from '~/providers/team';

type EnvelopeDuplicateDialogProps = {
  envelopeId: string;
  envelopeType: EnvelopeType;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
};

export const EnvelopeDuplicateDialog = ({
  envelopeId,
  envelopeType,
  trigger,
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
}: EnvelopeDuplicateDialogProps) => {
  const navigate = useNavigate();

  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onControlledOpenChange?.(value);
  };

  const { toast } = useToast();
  const { t } = useLingui();

  const team = useCurrentTeam();

  const isDocument = envelopeType === EnvelopeType.DOCUMENT;

  const form = useForm({
    defaultValues: {
      includeRecipients: true,
      includeFields: true,
    },
  });

  const includeRecipients = form.watch('includeRecipients');

  const { mutateAsync: duplicateEnvelope, isPending: isDuplicating } = trpc.envelope.duplicate.useMutation({
    onSuccess: async ({ id }) => {
      toast({
        title: isDocument ? t`Document Duplicated` : t`Template Duplicated`,
        description: isDocument
          ? t`Your document has been successfully duplicated.`
          : t`Your template has been successfully duplicated.`,
        duration: 5000,
      });

      const path = isDocument ? formatDocumentsPath(team.url) : formatTemplatesPath(team.url);

      await navigate(`${path}/${id}/edit`);
      setOpen(false);
    },
  });

  const onDuplicate = async () => {
    const { includeRecipients, includeFields } = form.getValues();

    try {
      await duplicateEnvelope({
        envelopeId,
        includeRecipients,
        includeFields: includeRecipients && includeFields,
      });
    } catch {
      toast({
        title: t`Something went wrong`,
        description: isDocument
          ? t`This document could not be duplicated at this time. Please try again.`
          : t`This template could not be duplicated at this time. Please try again.`,
        variant: 'destructive',
        duration: 7500,
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (isDuplicating) {
          return;
        }

        setOpen(value);

        if (!value) {
          form.reset();
        }
      }}
    >
      {controlledOpen === undefined && trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDocument ? <Trans>Duplicate Document</Trans> : <Trans>Duplicate Template</Trans>}
          </DialogTitle>
          <DialogDescription>
            {isDocument ? (
              <Trans>This document will be duplicated.</Trans>
            ) : (
              <Trans>This template will be duplicated.</Trans>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Controller
            control={form.control}
            name="includeRecipients"
            render={({ field }) => (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="envelopeDuplicateIncludeRecipients"
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked === true);

                    if (!checked) {
                      form.setValue('includeFields', false);
                    }
                  }}
                />
                <Label htmlFor="envelopeDuplicateIncludeRecipients">
                  <Trans>Include Recipients</Trans>
                </Label>
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="includeFields"
            render={({ field }) => (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="envelopeDuplicateIncludeFields"
                  checked={field.value}
                  disabled={!includeRecipients}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <Label htmlFor="envelopeDuplicateIncludeFields" className={!includeRecipients ? 'opacity-50' : ''}>
                  <Trans>Include Fields</Trans>
                </Label>
              </div>
            )}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isDuplicating}>
              <Trans>Cancel</Trans>
            </Button>
          </DialogClose>

          <Button type="button" loading={isDuplicating} onClick={onDuplicate}>
            <Trans>Duplicate</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

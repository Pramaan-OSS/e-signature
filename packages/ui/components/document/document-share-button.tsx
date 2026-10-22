import { useCopyShareLink } from '@e-sign/lib/client-only/hooks/use-copy-share-link';
import { NEXT_PUBLIC_WEBAPP_URL } from '@e-sign/lib/constants/app';
import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@e-sign/lib/constants/trpc';
import { trpc } from '@e-sign/trpc/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { Copy, Sparkles } from 'lucide-react';
import type React from 'react';
import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';

import { cn } from '../../lib/utils';
import { Button } from '../../primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../primitives/dialog';
import { useToast } from '../../primitives/use-toast';

export type DocumentShareButtonProps = HTMLAttributes<HTMLButtonElement> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  token?: string;
  documentId: number;
  trigger?: (_props: { loading: boolean; disabled: boolean }) => React.ReactNode;
};

export const DocumentShareButton = ({
  token,
  documentId,
  className,
  trigger,
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
}: DocumentShareButtonProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();

  const { copyShareLink, createAndCopyShareLink, isCopyingShareLink } = useCopyShareLink({
    onSuccess: () =>
      toast({
        title: _(msg`Copied to clipboard`),
        description: _(msg`The sharing link has been copied to your clipboard.`),
      }),
    onError: () =>
      toast({
        title: _(msg`Something went wrong`),
        description: _(msg`The sharing link could not be created at this time. Please try again.`),
        variant: 'destructive',
        duration: 5000,
      }),
  });

  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = controlledOpen ?? localOpen;
  const setIsOpen = (value: boolean) => {
    setLocalOpen(value);
    onControlledOpenChange?.(value);
  };

  const {
    mutateAsync: createOrGetShareLink,
    data: shareLink,
    isPending: isCreatingOrGettingShareLink,
  } = trpc.document.share.useMutation({
    ...DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
    onError: () =>
      toast({
        title: _(msg`Something went wrong`),
        description: _(msg`The sharing link could not be created at this time. Please try again.`),
        variant: 'destructive',
      }),
  });

  const isLoading = isCreatingOrGettingShareLink || isCopyingShareLink;

  useEffect(() => {
    if (isOpen) {
      void createOrGetShareLink({ token, documentId }).catch(() => null);
    }
  }, [isOpen, token, documentId, createOrGetShareLink]);

  const onCopyClick = async () => {
    try {
      if (shareLink) {
        await copyShareLink(`${NEXT_PUBLIC_WEBAPP_URL()}/share/${shareLink.slug}`);
      } else {
        await createAndCopyShareLink({ token, documentId });
      }
      setIsOpen(false);
    } catch {
      // The copy handler shows the retry message.
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger onClick={(e) => e.stopPropagation()} asChild>
          {trigger?.({
            disabled: !documentId,
            loading: isLoading,
          }) || (
            <Button
              variant="outline"
              disabled={!token || !documentId}
              className={cn('h-11 w-full max-w-lg flex-1', className)}
              loading={isLoading}
            >
              {!isLoading && <Sparkles className="mr-2 h-5 w-5" />}
              <Trans>Share</Trans>
            </Button>
          )}
        </DialogTrigger>
      )}

      <DialogContent position="end">
        <DialogHeader>
          <DialogTitle className="w-full max-w-full whitespace-pre-line break-words">
            <Trans>Share your signing experience!</Trans>
          </DialogTitle>

          <DialogDescription className="mt-4">
            <Trans>
              Rest assured, your document is strictly confidential and will never be shared. Only your signing
              experience will be highlighted. Share your personalized signing card to showcase your signature!
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="flex w-full flex-col">
          <div className="rounded-md border p-4">
            <Trans>Share your signing card with a local link.</Trans>
            <span className="mt-2 block" />
            <span
              className={cn('break-all font-medium text-blue-400', {
                'animate-pulse': !shareLink?.slug,
              })}
            >
              {NEXT_PUBLIC_WEBAPP_URL()}/share/{shareLink?.slug || '...'}
            </span>
            <div
              className={cn('mt-4 aspect-[1200/630] overflow-hidden rounded-lg border bg-muted/40', {
                'animate-pulse': !shareLink?.slug,
              })}
            >
              {shareLink?.slug && (
                <img
                  src={`${NEXT_PUBLIC_WEBAPP_URL()}/share/${shareLink.slug}/opengraph`}
                  alt="sharing link"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <Button variant="outline" className="flex-1" onClick={onCopyClick}>
              <Copy className="mr-2 h-4 w-4" />
              <Trans>Copy Link</Trans>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

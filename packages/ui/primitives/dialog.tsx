import { Trans } from '@lingui/react/macro';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';

const Dialog = (props: React.ComponentProps<typeof DialogPrimitive.Root>) => (
  <DialogPrimitive.Root {...props} modal={false} />
);

const DialogTrigger = DialogPrimitive.Trigger;

const DialogClose = DialogPrimitive.Close;

export const InlineDialogHost = ({ fallback = false }: { fallback?: boolean }) => (
  <div
    data-inline-dialog-host={fallback ? 'fallback' : 'page'}
    className="mx-auto mb-[18px] w-full min-w-0 max-w-2xl shrink-0 space-y-4 empty:hidden [&>.inline-dialog]:mx-auto [&>.inline-dialog]:max-w-full"
  />
);

const DialogPortal = ({
  children,
  container: suppliedContainer,
  position: _position,
  ...props
}: DialogPrimitive.DialogPortalProps & { position?: 'start' | 'end' | 'center' }) => {
  const [container, setContainer] = React.useState<DialogPrimitive.DialogPortalProps['container']>();
  React.useEffect(() => {
    const next =
      suppliedContainer ??
      document.querySelector<HTMLElement>('[data-inline-dialog-host="page"]') ??
      document.querySelector<HTMLElement>('[data-inline-dialog-host="fallback"]');
    if (next !== container) {
      setContainer(next);
    }
  });
  return container ? (
    <DialogPrimitive.Portal container={container} {...props}>
      {children}
    </DialogPrimitive.Portal>
  ) : null;
};

DialogPortal.displayName = DialogPrimitive.Portal.displayName;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(() => null);

DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    position?: 'start' | 'end' | 'center';
    hideClose?: boolean;
    /* Below prop is to add additional classes to the overlay */
    overlayClassName?: string;
  }
>(
  (
    {
      className,
      children,
      overlayClassName,
      position = 'start',
      hideClose = false,
      onOpenAutoFocus,
      onCloseAutoFocus,
      onFocusOutside,
      ...props
    },
    ref,
  ) => {
    const returnFocus = React.useRef<HTMLElement | null>(null);
    const content = React.useRef<HTMLDivElement | null>(null);
    return (
      <DialogPortal position={position}>
        <DialogOverlay className={cn(overlayClassName)} />
        <DialogPrimitive.Content
          ref={(node) => {
            content.current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          className={cn(
            'inline-dialog relative grid w-full scroll-mt-24 gap-4 p-6 focus:outline-none',
            {
              'rounded-b-xl': position === 'start',
              'rounded-t-xl': position === 'end',
            },
            className,
          )}
          {...props}
          onFocusOutside={(event) => {
            onFocusOutside?.(event);
            const target = event.detail.originalEvent.target;
            // A closing menu restores focus after its form opens. Keep the new form open.
            if (target instanceof Element && target.closest('[data-radix-menu-content], [aria-haspopup="menu"]')) {
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => {
            returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            onOpenAutoFocus?.(event);
            requestAnimationFrame(() => content.current?.scrollIntoView({ block: 'start' }));
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (!event.defaultPrevented && returnFocus.current?.isConnected && returnFocus.current !== document.body) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
        >
          {children}
          {!hideClose && (
            <DialogPrimitive.Close
              data-testid="btn-dialog-close"
              className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">
                <Trans>Close</Trans>
              </span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);

DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);

DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse space-y-2 space-y-reverse sm:flex-row sm:justify-end sm:space-x-2 sm:space-y-0',
      className,
    )}
    {...props}
  />
);

DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('truncate font-semibold text-lg tracking-tight', className)}
    {...props}
  />
));

DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-muted-foreground text-sm', className)} {...props} />
));

DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};

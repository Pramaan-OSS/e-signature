import { useSession } from '@e-sign/lib/client-only/providers/session';
import { trpc } from '@e-sign/trpc/react';
import { ZUpdateProfileMutationSchema } from '@e-sign/trpc/server/profile-router/schema';
import { cn } from '@e-sign/ui/lib/utils';
import { Button } from '@e-sign/ui/primitives/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@e-sign/ui/primitives/form/form';
import { Input } from '@e-sign/ui/primitives/input';
import { Label } from '@e-sign/ui/primitives/label';
import { SignaturePadDialog } from '@e-sign/ui/primitives/signature-pad/signature-pad-dialog';
import { useToast } from '@e-sign/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export const ZProfileFormSchema = ZUpdateProfileMutationSchema;

export const ZTwoFactorAuthTokenSchema = z.object({
  token: z.string(),
});

export type TTwoFactorAuthTokenSchema = z.infer<typeof ZTwoFactorAuthTokenSchema>;
export type TProfileFormSchema = z.infer<typeof ZProfileFormSchema>;

export type ProfileFormProps = {
  className?: string;
};

export const ProfileForm = ({ className }: ProfileFormProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();
  const { user, refreshSession } = useSession();

  const form = useForm<TProfileFormSchema>({
    values: {
      name: user.name ?? '',
      signature: user.signature || '',
    },
    resolver: zodResolver(ZProfileFormSchema),
  });

  const isSubmitting = form.formState.isSubmitting;

  const { mutateAsync: updateProfile } = trpc.profile.updateProfile.useMutation();

  const onFormSubmit = async ({ name, signature }: TProfileFormSchema) => {
    try {
      await updateProfile({
        name,
        signature,
      });

      await refreshSession();

      toast({
        title: _(msg`Profile updated`),
        description: _(msg`Your profile has been updated successfully.`),
        duration: 5000,
      });
    } catch (err) {
      toast({
        title: _(msg`An unknown error occurred`),
        description: _(
          msg`We encountered an unknown error while attempting update your profile. Please try again later.`,
        ),
        variant: 'destructive',
      });
    }
  };

  return (
    <Form {...form}>
      <form className={cn('flex w-full flex-col gap-y-4', className)} onSubmit={form.handleSubmit(onFormSubmit)}>
        <fieldset className="flex w-full flex-col gap-y-4" disabled={isSubmitting}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Full Name</Trans>
                </FormLabel>
                <FormControl>
                  <Input type="text" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div>
            <Label htmlFor="email" className="text-muted-foreground">
              <Trans>Email</Trans>
            </Label>
            <Input id="email" type="email" className="mt-2 bg-muted" value={user.email} disabled />
          </div>

          <FormField
            control={form.control}
            name="signature"
            render={({ field: { onChange, value } }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Signature</Trans>
                </FormLabel>
                <FormControl>
                  <SignaturePadDialog
                    disabled={isSubmitting}
                    fullName={user.name ?? ''}
                    value={value}
                    onChange={(v) => onChange(v ?? '')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        <Button type="submit" loading={isSubmitting} className="self-end">
          <Trans>Update profile</Trans>
        </Button>
      </form>
    </Form>
  );
};

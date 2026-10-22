import { useCurrentOrganisation } from '@e-sign/lib/client-only/providers/organisation';
import { trpc } from '@e-sign/trpc/react';
import { Alert, AlertDescription } from '@e-sign/ui/primitives/alert';
import { Button } from '@e-sign/ui/primitives/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@e-sign/ui/primitives/dialog';
import { Trans, useLingui } from '@lingui/react/macro';
import { OrganisationMemberRole, TeamMemberRole } from '@prisma/client';
import { useState } from 'react';

import { useCurrentTeam } from '~/providers/team';

type AiFeaturesEnableDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabled: () => void;
};

export const AiFeaturesEnableDialog = ({ open, onOpenChange, onEnabled }: AiFeaturesEnableDialogProps) => {
  const { t } = useLingui();

  const team = useCurrentTeam();
  const organisation = useCurrentOrganisation();

  const isTeamAdmin = team.currentTeamRole === TeamMemberRole.ADMIN;
  const isOrganisationAdmin = organisation.currentOrganisationRole === OrganisationMemberRole.ADMIN;
  const canEnableAiFeatures = isTeamAdmin || isOrganisationAdmin;

  const [error, setError] = useState<string | null>(null);

  const { mutateAsync: updateTeamSettings, isPending: isUpdatingTeamSettings } =
    trpc.team.settings.update.useMutation();
  const { mutateAsync: updateOrganisationSettings, isPending: isUpdatingOrganisationSettings } =
    trpc.organisation.settings.update.useMutation();

  const isSubmitting = isUpdatingTeamSettings || isUpdatingOrganisationSettings;

  const onEnableClick = async () => {
    if (!canEnableAiFeatures) {
      return;
    }

    setError(null);

    try {
      if (isTeamAdmin) {
        await updateTeamSettings({
          teamId: team.id,
          data: { aiFeaturesEnabled: true },
        });
      } else {
        await updateOrganisationSettings({
          organisationId: organisation.id,
          data: { aiFeaturesEnabled: true },
        });
      }

      onEnabled();
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to enable automatic detection', err);
      setError(
        err instanceof Error ? err.message : t`We couldn't enable automatic detection right now. Please try again.`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>Enable automatic detection</Trans>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            <Trans>
              Turn on automatic detection to suggest recipients and fields in your documents. Review every suggestion
              before sending.
            </Trans>
          </p>

          <Alert variant="neutral">
            <AlertDescription>
              <Trans>
                Selected document content is sent to Pramaan for detection. Only enable this feature for documents you
                are allowed to share.
              </Trans>
            </AlertDescription>
          </Alert>

          {canEnableAiFeatures ? (
            <p className="text-muted-foreground text-sm">
              <Trans>
                You're an admin. You can enable automatic detection for this team right away. Everyone on the team will
                see automatic detection once enabled.
              </Trans>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              <Trans>
                automatic detection are disabled for your team. Please ask your team owner or organisation owner to
                enable them.
              </Trans>
            </p>
          )}

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            <Trans>Close</Trans>
          </Button>

          {canEnableAiFeatures ? (
            <Button type="button" onClick={() => void onEnableClick()} loading={isSubmitting}>
              <Trans>Enable automatic detection</Trans>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

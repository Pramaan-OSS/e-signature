import { useSession } from '@e-sign/lib/client-only/providers/session';
import type { TEnvelope } from '@e-sign/lib/types/envelope';
import { isDocumentCompleted } from '@e-sign/lib/utils/document';
import { getEnvelopeItemPermissions, mapSecondaryIdToDocumentId } from '@e-sign/lib/utils/envelope';
import { formatDocumentsPath } from '@e-sign/lib/utils/teams';
import { trpc as trpcReact } from '@e-sign/trpc/react';
import { DocumentShareButton } from '@e-sign/ui/components/document/document-share-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@e-sign/ui/primitives/dropdown-menu';
import { Trans } from '@lingui/react/macro';
import { DocumentStatus, EnvelopeType } from '@prisma/client';
import {
  Copy,
  Download,
  Edit,
  FileOutputIcon,
  History,
  MoreHorizontal,
  Pencil,
  ScrollTextIcon,
  Share,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { EnvelopeDeleteDialog } from '~/components/dialogs/envelope-delete-dialog';
import { EnvelopeDownloadDialog } from '~/components/dialogs/envelope-download-dialog';
import { EnvelopeDuplicateDialog } from '~/components/dialogs/envelope-duplicate-dialog';
import { EnvelopeRedistributeDialog } from '~/components/dialogs/envelope-redistribute-dialog';
import { EnvelopeRenameDialog } from '~/components/dialogs/envelope-rename-dialog';
import { EnvelopeSaveAsTemplateDialog } from '~/components/dialogs/envelope-save-as-template-dialog';
import { DocumentRecipientLinkCopyDialog } from '~/components/general/document/document-recipient-link-copy-dialog';
import { useCurrentTeam } from '~/providers/team';

export type DocumentPageViewDropdownProps = {
  envelope: TEnvelope;
};

export const DocumentPageViewDropdown = ({ envelope }: DocumentPageViewDropdownProps) => {
  const { user } = useSession();

  const navigate = useNavigate();
  const team = useCurrentTeam();

  const trpcUtils = trpcReact.useUtils();

  const [activeDialog, setActiveDialog] = useState<
    'download' | 'duplicate' | 'delete' | 'links' | 'resend' | 'share' | null
  >(null);
  const [isRenameDialogOpen, setRenameDialogOpen] = useState(false);
  const [isSaveAsTemplateDialogOpen, setSaveAsTemplateDialogOpen] = useState(false);

  const recipient = envelope.recipients.find((recipient) => recipient.email === user.email);

  const isOwner = envelope.userId === user.id;
  const isDraft = envelope.status === DocumentStatus.DRAFT;
  const isPending = envelope.status === DocumentStatus.PENDING;
  const isDeleted = envelope.deletedAt !== null;
  const isComplete = isDocumentCompleted(envelope);
  const isCurrentTeamDocument = team && envelope.teamId === team.id;
  const canManageDocument = Boolean(isOwner || isCurrentTeamDocument);

  const { canTitleBeChanged } = getEnvelopeItemPermissions(envelope, []);

  const documentsPath = formatDocumentsPath(team.url);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="document-page-view-action-btn">
          <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-52" align="end" forceMount>
          <DropdownMenuLabel>
            <Trans>Action</Trans>
          </DropdownMenuLabel>

          {(isOwner || isCurrentTeamDocument) && !isComplete && (
            <DropdownMenuItem asChild>
              <Link to={`${documentsPath}/${envelope.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                <Trans>Edit</Trans>
              </Link>
            </DropdownMenuItem>
          )}

          {canManageDocument && canTitleBeChanged && (
            <DropdownMenuItem onSelect={() => setTimeout(() => setRenameDialogOpen(true), 0)}>
              <Pencil className="mr-2 h-4 w-4" />
              <Trans>Rename</Trans>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('download'), 0)}>
            <Download className="mr-2 h-4 w-4" />
            <Trans>Download</Trans>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link to={`${documentsPath}/${envelope.id}/logs`}>
              <ScrollTextIcon className="mr-2 h-4 w-4" />
              <Trans>Audit Logs</Trans>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('duplicate'), 0)}>
            <Copy className="mr-2 h-4 w-4" />
            <Trans>Duplicate</Trans>
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setTimeout(() => setSaveAsTemplateDialogOpen(true), 0)}>
            <FileOutputIcon className="mr-2 h-4 w-4" />
            <Trans>Save as Template</Trans>
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('delete'), 0)}>
            <Trash2 className="mr-2 h-4 w-4" />
            {canManageDocument ? <Trans>Delete</Trans> : <Trans>Hide</Trans>}
          </DropdownMenuItem>

          <DropdownMenuLabel>
            <Trans>Share</Trans>
          </DropdownMenuLabel>

          {canManageDocument && (
            <DropdownMenuItem disabled={!isPending} onSelect={() => setTimeout(() => setActiveDialog('links'), 0)}>
              <Copy className="mr-2 h-4 w-4" />
              <Trans>Signing Links</Trans>
            </DropdownMenuItem>
          )}

          {canManageDocument && (
            <DropdownMenuItem disabled={!isPending} onSelect={() => setTimeout(() => setActiveDialog('resend'), 0)}>
              <History className="mr-2 h-4 w-4" />
              <Trans>Resend</Trans>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem disabled={isDraft} onSelect={() => setTimeout(() => setActiveDialog('share'), 0)}>
            <Share className="mr-2 h-4 w-4" />
            <Trans>Share Signing Card</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EnvelopeSaveAsTemplateDialog
        envelopeId={envelope.id}
        open={isSaveAsTemplateDialogOpen}
        onOpenChange={setSaveAsTemplateDialogOpen}
      />

      <EnvelopeRenameDialog
        id={envelope.id}
        initialTitle={envelope.title}
        open={isRenameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        onSuccess={async () => {
          await trpcUtils.envelope.get.invalidate();
        }}
      />
      <EnvelopeDownloadDialog
        envelopeId={envelope.id}
        envelopeStatus={envelope.status}
        isLegacy={envelope.internalVersion === 1}
        token={canManageDocument ? undefined : recipient?.token}
        envelopeItems={envelope.envelopeItems}
        open={activeDialog === 'download'}
        onOpenChange={(open) => setActiveDialog(open ? 'download' : null)}
      />
      <EnvelopeDuplicateDialog
        envelopeId={envelope.id}
        envelopeType={EnvelopeType.DOCUMENT}
        open={activeDialog === 'duplicate'}
        onOpenChange={(open) => setActiveDialog(open ? 'duplicate' : null)}
      />
      <EnvelopeDeleteDialog
        id={envelope.id}
        type={EnvelopeType.DOCUMENT}
        status={envelope.status}
        title={envelope.title}
        canManageDocument={canManageDocument}
        onDelete={() => {
          void navigate(documentsPath);
        }}
        open={activeDialog === 'delete'}
        onOpenChange={(open) => setActiveDialog(open ? 'delete' : null)}
      />
      <DocumentRecipientLinkCopyDialog
        recipients={envelope.recipients}
        open={activeDialog === 'links'}
        onOpenChange={(open) => setActiveDialog(open ? 'links' : null)}
      />
      <EnvelopeRedistributeDialog
        envelope={envelope}
        envelopeType={EnvelopeType.DOCUMENT}
        open={activeDialog === 'resend'}
        onOpenChange={(open) => setActiveDialog(open ? 'resend' : null)}
      />
      <DocumentShareButton
        documentId={mapSecondaryIdToDocumentId(envelope.secondaryId)}
        token={isOwner ? undefined : recipient?.token}
        open={activeDialog === 'share'}
        onOpenChange={(open) => setActiveDialog(open ? 'share' : null)}
      />
    </>
  );
};

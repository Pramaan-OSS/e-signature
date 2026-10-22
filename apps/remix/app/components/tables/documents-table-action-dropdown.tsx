import { useSession } from '@e-sign/lib/client-only/providers/session';
import type { TDocumentMany as TDocumentRow } from '@e-sign/lib/types/document';
import { isDocumentCompleted } from '@e-sign/lib/utils/document';
import { getEnvelopeItemPermissions } from '@e-sign/lib/utils/envelope';
import { findRecipientByEmail } from '@e-sign/lib/utils/recipients';
import { formatDocumentsPath, isMemberManagerOrAbove } from '@e-sign/lib/utils/teams';
import { trpc as trpcReact } from '@e-sign/trpc/react';
import { DocumentShareButton } from '@e-sign/ui/components/document/document-share-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@e-sign/ui/primitives/dropdown-menu';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { DocumentStatus, EnvelopeType, RecipientRole } from '@prisma/client';
import {
  CheckCircle,
  Copy,
  Download,
  Edit,
  EyeIcon,
  FileOutputIcon,
  FolderInput,
  History,
  MoreHorizontal,
  Pencil,
  Share,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { EnvelopeCancelDialog } from '~/components/dialogs/envelope-cancel-dialog';
import { EnvelopeDeleteDialog } from '~/components/dialogs/envelope-delete-dialog';
import { EnvelopeDuplicateDialog } from '~/components/dialogs/envelope-duplicate-dialog';
import { EnvelopeRedistributeDialog } from '~/components/dialogs/envelope-redistribute-dialog';
import { EnvelopeSaveAsTemplateDialog } from '~/components/dialogs/envelope-save-as-template-dialog';
import { DocumentRecipientLinkCopyDialog } from '~/components/general/document/document-recipient-link-copy-dialog';
import { useCurrentTeam } from '~/providers/team';

import { EnvelopeDownloadDialog } from '../dialogs/envelope-download-dialog';
import { EnvelopeRenameDialog } from '../dialogs/envelope-rename-dialog';

export type DocumentsTableActionDropdownProps = {
  row: TDocumentRow;
  onMoveDocument?: () => void;
};

export const DocumentsTableActionDropdown = ({ row, onMoveDocument }: DocumentsTableActionDropdownProps) => {
  const { user } = useSession();
  const team = useCurrentTeam();

  const { _ } = useLingui();
  const trpcUtils = trpcReact.useUtils();

  const [isRenameDialogOpen, setRenameDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<
    'download' | 'duplicate' | 'cancel' | 'links' | 'resend' | 'share' | null
  >(null);
  const [isSaveAsTemplateDialogOpen, setSaveAsTemplateDialogOpen] = useState(false);

  const recipient = findRecipientByEmail({
    recipients: row.recipients,
    userEmail: user.email,
    teamEmail: team.teamEmail?.email,
  });

  const isOwner = row.user.id === user.id;
  // const isRecipient = !!recipient;
  const isDraft = row.status === DocumentStatus.DRAFT;
  const isPending = row.status === DocumentStatus.PENDING;
  const isComplete = isDocumentCompleted(row.status);
  // const isSigned = recipient?.signingStatus === SigningStatus.SIGNED;
  const isCurrentTeamDocument = team && row.team?.url === team.url;
  const canManageDocument = Boolean(isOwner || isCurrentTeamDocument);

  // Cancelling a document is restricted server-side to the document owner or a
  // privileged team member (ADMIN/MANAGER). Mirror that here so plain MEMBERs
  // don't see a Cancel action that would fail on the server.
  const isPrivilegedTeamMember = isMemberManagerOrAbove(team.currentTeamRole);
  const canCancelDocument = isOwner || isPrivilegedTeamMember;

  const { canTitleBeChanged } = getEnvelopeItemPermissions(
    {
      completedAt: row.completedAt,
      deletedAt: row.deletedAt,
      type: EnvelopeType.DOCUMENT,
      status: row.status,
    },
    [],
  );

  const documentsPath = formatDocumentsPath(team.url);
  const formatPath = `${documentsPath}/${row.envelopeId}/edit`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="document-table-action-btn">
          <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-52" align="start" forceMount>
          <DropdownMenuLabel>
            <Trans>Action</Trans>
          </DropdownMenuLabel>

          {!isDraft &&
            recipient &&
            recipient?.role !== RecipientRole.CC &&
            recipient?.role !== RecipientRole.ASSISTANT && (
              <DropdownMenuItem disabled={!recipient || isComplete} asChild>
                <a href={`/sign/${recipient?.token}`}>
                  {recipient?.role === RecipientRole.VIEWER && (
                    <>
                      <EyeIcon className="mr-2 h-4 w-4" />
                      <Trans>View</Trans>
                    </>
                  )}

                  {recipient?.role === RecipientRole.SIGNER && (
                    <>
                      <Pencil className="mr-2 h-4 w-4" />
                      <Trans>Sign</Trans>
                    </>
                  )}

                  {recipient?.role === RecipientRole.APPROVER && (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      <Trans>Approve</Trans>
                    </>
                  )}
                </a>
              </DropdownMenuItem>
            )}

          <DropdownMenuItem disabled={!canManageDocument || isComplete} asChild>
            <Link to={formatPath}>
              <Edit className="mr-2 h-4 w-4" />
              <Trans>Edit</Trans>
            </Link>
          </DropdownMenuItem>

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

          <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('duplicate'), 0)}>
            <Copy className="mr-2 h-4 w-4" />
            <Trans>Duplicate</Trans>
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setTimeout(() => setSaveAsTemplateDialogOpen(true), 0)}>
            <FileOutputIcon className="mr-2 h-4 w-4" />
            <Trans>Save as Template</Trans>
          </DropdownMenuItem>

          {onMoveDocument && canManageDocument && (
            <DropdownMenuItem onSelect={() => setTimeout(() => onMoveDocument?.(), 0)}>
              <FolderInput className="mr-2 h-4 w-4" />
              <Trans>Move to Folder</Trans>
            </DropdownMenuItem>
          )}

          {canCancelDocument && isPending && (
            <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('cancel'), 0)}>
              <XCircle className="mr-2 h-4 w-4" />
              <Trans>Cancel</Trans>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onSelect={() => setTimeout(() => setDeleteDialogOpen(true), 0)}>
            <Trash2 className="mr-2 h-4 w-4" />
            {canManageDocument ? _(msg`Delete`) : _(msg`Hide`)}
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

          {canManageDocument && isPending && (
            <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('resend'), 0)}>
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
      <EnvelopeDeleteDialog
        id={row.envelopeId}
        type={EnvelopeType.DOCUMENT}
        status={row.status}
        title={row.title}
        canManageDocument={canManageDocument}
        open={isDeleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />

      <EnvelopeSaveAsTemplateDialog
        envelopeId={row.envelopeId}
        open={isSaveAsTemplateDialogOpen}
        onOpenChange={setSaveAsTemplateDialogOpen}
      />

      <EnvelopeRenameDialog
        id={row.envelopeId}
        initialTitle={row.title}
        open={isRenameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        onSuccess={async () => {
          await trpcUtils.document.findDocumentsInternal.invalidate();
        }}
      />
      <EnvelopeDownloadDialog
        envelopeId={row.envelopeId}
        envelopeStatus={row.status}
        isLegacy={row.internalVersion === 1}
        token={canManageDocument ? undefined : recipient?.token}
        open={activeDialog === 'download'}
        onOpenChange={(open) => setActiveDialog(open ? 'download' : null)}
      />
      <EnvelopeDuplicateDialog
        envelopeId={row.envelopeId}
        envelopeType={EnvelopeType.DOCUMENT}
        open={activeDialog === 'duplicate'}
        onOpenChange={(open) => setActiveDialog(open ? 'duplicate' : null)}
      />
      {canCancelDocument && isPending && (
        <EnvelopeCancelDialog
          id={row.envelopeId}
          title={row.title}
          onCancel={async () => {
            await trpcUtils.document.findDocumentsInternal.invalidate();
          }}
          open={activeDialog === 'cancel'}
          onOpenChange={(open) => setActiveDialog(open ? 'cancel' : null)}
        />
      )}
      {canManageDocument && (
        <DocumentRecipientLinkCopyDialog
          recipients={row.recipients}
          open={activeDialog === 'links'}
          onOpenChange={(open) => setActiveDialog(open ? 'links' : null)}
        />
      )}
      {canManageDocument && (
        <EnvelopeRedistributeDialog
          envelope={{
            id: row.envelopeId,
            status: row.status,
            type: EnvelopeType.DOCUMENT,
            recipients: row.recipients,
          }}
          envelopeType={EnvelopeType.DOCUMENT}
          open={activeDialog === 'resend'}
          onOpenChange={(open) => setActiveDialog(open ? 'resend' : null)}
        />
      )}
      <DocumentShareButton
        documentId={row.id}
        token={isOwner ? undefined : recipient?.token}
        open={activeDialog === 'share'}
        onOpenChange={(open) => setActiveDialog(open ? 'share' : null)}
      />
    </>
  );
};

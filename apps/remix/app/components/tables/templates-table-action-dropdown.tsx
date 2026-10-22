import type { TRecipientLite } from '@e-sign/lib/types/recipient';
import { trpc as trpcReact } from '@e-sign/trpc/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@e-sign/ui/primitives/dropdown-menu';
import { Trans } from '@lingui/react/macro';
import { DocumentStatus, EnvelopeType, type TemplateDirectLink } from '@prisma/client';
import { Copy, Download, Edit, FolderIcon, MoreHorizontal, Pencil, Share2Icon, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { EnvelopeDeleteDialog } from '../dialogs/envelope-delete-dialog';
import { EnvelopeDownloadDialog } from '../dialogs/envelope-download-dialog';
import { EnvelopeDuplicateDialog } from '../dialogs/envelope-duplicate-dialog';
import { EnvelopeRenameDialog } from '../dialogs/envelope-rename-dialog';
import { EnvelopesBulkMoveDialog } from '../dialogs/envelopes-bulk-move-dialog';
import { TemplateBulkSendDialog } from '../dialogs/template-bulk-send-dialog';
import { TemplateDirectLinkDialog } from '../dialogs/template-direct-link-dialog';

export type TemplatesTableActionDropdownProps = {
  row: {
    id: number;
    userId: number;
    teamId: number;
    title: string;
    folderId?: string | null;
    envelopeId: string;
    directLink?: Pick<TemplateDirectLink, 'token' | 'enabled'> | null;
    recipients: TRecipientLite[];
  };
  templateRootPath: string;
  teamId: number;
  onDelete?: () => Promise<void> | void;
};

export const TemplatesTableActionDropdown = ({
  row,
  templateRootPath,
  teamId,
  onDelete,
}: TemplatesTableActionDropdownProps) => {
  const trpcUtils = trpcReact.useUtils();
  const navigate = useNavigate();

  const [isRenameDialogOpen, setRenameDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'duplicate' | 'direct-link' | 'bulk' | 'download' | null>(null);
  const [isMoveToFolderDialogOpen, setMoveToFolderDialogOpen] = useState(false);

  const isTeamTemplate = row.teamId === teamId;
  const canMutate = isTeamTemplate;

  const formatPath = `${templateRootPath}/${row.envelopeId}/edit`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="template-table-action-btn">
          <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-52" align="start" forceMount>
          <DropdownMenuLabel>Action</DropdownMenuLabel>

          <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('download'), 0)}>
            <Download className="mr-2 h-4 w-4" />
            <Trans>Download</Trans>
          </DropdownMenuItem>

          {canMutate && (
            <>
              <DropdownMenuItem asChild>
                <Link to={formatPath}>
                  <Edit className="mr-2 h-4 w-4" />
                  <Trans>Edit</Trans>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setTimeout(() => setRenameDialogOpen(true), 0)}>
                <Pencil className="mr-2 h-4 w-4" />
                <Trans>Rename</Trans>
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('duplicate'), 0)}>
                <Copy className="mr-2 h-4 w-4" />
                <Trans>Duplicate</Trans>
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('direct-link'), 0)}>
                <Share2Icon className="mr-2 h-4 w-4" />
                <Trans>Direct link</Trans>
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setTimeout(() => setMoveToFolderDialogOpen(true), 0)}>
                <FolderIcon className="mr-2 h-4 w-4" />
                <Trans>Move to Folder</Trans>
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setTimeout(() => setActiveDialog('bulk'), 0)}>
                <Upload className="mr-2 h-4 w-4" />
                <Trans>Bulk Send via CSV</Trans>
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setTimeout(() => setDeleteDialogOpen(true), 0)}>
                <Trash2 className="mr-2 h-4 w-4" />
                <Trans>Delete</Trans>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canMutate && (
        <EnvelopeDeleteDialog
          id={row.envelopeId}
          type={EnvelopeType.TEMPLATE}
          status={DocumentStatus.DRAFT}
          title={row.title}
          canManageDocument={canMutate}
          onDelete={onDelete}
          open={isDeleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      )}

      <EnvelopesBulkMoveDialog
        envelopeIds={[row.envelopeId]}
        envelopeType={EnvelopeType.TEMPLATE}
        open={isMoveToFolderDialogOpen}
        onOpenChange={setMoveToFolderDialogOpen}
        currentFolderId={row.folderId ?? undefined}
        onSuccess={(folderId) => navigate(folderId ? `${templateRootPath}/f/${folderId}` : templateRootPath)}
      />

      <EnvelopeRenameDialog
        id={row.envelopeId}
        initialTitle={row.title}
        open={isRenameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        envelopeType="template"
        onSuccess={async () => {
          await Promise.all([
            trpcUtils.template.findTemplates.invalidate(),
            trpcUtils.template.findTemplatesInternal.invalidate(),
          ]);
        }}
      />
      {canMutate && (
        <EnvelopeDuplicateDialog
          envelopeId={row.envelopeId}
          envelopeType={EnvelopeType.TEMPLATE}
          open={activeDialog === 'duplicate'}
          onOpenChange={(open) => setActiveDialog(open ? 'duplicate' : null)}
        />
      )}
      {canMutate && (
        <TemplateDirectLinkDialog
          templateId={row.id}
          recipients={row.recipients}
          directLink={row.directLink}
          open={activeDialog === 'direct-link'}
          onOpenChange={(open) => setActiveDialog(open ? 'direct-link' : null)}
        />
      )}
      {canMutate && (
        <TemplateBulkSendDialog
          templateId={row.id}
          recipients={row.recipients}
          open={activeDialog === 'bulk'}
          onOpenChange={(open) => setActiveDialog(open ? 'bulk' : null)}
        />
      )}
      <EnvelopeDownloadDialog
        envelopeId={row.envelopeId}
        envelopeStatus={DocumentStatus.DRAFT}
        open={activeDialog === 'download'}
        onOpenChange={(open) => setActiveDialog(open ? 'download' : null)}
      />
    </>
  );
};

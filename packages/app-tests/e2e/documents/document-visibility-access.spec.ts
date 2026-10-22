import { cancelDocument } from '@e-sign/lib/server-only/document/cancel-document';
import { deleteDocument } from '@e-sign/lib/server-only/document/delete-document';
import { getEnvelopeWhereInput } from '@e-sign/lib/server-only/envelope/get-envelope-by-id';
import { prisma } from '@e-sign/prisma';
import { DocumentStatus, DocumentVisibility, TeamMemberRole } from '@e-sign/prisma/client';
import { seedBlankDocument } from '@e-sign/prisma/seed/documents';
import { seedTeamMember } from '@e-sign/prisma/seed/teams';
import { seedUser } from '@e-sign/prisma/seed/users';
import { expect, test } from '@playwright/test';

const requestMetadata = {
  auth: null,
  requestMetadata: {},
  source: 'app' as const,
};

test.describe.configure({ mode: 'parallel' });

const canReadEnvelope = async (envelopeId: string, userId: number, teamId: number) => {
  try {
    await getEnvelopeWhereInput({
      id: { type: 'envelopeId', id: envelopeId },
      userId,
      teamId,
      type: null,
    }).then(({ envelopeWhereInput }) => prisma.envelope.findFirstOrThrow({ where: envelopeWhereInput }));

    return true;
  } catch {
    return false;
  }
};

test('[DOCUMENTS]: a member cannot delete a document with restricted visibility', async () => {
  const { user: owner, team } = await seedUser();
  const member = await seedTeamMember({ teamId: team.id, role: TeamMemberRole.MEMBER });

  const envelope = await seedBlankDocument(owner, team.id, {
    createDocumentOptions: {
      visibility: DocumentVisibility.ADMIN,
      status: DocumentStatus.DRAFT,
    },
  });

  // The member cannot read an ADMIN-visibility document, so they must not be
  // able to delete it either.
  expect(await canReadEnvelope(envelope.id, member.id, team.id)).toBe(false);

  await expect(
    deleteDocument({
      id: { type: 'envelopeId', id: envelope.id },
      userId: member.id,
      teamId: team.id,
      requestMetadata,
    }),
  ).rejects.toThrow();

  const stillExists = await prisma.envelope.findUnique({ where: { id: envelope.id } });
  expect(stillExists).not.toBeNull();
});

test('[DOCUMENTS]: a manager cannot cancel a document with restricted visibility', async () => {
  const { user: owner, team } = await seedUser();
  const manager = await seedTeamMember({ teamId: team.id, role: TeamMemberRole.MANAGER });

  const envelope = await seedBlankDocument(owner, team.id, {
    createDocumentOptions: {
      visibility: DocumentVisibility.ADMIN,
      status: DocumentStatus.PENDING,
    },
  });

  // A manager outranks a member but still cannot read an ADMIN-visibility
  // document, so cancellation must be blocked despite the sufficient role.
  expect(await canReadEnvelope(envelope.id, manager.id, team.id)).toBe(false);

  await expect(
    cancelDocument({
      id: { type: 'envelopeId', id: envelope.id },
      userId: manager.id,
      teamId: team.id,
      reason: 'test-cancel',
      requestMetadata,
    }),
  ).rejects.toThrow();

  const after = await prisma.envelope.findUnique({ where: { id: envelope.id } });
  expect(after?.status).toBe(DocumentStatus.PENDING);
});

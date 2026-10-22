import { randomUUID } from 'node:crypto';
import { prisma } from '@e-sign/prisma';
import { callPramaan } from '../pramaan';

export async function createEmailDomain({ domain, organisationId }: { domain: string; organisationId: string }) {
  const result = await callPramaan('email.domain.verify', { domain }, { idempotencyKey: `domain-add:${organisationId}:${domain}` });
  const row = await prisma.emailDomain.create({ data: { id: randomUUID(), domain, organisationId, selector: randomUUID(), publicKey: JSON.stringify(result.dnsRecords), privateKey: '', dnsRecords: result.dnsRecords, status: result.status === 'verified' ? 'ACTIVE' : 'PENDING' }, omit: { privateKey: true }, include: { emails: true } });
  return { emailDomain: { ...row, records: result.dnsRecords }, records: result.dnsRecords };
}
export async function verifyEmailDomain(emailDomainId: string) {
  const row = await prisma.emailDomain.findUniqueOrThrow({ where: { id: emailDomainId } });
  const result = await callPramaan('email.domain.get', { domain: row.domain });
  await prisma.emailDomain.update({ where: { id: row.id }, data: { publicKey: JSON.stringify(result.dnsRecords), dnsRecords: result.dnsRecords, status: result.status === 'verified' ? 'ACTIVE' : 'PENDING', lastVerifiedAt: new Date() } });
  return { ...result, isVerified: result.status === 'verified' };
}
export async function reregisterEmailDomain({ emailDomainId }: { emailDomainId: string }) {
  return verifyEmailDomain(emailDomainId);
}
export async function deleteEmailDomain({ emailDomainId }: { emailDomainId: string }) {
  const row = await prisma.emailDomain.findUniqueOrThrow({ where: { id: emailDomainId } });
  await callPramaan('email.domain.delete', { domain: row.domain }, { idempotencyKey: `domain-delete:${row.id}` });
  return prisma.emailDomain.delete({ where: { id: row.id } });
}

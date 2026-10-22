import { useState } from 'react';
import type { ReactNode } from 'react';
import { trpc } from '@e-sign/trpc/react';
import { useSession } from '@e-sign/lib/client-only/providers/session';
import { ZCreateOrganisationRequestSchema } from '@e-sign/trpc/server/organisation-router/create-organisation.types';
import type { z } from 'zod';
export const ZCreateOrganisationFormSchema = ZCreateOrganisationRequestSchema.pick({ name: true });
export type TCreateOrganisationFormSchema = z.infer<typeof ZCreateOrganisationFormSchema>;
export type OrganisationCreateDialogProps = { trigger?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; defaultOpen?: boolean; modal?: boolean };
export function OrganisationCreateDialog({ trigger, open: controlled, onOpenChange }: OrganisationCreateDialogProps) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [error, setError] = useState('');
  const create = trpc.organisation.create.useMutation(); const { refreshSession } = useSession();
  const change = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
  return <section><div onClick={() => change(true)}>{trigger || <button>Create workspace</button>}</div>{(controlled ?? open) && <form onSubmit={async e => { e.preventDefault(); try { await create.mutateAsync({ name }); await refreshSession(); change(false); } catch { setError('Workspace could not be created.'); } }}><h2>Create workspace</h2><label>Workspace name<input value={name} onChange={e => setName(e.target.value)} required /></label><button disabled={create.isPending}>Create workspace</button><button type="button" onClick={() => change(false)}>Cancel</button>{error && <p role="alert">{error}</p>}</form>}</section>;
}

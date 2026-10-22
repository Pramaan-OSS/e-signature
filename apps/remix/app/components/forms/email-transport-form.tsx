import { useState } from 'react';
import type { ReactNode } from 'react';
export type EmailTransportFormValues = { name: string; fromName: string; fromAddress: string; type: 'PRAMAAN' };
export const emailTransportFormToConfig = (_values: EmailTransportFormValues) => ({ type: 'PRAMAAN' as const });
export function EmailTransportForm({ defaultValues, onFormSubmit, formSubmitTrigger }: { defaultValues?: Partial<EmailTransportFormValues>; isEdit?: boolean; onFormSubmit(values: EmailTransportFormValues): Promise<void>; formSubmitTrigger?: ReactNode }) {
  const [values, setValues] = useState<EmailTransportFormValues>({ name: '', fromName: '', fromAddress: '', type: 'PRAMAAN', ...defaultValues });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onFormSubmit(values); } catch { setError('Sender could not be saved.'); } finally { setBusy(false); } }}>
    <p>All email uses your workspace connection.</p>
    <label>Sender label<input value={values.name} onChange={e => setValues({ ...values, name: e.target.value })} required /></label>
    <label>From name<input value={values.fromName} onChange={e => setValues({ ...values, fromName: e.target.value })} required /></label>
    <label>From address<input type="email" value={values.fromAddress} onChange={e => setValues({ ...values, fromAddress: e.target.value })} required /></label>
    {formSubmitTrigger || <button disabled={busy}>Save sender</button>}{busy && <p>Saving your sender.</p>}{error && <p role="alert">{error}</p>}
  </form>;
}

import { getSession } from '@e-sign/auth/server/lib/utils/get-session';
import { formatPath, NEXT_PUBLIC_WEBAPP_URL } from '@e-sign/lib/constants/app';
import { pramaanConfigured } from '@e-sign/lib/server-only/pramaan';
import { manageOwnedOutcome, runOwnedOperation } from '@e-sign/lib/server-only/pramaan/operations';
import { getTeamByUrl } from '@e-sign/lib/server-only/team/get-team';
import { ConnectionAccessNotice } from '@e-sign/lib/universal/apps/access-notice';
import { appExecutionOutput, catalogueActions } from '@e-sign/lib/universal/apps/catalogue';
import { emailDeliveryTrackable } from '@e-sign/lib/universal/email/tracking';
import { EstimatePrice } from '@e-sign/lib/universal/estimate-price';
import { prisma } from '@e-sign/prisma';
import { useState } from 'react';
import { useFetcher, useLoaderData, useRevalidator } from 'react-router';
import type { Route } from './+types/actions';

const choices = [
  ['send-signature', 'Send a hosted copy'],
  ['signature-status', 'Check signing'],
  ['signature-download', 'Download signed result'],
  ['signature-audit', 'Read signing audit'],
  ['signature-remind', 'Remind a signer'],
  ['signature-cancel', 'Stop signing'],
  ['create-template', 'Save a hosted template'],
  ['template-status', 'Read a hosted template'],
  ['send-template', 'Send a hosted template'],
  ['verify-identity', 'Verify a consenting signer'],
  ['identity-status', 'Check identity verification'],
  ['sms-reminder', 'Send a text reminder'],
  ['sms-status', 'Check text delivery'],
  ['email-status', 'Check email delivery'],
  ['extract-document', 'Read document details'],
  ['extract-contract', 'Read contract terms'],
  ['extract-signatures', 'Extract signature images'],
  ['connect-app', 'Connect an app'],
  ['list-app-connections', 'Check connected accounts'],
  ['revoke-app-connection', 'Disconnect an app'],
  ['list-app-actions', 'Search connected app actions'],
  ['run-app-action', 'Run a connected app action'],
  ['upload-storage', 'Save a document in file storage'],
] as const;
export async function loader({ request, params }: Route.LoaderArgs) {
  const { user } = await getSession(request);
  const team = await getTeamByUrl({ userId: user.id, teamUrl: params.teamUrl! });
  const operations = await prisma.capabilityOperation.findMany({
    where: {
      userId: user.id,
      teamId: team.id,
      action: { notIn: ['signature.digest.sign', 'signature.timestamp.create'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const documents = await prisma.envelope.findMany({
    where: { userId: user.id, teamId: team.id, deletedAt: null },
    select: { id: true, title: true, status: true, recipients: { select: { id: true, name: true } } },
    take: 100,
  });
  return { enabled: pramaanConfigured(), documents, operations, nextOperationId: crypto.randomUUID() };
}
export async function action({ request, params }: Route.ActionArgs) {
  const { user, session } = await getSession(request);
  const team = await getTeamByUrl({ userId: user.id, teamUrl: params.teamUrl! });
  const form = await request.formData();
  const value = (key: string) => String(form.get(key) || '') || undefined;
  try {
    if (form.get('intent') === 'check-outcome' || form.get('intent') === 'cancel-outcome') {
      const result = await manageOwnedOutcome(
        value('operationId') || '',
        user.id,
        team.id,
        form.get('intent') === 'cancel-outcome',
      );
      return { result, error: undefined };
    }
    const input = {
      action: value('action'),
      operationId: value('operationId'),
      envelopeId: value('envelopeId'),
      sourceOperationId: value('sourceOperationId'),
      recipientId: value('recipientId') ? Number(value('recipientId')) : undefined,
      title: value('title'),
      subject: value('subject'),
      message: value('message'),
      email: value('email'),
      phone: value('phone'),
      query: value('query'),
      app: value('app'),
      appAction: value('appAction'),
      cursor: value('cursor'),
      readDownloadedFiles: form.get('readDownloadedFiles') === 'on',
      arguments: value('arguments') ? JSON.parse(value('arguments')!) : undefined,
      consent: form.get('consent') === 'on',
      approveOutcome: form.get('approveOutcome') === 'yes',
      confirm: form.get('confirm') === 'on',
    };
    const result = await runOwnedOperation(
      input,
      user.id,
      team.id,
      new URL(formatPath(`/t/${team.url}/actions`), NEXT_PUBLIC_WEBAPP_URL()).toString(),
      { key: `${user.id}:${team.id}:${session.id}`, expiresAt: session.expiresAt.getTime() },
    );
    return { result, error: undefined };
  } catch {
    return { result: undefined, error: 'Check your choices and workspace permissions.' };
  }
}
export default function Actions() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const jobFetcher = useFetcher<typeof action>();
  const refresh = useRevalidator();
  const [selected, setSelected] = useState('send-signature');
  const [envelopeId, setEnvelopeId] = useState('');
  const [appSlug, setAppSlug] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [actionKey, setActionKey] = useState('');
  const savedCatalogue = data.operations.find(
    (o) => o.id === sourceId && o.action === 'list-app-actions' && o.state === 'done',
  );
  const availableActions = catalogueActions(savedCatalogue?.result);
  const selectedAction = availableActions.find((a) => a.action === actionKey);
  const appActionReady =
    selected !== 'run-app-action' ||
    Boolean(
      selectedAction?.inputSchema &&
        typeof selectedAction.inputSchema === 'object' &&
        !Array.isArray(selectedAction.inputSchema),
    );
  const appSlugs = [...new Set(data.operations.flatMap((o) => catalogueActions(o.result).map((a) => a.app)))];
  const [operationId, setOperationId] = useState(() => data.nextOperationId);
  const document = data.documents.find((d) => d.id === envelopeId);
  const busy = fetcher.state !== 'idle';
  const planned =
    fetcher.data?.result?.state === 'planned' && fetcher.data.result.id === operationId
      ? (fetcher.data.result.result as unknown as {
          input: { phone: string; message: string };
          steps: string[];
          priceMaxMicro: number;
          priceTypicalMicro?: number;
          expiresAt: number;
        })
      : undefined;
  return (
    <main className="capability-workspace" data-thread-none>
      <header>
        <h1>Workspace actions</h1>
        <p>Send hosted copies, check progress and connect your tools.</p>
        <p>Hosted requests are separate from your local signing drafts.</p>
      </header>
      {!data.enabled && <p>Add your workspace connection key to enable these actions.</p>}
      <fetcher.Form
        method="post"
        className="capability-form"
        onChange={(event) => {
          if (fetcher.data && (event.target as unknown as { name?: string }).name !== 'confirm') {
            setOperationId(crypto.randomUUID());
          }
        }}
      >
        <input type="hidden" name="operationId" value={operationId} />
        <label>
          Action
          <select name="action" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {choices
              .filter(
                ([id]) =>
                  id !== 'email-status' ||
                  data.operations.some(
                    (o) => o.action === 'email-notification' && o.state === 'done' && emailDeliveryTrackable(o.result),
                  ),
              )
              .map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label>
          Document
          <select name="envelopeId" value={envelopeId} onChange={(e) => setEnvelopeId(e.target.value)}>
            <option value="">Choose a document</option>
            {data.documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Saved request
          <select
            name="sourceOperationId"
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              setActionKey('');
            }}
          >
            <option value="">Choose a saved request</option>
            {data.operations
              .filter(
                (o) =>
                  o.state === 'done' &&
                  (selected !== 'email-status' ||
                    (o.action === 'email-notification' && emailDeliveryTrackable(o.result))),
              )
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {choices.find((c) => c[0] === o.action)?.[1] || 'Email notification'} ·{' '}
                  {new Date(o.createdAt).toLocaleString()}
                </option>
              ))}
          </select>
        </label>
        {selected === 'verify-identity' && (
          <label>
            Signer
            <select name="recipientId">
              <option value="">Choose a signer</option>
              {document?.recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || 'Unnamed signer'}
                </option>
              ))}
            </select>
          </label>
        )}
        {['send-signature', 'send-template', 'create-template'].includes(selected) && (
          <>
            <label>
              Title
              <input name="title" />
            </label>
            <label>
              Email subject
              <input name="subject" />
            </label>
          </>
        )}
        {['signature-remind'].includes(selected) && (
          <label>
            Signer email
            <input name="email" type="email" />
          </label>
        )}
        {selected === 'sms-reminder' && (
          <label>
            Phone number
            <input name="phone" type="tel" placeholder="+441234567890" />
          </label>
        )}
        {['connect-app', 'list-app-actions', 'list-app-connections', 'revoke-app-connection'].includes(selected) && (
          <label>
            Connected app key
            <input
              name="app"
              list="catalogue-apps"
              value={appSlug}
              onChange={(event) => setAppSlug(event.target.value)}
            />
            <datalist id="catalogue-apps">
              {appSlugs.map((app) => (
                <option key={app} value={app} />
              ))}
            </datalist>
            <small>Use the app slug from the catalogue, keeping any underscores.</small>
          </label>
        )}
        {selected === 'connect-app' && <ConnectionAccessNotice app={appSlug} />}
        {selected === 'run-app-action' && (
          <p>
            Every action requires your approval. Actions that create, change, send or delete are not yet live-verified.
          </p>
        )}
        {selected === 'list-app-actions' && (
          <label>
            Search keyword
            <input name="query" required maxLength={200} />
            <small>
              Each new page uses your workspace balance. Load more when needed; pages already loaded in this sign-in
              session are reused.
            </small>
          </label>
        )}
        {selected === 'run-app-action' && (
          <>
            <label>
              Available action
              <select name="appAction" value={actionKey} onChange={(event) => setActionKey(event.target.value)}>
                <option value="">Choose an action from the saved search</option>
                {availableActions.map((a) => (
                  <option key={a.action} value={a.action}>
                    {a.description || a.action}
                  </option>
                ))}
              </select>
            </label>
            {selectedAction && (
              <details open>
                <summary>Expected inputs</summary>
                {selectedAction.inputSchema ? (
                  <pre>{JSON.stringify(selectedAction.inputSchema, null, 2)}</pre>
                ) : (
                  <p>This action has no input schema. Choose another action.</p>
                )}
              </details>
            )}
            <label>
              <input type="checkbox" name="readDownloadedFiles" /> Read returned files as text
              <small>
                Reads platform file handles after this action. Parsing uses your workspace balance; a failed copy does
                not run the action again.
              </small>
            </label>
            <label>
              Action details
              <textarea name="arguments" placeholder="{}" />
            </label>
          </>
        )}
        <label>
          Message or instructions
          <textarea name="message" rows={3} />
        </label>
        {['verify-identity', 'sms-reminder', 'extract-signatures'].includes(selected) && (
          <label>
            <input name="consent" type="checkbox" />
            The recipient agrees to this action.
          </label>
        )}
        <label>
          <input name="confirm" type="checkbox" />I approve sending messages or changing this request.
        </label>
        {planned && (
          <section aria-label="Reminder estimate">
            <h2>Review before sending</h2>
            <p>To: {planned.input.phone}</p>
            <p>{planned.input.message}</p>
            <ul>
              {planned.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <EstimatePrice {...planned} />
            <p>Approval expires at {new Date(planned.expiresAt).toLocaleTimeString()}.</p>
            <p>Confirm the message above, then approve sending.</p>
          </section>
        )}
        <button
          data-thread
          type="submit"
          name="approveOutcome"
          value={planned ? 'yes' : 'no'}
          disabled={!data.enabled || busy || !appActionReady}
        >
          {planned
            ? 'Approve estimate and send'
            : selected === 'sms-reminder'
              ? 'Review reminder estimate'
              : 'Run selected action'}
        </button>
        {!appActionReady && <small>Select a saved catalogue search and an action with an input schema.</small>}
        {(!data.enabled || busy) && (
          <small>{busy ? 'Your request is still working.' : 'Add your connection key first.'}</small>
        )}
        {busy && <p role="status">Working. Your request is saved.</p>}
        {fetcher.data?.error && <p role="alert">{fetcher.data.error}</p>}
        {fetcher.data?.result && (
          <p role="status">
            {fetcher.data.result.state === 'planned'
              ? 'Review the estimate before approving.'
              : fetcher.data.result.state === 'waiting'
                ? 'The service is busy. Try again later.'
                : fetcher.data.result.state === 'done'
                  ? 'Done. Your action was accepted. Check its saved result.'
                  : fetcher.data.result.state === 'failed'
                    ? `Failed. ${fetcher.data.result.error || 'Try again.'}`
                    : 'Blocked. Check the request before trying again.'}
          </p>
        )}
      </fetcher.Form>
      <section>
        <h2>Saved requests</h2>
        <button type="button" onClick={() => refresh.revalidate()} disabled={refresh.state !== 'idle'}>
          Refresh saved requests
        </button>
        {jobFetcher.data?.error && <p role="alert">{jobFetcher.data.error}</p>}
        {jobFetcher.data?.result?.error && <p role="status">{jobFetcher.data.result.error}</p>}
        {data.operations.length === 0 && <p>Your requests appear here.</p>}
        {data.operations.map((o) => (
          <article key={o.id}>
            <h3>{choices.find((c) => c[0] === o.action)?.[1] || 'Email notification'}</h3>
            <p>
              {o.state === 'done'
                ? ['send-signature', 'send-template', 'verify-identity', 'sms-reminder', 'email-notification'].includes(
                    o.action,
                  ) &&
                  !['completed', 'approved', 'delivered'].includes(
                    String((o.result as { status?: string } | null)?.status),
                  )
                  ? 'Waiting'
                  : 'Done'
                : o.state === 'planned'
                  ? 'Awaiting approval'
                  : o.state === 'waiting'
                    ? 'Try later'
                    : o.state === 'working'
                      ? 'Working'
                      : o.state === 'failed'
                        ? 'Failed'
                        : 'Blocked'}
              . {o.error || 'Your request is saved.'}
            </p>
            {o.action === 'sms-reminder' && typeof (o.result as { jobId?: unknown } | null)?.jobId === 'string' && (
              <>
                <p>Long runs can take up to 35 minutes. Cancellation does not undo completed steps.</p>
                <button
                  type="button"
                  disabled={jobFetcher.state !== 'idle'}
                  onClick={() => jobFetcher.submit({ intent: 'check-outcome', operationId: o.id }, { method: 'post' })}
                >
                  Check saved run
                </button>
                {['working', 'blocked'].includes(o.state) &&
                  (o.result as { jobStatus?: string } | null)?.jobStatus == null && (
                    <button
                      type="button"
                      disabled={jobFetcher.state !== 'idle'}
                      onClick={() =>
                        jobFetcher.submit({ intent: 'cancel-outcome', operationId: o.id }, { method: 'post' })
                      }
                    >
                      Cancel saved run
                    </button>
                  )}
              </>
            )}
            {(o.result as { needsCheck?: boolean } | null)?.needsCheck && (
              <p role="alert">
                A step may have acted. Check before retrying. This request will not be sent again automatically.
              </p>
            )}
            {o.action === 'list-app-actions' &&
              o.state === 'done' &&
              (() => {
                const r = o.result as {
                  nextCursor?: string;
                  query?: string;
                  app?: string;
                  cursorExpiresAt?: number;
                } | null;
                if (!r?.nextCursor || !r.query) {
                  return null;
                }
                const expired = !r.cursorExpiresAt || r.cursorExpiresAt <= Date.now();
                return (
                  <>
                    <button
                      type="button"
                      disabled={!data.enabled || busy || expired}
                      onClick={() =>
                        fetcher.submit(
                          {
                            action: 'list-app-actions',
                            operationId: crypto.randomUUID(),
                            sourceOperationId: o.id,
                            query: r.query!,
                            app: r.app || '',
                            cursor: r.nextCursor!,
                          },
                          { method: 'post' },
                        )
                      }
                    >
                      Load more actions
                    </button>
                    <small>
                      {expired
                        ? 'This search expired. Start a new search.'
                        : 'Loads one paid page; previously loaded pages are reused for this session.'}
                    </small>
                  </>
                );
              })()}
            {o.result != null &&
              typeof o.result === 'object' &&
              !Array.isArray(o.result) &&
              (() => {
                const r = o.result as Record<string, unknown>;
                if (o.action === 'connect-app' && typeof r.connectUrl === 'string') {
                  return (
                    <ConnectionAccessNotice app={typeof r.app === 'string' ? r.app : ''} connectUrl={r.connectUrl} />
                  );
                }
                const url = r.connectUrl || r.verificationUrl || (r.file as { url?: string } | undefined)?.url;
                return typeof url === 'string' && url.startsWith('https://') ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    Open saved result
                  </a>
                ) : null;
              })()}
            {o.action === 'run-app-action' &&
              (() => {
                const output = appExecutionOutput(o.result);
                return (
                  <>
                    {output.displayUrl && (
                      <a href={output.displayUrl} target="_blank" rel="noopener noreferrer">
                        Open app result
                      </a>
                    )}
                    {Array.isArray((o.result as { fileTexts?: unknown })?.fileTexts) && (
                      <details open>
                        <summary>Returned file text</summary>
                        <pre>{JSON.stringify((o.result as { fileTexts: unknown }).fileTexts, null, 2)}</pre>
                      </details>
                    )}
                    {output.results.length > 0 && (
                      <details>
                        <summary>Returned items ({output.results.length})</summary>
                        <pre>{JSON.stringify(output.results, null, 2)}</pre>
                      </details>
                    )}
                  </>
                );
              })()}
            <details>
              <summary>Details</summary>
              <pre>
                {JSON.stringify(
                  ['planned', 'waiting'].includes(o.state) ? { message: 'Estimate awaiting approval.' } : o.result,
                  null,
                  2,
                )}
              </pre>
            </details>
          </article>
        ))}
      </section>
      <section>
        <h2>Unavailable features</h2>
        <p>Cloud certificate signing, trusted timestamps and external organisation sign-in are unavailable.</p>
        <p>
          Files above 25 MB use resumable multipart storage. Large documents also keep a database copy for reading;
          refused uploads can stay in the database.
        </p>
        <p>Challenge verification is ready. Captcha stays off until hosted challenges are available.</p>
      </section>
    </main>
  );
}

import { buildTransport } from '@e-sign/email/transports/build-transport';
import { afterEach, expect, it, vi } from 'vitest';
import { MANAGED_EMAIL_ADDRESS, MANAGED_EMAIL_DOMAIN, MANAGED_EMAIL_FROM } from '../../constants/email';
import { emailDeliveryTrackable } from '../../universal/email/tracking';
import { setPramaanClientForTests } from '../pramaan';
import { capabilityJobContext } from './job-context';

const savedMail = vi.hoisted(() => new Map<string, any>());
vi.mock('@e-sign/prisma', () => ({
  prisma: {
    capabilityOperation: {
      findUnique: async ({ where }: any) => savedMail.get(where.id),
      create: async ({ data }: any) => {
        if (savedMail.has(data.id)) {
          throw new Error('Already claimed');
        }
        savedMail.set(data.id, data);
        return data;
      },
      upsert: async ({ where, create, update }: any) => {
        const row = savedMail.has(where.id) ? { ...savedMail.get(where.id), ...update } : create;
        savedMail.set(where.id, row);
        return row;
      },
    },
  },
}));
const call = vi.fn(async (_id: string, _input: unknown, _options?: unknown) => ({ status: 'sent', ref: 'owned_mail' }));
afterEach(() => {
  setPramaanClientForTests(undefined);
  call.mockClear();
  savedMail.clear();
});
it('keeps hidden recipients private and preserves reply/thread headers', async () => {
  setPramaanClientForTests({ call } as never);
  await buildTransport().sendMail({
    from: 'sender@example.test',
    to: 'visible@example.test',
    cc: 'copy@example.test',
    bcc: 'hidden@example.test',
    replyTo: 'reply@owner.org',
    subject: 'Agreement',
    text: 'Read it',
    inReplyTo: '<parent@example.test>',
    references: ['<parent@example.test>'],
  });
  expect(call.mock.calls[0]).toMatchObject([
    'email.send',
    {
      to: ['visible@example.test'],
      cc: ['copy@example.test'],
      bcc: ['hidden@example.test'],
      replyTo: 'reply@owner.org',
      inReplyTo: '<parent@example.test>',
      references: ['<parent@example.test>'],
    },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  ]);
});
it('uses the same action key when a queued email job retries', async () => {
  setPramaanClientForTests({ call } as never);
  for (let i = 0; i < 2; i++) {
    await capabilityJobContext.run('job:notification', () =>
      buildTransport().sendMail({
        from: 'sender@example.test',
        to: 'visible@example.test',
        subject: 'Agreement',
        text: 'Read it',
      }),
    );
  }
  expect((call.mock.calls as unknown[][])[0][2]).toEqual((call.mock.calls as unknown[][])[1][2]);
});

it('preserves display names while constructing sender and all envelope recipients', async () => {
  setPramaanClientForTests({ call } as never);
  const result = await buildTransport().sendMail({
    from: '"Agreement, Team" <sender@example.test>',
    to: '"Recipient, One" <visible@example.test>',
    cc: { name: 'Copy Recipient', address: 'copy@example.test' },
    bcc: { name: 'Hidden Recipient', address: 'hidden@example.test' },
    replyTo: { name: 'Replies', address: 'reply@owner.org' },
    subject: 'Agreement',
    text: 'Read it',
  });
  expect(result.envelope).toEqual({
    from: 'sender@example.test',
    to: ['visible@example.test', 'copy@example.test', 'hidden@example.test'],
  });
  expect(result.accepted).toEqual(result.envelope.to);
  expect(call.mock.calls[0]).toMatchObject([
    'email.send',
    {
      from: MANAGED_EMAIL_FROM,
      to: ['"Recipient, One" <visible@example.test>'],
      cc: ['copy@example.test'],
      bcc: ['hidden@example.test'],
      replyTo: 'reply@owner.org',
    },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  ]);
});

it('preserves local attachments and inline content with reply and thread headers', async () => {
  setPramaanClientForTests({ call } as never);
  await buildTransport().sendMail({
    from: 'sender@example.test',
    to: 'visible@example.test',
    subject: 'Agreement',
    text: Buffer.from('Read it'),
    html: '<p>Read it</p>',
    inReplyTo: '<parent@example.test>',
    references: ['<first@example.test>', '<parent@example.test>'],
    attachments: [
      { filename: 'agreement.pdf', content: Buffer.from('%PDF-local'), contentType: 'application/pdf' },
      {
        filename: 'logo.png',
        content: 'aW1hZ2U=',
        encoding: 'base64',
        contentType: 'image/png',
        cid: 'logo',
        contentDisposition: 'inline',
      },
    ],
  });
  expect(call.mock.calls[0]).toMatchObject([
    'email.message.send',
    {
      text: 'Read it',
      html: '<p>Read it</p>',
      inReplyTo: '<parent@example.test>',
      references: ['<first@example.test>', '<parent@example.test>'],
      attachments: [
        {
          filename: 'agreement.pdf',
          content: Buffer.from('%PDF-local').toString('base64'),
          mimeType: 'application/pdf',
          inline: false,
        },
        { filename: 'logo.png', content: 'aW1hZ2U=', mimeType: 'image/png', contentId: 'logo', inline: true },
      ],
    },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  ]);
});

it('refuses attachment paths before any sending call', async () => {
  setPramaanClientForTests({ call } as never);
  await expect(
    buildTransport().sendMail({
      from: 'sender@example.test',
      to: 'visible@example.test',
      attachments: [{ path: 'https://example.test/file.pdf' }],
    }),
  ).rejects.toThrow('Email could not be sent');
  expect(call).not.toHaveBeenCalled();
});

it.each([
  ['"user"@example.test(x)evil.test', 'user@example.test'],
  ['"a"@b.test(c)d.test(e)f.test', 'a@b.test'],
])('keeps trailing comments out of the quoted local-part envelope: %s', async (recipient, expected) => {
  setPramaanClientForTests({ call } as never);
  const result = await buildTransport().sendMail({
    from: 'sender@example.test',
    to: recipient,
    subject: 'Agreement',
    text: 'Read it',
  });
  expect(result.envelope.to).toEqual([expected]);
  expect(result.envelope.to[0]).not.toMatch(/\s/);
  expect(result.accepted).toEqual([expected]);
});

it('parses a pathological comment-joined address within a bounded isolated process', async () => {
  const { execFileSync } = await import('node:child_process');
  const { createRequire } = await import('node:module');
  const parserPath = createRequire(import.meta.url).resolve('nodemailer/lib/addressparser');
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      `
    const parse = require(${JSON.stringify(parserPath)});
    const result = parse('a' + '@b(c)'.repeat(130000));
    process.stdout.write(JSON.stringify({ count: result.length, length: result[0].address.length }));
  `,
    ],
    { timeout: 2000, encoding: 'utf8' },
  );
  expect(JSON.parse(output)).toEqual({ count: 1, length: 260001 });
});

const completionMail = (bytes = Buffer.from('%PDF-completed')) => ({
  from: 'sender@example.test',
  to: 'visible@example.test',
  subject: 'Signing complete',
  text: 'Download securely: https://app.example.test/sign/opaque/complete',
  html: '<a href="https://app.example.test/sign/opaque/complete">Download</a>',
  headers: { 'X-ESign-Completed-Document': 'true' },
  attachments: [{ filename: 'completed.pdf', content: bytes, contentType: 'application/pdf' }],
});
it('uploads a completed PDF and sends its file handle while retaining the secure link', async () => {
  const upload = vi.fn(async () => ({ fileId: 'file_completed', url: 'https://platform.example.test/files/private' }));
  setPramaanClientForTests({ call, files: { upload } } as never);
  await buildTransport().sendMail(completionMail());
  expect(upload).toHaveBeenCalledWith(Buffer.from('%PDF-completed'), 'application/pdf', 'document', 6_000_000);
  expect(call.mock.calls[0]).toMatchObject([
    'email.send',
    { attachments: [{ fileId: 'file_completed', name: 'completed.pdf' }], text: completionMail().text },
    { idempotencyKey: expect.stringMatching(/:attachments$/) },
  ]);
  expect(JSON.stringify(call.mock.calls)).not.toContain('/files/private');
});
it.each([
  6_000_001, 7_000_000,
])('keeps the secure link and does not upload an over-limit %s-byte attachment', async (size) => {
  const upload = vi.fn();
  setPramaanClientForTests({ call, files: { upload } } as never);
  await buildTransport().sendMail(completionMail(Buffer.alloc(size)));
  expect(upload).not.toHaveBeenCalled();
  expect(call).toHaveBeenCalledOnce();
  expect(call.mock.calls[0][0]).toBe('email.send');
  expect(call.mock.calls[0][1]).not.toHaveProperty('attachments');
  expect(call.mock.calls[0][1]).toHaveProperty('text', completionMail().text);
});
it.each([
  'invalid_request',
  'upstream_unavailable',
])('falls back to the secure link after a confirmed %s refusal', async (code) => {
  const upload = vi.fn(async () => ({ fileId: 'file_completed', url: 'https://platform.example.test/files/private' }));
  call.mockRejectedValueOnce({ code, effect: 'none' });
  setPramaanClientForTests({ call, files: { upload } } as never);
  await buildTransport().sendMail(completionMail());
  expect(call).toHaveBeenCalledTimes(2);
  expect(call.mock.calls[1][1]).not.toHaveProperty('attachments');
  expect(call.mock.calls[1][1]).toHaveProperty('text', completionMail().text);
  expect(call.mock.calls[0][2]).not.toEqual(call.mock.calls[1][2]);
});
it('does not send a second email after an uncertain attachment-send response', async () => {
  const upload = vi.fn(async () => ({ fileId: 'file_completed', url: 'https://platform.example.test/files/private' }));
  call.mockRejectedValueOnce({ code: 'upstream_unavailable' });
  setPramaanClientForTests({ call, files: { upload } } as never);
  await expect(buildTransport().sendMail(completionMail())).rejects.toThrow('Check its status');
  expect(call).toHaveBeenCalledOnce();
});

it('a confirmed link fallback is not resent with attachments on a later queued retry', async () => {
  const upload = vi.fn(async () => ({ fileId: 'file_completed', url: 'https://platform.example.test/files/private' }));
  call.mockRejectedValueOnce({ code: 'invalid_request', effect: 'none' });
  setPramaanClientForTests({ call, files: { upload } } as never);
  const mail = {
    ...completionMail(),
    headers: { ...completionMail().headers, 'X-ESign-Sender-User-Id': '1', 'X-ESign-Team-Id': '2' },
  };
  for (let i = 0; i < 2; i++) {
    await capabilityJobContext.run('job:completed', () => buildTransport().sendMail(mail));
  }
  expect(call).toHaveBeenCalledTimes(2);
  expect(upload).toHaveBeenCalledOnce();
  expect([...savedMail.values()][0].state).toBe('done');
});
it('an uncertain queued completion email stays saved without an automatic resend', async () => {
  const upload = vi.fn(async () => ({ fileId: 'file_completed', url: 'https://platform.example.test/files/private' }));
  call.mockRejectedValueOnce({ code: 'upstream_timeout' });
  setPramaanClientForTests({ call, files: { upload } } as never);
  const mail = {
    ...completionMail(),
    headers: { ...completionMail().headers, 'X-ESign-Sender-User-Id': '1', 'X-ESign-Team-Id': '2' },
  };
  for (let i = 0; i < 2; i++) {
    await expect(
      capabilityJobContext.run('job:uncertain-completed', () => buildTransport().sendMail(mail)),
    ).rejects.toThrow('Check its status');
  }
  expect(call).toHaveBeenCalledOnce();
  expect([...savedMail.values()][0].state).not.toBe('done');
});

it('applies the total byte and file-count limits across all completed PDFs', async () => {
  const upload = vi.fn();
  setPramaanClientForTests({ call, files: { upload } } as never);
  for (const attachments of [
    Array.from({ length: 11 }, () => completionMail().attachments[0]),
    [completionMail(Buffer.alloc(3_000_001)).attachments[0], completionMail(Buffer.alloc(3_000_000)).attachments[0]],
  ]) {
    await buildTransport().sendMail({ ...completionMail(), attachments });
  }
  expect(upload).not.toHaveBeenCalled();
  expect(call).toHaveBeenCalledTimes(2);
  for (const [, input] of call.mock.calls) {
    expect(input).not.toHaveProperty('attachments');
  }
});
it('attaches a completed PDF exactly at the byte limit', async () => {
  const upload = vi.fn(async () => ({ fileId: 'file_completed' }));
  setPramaanClientForTests({ call, files: { upload } } as never);
  await buildTransport().sendMail(completionMail(Buffer.alloc(6_000_000)));
  expect(upload).toHaveBeenCalledOnce();
  expect(call.mock.calls[0][1]).toHaveProperty('attachments');
});
it('keeps the secure link when staging the PDF is unavailable', async () => {
  const upload = vi.fn(async () => {
    throw new Error('Not available yet');
  });
  setPramaanClientForTests({ call, files: { upload } } as never);
  await buildTransport().sendMail(completionMail());
  expect(call).toHaveBeenCalledOnce();
  expect(call.mock.calls[0][1]).not.toHaveProperty('attachments');
  expect(call.mock.calls[0][1]).toHaveProperty('text', completionMail().text);
});

it('uses the template sending domain and keeps the owner address for replies', async () => {
  expect(MANAGED_EMAIL_DOMAIN.split('.')).toEqual(['updates', 'pramaan', 'one']);
  expect(MANAGED_EMAIL_FROM).toBe(`e-sign <noreply@${MANAGED_EMAIL_DOMAIN}>`);
  setPramaanClientForTests({ call } as never);
  await buildTransport().sendMail({
    from: { name: 'Owner', address: 'owner@owner.org' },
    to: 'recipient@example.test',
    subject: 'Confirmation',
    text: 'Confirm your account',
  });
  expect(call.mock.calls[0]).toMatchObject([
    'email.send',
    { from: MANAGED_EMAIL_FROM, replyTo: 'owner@owner.org' },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  ]);
});
it('retains an explicit reply address with the managed default sender', async () => {
  setPramaanClientForTests({ call } as never);
  await buildTransport().sendMail({
    from: { name: 'e-sign', address: MANAGED_EMAIL_ADDRESS },
    replyTo: 'owner@owner.org',
    to: 'recipient@example.test',
    subject: 'Confirmation',
    text: 'Confirm your account',
  });
  expect(call.mock.calls[0]).toMatchObject([
    'email.send',
    { from: MANAGED_EMAIL_FROM, replyTo: 'owner@owner.org' },
    expect.anything(),
  ]);
});
it('does not use a subdomain as the managed sending domain', async () => {
  setPramaanClientForTests({ call } as never);
  await buildTransport().sendMail({
    from: `owner@other.${MANAGED_EMAIL_DOMAIN}`,
    to: 'recipient@example.test',
    subject: 'Confirmation',
    text: 'Confirm',
  });
  expect(call.mock.calls[0]).toMatchObject([
    'email.send',
    { from: MANAGED_EMAIL_FROM, replyTo: `owner@other.${MANAGED_EMAIL_DOMAIN}` },
    expect.anything(),
  ]);
});

it.each([
  'hello@example.test',
  'hello@example.com',
  'hello@sub.example.com',
  'hello@owner.test',
  'hello@owner.invalid',
  'hello@owner.localhost',
])('omits placeholder reply address %s', async (address) => {
  setPramaanClientForTests({ call } as never);
  await buildTransport().sendMail({
    from: address,
    replyTo: address,
    to: 'recipient@example.test',
    subject: 'Confirmation',
    text: 'Confirm',
  });
  expect(call.mock.calls[0][1]).toMatchObject({ from: MANAGED_EMAIL_FROM });
  expect(call.mock.calls[0][1]).toHaveProperty('replyTo', undefined);
});

it.each([true, false, undefined])('preserves tracking eligibility from the send receipt: %s', async (trackable) => {
  const send = vi
    .fn()
    .mockResolvedValue({ status: 'queued', ref: 'owned_mail', ...(trackable === undefined ? {} : { trackable }) });
  setPramaanClientForTests({ call: send } as never);
  await buildTransport().sendMail({
    from: MANAGED_EMAIL_FROM,
    to: 'recipient@example.test',
    subject: 'Notification',
    text: 'Saved notification',
    headers: { 'X-ESign-Sender-User-Id': '1', 'X-ESign-Team-Id': '2' },
  });
  const receipt = [...savedMail.values()][0].result;
  expect(receipt.trackable).toBe(trackable === true);
  expect(emailDeliveryTrackable(receipt)).toBe(trackable === true);
  expect(send).toHaveBeenCalledOnce();
});

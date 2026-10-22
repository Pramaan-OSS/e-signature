import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import { pdfToContractText } from '../ai/pdf-to-images';
import { setPramaanClientForTests } from '../pramaan';
import { executeAction } from './actions';

afterEach(() => setPramaanClientForTests(undefined));
it('sends locally read contract text instead of a PDF exceeding the base64 contract limit', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Agreement effective October 18, 2026.', { font });
  const bytes = await pdf.save();
  expect(Buffer.from(bytes).toString('base64').length).toBeGreaterThan(512);
  const call = vi.fn(async (_id: string, input: any) => {
    expect(input).not.toHaveProperty('base64');
    expect(input.text.length).toBeLessThanOrEqual(20_000);
    return { effectiveDate: '2026-10-18' };
  });
  setPramaanClientForTests({ call } as never);
  await expect(
    executeAction({ action: 'extract-contract', operationId: crypto.randomUUID(), envelopeId: 'owned' }, {
      envelope: async () => ({ documents: [{ bytes }] }),
    } as never),
  ).resolves.toEqual({ effectiveDate: '2026-10-18' });
  expect(call).toHaveBeenCalledWith(
    'document.contract.extract',
    { text: 'Agreement effective October 18, 2026.' },
    undefined,
  );
});
it('refuses a document without selectable contract text', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await expect(pdfToContractText(await pdf.save())).rejects.toThrow('selectable text');
});
it('refuses over-limit text without silently shortening the contract', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 21; i++) {
    pdf.addPage().drawText('x'.repeat(1000), { font, size: 1 });
  }
  await expect(pdfToContractText(await pdf.save())).rejects.toThrow('20,000 characters');
});

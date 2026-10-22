import { PDFDocument } from '@cantoo/pdf-lib';
import sharp from 'sharp';
import { resizeDocumentImage } from '../../../../utils/images/resize-document-image';
import { extractDocument } from '../../../pramaan/extract';
import { buildRecipientContextMessage } from './helpers';
import type { RecipientContext } from './types';

export async function detectFieldsFromPage({
  image,
  pageNumber,
  recipients,
  context,
}: {
  image: Buffer;
  pageNumber: number;
  recipients: RecipientContext[];
  context?: string;
}) {
  // Preserve the masked, normalized page while sending an actual PDF document.
  const normalized = await resizeDocumentImage({ image });
  const png = await sharp(normalized).png().toBuffer();
  const document = await PDFDocument.create();
  const bitmap = await document.embedPng(png);
  document.addPage([1000, 1000]).drawImage(bitmap, { x: 0, y: 0, width: 1000, height: 1000 });
  const result = await extractDocument(
    await document.save(),
    'pdf',
    'field-detection',
    `Detect empty fillable fields on page ${pageNumber}. Use box2d [yMin,xMin,yMax,xMax] on a 0–1000 scale. Exclude labels, filled content and solid black rectangles. ${buildRecipientContextMessage(recipients)} ${context || ''}`,
  );
  return result.fields;
}

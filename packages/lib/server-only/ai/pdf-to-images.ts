import pMap from 'p-map';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Canvas, Image, Path2D } from 'skia-canvas';
import { DocumentExtractionError } from '../pramaan/extract';

// @ts-expect-error napi-rs/canvas satisfies the requirements
globalThis.Path2D = Path2D;
// @ts-expect-error napi-rs/canvas satisfies the requirements
globalThis.Image = Image;

class SkiaCanvasFactory {
  _createCanvas(width: number, height: number) {
    const canvas = new Canvas(width, height);
    canvas.gpu = false;

    return canvas;
  }

  create(width: number, height: number) {
    const canvas = this._createCanvas(width, height);

    return {
      canvas,
      context: canvas.getContext('2d'),
    };
  }

  reset(canvasAndContext: { canvas: Canvas }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: { canvas: Canvas | null; context: unknown }) {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }

    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

export type PdfToImagesOptions = {
  scale?: number;
};

export const pdfToImages = async (pdfBytes: Uint8Array, options: PdfToImagesOptions = {}) => {
  const { scale = 2 } = options;

  const task = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes),
    CanvasFactory: SkiaCanvasFactory,
  });

  const pdf = await task.promise;

  const images = await pMap(
    Array.from({ length: pdf.numPages }),
    async (_, index) => {
      const pageNumber = index + 1;
      const page = await pdf.getPage(pageNumber);

      const viewport = page.getViewport({ scale });

      const canvas = new Canvas(viewport.width, viewport.height);
      canvas.gpu = false;

      const canvasContext = canvas.getContext('2d');

      await page.render({
        // @ts-expect-error napi-rs/canvas satifies the requirements
        canvas,
        // @ts-expect-error napi-rs/canvas satifies the requirements
        canvasContext,
        viewport,
      }).promise;

      const result = {
        pageNumber,
        image: await canvas.toBuffer('jpeg'),
        width: Math.floor(viewport.width),
        height: Math.floor(viewport.height),
        mimeType: 'image/jpeg',
      };

      void page.cleanup();

      return result;
    },
    { concurrency: 10 },
  );

  void pdf.destroy().catch((e) => console.error(e));
  void task.destroy().catch((e) => console.error(e));

  return images;
};

/** Read selectable text locally; do not silently truncate a contract. */
export const pdfToContractText = async (pdfBytes: Uint8Array) => {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), CanvasFactory: SkiaCanvasFactory }).promise;
  try {
    const pages: string[] = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      length += text.length + (pages.length ? 1 : 0);
      if (length > 20_000) {
        throw new DocumentExtractionError(
          'Contract extraction accepts up to 20,000 characters. Choose a shorter document.',
        );
      }
      pages.push(text);
      page.cleanup();
    }
    const text = pages.join('\n').trim();
    if (!text) {
      throw new DocumentExtractionError('Contract extraction needs selectable text. Choose a text document.');
    }
    return text;
  } finally {
    await pdf.destroy();
  }
};

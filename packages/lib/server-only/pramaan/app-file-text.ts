import { callPramaan } from '../pramaan';
export type FileText = {
  fileId?: string;
  status: 'read' | 'copy-failed' | 'parse-failed';
  text?: string;
  truncated?: boolean;
  message?: string;
};
/** Read only platform handles. Never fetch returned URLs or repeat the connected action. */
export async function readAppFileText(output: unknown): Promise<FileText[]> {
  const candidates: Array<{ fileId?: string; failed?: boolean }> = [];
  const seen = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 12 || candidates.length >= 10 || !value || typeof value !== 'object') {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
      }
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.stored === false && typeof record.note === 'string') {
      candidates.push({ failed: true });
      return;
    }
    if (
      typeof record.fileId === 'string' &&
      /^file_[A-Za-z0-9_-]{1,128}$/.test(record.fileId) &&
      typeof record.contentType === 'string' &&
      typeof record.sizeBytes === 'number' &&
      record.sizeBytes > 0 &&
      record.sizeBytes <= 10 * 1024 * 1024
    ) {
      if (!seen.has(record.fileId)) {
        seen.add(record.fileId);
        candidates.push({ fileId: record.fileId });
      }
      return;
    }
    for (const item of Object.values(record)) {
      visit(item, depth + 1);
    }
  };
  visit(output, 0);
  const texts: FileText[] = [];
  for (const file of candidates) {
    if (file.failed) {
      texts.push({
        status: 'copy-failed',
        message: 'The action ran, but its file could not be copied. Do not run the action again to repair the copy.',
      });
      continue;
    }
    try {
      const parsed = await callPramaan('document.parse', { fileId: file.fileId!, ocr: false });
      texts.push({ fileId: file.fileId, status: 'read', text: parsed.text, truncated: parsed.truncated });
    } catch {
      texts.push({
        fileId: file.fileId,
        status: 'parse-failed',
        message:
          'The action ran, but its file could not be read as text. Do not run the action again to retry parsing.',
      });
    }
  }
  return texts;
}

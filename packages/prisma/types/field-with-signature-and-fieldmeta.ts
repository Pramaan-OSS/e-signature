import type { TFieldMetaSchema as FieldMeta } from '@e-sign/lib/types/field-meta';
import type { Field, Signature } from '@prisma/client';

export type FieldWithSignatureAndFieldMeta = Field & {
  signature?: Signature | null;
  fieldMeta: FieldMeta | null;
};

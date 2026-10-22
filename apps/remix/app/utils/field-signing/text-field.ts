import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import type { TFieldText } from '@e-sign/lib/types/field';
import type { TSignEnvelopeFieldValue } from '@e-sign/trpc/server/envelope-router/sign-envelope-field.types';
import { FieldType } from '@prisma/client';

import { SignFieldTextDialog } from '~/components/dialogs/sign-field-text-dialog';

type HandleTextFieldClickOptions = {
  field: TFieldText;
  text: string | null;
};

export const handleTextFieldClick = async (
  options: HandleTextFieldClickOptions,
): Promise<Extract<TSignEnvelopeFieldValue, { type: typeof FieldType.TEXT }> | null> => {
  const { field, text } = options;

  if (field.type !== FieldType.TEXT) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Invalid field type',
    });
  }

  if (field.inserted) {
    return {
      type: FieldType.TEXT,
      value: null,
    };
  }

  let textToInsert = text;

  if (!textToInsert) {
    textToInsert = await SignFieldTextDialog.call({
      fieldMeta: field.fieldMeta,
    });
  }

  if (!textToInsert) {
    return null;
  }

  return {
    type: FieldType.TEXT,
    value: textToInsert,
  };
};

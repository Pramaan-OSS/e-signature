import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import type { TFieldDropdown } from '@e-sign/lib/types/field';
import type { TSignEnvelopeFieldValue } from '@e-sign/trpc/server/envelope-router/sign-envelope-field.types';
import { FieldType } from '@prisma/client';

import { SignFieldDropdownDialog } from '~/components/dialogs/sign-field-dropdown-dialog';

type HandleDropdownFieldClickOptions = {
  field: TFieldDropdown;
  text: string | null;
};

export const handleDropdownFieldClick = async (
  options: HandleDropdownFieldClickOptions,
): Promise<Extract<TSignEnvelopeFieldValue, { type: typeof FieldType.DROPDOWN }> | null> => {
  const { field, text } = options;

  if (field.type !== FieldType.DROPDOWN || !field.fieldMeta) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Invalid field type',
    });
  }

  if (field.inserted) {
    return {
      type: FieldType.DROPDOWN,
      value: null,
    };
  }

  let textToInsert = text;

  if (!textToInsert) {
    textToInsert = await SignFieldDropdownDialog.call({
      fieldMeta: field.fieldMeta,
    });
  }

  if (!textToInsert) {
    return null;
  }

  return {
    type: FieldType.DROPDOWN,
    value: textToInsert,
  };
};

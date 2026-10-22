import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import type { TFieldInitials } from '@e-sign/lib/types/field';
import type { TSignEnvelopeFieldValue } from '@e-sign/trpc/server/envelope-router/sign-envelope-field.types';
import { FieldType } from '@prisma/client';

import { SignFieldInitialsDialog } from '~/components/dialogs/sign-field-initials-dialog';

type HandleInitialsFieldClickOptions = {
  field: TFieldInitials;
  initials: string | null;
};

export const handleInitialsFieldClick = async (
  options: HandleInitialsFieldClickOptions,
): Promise<Extract<TSignEnvelopeFieldValue, { type: typeof FieldType.INITIALS }> | null> => {
  const { field, initials } = options;

  if (field.type !== FieldType.INITIALS) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Invalid field type',
    });
  }

  if (field.inserted) {
    return {
      type: FieldType.INITIALS,
      value: null,
    };
  }

  let initialsToInsert = initials;

  if (!initialsToInsert) {
    initialsToInsert = await SignFieldInitialsDialog.call({});
  }

  if (!initialsToInsert) {
    return null;
  }

  return {
    type: FieldType.INITIALS,
    value: initialsToInsert,
  };
};

import { APP_DOCUMENT_UPLOAD_SIZE_LIMIT } from '@e-sign/lib/constants/app';
import { DOCUMENT_CONVERSION_MIME_TYPE_DOCX } from '@e-sign/lib/constants/document-conversion';
import { msg } from '@lingui/core/macro';
import { ErrorCode, type FileRejection } from 'react-dropzone';
import { match } from 'ts-pattern';

export const buildDropzoneRejectionDescription = (fileRejections: FileRejection[]) => {
  const errorCode = fileRejections[0]?.errors[0]?.code;

  return match(errorCode)
    .with('docx-too-large', () => msg`Word files cannot exceed 100 MB`)
    .with(ErrorCode.FileTooLarge, () =>
      fileRejections[0]?.file.type === DOCUMENT_CONVERSION_MIME_TYPE_DOCX
        ? msg`Word files cannot exceed 100 MB`
        : msg`File is larger than ${APP_DOCUMENT_UPLOAD_SIZE_LIMIT}MB`,
    )
    .with(ErrorCode.FileInvalidType, () => msg`Only PDF files are allowed`)
    .with(ErrorCode.FileTooSmall, () => msg`File is too small`)
    .with(ErrorCode.TooManyFiles, () => msg`Only one file can be uploaded at a time`)
    .otherwise(() => msg`Unknown error`);
};

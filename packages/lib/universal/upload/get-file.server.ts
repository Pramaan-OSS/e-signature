import { DocumentDataType } from '@prisma/client';
import { base64 } from '@scure/base';
import { match } from 'ts-pattern';

import { getObject } from '../../server-only/pramaan/storage';

export type GetFileOptions = {
  type: DocumentDataType;
  data: string;
};

export const getFileServerSide = async ({ type, data }: GetFileOptions) => {
  return await match(type)
    .with(DocumentDataType.BYTES, () => getFileFromBytes(data))
    .with(DocumentDataType.BYTES_64, () => getFileFromBytes64(data))
    .with(DocumentDataType.S3_PATH, async () => getFileFromS3(data))
    .exhaustive();
};

const getFileFromBytes = (data: string) => {
  const encoder = new TextEncoder();

  const binaryData = encoder.encode(data);

  return binaryData;
};

const getFileFromBytes64 = (data: string) => {
  const binaryData = base64.decode(data);

  return binaryData;
};

const getFileFromS3 = async (key: string) => getObject(key);

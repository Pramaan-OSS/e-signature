import type { RequestMetadata } from '@e-sign/lib/universal/extract-request-metadata';

export type HonoAuthContext = {
  Variables: {
    requestMetadata: RequestMetadata;
  };
};

import { env } from '../utils/env';

export const E_SIGN_ENCRYPTION_KEY = env('NEXT_PRIVATE_ENCRYPTION_KEY');

export const E_SIGN_ENCRYPTION_SECONDARY_KEY = env('NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY');

// if (typeof window === 'undefined') {
//   if (!E_SIGN_ENCRYPTION_KEY || !E_SIGN_ENCRYPTION_SECONDARY_KEY) {
//     throw new Error('Missing E_SIGN_ENCRYPTION_KEY or E_SIGN_ENCRYPTION_SECONDARY_KEY keys');
//   }

//   if (E_SIGN_ENCRYPTION_KEY === E_SIGN_ENCRYPTION_SECONDARY_KEY) {
//     throw new Error(
//       'E_SIGN_ENCRYPTION_KEY and E_SIGN_ENCRYPTION_SECONDARY_KEY cannot be equal',
//     );
//   }
// }

// if (E_SIGN_ENCRYPTION_KEY === 'CAFEBABE') {
//   console.warn('*********************************************************************');
//   console.warn('*');
//   console.warn('*');
//   console.warn('Please change the encryption key from the default value of "CAFEBABE"');
//   console.warn('*');
//   console.warn('*');
//   console.warn('*********************************************************************');
// }

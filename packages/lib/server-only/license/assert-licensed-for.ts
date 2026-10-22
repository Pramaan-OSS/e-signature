import type { LicenseFlag } from '../../types/license';
/** Core features have no subscription or licence gate. */
export const assertLicensedFor = async (_feature: LicenseFlag, _options?: { errorCode?: string; message?: string }) => {};

import type { TCachedLicense } from '../../types/license';
export class LicenseClient { static async start() {} static getInstance(): LicenseClient | null { return null; } async getCachedLicense(): Promise<TCachedLicense | null> { return null; } async resync() {} }

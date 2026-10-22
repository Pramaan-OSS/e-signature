import { PramaanStorageProvider } from './pramaan-provider';
import type { StorageProvider } from './storage-provider';
export const getStorageProvider = (): StorageProvider => new PramaanStorageProvider();

import type { ReactNode } from 'react';
import { localLimits } from './limits';
export const useLimits = () => ({ ...localLimits(), refreshLimits: async () => localLimits(), isLoading: false });
export function LimitsProvider({ children }: { children: ReactNode; initialValue?: unknown; teamId?: number; disableLimitsFetch?: boolean }) { return <>{children}</>; }

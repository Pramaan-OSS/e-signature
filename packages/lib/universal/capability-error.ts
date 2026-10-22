import { AppError } from '../errors/app-error';
export function capabilityFailureMessage(error: unknown, fallback: string) {
  return AppError.parseError(error).code === 'upstream_unavailable'
    ? 'This feature is not available yet. Try later.'
    : fallback;
}

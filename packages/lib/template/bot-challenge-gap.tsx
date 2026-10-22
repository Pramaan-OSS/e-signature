import { forwardRef } from 'react';
export interface BotChallengeInstance { reset(): void; getResponsePromise(timeout?: number): Promise<string>; execute(): void; remove(): void; }
export const BotChallenge = forwardRef<BotChallengeInstance, { [key: string]: unknown }>(() => <p>Captcha challenges are unavailable.</p>);

import { limitsHandler } from '@e-sign/lib/template/limits';

import type { Route } from './+types/limits';

export async function loader({ request }: Route.LoaderArgs) {
  return limitsHandler(request);
}

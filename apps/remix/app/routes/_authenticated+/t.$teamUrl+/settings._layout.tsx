import { getSession } from '@e-sign/auth/server/lib/utils/get-session';
import type { RouteHandle } from '@e-sign/lib/client-only/hooks/use-child-route-flags';
import { getTeamByUrl } from '@e-sign/lib/server-only/team/get-team';
import { canExecuteTeamAction } from '@e-sign/lib/utils/teams';
import { msg } from '@lingui/core/macro';
import { redirect } from 'react-router';

import { UnifiedSettingsLayout } from '~/components/general/unified-settings-layout';
import { appMetaTags } from '~/utils/meta';

import type { Route } from './+types/settings._layout';

export function meta() {
  return appMetaTags(msg`Team Settings`);
}

export const handle: RouteHandle = {
  layoutMode: 'settings',
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getSession(request);

  const team = await getTeamByUrl({
    userId: session.user.id,
    teamUrl: params.teamUrl,
  });

  if (!team || !canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole)) {
    throw redirect(`/t/${params.teamUrl}`);
  }
}

export async function clientLoader() {
  // Do nothing, we only want the loader to run on SSR.
}

export default function TeamSettingsLayout() {
  return <UnifiedSettingsLayout activeScope="team" />;
}

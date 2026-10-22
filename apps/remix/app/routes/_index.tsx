import { extractCookieFromHeaders } from '@e-sign/auth/server/lib/utils/cookies';
import { getOptionalSession } from '@e-sign/auth/server/lib/utils/get-session';
import { PREFERRED_TEAM_URL_COOKIE } from '@e-sign/lib/constants/cookies';
import { getTeams } from '@e-sign/lib/server-only/team/get-teams';
import { formatDocumentsPath } from '@e-sign/lib/utils/teams';
import { ZTeamUrlSchema } from '@e-sign/trpc/server/team-router/schema';
import { redirect } from 'react-router';

import type { Route } from './+types/_index';

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getOptionalSession(request);

  // Embed sessions are rejected by the authenticated tree, so treat them as signed out here.
  if (session.isAuthenticated && !session.session.isEmbed) {
    const teamUrlCookie = extractCookieFromHeaders(PREFERRED_TEAM_URL_COOKIE, request.headers);

    // const referrer = request.headers.get('referer');
    // let isReferrerFromTeamUrl = false;

    // if (referrer) {
    //   const referrerUrl = new URL(referrer);

    //   if (referrerUrl.pathname.startsWith('/t/')) {
    //     isReferrerFromTeamUrl = true;
    //   }
    // }

    const preferredTeamUrl =
      teamUrlCookie && ZTeamUrlSchema.safeParse(teamUrlCookie).success ? teamUrlCookie : undefined;

    // // Early return for no preferred team.
    // if (!preferredTeamUrl || isReferrerFromTeamUrl) {
    //   throw redirect('/inbox');
    // }

    const teams = await getTeams({ userId: session.user.id });

    let currentTeam = teams.find((team) => team.url === preferredTeamUrl);

    if (!currentTeam && teams.length === 1) {
      currentTeam = teams[0];
    }

    if (!currentTeam) {
      throw redirect('/inbox');
    }

    throw redirect(formatDocumentsPath(currentTeam.url));
  }

  throw redirect('/signin');
}

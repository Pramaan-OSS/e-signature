import { createElement } from 'react';

const aliases: Record<string, string> = {
  googledrive: 'google_drive',
  googlecalendar: 'google_calendar',
  googlesheets: 'google_sheets',
  googledocs: 'google_docs',
};
const grants: Record<string, string> = {
  gmail:
    'Connecting gives e-sign full access to your Gmail: it can read, send and permanently delete mail, and read your profile and contacts.',
  google_drive:
    'Connecting gives e-sign full access to your Google Drive: it can read, change, share and delete every file.',
  google_calendar: 'Connecting lets e-sign read and change data in your Google Calendar account.',
  slack: 'Connecting lets e-sign read and change data in your Slack account.',
  hubspot: 'Connecting lets e-sign read and change data in your HubSpot account.',
  notion: 'Connecting gives e-sign access to the pages you choose in Notion’s own picker.',
};
const labels: Record<string, string> = {
  google_sheets: 'Google Sheets',
  google_docs: 'Google Docs',
  google_search_console: 'Search Console',
  google_analytics: 'Analytics',
  airtable: 'Airtable',
  linear: 'Linear',
  salesforce: 'Salesforce',
  calendly: 'Calendly',
  outlook: 'Outlook',
  github: 'GitHub',
};
export function appAccessNotice(app: string): string {
  const slug = app.trim().toLowerCase();
  const key = Object.hasOwn(aliases, slug) ? aliases[slug] : slug;
  const grant =
    (Object.hasOwn(grants, key) ? grants[key] : undefined) ||
    `Connecting may give e-sign full access to your ${(Object.hasOwn(labels, key) ? labels[key] : undefined) || slug || 'chosen app'} account.`;
  return `${grant} e-sign connects your account, shows its connection status, and runs only the app actions you choose and approve. Approved actions can read, send, change or delete data. You cannot request narrower access here. The connection link expires after about 10 minutes.`;
}
export function ConnectionAccessNotice({ app, connectUrl }: { app: string; connectUrl?: string }) {
  let safeUrl: string | undefined;
  if (connectUrl) {
    try {
      const url = new URL(connectUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) {
        safeUrl = url.href;
      }
    } catch {
      /* Invalid links stay unavailable. */
    }
  }
  return createElement(
    'section',
    { 'aria-label': 'Connection access', 'data-connect-access-notice': true },
    createElement('p', null, appAccessNotice(app)),
    safeUrl
      ? createElement(
          'a',
          { href: safeUrl, target: '_blank', rel: 'noopener noreferrer' },
          'Continue to the consent screen',
        )
      : null,
  );
}

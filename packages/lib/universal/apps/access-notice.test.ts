import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { appAccessNotice, ConnectionAccessNotice } from './access-notice';

it('renders the full-mail access notice and actual behavior before the hosted redirect link', () => {
  const html = renderToStaticMarkup(
    createElement(ConnectionAccessNotice, { app: 'gmail', connectUrl: 'https://example.test/consent' }),
  );
  expect(html).toContain('permanently delete mail');
  expect(html).toContain('profile and contacts');
  expect(html).toContain('actions you choose and approve');
  expect(html.indexOf('full access to your Gmail')).toBeLessThan(html.indexOf('href='));
});
it('shows Drive access to every file without claiming this product only reads', () => {
  expect(appAccessNotice('google_drive')).toContain('read, change, share and delete every file');
  expect(appAccessNotice('googledrive')).toBe(appAccessNotice('google_drive'));
  expect(appAccessNotice('google_drive')).toContain('Approved actions can read, send, change or delete');
});
it('describes known read/write access and Notion’s page picker', () => {
  for (const app of ['google_calendar', 'slack', 'hubspot']) {
    expect(appAccessNotice(app)).toContain('read and change');
  }
  expect(appAccessNotice('notion')).toContain('pages you choose in Notion');
});
it('warns that unknown scope levels may give full account access', () => {
  for (const app of [
    'google_sheets',
    'google_docs',
    'google_search_console',
    'google_analytics',
    'airtable',
    'linear',
    'salesforce',
    'calendly',
    'outlook',
    'github',
    'another_app',
  ]) {
    expect(appAccessNotice(app)).toContain('may give e-sign full access');
  }
});
it('shows the notice before a link exists and explains narrowing and expiry', () => {
  const html = renderToStaticMarkup(createElement(ConnectionAccessNotice, { app: 'gmail' }));
  expect(html).toContain('full access');
  expect(html).toContain('cannot request narrower access');
  expect(html).toContain('about 10 minutes');
  expect(html).not.toContain('href=');
});
it('never renders a dangerous or credential-bearing redirect link', () => {
  for (const connectUrl of ['javascript:alert(1)', 'https://secret@example.test/consent', 'broken']) {
    expect(renderToStaticMarkup(createElement(ConnectionAccessNotice, { app: 'gmail', connectUrl }))).not.toContain(
      'href=',
    );
  }
});

it('generic fallback handles unknown slugs that match object property names', () => {
  for (const app of ['constructor', '__proto__']) {
    expect(appAccessNotice(app)).toContain('may give e-sign full access');
  }
});

import { NEXT_PUBLIC_WEBAPP_URL } from '@e-sign/lib/constants/app';
import { i18n, type MessageDescriptor } from '@lingui/core';
export const appMetaTags = (title?: MessageDescriptor) => [
  { title: title ? `${i18n._(title)} · e-sign` : 'e-sign' },
  { name: 'description', content: 'Prepare documents, collect signatures and follow each request.' },
  { property: 'og:title', content: 'e-sign' },
  { property: 'og:image', content: `${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg` },
];

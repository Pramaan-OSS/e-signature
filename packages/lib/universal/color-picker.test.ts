import { ColorPicker } from '@e-sign/ui/primitives/color-picker';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

it('renders one named button so a settings form hydrates without nested interactive controls', () => {
  const html = renderToStaticMarkup(createElement(ColorPicker, { value: '#000000', onChange: () => undefined }));
  expect(html.match(/<button\b/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Choose color"');
  expect(html).toContain('type="button"');
});

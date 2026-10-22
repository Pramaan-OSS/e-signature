import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findNestedMenuDialogs } from './check-inline-menus.mjs';

test('rejects an inline form inside a floating menu', () => {
  assert.deepEqual(
    findNestedMenuDialogs('<DropdownMenuContent>\n  <DeleteDialog />\n</DropdownMenuContent>', 'page.tsx'),
    ['page.tsx:2: render DeleteDialog outside menu content.'],
  );
});
test('also rejects nested forms and share controls inside menu wrappers', () => {
  const result = findNestedMenuDialogs(
    '<DropdownMenuContent><div><EditDialog><input /></EditDialog><DocumentShareButton /></div></DropdownMenuContent>',
  );
  assert.equal(result.length, 2);
});
test('allows an inline form beside the closed menu', () => {
  assert.deepEqual(
    findNestedMenuDialogs(
      '<><DropdownMenu><DropdownMenuContent><DropdownMenuItem /></DropdownMenuContent></DropdownMenu><EditDialog open={open} /></>',
    ),
    [],
  );
});

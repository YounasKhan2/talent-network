import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMammothHtml } from './docx-extractor.js';

void test('DOCX structural normalizer preserves table rows and list boundaries', () => {
  const blocks = parseMammothHtml(`
    <p>PROFESSIONAL EXPERIENCE</p>
    <table>
      <tbody>
        <tr>
          <td><p>Associate Full-Stack Developer | ExampleSoft | Lahore, Pakistan</p></td>
          <td><p>2025 - 2026</p></td>
        </tr>
      </tbody>
    </table>
    <ul>
      <li>Built secure full-stack features.</li>
      <li>Integrated APIs and databases.</li>
    </ul>
  `);

  assert.deepEqual(
    blocks.map((block) => ({ kind: block.kind, text: block.text, tableCells: block.tableCells })),
    [
      {
        kind: 'PARAGRAPH',
        text: 'PROFESSIONAL EXPERIENCE',
        tableCells: undefined,
      },
      {
        kind: 'TABLE_ROW',
        text: 'Associate Full-Stack Developer | ExampleSoft | Lahore, Pakistan | 2025 - 2026',
        tableCells: [
          'Associate Full-Stack Developer | ExampleSoft | Lahore, Pakistan',
          '2025 - 2026',
        ],
      },
      {
        kind: 'LIST_ITEM',
        text: '• Built secure full-stack features.',
        tableCells: undefined,
      },
      {
        kind: 'LIST_ITEM',
        text: '• Integrated APIs and databases.',
        tableCells: undefined,
      },
    ],
  );
});

void test('DOCX structural normalizer preserves only safe hyperlink targets', () => {
  const blocks = parseMammothHtml(`
    <p>
      <a href="https://github.com/example">GitHub</a>
      <a href="javascript:alert(1)">unsafe</a>
    </p>
  `);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.text, 'GitHub unsafe');
  assert.deepEqual(blocks[0]?.hyperlinks, [
    { text: 'GitHub', url: 'https://github.com/example' },
  ]);
});

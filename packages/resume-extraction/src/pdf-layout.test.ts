import assert from 'node:assert/strict';
import test from 'node:test';

import { reconstructPdfPageText, type ResumePdfTextContentItem } from './index.js';

function textItem(
  str: string,
  x: number,
  y: number,
  width: number,
  height = 10,
): ResumePdfTextContentItem {
  return {
    kind: 'TEXT',
    str,
    dir: 'ltr',
    transform: [1, 0, 0, 1, x, y],
    width,
    height,
    fontName: 'fixture-font',
    hasEOL: false,
  };
}

void test('reconstructs visual rows using PDF coordinates instead of source item order', () => {
  const items: ResumePdfTextContentItem[] = [
    textItem('2025 - 2026', 420, 500, 70),
    textItem('Associate Full-Stack Developer', 50, 500, 180),
    textItem('Preesoft', 50, 480, 60),
    textItem('Lahore, Pakistan', 420, 480, 90),
  ];

  const result = reconstructPdfPageText(items);

  assert.equal(
    result.text,
    'Associate Full-Stack Developer 2025 - 2026\nPreesoft Lahore, Pakistan',
  );
  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.lines[0]?.sourceItemIndexes, [1, 0]);
  assert.deepEqual(result.lines[1]?.sourceItemIndexes, [2, 3]);
  assert.ok((result.lines[0]?.boundingBox?.width ?? 0) > 400);
  assert.equal(
    result.text.slice(
      result.lines[0]?.sourceRange.startOffset,
      result.lines[0]?.sourceRange.endOffset,
    ),
    result.lines[0]?.text,
  );
});

void test('keeps marked-content entries out of reconstructed text without discarding them', () => {
  const items: ResumePdfTextContentItem[] = [
    { kind: 'MARKED_CONTENT', type: 'beginMarkedContentProps', id: 'mc0' },
    textItem('EDUCATION', 50, 400, 80, 12),
    { kind: 'MARKED_CONTENT', type: 'endMarkedContent', id: null },
  ];

  const result = reconstructPdfPageText(items);

  assert.equal(result.text, 'EDUCATION');
  assert.deepEqual(result.lines[0]?.sourceItemIndexes, [1]);
  assert.equal(items[0]?.kind, 'MARKED_CONTENT');
  assert.equal(items[2]?.kind, 'MARKED_CONTENT');
});

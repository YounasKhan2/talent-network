import assert from 'node:assert/strict';
import test from 'node:test';

import { buildResumeDocumentGraph, type ResumeDocumentGraphSource } from './document-graph.js';

void test('PDF graph preserves real pages, geometry, source ranges, order, and safe annotation links', () => {
  const graph = buildResumeDocumentGraph({
    sourceExtractionId: 'extract-pdf-1',
    document: pdfDocument(),
  });

  assert.equal(graph.schemaVersion, 'resume-document-graph-v1');
  assert.deepEqual(graph.pageIds, ['page-1']);
  assert.equal(graph.nodes[0]?.kind, 'DOCUMENT');

  const page = graph.nodes.find((node) => node.kind === 'PAGE');
  assert.equal(page?.pageNumber, 1);

  const paragraphs = graph.nodes.filter((node) => node.kind === 'PARAGRAPH');
  assert.equal(paragraphs.length, 2);
  assert.deepEqual(paragraphs[0]?.sourceRange, { start: 0, end: 18 });
  assert.deepEqual(paragraphs[0]?.boundingBox, {
    x: 10,
    y: 700,
    width: 200,
    height: 18,
  });

  const links = graph.nodes.filter((node) => node.kind === 'LINK');
  assert.equal(links.length, 1);
  assert.equal(links[0]?.metadata?.url, 'https://example.com/profile');
  assert.deepEqual(links[0]?.boundingBox, {
    x: 10,
    y: 660,
    width: 190,
    height: 20,
  });

  assert.ok(
    graph.nodes.every(
      (node, index, nodes) => index === 0 || node.readingOrder > nodes[index - 1]!.readingOrder,
    ),
  );
});

void test('DOCX graph preserves headings, grouped lists, grouped tables, cells, links, and null pagination', () => {
  const graph = buildResumeDocumentGraph({
    sourceExtractionId: 'extract-docx-1',
    document: docxDocument(),
  });

  assert.deepEqual(graph.pageIds, []);
  assert.equal(
    graph.nodes.some((node) => node.kind === 'PAGE'),
    false,
  );
  assert.equal(
    graph.nodes.find((node) => node.kind === 'HEADING')?.text,
    'Professional Experience',
  );

  const list = graph.nodes.find((node) => node.kind === 'LIST');
  assert.ok(list);
  assert.equal(list.childIds.length, 2);
  assert.ok(
    list.childIds.every((id) => graph.nodes.find((node) => node.id === id)?.kind === 'LIST_ITEM'),
  );

  const table = graph.nodes.find((node) => node.kind === 'TABLE');
  assert.ok(table);
  assert.equal(table.childIds.length, 2);

  const firstRow = graph.nodes.find((node) => node.id === table.childIds[0]);
  assert.equal(firstRow?.kind, 'TABLE_ROW');
  assert.equal(firstRow?.childIds.length, 2);
  assert.deepEqual(
    firstRow?.childIds.map((id) => graph.nodes.find((node) => node.id === id)?.text),
    ['Senior Engineer | ExampleSoft', '2022 - Present'],
  );

  const link = graph.nodes.find((node) => node.kind === 'LINK');
  assert.equal(link?.metadata?.url, 'https://example.com/project');
  assert.equal(link?.pageNumber, null);
});

void test('OCR graph preserves real page identity and surfaces low-quality OCR diagnostics', () => {
  const document: ResumeDocumentGraphSource = {
    resumeVersionId: 'resume-ocr-1',
    extractionMethod: 'OCR',
    extractor: { name: 'http-ocr-service', version: '1' },
    pages: [
      {
        pageNumber: 1,
        text: 'Scanned Resume',
        blocks: [
          {
            text: 'Scanned Resume',
            sourceRange: { startOffset: 0, endOffset: 14 },
            boundingBox: { x: 20, y: 40, width: 180, height: 20 },
          },
        ],
      },
      { pageNumber: 2, text: '', blocks: [] },
    ],
    quality: {
      pageCount: 2,
      pagesWithText: 1,
      replacementCharacterRatio: 0.03,
      controlCharacterRatio: 0,
      warnings: [],
    },
  };

  const graph = buildResumeDocumentGraph({ sourceExtractionId: 'extract-ocr-1', document });
  assert.deepEqual(graph.pageIds, ['page-1', 'page-2']);
  assert.ok(graph.warnings.some((warning) => warning.code === 'OCR_LOW_QUALITY'));
});

void test('paginated blocks without geometry stay preserved and emit reading-order uncertainty', () => {
  const document = pdfDocument();
  document.pages[0]!.blocks[1]!.boundingBox = null;

  const graph = buildResumeDocumentGraph({
    sourceExtractionId: 'extract-pdf-2',
    document,
  });
  assert.equal(graph.nodes.filter((node) => node.kind === 'PARAGRAPH').length, 2);
  assert.ok(graph.warnings.some((warning) => warning.code === 'READING_ORDER_UNCERTAIN'));
});

function pdfDocument(): ResumeDocumentGraphSource {
  return {
    resumeVersionId: 'resume-pdf-1',
    extractionMethod: 'NATIVE_PDF',
    extractor: { name: 'pdfjs-dist', version: '6.3.289' },
    pages: [
      {
        pageNumber: 1,
        text: 'Professional Summary\nPlatform engineer',
        blocks: [
          {
            text: 'Professional Summary',
            sourceRange: { startOffset: 0, endOffset: 18 },
            boundingBox: { x: 10, y: 700, width: 200, height: 18 },
          },
          {
            text: 'Platform engineer',
            sourceRange: { startOffset: 19, endOffset: 36 },
            boundingBox: { x: 10, y: 670, width: 180, height: 14 },
          },
        ],
        nativePdf: {
          annotations: [
            { url: 'https://example.com/profile', rect: [10, 660, 200, 680] },
            { url: 'javascript:alert(1)', rect: [0, 0, 10, 10] },
          ],
        },
      },
    ],
    quality: {
      pageCount: 1,
      pagesWithText: 1,
      replacementCharacterRatio: 0,
      controlCharacterRatio: 0,
      warnings: [],
    },
  };
}

function docxDocument(): ResumeDocumentGraphSource {
  const nativeBlocks = [
    { kind: 'HEADING' as const, text: 'Professional Experience' },
    { kind: 'LIST_ITEM' as const, text: '• Led platform migration' },
    {
      kind: 'LIST_ITEM' as const,
      text: '• Built internal tooling',
      hyperlinks: [{ text: 'project', url: 'https://example.com/project' }],
    },
    {
      kind: 'TABLE_ROW' as const,
      text: 'Senior Engineer | ExampleSoft | 2022 - Present',
      tableCells: ['Senior Engineer | ExampleSoft', '2022 - Present'],
    },
    {
      kind: 'TABLE_ROW' as const,
      text: 'Engineer | ExampleSoft | 2020 - 2022',
      tableCells: ['Engineer | ExampleSoft', '2020 - 2022'],
    },
  ];

  let cursor = 0;
  const blocks = nativeBlocks.map((block) => {
    const startOffset = cursor;
    const endOffset = startOffset + block.text.length;
    cursor = endOffset + 1;
    return { text: block.text, sourceRange: { startOffset, endOffset } };
  });

  return {
    resumeVersionId: 'resume-docx-1',
    extractionMethod: 'NATIVE_DOCX',
    extractor: { name: 'mammoth', version: '1.12.3' },
    pages: [
      {
        pageNumber: null,
        text: nativeBlocks.map((block) => block.text).join('\n'),
        blocks,
        nativeDocx: { blocks: nativeBlocks },
      },
    ],
    quality: {
      pageCount: 1,
      pagesWithText: 1,
      replacementCharacterRatio: 0,
      controlCharacterRatio: 0,
      warnings: [],
    },
  };
}

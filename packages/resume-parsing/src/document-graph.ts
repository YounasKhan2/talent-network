import {
  DOCUMENT_GRAPH_SCHEMA_VERSION,
  type DocumentGraphNode,
  type DocumentGraphWarning,
  type ResumeDocumentGraphV1,
  type ResumeIntelligenceBoundingBox,
  type ResumeIntelligenceSourceRange,
} from '@talent-network/contracts';

export type ResumeDocumentGraphSourceRange = {
  startOffset: number;
  endOffset: number;
};

export type ResumeDocumentGraphSourceBlock = {
  text: string;
  sourceRange: ResumeDocumentGraphSourceRange;
  boundingBox?: ResumeIntelligenceBoundingBox | null;
};

export type ResumeDocumentGraphDocxHyperlink = {
  text: string;
  url: string;
};

export type ResumeDocumentGraphDocxBlock = {
  kind: 'PARAGRAPH' | 'HEADING' | 'LIST_ITEM' | 'TABLE_ROW';
  text: string;
  tableCells?: string[];
  hyperlinks?: ResumeDocumentGraphDocxHyperlink[];
};

export type ResumeDocumentGraphPageSource = {
  pageNumber: number | null;
  text: string;
  blocks: ResumeDocumentGraphSourceBlock[];
  nativePdf?: {
    annotations?: unknown[];
  };
  nativeDocx?: {
    blocks: ResumeDocumentGraphDocxBlock[];
  };
};

export type ResumeDocumentGraphSource = {
  resumeVersionId: string;
  extractionMethod: 'NATIVE_PDF' | 'NATIVE_DOCX' | 'OCR';
  extractor: {
    name: string;
    version: string;
  };
  pages: ResumeDocumentGraphPageSource[];
  quality?: {
    pageCount: number;
    pagesWithText: number;
    replacementCharacterRatio: number;
    controlCharacterRatio: number;
    warnings: string[];
  };
};

export interface BuildResumeDocumentGraphInput {
  sourceExtractionId: string;
  document: ResumeDocumentGraphSource;
}

interface MutableDocumentGraphNode extends Omit<DocumentGraphNode, 'childIds'> {
  childIds: string[];
}

interface GraphBuilderState {
  nodes: MutableDocumentGraphNode[];
  nodeById: Map<string, MutableDocumentGraphNode>;
  pageIds: string[];
  warnings: DocumentGraphWarning[];
  readingOrder: number;
  nodeCounter: number;
}

/**
 * Builds the Phase 3G layout-aware graph from the verified extraction artifact.
 *
 * This function deliberately preserves only structure the extractor can prove.
 * Semantic section/record classification belongs to later 3G stages.
 */
export function buildResumeDocumentGraph(
  input: BuildResumeDocumentGraphInput,
): ResumeDocumentGraphV1 {
  const state: GraphBuilderState = {
    nodes: [],
    nodeById: new Map(),
    pageIds: [],
    warnings: [],
    readingOrder: 0,
    nodeCounter: 0,
  };

  const root = addNode(state, {
    id: 'document',
    kind: 'DOCUMENT',
    pageNumber: null,
    readingOrder: nextReadingOrder(state),
    metadata: {
      extractionMethod: input.document.extractionMethod,
      extractor: input.document.extractor.name,
      extractorVersion: input.document.extractor.version,
    },
  });

  for (const [pageIndex, page] of input.document.pages.entries()) {
    const parentId =
      page.pageNumber === null ? root.id : addPageNode(state, root.id, pageIndex, page);

    if (page.nativeDocx && page.nativeDocx.blocks.length > 0) {
      buildDocxNodes(state, parentId, page);
    } else {
      buildPageBlockNodes(state, parentId, page);
      buildPdfAnnotationLinks(state, parentId, page);
    }
  }

  addQualityWarnings(state, input.document);

  return {
    schemaVersion: DOCUMENT_GRAPH_SCHEMA_VERSION,
    resumeVersionId: input.document.resumeVersionId,
    sourceExtractionId: input.sourceExtractionId,
    nodes: state.nodes,
    pageIds: state.pageIds,
    extractionMethod: input.document.extractionMethod,
    extractionVersion: `${input.document.extractor.name}@${input.document.extractor.version}`,
    warnings: state.warnings,
  };
}

function addPageNode(
  state: GraphBuilderState,
  rootId: string,
  pageIndex: number,
  page: ResumeDocumentGraphPageSource,
): string {
  const id = `page-${page.pageNumber ?? pageIndex + 1}`;
  addNode(state, {
    id,
    kind: 'PAGE',
    pageNumber: page.pageNumber,
    parentId: rootId,
    readingOrder: nextReadingOrder(state),
    metadata: { pageIndex },
  });
  state.pageIds.push(id);
  return id;
}

function buildPageBlockNodes(
  state: GraphBuilderState,
  parentId: string,
  page: ResumeDocumentGraphPageSource,
): void {
  const geometryMissing: string[] = [];

  for (const [blockIndex, block] of page.blocks.entries()) {
    const node = addNode(state, {
      id: nextNodeId(state, 'paragraph'),
      kind: 'PARAGRAPH',
      text: block.text,
      pageNumber: page.pageNumber,
      parentId,
      readingOrder: nextReadingOrder(state),
      sourceRange: toGraphSourceRange(block.sourceRange),
      ...(block.boundingBox ? { boundingBox: block.boundingBox } : {}),
      metadata: { blockIndex },
    });
    if (!block.boundingBox && page.pageNumber !== null) geometryMissing.push(node.id);
  }

  if (geometryMissing.length > 0) {
    state.warnings.push({
      code: 'READING_ORDER_UNCERTAIN',
      nodeIds: geometryMissing,
      message: 'Some paginated source blocks do not expose geometry.',
    });
  }
}

function buildDocxNodes(
  state: GraphBuilderState,
  parentId: string,
  page: ResumeDocumentGraphPageSource,
): void {
  const nativeBlocks = page.nativeDocx?.blocks ?? [];
  let index = 0;

  while (index < nativeBlocks.length) {
    const nativeBlock = nativeBlocks[index];
    if (!nativeBlock) break;

    if (nativeBlock.kind === 'LIST_ITEM') {
      index = buildDocxList(state, parentId, page, nativeBlocks, index);
      continue;
    }

    if (nativeBlock.kind === 'TABLE_ROW') {
      index = buildDocxTable(state, parentId, page, nativeBlocks, index);
      continue;
    }

    const sourceBlock = page.blocks[index];
    const node = addNode(state, {
      id: nextNodeId(state, nativeBlock.kind === 'HEADING' ? 'heading' : 'paragraph'),
      kind: nativeBlock.kind === 'HEADING' ? 'HEADING' : 'PARAGRAPH',
      text: nativeBlock.text,
      pageNumber: null,
      parentId,
      readingOrder: nextReadingOrder(state),
      ...(sourceBlock ? { sourceRange: toGraphSourceRange(sourceBlock.sourceRange) } : {}),
      metadata: { blockIndex: index },
    });
    addDocxHyperlinks(state, node.id, nativeBlock.hyperlinks);
    index += 1;
  }
}

function buildDocxList(
  state: GraphBuilderState,
  parentId: string,
  page: ResumeDocumentGraphPageSource,
  blocks: readonly ResumeDocumentGraphDocxBlock[],
  startIndex: number,
): number {
  const list = addNode(state, {
    id: nextNodeId(state, 'list'),
    kind: 'LIST',
    pageNumber: null,
    parentId,
    readingOrder: nextReadingOrder(state),
    metadata: { startBlockIndex: startIndex },
  });

  let index = startIndex;
  while (index < blocks.length && blocks[index]?.kind === 'LIST_ITEM') {
    const block = blocks[index];
    if (!block) break;
    const sourceBlock = page.blocks[index];
    const item = addNode(state, {
      id: nextNodeId(state, 'list-item'),
      kind: 'LIST_ITEM',
      text: block.text,
      pageNumber: null,
      parentId: list.id,
      readingOrder: nextReadingOrder(state),
      ...(sourceBlock ? { sourceRange: toGraphSourceRange(sourceBlock.sourceRange) } : {}),
      metadata: { blockIndex: index },
    });
    addDocxHyperlinks(state, item.id, block.hyperlinks);
    index += 1;
  }

  return index;
}

function buildDocxTable(
  state: GraphBuilderState,
  parentId: string,
  page: ResumeDocumentGraphPageSource,
  blocks: readonly ResumeDocumentGraphDocxBlock[],
  startIndex: number,
): number {
  const table = addNode(state, {
    id: nextNodeId(state, 'table'),
    kind: 'TABLE',
    pageNumber: null,
    parentId,
    readingOrder: nextReadingOrder(state),
    metadata: { startBlockIndex: startIndex },
  });

  let index = startIndex;
  while (index < blocks.length && blocks[index]?.kind === 'TABLE_ROW') {
    const block = blocks[index];
    if (!block) break;
    const sourceBlock = page.blocks[index];
    const row = addNode(state, {
      id: nextNodeId(state, 'table-row'),
      kind: 'TABLE_ROW',
      text: block.text,
      pageNumber: null,
      parentId: table.id,
      readingOrder: nextReadingOrder(state),
      ...(sourceBlock ? { sourceRange: toGraphSourceRange(sourceBlock.sourceRange) } : {}),
      metadata: { blockIndex: index },
    });

    for (const [cellIndex, cellText] of (block.tableCells ?? []).entries()) {
      addNode(state, {
        id: nextNodeId(state, 'table-cell'),
        kind: 'TABLE_CELL',
        text: cellText,
        pageNumber: null,
        parentId: row.id,
        readingOrder: nextReadingOrder(state),
        ...(sourceBlock ? { sourceRange: toGraphSourceRange(sourceBlock.sourceRange) } : {}),
        metadata: { blockIndex: index, cellIndex },
      });
    }

    addDocxHyperlinks(state, row.id, block.hyperlinks);
    index += 1;
  }

  if (table.childIds.length === 0) {
    state.warnings.push({
      code: 'TABLE_STRUCTURE_UNCERTAIN',
      nodeIds: [table.id],
      message: 'A table container was detected without any preserved row nodes.',
    });
  }

  return index;
}

function addDocxHyperlinks(
  state: GraphBuilderState,
  parentId: string,
  hyperlinks: readonly ResumeDocumentGraphDocxHyperlink[] | undefined,
): void {
  for (const hyperlink of hyperlinks ?? []) {
    const url = safeHttpUrl(hyperlink.url);
    if (!url) continue;
    addNode(state, {
      id: nextNodeId(state, 'link'),
      kind: 'LINK',
      text: hyperlink.text,
      pageNumber: null,
      parentId,
      readingOrder: nextReadingOrder(state),
      metadata: { url },
    });
  }
}

function buildPdfAnnotationLinks(
  state: GraphBuilderState,
  parentId: string,
  page: ResumeDocumentGraphPageSource,
): void {
  for (const annotation of page.nativePdf?.annotations ?? []) {
    const record = asRecord(annotation);
    if (!record) continue;
    const url = safeHttpUrl(typeof record.url === 'string' ? record.url : null);
    if (!url) continue;

    const boundingBox = rectToBoundingBox(record.rect);
    addNode(state, {
      id: nextNodeId(state, 'link'),
      kind: 'LINK',
      pageNumber: page.pageNumber,
      parentId,
      readingOrder: nextReadingOrder(state),
      ...(boundingBox ? { boundingBox } : {}),
      metadata: { url, annotation: true },
    });
  }
}

function addQualityWarnings(state: GraphBuilderState, document: ResumeDocumentGraphSource): void {
  const quality = document.quality;
  if (!quality) return;

  if (document.extractionMethod === 'OCR') {
    const hasSparsePages = quality.pageCount > 0 && quality.pagesWithText < quality.pageCount;
    const hasCharacterNoise =
      quality.replacementCharacterRatio > 0.02 || quality.controlCharacterRatio > 0.01;
    if (hasSparsePages || hasCharacterNoise) {
      state.warnings.push({
        code: 'OCR_LOW_QUALITY',
        nodeIds: state.pageIds,
        message: 'OCR output contains sparse pages or elevated character-noise signals.',
      });
    }
  }

  if (quality.warnings.some((warning) => /truncat|limit|too large/i.test(warning))) {
    state.warnings.push({
      code: 'TRUNCATED_INPUT',
      nodeIds: ['document'],
      message: 'Extraction quality warnings indicate possible truncation or limit pressure.',
    });
  }
}

function addNode(
  state: GraphBuilderState,
  input: Omit<MutableDocumentGraphNode, 'childIds'> & { childIds?: string[] },
): MutableDocumentGraphNode {
  const node: MutableDocumentGraphNode = { ...input, childIds: input.childIds ?? [] };
  state.nodes.push(node);
  state.nodeById.set(node.id, node);

  if (node.parentId) {
    const parent = state.nodeById.get(node.parentId);
    parent?.childIds.push(node.id);
  }

  return node;
}

function nextReadingOrder(state: GraphBuilderState): number {
  const value = state.readingOrder;
  state.readingOrder += 1;
  return value;
}

function nextNodeId(state: GraphBuilderState, prefix: string): string {
  state.nodeCounter += 1;
  return `${prefix}-${state.nodeCounter}`;
}

function toGraphSourceRange(range: ResumeDocumentGraphSourceRange): ResumeIntelligenceSourceRange {
  return { start: range.startOffset, end: range.endOffset };
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function rectToBoundingBox(value: unknown): ResumeIntelligenceBoundingBox | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const coordinates = value as unknown[];
  const x1 = coordinates[0];
  const y1 = coordinates[1];
  const x2 = coordinates[2];
  const y2 = coordinates[3];
  if (!isFiniteNumber(x1) || !isFiniteNumber(y1) || !isFiniteNumber(x2) || !isFiniteNumber(y2)) {
    return null;
  }

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

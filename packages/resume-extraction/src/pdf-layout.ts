import type {
  ResumeBoundingBox,
  ResumeDocumentBlock,
  ResumeDocumentLine,
  ResumeJsonValue,
  ResumePdfMarkedContentItem,
  ResumePdfTextContentItem,
  ResumePdfTextItem,
  ResumePdfTextStyle,
} from './contracts.js';

interface PositionedTextItem {
  sourceItemIndex: number;
  item: ResumePdfTextItem;
  x: number;
  y: number;
}

interface MutableLine {
  baselineY: number;
  items: PositionedTextItem[];
}

export interface ReconstructedPdfPageText {
  text: string;
  lines: ResumeDocumentLine[];
  blocks: ResumeDocumentBlock[];
}

export function toResumePdfTextContentItem(item: unknown): ResumePdfTextContentItem | null {
  if (!isRecord(item)) return null;

  if (typeof item.str === 'string') {
    return {
      kind: 'TEXT',
      str: item.str,
      dir: typeof item.dir === 'string' ? item.dir : 'ltr',
      transform: numberArray(item.transform),
      width: finiteNumber(item.width),
      height: finiteNumber(item.height),
      fontName: typeof item.fontName === 'string' ? item.fontName : '',
      hasEOL: item.hasEOL === true,
    };
  }

  if (typeof item.type === 'string') {
    const markedContent: ResumePdfMarkedContentItem = {
      kind: 'MARKED_CONTENT',
      type: item.type,
      id: typeof item.id === 'string' ? item.id : null,
    };
    return markedContent;
  }

  return null;
}

export function toResumePdfTextStyles(value: unknown): Record<string, ResumePdfTextStyle> {
  if (!isRecord(value)) return {};
  const styles: Record<string, ResumePdfTextStyle> = {};

  for (const [fontName, rawStyle] of Object.entries(value)) {
    if (!isRecord(rawStyle)) continue;
    styles[fontName] = {
      ascent: finiteNumber(rawStyle.ascent),
      descent: finiteNumber(rawStyle.descent),
      vertical: rawStyle.vertical === true,
      fontFamily: typeof rawStyle.fontFamily === 'string' ? rawStyle.fontFamily : '',
    };
  }

  return styles;
}

export function toResumeJsonValue(value: unknown): ResumeJsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => toResumeJsonValue(item));
  if (!isRecord(value)) return null;

  const output: { [key: string]: ResumeJsonValue } = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    output[key] = toResumeJsonValue(child);
  }
  return output;
}

export function reconstructPdfPageText(
  items: readonly ResumePdfTextContentItem[],
): ReconstructedPdfPageText {
  const positioned = items
    .map((item, sourceItemIndex): PositionedTextItem | null => {
      if (item.kind !== 'TEXT' || !item.str.trim()) return null;
      const x = item.transform[4];
      const y = item.transform[5];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { sourceItemIndex, item, x: x ?? 0, y: y ?? 0 };
    })
    .filter((item): item is PositionedTextItem => item !== null);

  if (positioned.length === 0) return { text: '', lines: [], blocks: [] };

  const medianHeight = median(
    positioned.map(({ item }) => Math.abs(item.height)).filter((height) => height > 0),
  );
  const yTolerance = Math.max(1.5, Math.min(6, (medianHeight || 10) * 0.35));
  const sorted = [...positioned].sort((left, right) => {
    const yDelta = right.y - left.y;
    if (Math.abs(yDelta) > yTolerance) return yDelta;
    return left.x - right.x;
  });

  const visualLines: MutableLine[] = [];
  for (const positionedItem of sorted) {
    const line = visualLines.find(
      (candidate) => Math.abs(candidate.baselineY - positionedItem.y) <= yTolerance,
    );
    if (line) {
      line.items.push(positionedItem);
      line.baselineY = average(line.items.map((entry) => entry.y));
    } else {
      visualLines.push({ baselineY: positionedItem.y, items: [positionedItem] });
    }
  }

  visualLines.sort((left, right) => right.baselineY - left.baselineY);

  const lineDrafts = visualLines.map((line) => {
    const isRtl = line.items.length > 0 && line.items.every(({ item }) => item.dir === 'rtl');
    const ordered = [...line.items].sort((left, right) =>
      isRtl ? right.x - left.x : left.x - right.x,
    );
    const text = joinVisualLine(ordered, isRtl);
    return {
      text,
      boundingBox: boundingBoxForItems(ordered),
      sourceItemIndexes: ordered.map((entry) => entry.sourceItemIndex),
    };
  });

  const lines: ResumeDocumentLine[] = [];
  let cursor = 0;
  for (const draft of lineDrafts) {
    if (!draft.text) continue;
    const startOffset = cursor;
    const endOffset = startOffset + draft.text.length;
    lines.push({
      text: draft.text,
      sourceRange: { startOffset, endOffset },
      boundingBox: draft.boundingBox,
      sourceItemIndexes: draft.sourceItemIndexes,
    });
    cursor = endOffset + 1;
  }

  const text = lines.map((line) => line.text).join('\n');
  const blocks: ResumeDocumentBlock[] = lines.map((line) => ({
    text: line.text,
    sourceRange: line.sourceRange,
    boundingBox: line.boundingBox,
    sourceItemIndexes: line.sourceItemIndexes,
  }));

  return { text, lines, blocks };
}

function joinVisualLine(items: readonly PositionedTextItem[], isRtl: boolean): string {
  let output = '';
  let previous: PositionedTextItem | null = null;

  for (const current of items) {
    const value = current.item.str.replace(/\s+/g, ' ').trim();
    if (!value) continue;

    if (previous && output) {
      const previousStart = previous.x;
      const previousEnd = previous.x + Math.abs(previous.item.width);
      const currentStart = current.x;
      const currentEnd = current.x + Math.abs(current.item.width);
      const gap = isRtl ? previousStart - currentEnd : currentStart - previousEnd;
      const previousCharacterWidth =
        Math.abs(previous.item.width) / Math.max(previous.item.str.trim().length, 1);
      const currentCharacterWidth =
        Math.abs(current.item.width) / Math.max(current.item.str.trim().length, 1);
      const referenceWidth = median([previousCharacterWidth, currentCharacterWidth]) || 4;

      if (gap > Math.max(0.5, referenceWidth * 0.18)) output += ' ';
    }

    output += value;
    previous = current;
  }

  return output.trim();
}

function boundingBoxForItems(items: readonly PositionedTextItem[]): ResumeBoundingBox | null {
  if (items.length === 0) return null;
  const minX = Math.min(...items.map((entry) => entry.x));
  const minY = Math.min(...items.map((entry) => entry.y));
  const maxX = Math.max(...items.map((entry) => entry.x + Math.abs(entry.item.width)));
  const maxY = Math.max(
    ...items.map((entry) => entry.y + Math.max(Math.abs(entry.item.height), 0)),
  );
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => finiteNumber(entry));
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

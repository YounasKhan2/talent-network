import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESUME_DOCX_MIME_TYPE,
  RESUME_PDF_MIME_TYPE,
  validateResumeDocument,
} from './file-validation.js';

function validate(bytes: Buffer, mimeType: string) {
  return validateResumeDocument({
    bytes,
    declaredMimeType: mimeType,
    declaredSizeBytes: bytes.length,
    maxSizeBytes: 10 * 1024 * 1024,
  });
}

void test('accepts a structurally plausible unencrypted PDF', () => {
  const bytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n', 'latin1');
  const result = validate(bytes, RESUME_PDF_MIME_TYPE);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, 'PDF');
  assert.equal(result.detectedMimeType, RESUME_PDF_MIME_TYPE);
  assert.match(result.checksumSha256, /^[a-f0-9]{64}$/);
});

void test('rejects a spoofed PDF signature', () => {
  const bytes = Buffer.from('not-a-pdf%%EOF', 'latin1');
  const result = validate(bytes, RESUME_PDF_MIME_TYPE);
  assert.deepEqual(result, {
    ok: false,
    code: 'SIGNATURE_MISMATCH',
    message: 'Declared PDF does not have a PDF file signature.',
  });
});

void test('rejects encrypted PDFs', () => {
  const bytes = Buffer.from('%PDF-1.7\n/Encrypt 4 0 R\n%%EOF', 'latin1');
  const result = validate(bytes, RESUME_PDF_MIME_TYPE);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'ENCRYPTED_DOCUMENT');
});

void test('accepts a structurally valid DOCX OOXML ZIP container', () => {
  const bytes = createStoredZip(['[Content_Types].xml', 'word/document.xml']);
  const result = validate(bytes, RESUME_DOCX_MIME_TYPE);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, 'DOCX');
  assert.equal(result.detectedMimeType, RESUME_DOCX_MIME_TYPE);
});

void test('rejects truncated DOCX containers even when required names are present', () => {
  const valid = createStoredZip(['[Content_Types].xml', 'word/document.xml']);
  const bytes = valid.subarray(0, valid.length - 10);
  const result = validate(bytes, RESUME_DOCX_MIME_TYPE);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'CORRUPT_DOCUMENT');
});

void test('rejects DOCX containers missing the Word document part', () => {
  const bytes = createStoredZip(['[Content_Types].xml', 'custom/data.xml']);
  const result = validate(bytes, RESUME_DOCX_MIME_TYPE);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'CORRUPT_DOCUMENT');
});

void test('rejects encrypted ZIP entries presented as DOCX', () => {
  const bytes = createStoredZip(['[Content_Types].xml', 'word/document.xml'], true);
  const result = validate(bytes, RESUME_DOCX_MIME_TYPE);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'ENCRYPTED_DOCUMENT');
});

void test('rejects encrypted Office compound documents presented as DOCX', () => {
  const bytes = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.from('encrypted-office-document', 'latin1'),
  ]);
  const result = validate(bytes, RESUME_DOCX_MIME_TYPE);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'ENCRYPTED_DOCUMENT');
});

void test('rejects recorded-size mismatches before processing', () => {
  const bytes = Buffer.from('%PDF-1.7\n%%EOF\n', 'latin1');
  const result = validateResumeDocument({
    bytes,
    declaredMimeType: RESUME_PDF_MIME_TYPE,
    declaredSizeBytes: bytes.length + 1,
    maxSizeBytes: 10 * 1024 * 1024,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'CORRUPT_DOCUMENT');
});

function createStoredZip(entryNames: string[], encrypted = false): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entryName of entryNames) {
    const name = Buffer.from(entryName, 'utf8');
    const flags = encrypted ? 0x0001 : 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(0, 18);
    localHeader.writeUInt32LE(0, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(0, 20);
    centralHeader.writeUInt32LE(0, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length;
  }

  const local = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entryNames.length, 8);
  eocd.writeUInt16LE(entryNames.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, central, eocd]);
}

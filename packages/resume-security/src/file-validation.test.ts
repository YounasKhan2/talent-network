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

test('accepts a structurally plausible unencrypted PDF', () => {
  const bytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n', 'latin1');
  const result = validate(bytes, RESUME_PDF_MIME_TYPE);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, 'PDF');
  assert.equal(result.detectedMimeType, RESUME_PDF_MIME_TYPE);
  assert.match(result.checksumSha256, /^[a-f0-9]{64}$/);
});

test('rejects a spoofed PDF signature', () => {
  const bytes = Buffer.from('not-a-pdf%%EOF', 'latin1');
  const result = validate(bytes, RESUME_PDF_MIME_TYPE);
  assert.deepEqual(result, {
    ok: false,
    code: 'SIGNATURE_MISMATCH',
    message: 'Declared PDF does not have a PDF file signature.',
  });
});

test('rejects encrypted PDFs', () => {
  const bytes = Buffer.from('%PDF-1.7\n/Encrypt 4 0 R\n%%EOF', 'latin1');
  const result = validate(bytes, RESUME_PDF_MIME_TYPE);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'ENCRYPTED_DOCUMENT');
});

test('accepts a DOCX-like OOXML ZIP container', () => {
  const bytes = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('placeholder [Content_Types].xml placeholder word/document.xml', 'latin1'),
  ]);
  const result = validate(bytes, RESUME_DOCX_MIME_TYPE);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, 'DOCX');
});

test('rejects encrypted Office compound documents presented as DOCX', () => {
  const bytes = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.from('encrypted-office-document', 'latin1'),
  ]);
  const result = validate(bytes, RESUME_DOCX_MIME_TYPE);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'ENCRYPTED_DOCUMENT');
});

test('rejects recorded-size mismatches before processing', () => {
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

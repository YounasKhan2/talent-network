import { createHash } from 'node:crypto';

export const RESUME_PDF_MIME_TYPE = 'application/pdf';
export const RESUME_DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ResumeDocumentKind = 'PDF' | 'DOCX';

export type ResumeValidationFailureCode =
  | 'FILE_EMPTY'
  | 'FILE_TOO_LARGE'
  | 'SIGNATURE_MISMATCH'
  | 'CORRUPT_DOCUMENT'
  | 'ENCRYPTED_DOCUMENT'
  | 'UNSUPPORTED_DOCUMENT';

export interface ResumeValidationSuccess {
  ok: true;
  kind: ResumeDocumentKind;
  detectedMimeType: typeof RESUME_PDF_MIME_TYPE | typeof RESUME_DOCX_MIME_TYPE;
  sizeBytes: number;
  checksumSha256: string;
}

export interface ResumeValidationFailure {
  ok: false;
  code: ResumeValidationFailureCode;
  message: string;
}

export type ResumeValidationResult = ResumeValidationSuccess | ResumeValidationFailure;

export interface ValidateResumeDocumentInput {
  bytes: Uint8Array;
  declaredMimeType: string;
  declaredSizeBytes: number;
  maxSizeBytes: number;
}

const PDF_HEADER = Buffer.from('%PDF-', 'ascii');
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_COMPOUND_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PDF_EOF_SEARCH_WINDOW_BYTES = 4096;

export function validateResumeDocument(
  input: ValidateResumeDocumentInput,
): ResumeValidationResult {
  const bytes = Buffer.from(input.bytes);

  if (bytes.length === 0 || input.declaredSizeBytes <= 0) {
    return failure('FILE_EMPTY', 'Resume document is empty.');
  }

  if (bytes.length > input.maxSizeBytes || input.declaredSizeBytes > input.maxSizeBytes) {
    return failure('FILE_TOO_LARGE', 'Resume document exceeds the configured size limit.');
  }

  if (bytes.length !== input.declaredSizeBytes) {
    return failure(
      'CORRUPT_DOCUMENT',
      'Stored resume byte length does not match the recorded upload size.',
    );
  }

  if (input.declaredMimeType === RESUME_PDF_MIME_TYPE) {
    return validatePdf(bytes);
  }

  if (input.declaredMimeType === RESUME_DOCX_MIME_TYPE) {
    return validateDocx(bytes);
  }

  return failure('UNSUPPORTED_DOCUMENT', 'Resume document MIME type is not supported.');
}

function validatePdf(bytes: Buffer): ResumeValidationResult {
  if (!startsWith(bytes, PDF_HEADER)) {
    return failure('SIGNATURE_MISMATCH', 'Declared PDF does not have a PDF file signature.');
  }

  const text = bytes.toString('latin1');
  if (text.includes('/Encrypt')) {
    return failure('ENCRYPTED_DOCUMENT', 'Password-protected or encrypted PDFs are not supported.');
  }

  const tailStart = Math.max(0, bytes.length - PDF_EOF_SEARCH_WINDOW_BYTES);
  if (!bytes.subarray(tailStart).toString('latin1').includes('%%EOF')) {
    return failure('CORRUPT_DOCUMENT', 'PDF trailer is missing or incomplete.');
  }

  return success('PDF', RESUME_PDF_MIME_TYPE, bytes);
}

function validateDocx(bytes: Buffer): ResumeValidationResult {
  if (startsWith(bytes, OLE_COMPOUND_HEADER)) {
    return failure(
      'ENCRYPTED_DOCUMENT',
      'Encrypted Office documents are not supported for resume processing.',
    );
  }

  if (!startsWith(bytes, ZIP_LOCAL_HEADER)) {
    return failure('SIGNATURE_MISMATCH', 'Declared DOCX does not have an OOXML ZIP signature.');
  }

  const archiveText = bytes.toString('latin1');
  if (!archiveText.includes('[Content_Types].xml') || !archiveText.includes('word/')) {
    return failure('CORRUPT_DOCUMENT', 'DOCX container is missing required OOXML entries.');
  }

  return success('DOCX', RESUME_DOCX_MIME_TYPE, bytes);
}

function success(
  kind: ResumeDocumentKind,
  detectedMimeType: ResumeValidationSuccess['detectedMimeType'],
  bytes: Buffer,
): ResumeValidationSuccess {
  return {
    ok: true,
    kind,
    detectedMimeType,
    sizeBytes: bytes.length,
    checksumSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function failure(code: ResumeValidationFailureCode, message: string): ResumeValidationFailure {
  return { ok: false, code, message };
}

function startsWith(bytes: Buffer, prefix: Buffer): boolean {
  return bytes.length >= prefix.length && bytes.subarray(0, prefix.length).equals(prefix);
}

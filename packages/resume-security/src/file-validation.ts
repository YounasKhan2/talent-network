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
const ZIP_LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_COMPOUND_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PDF_EOF_SEARCH_WINDOW_BYTES = 4096;
const ZIP_EOCD_MIN_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 65_535;
const ZIP_ENCRYPTED_FLAG = 0x0001;

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

  const archive = inspectZipContainer(bytes);
  if (!archive.ok) {
    return failure(
      archive.encrypted ? 'ENCRYPTED_DOCUMENT' : 'CORRUPT_DOCUMENT',
      archive.encrypted
        ? 'Encrypted OOXML ZIP containers are not supported for resume processing.'
        : 'DOCX ZIP container is malformed or incomplete.',
    );
  }

  if (!archive.entries.has('[Content_Types].xml') || !archive.entries.has('word/document.xml')) {
    return failure('CORRUPT_DOCUMENT', 'DOCX container is missing required OOXML entries.');
  }

  return success('DOCX', RESUME_DOCX_MIME_TYPE, bytes);
}

interface ZipInspectionSuccess {
  ok: true;
  entries: Set<string>;
}

interface ZipInspectionFailure {
  ok: false;
  encrypted: boolean;
}

function inspectZipContainer(bytes: Buffer): ZipInspectionSuccess | ZipInspectionFailure {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0 || eocdOffset + ZIP_EOCD_MIN_BYTES > bytes.length) {
    return { ok: false, encrypted: false };
  }

  const diskNumber = bytes.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = bytes.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocdOffset + 8);
  const totalEntries = bytes.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  const commentLength = bytes.readUInt16LE(eocdOffset + 20);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== totalEntries ||
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    eocdOffset + ZIP_EOCD_MIN_BYTES + commentLength !== bytes.length
  ) {
    return { ok: false, encrypted: false };
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    centralDirectoryOffset < 0 ||
    centralDirectoryEnd > eocdOffset ||
    centralDirectoryEnd > bytes.length
  ) {
    return { ok: false, encrypted: false };
  }

  const entries = new Set<string>();
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > centralDirectoryEnd) return { ok: false, encrypted: false };
    if (bytes.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      return { ok: false, encrypted: false };
    }

    const flags = bytes.readUInt16LE(cursor + 8);
    if ((flags & ZIP_ENCRYPTED_FLAG) !== 0) return { ok: false, encrypted: true };

    const fileNameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const fileCommentLength = bytes.readUInt16LE(cursor + 32);
    const localHeaderOffset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + fileNameLength + extraLength + fileCommentLength;

    if (next > centralDirectoryEnd || localHeaderOffset + 30 > bytes.length) {
      return { ok: false, encrypted: false };
    }
    if (bytes.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_HEADER_SIGNATURE) {
      return { ok: false, encrypted: false };
    }

    const localFlags = bytes.readUInt16LE(localHeaderOffset + 6);
    if ((localFlags & ZIP_ENCRYPTED_FLAG) !== 0) return { ok: false, encrypted: true };

    const name = bytes.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8');
    if (!name || name.includes('\\') || name.startsWith('/') || name.includes('../')) {
      return { ok: false, encrypted: false };
    }
    entries.add(name);
    cursor = next;
  }

  if (cursor !== centralDirectoryEnd) return { ok: false, encrypted: false };
  return { ok: true, entries };
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  if (bytes.length < ZIP_EOCD_MIN_BYTES) return -1;
  const earliest = Math.max(0, bytes.length - ZIP_EOCD_MIN_BYTES - ZIP_MAX_COMMENT_BYTES);
  for (let offset = bytes.length - ZIP_EOCD_MIN_BYTES; offset >= earliest; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }
  return -1;
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

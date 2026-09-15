import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpResumeOcrEngine } from './http-ocr-engine.js';

const INPUT = {
  resumeVersionId: '11111111-1111-4111-8111-111111111111',
  mimeType: 'application/pdf',
  bytes: new Uint8Array([1, 2, 3]),
};

void test('HTTP OCR adapter normalizes provider pages into ResumeDocument', async () => {
  const engine = new HttpResumeOcrEngine({
    endpoint: 'http://ocr.internal/v1/recognize',
    fetchImpl: (_input, init) => {
      assert.equal(init?.method, 'POST');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('content-type'), 'application/pdf');
      assert.equal(headers.get('x-resume-version-id'), INPUT.resumeVersionId);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pages: [
              {
                pageNumber: 1,
                text: 'Alex Morgan\r\n\r\nSenior Software Engineer with TypeScript and PostgreSQL experience.',
              },
            ],
            warnings: ['LOW_CONTRAST'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    },
  });

  const result = await engine.recognize(INPUT);

  assert.equal(result.document.extractionMethod, 'OCR');
  assert.equal(result.document.extractor.name, 'http-ocr-service');
  assert.equal(result.document.pages[0]?.pageNumber, 1);
  assert.match(result.document.text, /Alex Morgan/);
  assert.equal(result.document.quality.pageCount, 1);
  assert.deepEqual(result.document.quality.warnings, ['LOW_CONTRAST']);
  assert.equal(result.document.pages[0]?.blocks.length, 2);
});

void test('HTTP OCR adapter classifies transient provider failures as retryable service errors', async () => {
  const engine = new HttpResumeOcrEngine({
    endpoint: 'http://ocr.internal/v1/recognize',
    fetchImpl: () => Promise.resolve(new Response('busy', { status: 503 })),
  });

  await assert.rejects(() => engine.recognize(INPUT), /RESUME_OCR_SERVICE_UNAVAILABLE:HTTP_503/);
});

void test('HTTP OCR adapter rejects malformed provider responses', async () => {
  const engine = new HttpResumeOcrEngine({
    endpoint: 'http://ocr.internal/v1/recognize',
    fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ pages: [] }), { status: 200 })),
  });

  await assert.rejects(
    () => engine.recognize(INPUT),
    /RESUME_OCR_RECOGNITION_FAILED:INVALID_PAGES/,
  );
});

void test('HTTP OCR adapter never accepts unbounded response payloads', async () => {
  const engine = new HttpResumeOcrEngine({
    endpoint: 'http://ocr.internal/v1/recognize',
    maximumResponseBytes: 32,
    fetchImpl: () =>
      Promise.resolve(
        new Response(JSON.stringify({ pages: [{ pageNumber: 1, text: 'x'.repeat(100) }] }), {
          status: 200,
        }),
      ),
  });

  await assert.rejects(
    () => engine.recognize(INPUT),
    /RESUME_OCR_RECOGNITION_FAILED:RESPONSE_TOO_LARGE/,
  );
});

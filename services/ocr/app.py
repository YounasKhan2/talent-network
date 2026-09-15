from __future__ import annotations

import asyncio
import os
from io import BytesIO
from typing import Any

import fitz
import pytesseract
from fastapi import FastAPI, Header, HTTPException, Request, status
from PIL import Image

APP_NAME = "talent-network-local-ocr"
APP_VERSION = "1"
MAX_SOURCE_BYTES = int(os.getenv("OCR_MAX_SOURCE_BYTES", str(10 * 1024 * 1024)))
MAX_PAGES = int(os.getenv("OCR_MAX_PAGES", "100"))
MAX_NORMALIZED_CHARACTERS = int(os.getenv("OCR_MAX_NORMALIZED_CHARACTERS", "500000"))
OCR_DPI = int(os.getenv("OCR_DPI", "200"))
OCR_PAGE_TIMEOUT_SECONDS = int(os.getenv("OCR_PAGE_TIMEOUT_SECONDS", "30"))
SERVICE_TOKEN = os.getenv("OCR_SERVICE_TOKEN")

app = FastAPI(title=APP_NAME, version=APP_VERSION, docs_url=None, redoc_url=None)
ocr_semaphore = asyncio.Semaphore(1)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": APP_NAME, "version": APP_VERSION}


@app.post("/v1/recognize")
async def recognize(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _authorize(authorization)

    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only application/pdf OCR input is supported.",
        )

    declared_length = request.headers.get("content-length")
    if declared_length is not None:
        try:
            if int(declared_length) > MAX_SOURCE_BYTES:
                raise HTTPException(status_code=413, detail="OCR source exceeds size limit.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid content-length header.") from None

    payload = await _read_bounded_body(request)
    if len(payload) == 0:
        raise HTTPException(status_code=400, detail="OCR source is empty.")

    async with ocr_semaphore:
        try:
            return await asyncio.to_thread(_recognize_pdf, payload)
        except fitz.FileDataError as error:
            raise HTTPException(status_code=422, detail="Invalid PDF source.") from error
        except pytesseract.TesseractError as error:
            raise HTTPException(status_code=502, detail="OCR engine failed.") from error
        except RuntimeError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error


async def _read_bounded_body(request: Request) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        if not chunk:
            continue
        total += len(chunk)
        if total > MAX_SOURCE_BYTES:
            raise HTTPException(status_code=413, detail="OCR source exceeds size limit.")
        chunks.append(chunk)
    return b"".join(chunks)


def _authorize(authorization: str | None) -> None:
    if not SERVICE_TOKEN:
        return
    expected = f"Bearer {SERVICE_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")


def _recognize_pdf(payload: bytes) -> dict[str, Any]:
    document = fitz.open(stream=payload, filetype="pdf")
    try:
        if document.page_count == 0:
            raise RuntimeError("PDF contains no pages.")
        if document.page_count > MAX_PAGES:
            raise RuntimeError("PDF exceeds OCR page limit.")

        pages: list[dict[str, Any]] = []
        warnings: list[str] = []
        total_characters = 0
        zoom = OCR_DPI / 72
        matrix = fitz.Matrix(zoom, zoom)

        for index in range(document.page_count):
            page = document.load_page(index)
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            image = Image.open(BytesIO(pixmap.tobytes("png")))
            text = pytesseract.image_to_string(
                image,
                lang="eng",
                config="--oem 1 --psm 3",
                timeout=OCR_PAGE_TIMEOUT_SECONDS,
            )
            normalized = _normalize_text(text)
            total_characters += len(normalized)
            if total_characters > MAX_NORMALIZED_CHARACTERS:
                raise RuntimeError("OCR output exceeds normalized character limit.")
            if not normalized:
                warnings.append(f"NO_TEXT_PAGE_{index + 1}")
            pages.append({"pageNumber": index + 1, "text": normalized})

        return {"pages": pages, "warnings": warnings}
    finally:
        document.close()


def _normalize_text(value: str) -> str:
    lines = [line.rstrip() for line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    output: list[str] = []
    blank_pending = False
    for line in lines:
        if not line.strip():
            blank_pending = bool(output)
            continue
        if blank_pending:
            output.append("")
            blank_pending = False
        output.append(line.strip())
    return "\n".join(output).strip()

from __future__ import annotations

import argparse
import json
import os
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw, ImageFont

EXPECTED_PHRASES = ["Alex Morgan", "Senior Software Engineer", "TypeScript", "PostgreSQL"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate and OCR a deterministic scanned resume PDF.")
    parser.add_argument("--output", type=Path, help="Optional path to write the generated scanned PDF.")
    parser.add_argument(
        "--endpoint",
        default="http://127.0.0.1:4010/v1/recognize",
        help="OCR recognize endpoint.",
    )
    args = parser.parse_args()

    pdf_bytes = create_scanned_resume_pdf()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(pdf_bytes)

    headers = {
        "Content-Type": "application/pdf",
        "Accept": "application/json",
        "X-Resume-Version-Id": "00000000-0000-4000-8000-000000000001",
    }
    token = os.getenv("OCR_SERVICE_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = Request(args.endpoint, data=pdf_bytes, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"OCR smoke request failed: HTTP {error.code}: {body}") from error

    pages = payload.get("pages")
    if not isinstance(pages, list) or len(pages) != 1:
        raise SystemExit(f"Expected exactly one OCR page, received: {payload!r}")
    text = pages[0].get("text", "")
    missing = [phrase for phrase in EXPECTED_PHRASES if phrase.lower() not in text.lower()]
    if missing:
        raise SystemExit(f"OCR smoke output is missing expected phrases: {missing}. Text: {text!r}")

    print("Local OCR smoke passed.")
    print(f"Recognized {len(text)} characters on page 1.")
    if args.output:
        print(f"Scanned fixture written to {args.output}.")


def create_scanned_resume_pdf() -> bytes:
    image = Image.new("L", (1000, 1400), color=255)
    draw = ImageDraw.Draw(image)
    title = _font(42, bold=True)
    body = _font(28)

    y = 80
    draw.text((80, y), "Alex Morgan", font=title, fill=0)
    y += 80
    lines = [
        "Senior Software Engineer",
        "TypeScript React NestJS PostgreSQL Redis",
        "",
        "EXPERIENCE",
        "Built production web applications and secure APIs.",
        "Designed background processing and observability workflows.",
        "Implemented automated testing and cloud deployment practices.",
        "",
        "SKILLS",
        "TypeScript JavaScript React NestJS PostgreSQL Redis Docker",
    ]
    for line in lines:
        draw.text((80, y), line, font=body, fill=0)
        y += 52

    buffer = BytesIO()
    image.save(buffer, format="PDF", resolution=150.0)
    return buffer.getvalue()


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    )
    try:
        return ImageFont.truetype(candidates, size=size)
    except OSError:
        return ImageFont.load_default()


if __name__ == "__main__":
    main()

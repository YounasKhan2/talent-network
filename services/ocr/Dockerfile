FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/ocr/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ocr/app.py ./app.py

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 4010

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4010", "--workers", "1", "--no-access-log"]

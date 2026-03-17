# syntax=docker/dockerfile:1
FROM python:3.11-slim AS builder

WORKDIR /app
RUN pip install uv
COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

FROM python:3.11-slim

# System deps for OpenCV, pyzbar, Tesseract
RUN apt-get update && apt-get install -y --no-install-recommends \
    libzbar0 \
    tesseract-ocr \
    tesseract-ocr-rus \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

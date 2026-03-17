# syntax=docker/dockerfile:1
FROM python:3.11-slim AS builder

WORKDIR /build
RUN pip install uv
COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project --python 3.11

FROM python:3.11-slim

# System deps for OpenCV, pyzbar, Tesseract
RUN apt-get update && apt-get install -y --no-install-recommends \
    libzbar0 \
    tesseract-ocr \
    tesseract-ocr-rus \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install venv outside /app so volume mounts don't shadow it
COPY --from=builder /build/.venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY . .

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

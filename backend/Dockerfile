# syntax=docker/dockerfile:1
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

RUN pip install --no-cache-dir uv

# Install dependencies first (cache layer)
COPY pyproject.toml .
# Stub packages so the project is installable without full source
RUN mkdir -p app workers && touch app/__init__.py workers/__init__.py
RUN uv pip install --system --no-cache-dir .

# Copy source
COPY . .

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

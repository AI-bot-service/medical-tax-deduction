# syntax=docker/dockerfile:1
FROM python:3.11-slim

# System deps: libzbar0 for QR scanning, libgl1/libglib2.0 for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libzbar0 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN mkdir -p app workers && touch app/__init__.py workers/__init__.py
RUN uv pip install --system --no-cache-dir .

COPY . .

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

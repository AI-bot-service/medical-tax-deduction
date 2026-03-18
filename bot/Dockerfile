# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN mkdir -p handlers services && touch handlers/__init__.py services/__init__.py
RUN uv pip install --system --no-cache-dir .

COPY . .

CMD ["python", "main.py"]

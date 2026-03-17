# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app
RUN pip install uv
COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

COPY . .
ENV PATH="/app/.venv/bin:$PATH"

CMD ["python", "main.py"]

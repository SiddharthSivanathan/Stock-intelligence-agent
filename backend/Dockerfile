# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps:
#   - build-essential, gcc : needed by some wheels (pydantic-core, sentence-transformers later)
#   - curl                 : useful for healthchecks
#   - libpq-dev            : will be needed by asyncpg in Phase 1
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        libpq-dev \
 && rm -rf /var/lib/apt/lists/*

# Install Python deps first to maximize layer cache reuse.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy app source (overlaid by bind-mount in dev compose).
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

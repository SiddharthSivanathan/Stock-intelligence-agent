# =============================================================================
# Dev Dockerfile — TypeScript backend
# Runs `tsx watch` so edits under /app/src hot-reload, mirroring the Python
# backend's `uvicorn --reload` behaviour.
# =============================================================================
# Debian-based; Prisma's glibc engines work without any openssl wrangling.
FROM node:20-slim

# OpenSSL is needed by Prisma's query engine at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Prisma client needs the schema at install time.
COPY prisma ./prisma
RUN npx prisma generate

# Source is bind-mounted in docker-compose, but copy as a fallback for plain `docker run`.
COPY tsconfig.json ./
COPY src ./src

EXPOSE 8000

# Schema is owned by the Python backend's Alembic migrations; we just connect
# to the existing tables. `prisma generate` already ran above.
CMD ["npm", "run", "dev"]

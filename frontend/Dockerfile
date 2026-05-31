# syntax=docker/dockerfile:1.7
# Dev image — runs Vite dev server with HMR. Phase 12 will add a prod image
# that builds static assets and serves them via nginx.
FROM node:20-alpine

WORKDIR /app

# Install deps first for layer cache
COPY package.json ./
RUN npm install --no-audit --no-fund

# Source mounted at runtime via docker-compose bind mount; this COPY is just
# so the image is runnable standalone for one-off builds/inspection.
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]

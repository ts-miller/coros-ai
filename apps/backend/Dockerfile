# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache openssl python3 make g++

WORKDIR /app

ENV PRISMA_CLI_QUERY_ENGINE_TYPE=binary
ENV PRISMA_CLIENT_ENGINE_TYPE=binary

# Copy workspace manifests and install prod deps (tsx is a devDep but needed at runtime)
COPY package.json ./
COPY package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm install --workspace=apps/backend

# Copy source and Prisma schema
COPY apps/backend/src ./apps/backend/src
COPY apps/backend/prisma ./apps/backend/prisma

# Generate Prisma client
RUN cd apps/backend && npx prisma generate

EXPOSE 3000

WORKDIR /app/apps/backend
CMD ["npx", "tsx", "src/index.ts"]

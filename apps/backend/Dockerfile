# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy workspace manifests and install prod deps (tsx is a devDep but needed at runtime)
COPY package.json ./
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

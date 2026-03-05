# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app/apps/frontend

COPY apps/frontend/package.json ./
RUN npm install

COPY apps/frontend .

RUN npm run build -- --configuration=production

# ── Runtime stage — Nginx ────────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/frontend/dist/frontend/browser /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Cache tải gói của npm giữ lại giữa các lần build: đổi package-lock chỉ tải gói mới.
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# "npm run build" đã chạy prisma generate trước next build.
# Cache biên dịch của Next (.next/cache) giữ lại giữa các lần deploy: chỉ build lại phần code đổi.
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Asia/Ho_Chi_Minh
RUN apk add --no-cache tzdata
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["node", "server.js"]

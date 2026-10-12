# MCP server chạy bằng Docker để máy không cần cài Node.js. Build từ gốc repo:
#   docker build -f mcp/Dockerfile -t qltrungtam-mcp .
FROM node:22-alpine
WORKDIR /app
ENV TZ=Asia/Ho_Chi_Minh \
    NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache tzdata openssl

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src/lib ./src/lib
COPY mcp ./mcp

USER node
ENTRYPOINT ["node_modules/.bin/tsx", "mcp/server.ts"]

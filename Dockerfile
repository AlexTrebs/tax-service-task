FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/tax.db
COPY --from=deps /app/node_modules ./node_modules
COPY package.json openapi.yaml ./
COPY src ./src
RUN mkdir -p /app/data && chown -R bun:bun /app/data
USER bun
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["bun", "run", "src/index.ts"]

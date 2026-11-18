# Published to Docker Hub for linux/amd64 and linux/arm64 (the Oracle VPS).
#
# Stage 1 runs on the CI machine's own architecture ($BUILDPLATFORM), so no slow
# CPU emulation is needed. That is safe because every dependency is pure
# JavaScript (express, pg, ws), so node_modules is the same on amd64 and arm64.
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: the runtime image for the target architecture (only COPY, no RUN).
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER node
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/health > /dev/null || exit 1

CMD ["node", "src/server.js"]

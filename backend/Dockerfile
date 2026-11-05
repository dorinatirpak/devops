# Multi-arch base image: works on the ARM64 (aarch64) VPS and on x86 CI runners.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production deps first so this layer is cached between deploys.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

USER node
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/health > /dev/null || exit 1

CMD ["node", "src/server.js"]

# Published to Docker Hub for linux/amd64 and linux/arm64 (the Oracle VPS).

# ---- Stage 1: build the static React bundle ----
# Runs on the CI machine's own architecture: the output is plain HTML/JS/CSS,
# identical for every platform, so there is no need to emulate ARM here.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: serve it with nginx (tiny final image, no Node inside) ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1

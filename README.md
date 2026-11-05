# Neon Gothic Amőba

Gomoku/Amőba (15×15, five in a row) with **PvP** and **PvE** modes, a match history and a leaderboard.
University DevOps project: the focus is the **testing → CI/CD → Docker deployment** lifecycle.

| Tier | Tech | Container | Host port |
|------|------|-----------|-----------|
| Frontend | React 18 + Vite, served by nginx | `amoba-frontend-1` | `8090` (public via NPM) |
| Backend | Node 22 + Express | `amoba-backend-1` | `127.0.0.1:4010` (server-local only) |
| Database | PostgreSQL 16 | `amoba-db-1` | none (internal network only) |

> **Isolation from `hazi-projekt`:** the old project already uses host ports 8080/4000.
> Amőba uses its own compose project name (`amoba`), its own folder (`~/amoba`), its own
> networks and volume, and ports 8090/4010. Deploying Amőba never touches `~/hazi-projekt`.
> To make Amőba take over 8080/4000 later, stop `hazi-projekt` and change `FRONTEND_PORT`/`BACKEND_PORT`.

---

## 1. Architecture

```
 Browser ──HTTPS──► Cloudflare DNS ──► Oracle VPS :443
                                          │
                              Nginx Proxy Manager (npm-npm-1, Let's Encrypt)
                              amoba.devops-ora.tech  →  <host>:8090
                                          │
 ┌──────────────────────── docker compose project "amoba" ─────────────────────────┐
 │                                                                                  │
 │  frontend (nginx :80) ── /api/* ──►  backend (Express :4000) ──►  db (Postgres)  │
 │     static React files      "web" network       "data" network (internal)       │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

* **Container-to-container traffic** uses Docker's embedded DNS: the frontend's nginx proxies
  `/api/` to `http://backend:4000`, the backend connects to `postgres://…@db:5432/amoba`.
* **Two networks** enforce the tiers: `web` (frontend ↔ backend) and `data` (backend ↔ db,
  `internal: true`). The frontend physically cannot reach the database, and the DB has no host port.
* **One public entry point:** NPM only needs a single proxy host (→ 8090). Because the React app
  calls relative `/api/...` URLs, there is no CORS and no second domain. The backend's 4010 port is
  bound to `127.0.0.1` purely for `curl` health checks during the demo.
* **Healthchecks + `depends_on: service_healthy`** give a deterministic start order:
  db → backend → frontend. `docker compose up --wait` blocks until all three are healthy, which the
  pipeline uses as a deployment gate.
* **ARM64:** every base image (`node:22-alpine`, `nginx:1.27-alpine`, `postgres:16-alpine`) is
  multi-arch. CI builds amd64 images to run E2E; the VPS builds arm64 images natively during deploy
  (the repo is private, so free GitHub ARM runners aren't available, and QEMU emulation is slow).

## 2. Nginx Proxy Manager setup (one time)

1. **Cloudflare:** add an `A` record `amoba` → the VPS public IP (same as your other records).
   If you use the orange-cloud proxy, set SSL/TLS mode to *Full (strict)*.
2. **NPM (`https://<server>:8181`) → Hosts → Proxy Hosts → Add**
   * Domain: `amoba.devops-ora.tech`
   * Scheme `http`, Forward Hostname/IP: **the same host/IP you used for the hazi-projekt proxy host**
     (NPM runs in its own container, so it's the host's IP / Docker gateway, not `localhost`),
     Forward Port: **`8090`**
   * Enable *Block Common Exploits* and *Websockets Support*
   * SSL tab: *Request a new Let's Encrypt certificate*, *Force SSL*, *HTTP/2*.

No firewall change is needed: 8090 is only reached by NPM on the same machine.

## 3. CI/CD pipeline — `.github/workflows/deploy.yml`

```
push to main
   ├─► backend-tests   (unit + integration against a Postgres service container)
   ├─► frontend-tests  (unit + React Testing Library, then `vite build`)
   └─► e2e             (docker compose up the real 3-tier stack → Playwright/Chromium)
          └─► deploy   (only on push to main, only if everything above is green)
                 1. tar the source → ssh → ~/amoba   (the server has no git)
                 2. write ~/amoba/.env from GitHub Secrets
                 3. docker compose up -d --build --wait   (native ARM64 build)
                 4. smoke test: curl /api/health + frontend on the server
```

Pull requests run all tests but never deploy. The UI footer shows `build <commit sha>`, so during
the presentation you can prove the live site runs the commit you just pushed.

### GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Value |
|--------|-------|
| `SSH_HOST` | `devops-ora.tech` (or the VPS public IP) |
| `SSH_USER` | `dorina` |
| `SSH_PRIVATE_KEY` | private key of a **dedicated deploy key** (see below) |
| `SSH_KNOWN_HOSTS` | output of `ssh-keyscan devops-ora.tech` (pins the server's host key) |
| `POSTGRES_PASSWORD` | a long random string (e.g. `openssl rand -hex 24`) |

Create a dedicated deploy key instead of reusing your personal Oracle key:

```bash
ssh-keygen -t ed25519 -C "github-actions-amoba" -f amoba_deploy -N ""
ssh-copy-id -i amoba_deploy.pub devops-ora.tech        # or append it to ~/.ssh/authorized_keys
gh secret set SSH_PRIVATE_KEY < amoba_deploy
ssh-keyscan devops-ora.tech | gh secret set SSH_KNOWN_HOSTS
```

## 4. Testing strategy

| Level | Tool | What it proves | Where |
|-------|------|----------------|-------|
| Unit (frontend) | Vitest | win detection, draw, AI picks win/blocks | `frontend/src/game/logic.test.js` |
| Unit (backend) | Vitest | request validation rules | `backend/tests/unit/` |
| Component | **React Testing Library** + user-event | UI behaves like a user sees it: turns, winner banner, PvE AI reply, POST sent | `frontend/src/**/*.test.jsx` |
| Integration | Vitest + Supertest + **real PostgreSQL** | HTTP → Express → SQL → response, leaderboard aggregation | `backend/tests/integration/` |
| E2E | **Playwright** (Chromium) | browser → nginx → Express → Postgres → UI on the actual compose stack | `e2e/tests/` |

Why Playwright over Cypress: first-class headless Chromium in GitHub Actions
(`npx playwright install --with-deps`), official linux-arm64 builds (so the same suite can also run
on the VPS: `BASE_URL=https://amoba.devops-ora.tech npx playwright test`), auto-waiting assertions
(no flaky sleeps), and an HTML report + traces uploaded as a pipeline artifact.

## 5. Running locally

```bash
# Unit + component tests (no Docker needed)
cd backend && npm ci && npm run test:unit
cd frontend && npm ci && npm test

# Integration tests (needs Postgres)
docker run --rm -d --name amoba-pg -p 5432:5432 -e POSTGRES_USER=amoba -e POSTGRES_PASSWORD=amoba -e POSTGRES_DB=amoba_test postgres:16-alpine
cd backend && npm run test:integration

# Whole stack + E2E
cp .env.example .env
docker compose up -d --build --wait
cd e2e && npm ci && npx playwright install chromium && npx playwright test
```

## 6. Presentation checklist (Dec 9)

1. Show `docker compose ps` on the server: 3 healthy containers, DB without a host port.
2. Make a small visible change, `git push`.
3. Show the Actions run: 3 test jobs → E2E → deploy; open the Playwright HTML report artifact.
4. Refresh `https://amoba.devops-ora.tech` — footer shows the new commit sha.
5. Play a PvE match, show the leaderboard update (persisted in Postgres across redeploys).

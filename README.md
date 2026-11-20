# Neon Requiem

Five-in-a-row (Gomoku, 15×15). Enter your name once, then either **Find Opponent** (online matchmaking against another real player on their own device) or **Play vs AI**. Match history and a leaderboard are stored in PostgreSQL. Internally the stack is still called `amoba` (compose project, folder, images).
University DevOps project: the focus is the **testing → CI/CD → Docker deployment** lifecycle.

| Tier | Tech | Container | Host port |
| ------ | ------ | ----------- | ----------- |
| Frontend | React 18 + Vite, served by nginx | `amoba-frontend-1` | `8090` (public via NPM) |
| Backend | Node 22 + Express | `amoba-backend-1` | `127.0.0.1:4010` (server-local only) |
| Database | PostgreSQL 16 | `amoba-db-1` | none (internal network only) |

> **Isolation from `hazi-projekt`:** the old project already uses host ports 8080/4000.
> Neon Requiem uses its own compose project name (`amoba`), its own folder (`~/amoba`), its own
> networks and volume, and ports 8090/4010. Deploying Neon Requiem never touches `~/hazi-projekt`.
> To make Neon Requiem take over 8080/4000 later, stop `hazi-projekt` and change `FRONTEND_PORT`/`BACKEND_PORT`.

---

## 1. Architecture

```text
 Browser ──HTTPS──► Cloudflare DNS ──► Oracle VPS :443
                                          │
                              Nginx Proxy Manager (npm-npm-1, Let's Encrypt)
                              amoba.devops-ora.tech  →  <host>:8090
                                          │
 ┌──────────────────────── docker compose project "amoba" ─────────────────────────┐
 │                                                                                  │
 │  frontend (nginx :80) ── /api/* ──►  backend (Express :4000) ──►  db (Postgres)  │
 │     static React files  ── /api/ws ─►  + WebSocket lobby      "data" network      │
 │                          "web" network                        (internal)         │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

* **Container-to-container traffic** uses Docker's embedded DNS: the frontend's nginx proxies
  `/api/` to `http://backend:4000`, the backend connects to `postgres://…@db:5432/amoba`.
* **Online matchmaking** runs over one WebSocket (`/api/ws`). The backend's `Lobby`
  (`backend/src/lobby.js`) queues players, pairs the first two waiting players, assigns X/O at random
  and is the **only** place where online moves are validated and wins are decided. The browser just
  sends `join` / `move` and renders what the server broadcasts. A name can hold only one seat, so
  nobody can queue twice and play themselves. Leaving a running game counts as a loss.
  Results are written to Postgres by the server; `POST /api/matches` only accepts AI games.
* **Two networks** enforce the tiers: `web` (frontend ↔ backend) and `data` (backend ↔ db,
  `internal: true`). The frontend physically cannot reach the database, and the DB has no host port.
* **One public entry point:** NPM only needs a single proxy host (→ 8090). Because the React app
  calls relative `/api/...` URLs, there is no CORS and no second domain. The backend's 4010 port is
  bound to `127.0.0.1` purely for `curl` health checks during the demo.
* **Healthchecks + `depends_on: service_healthy`** give a deterministic start order:
  db → backend → frontend. `docker compose up --wait` blocks until all three are healthy, which the
  pipeline uses as a deployment gate.
* **Docker Hub + ARM64:** CI publishes `dorinatirpak2000/amoba-backend` and
  `dorinatirpak2000/amoba-frontend` as multi-arch images (`linux/amd64` + `linux/arm64`), tagged with
  the commit SHA and `latest`. The VPS only **pulls** them; it never builds. Building stays fast
  without ARM emulation: the `npm ci` / `vite build` stages run on the CI machine's own architecture
  (`FROM --platform=$BUILDPLATFORM`), which is safe because the dependencies are pure JavaScript and
  the frontend output is static files. The arm64 runtime stages contain only `COPY`.
  The E2E job runs on GitHub's native ARM64 runner (`ubuntu-24.04-arm`, free for public repos), so
  the end-to-end tests exercise the same CPU architecture as the production server.
* **Two compose files:** `docker-compose.yml` names the images (used everywhere).
  `docker-compose.override.yml` adds `build:` and is loaded automatically in a git checkout, so
  locally and in CI the same `docker compose up` builds from source. The server never receives the
  override file, so there `docker compose pull` fetches the images from Docker Hub.

## 2. Nginx Proxy Manager setup (one time)

1. **Cloudflare:** add an `A` record `amoba` → the VPS public IP (same as your other records).
   If you use the orange-cloud proxy, set SSL/TLS mode to *Full (strict)*.
2. **NPM (`https://<server>:8181`) → Hosts → Proxy Hosts → Add**
   * Domain: `amoba.devops-ora.tech`
   * Scheme `http`, Forward Hostname/IP: **the same host/IP you used for the hazi-projekt proxy host**
     (NPM runs in its own container, so it's the host's IP / Docker gateway, not `localhost`),
     Forward Port: **`8090`**
   * Enable *Block Common Exploits* and **Websockets Support** (required: online matchmaking uses a
     WebSocket; without it players stay on "Connecting…")
   * SSL tab: *Request a new Let's Encrypt certificate*, *Force SSL*, *HTTP/2*.

No firewall change is needed: 8090 is only reached by NPM on the same machine.

## 3. CI/CD pipeline — `.github/workflows/deploy.yml`

```text
push to main
   ├─► backend-tests   (unit + integration against a Postgres service container)
   ├─► frontend-tests  (unit + React Testing Library, then `vite build`)
   └─► e2e             (ARM64 runner: docker compose up the real 3-tier stack → Playwright/Chromium)
          └─► publish  (continuous delivery; only on main, only if everything above is green)
                 buildx → amd64 + arm64 images → Docker Hub, tags :<commit sha> and :latest
                 └─► deploy   (continuous deployment)
                        1. ssh: copy docker-compose.yml + scripts to ~/amoba (no source code)
                        2. write ~/amoba/.env from GitHub Secrets (IMAGE_TAG = commit sha)
                        3. docker compose pull && docker compose up -d --no-build --wait
                        4. remove older amoba images, smoke test /api/health + frontend
```

Pull requests run all tests but never publish or deploy. Every deploy runs exactly the image that
was published for that commit, so a rollback means setting `IMAGE_TAG` to an older SHA and
running `docker compose up -d` again. The UI footer shows `build <commit sha>`, so during
the presentation you can prove the live site runs the commit you just pushed.

### GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Value |
| -------- | ------- |
| `SSH_HOST` | `devops-ora.tech` (or the VPS public IP) |
| `SSH_USER` | `dorina` |
| `SSH_PRIVATE_KEY` | private key of a **dedicated deploy key** (see below) |
| `SSH_KNOWN_HOSTS` | output of `ssh-keyscan devops-ora.tech` (pins the server's host key) |
| `POSTGRES_PASSWORD` | a long random string (e.g. `openssl rand -hex 24`) |
| `DOCKERHUB_USERNAME` | `dorinatirpak2000` |
| `DOCKERHUB_TOKEN` | a Docker Hub **personal access token** with *Read & Write* access (Account settings → Personal access tokens). Never your Docker Hub password. |

The two Docker Hub repositories are created automatically by the first push. Keep them **public**
(free accounts get only one private repository, and the server pulls without logging in). The
images contain no secrets: the database password lives only in `~/amoba/.env` on the server.

Create a dedicated deploy key instead of reusing your personal Oracle key:

```bash
ssh-keygen -t ed25519 -C "github-actions-amoba" -f amoba_deploy -N ""
ssh-copy-id -i amoba_deploy.pub devops-ora.tech        # or append it to ~/.ssh/authorized_keys
gh secret set SSH_PRIVATE_KEY < amoba_deploy
ssh-keyscan devops-ora.tech | gh secret set SSH_KNOWN_HOSTS
```

## 4. Testing strategy

The suite follows the **Testing Pyramid**: many fast, cheap tests at the bottom, few slow,
expensive ones at the top. Each rule is tested at the lowest level that can see it; higher levels
only check what lower ones cannot (that the pieces work together). No tests for trivial UI details.

```text
            ▲  E2E (2)          full stack in a real browser · minutes · CI only
           ▲▲▲  Integration (3)  Express + real PostgreSQL + WebSocket · seconds
          ▲▲▲▲  Component (4)    React UI + fake server · ~1 s each
       ▲▲▲▲▲▲▲  Unit (7)         pure game and lobby logic · milliseconds
```

| Level | Tool | Tests | What they protect |
| ------- | ------ | ------: | ------------------- |
| Unit | Vitest | 7 | Win detection edge cases (four is not enough, no wrap-around, draw), AI wins before blocking; lobby pairing, one seat per name (no self-play), server-side turn rules, server-decided wins, forfeits |
| Component | **React Testing Library** + fake WebSocket | 4 | Name required, online game driven only by server-confirmed moves, "name taken" error, AI turn hand-over |
| Integration | Vitest + Supertest + `ws` + **real PostgreSQL** | 3 | AI results stored and aggregated into the leaderboard; forged or invalid results rejected; two WebSocket clients matched, game played and saved by the server |
| E2E | **Playwright** (Chromium) on the real compose stack, ARM64 runner | 2 | Two separate browsers play a full online match; AI game |

The deploy job adds a final smoke test (`/api/health` and the frontend on the server) after every
release, so the live system is checked too.

Why Playwright over Cypress: first-class headless Chromium in GitHub Actions
(`npx playwright install --with-deps`), official linux-arm64 builds (so the same suite can also run
on the VPS: `BASE_URL=https://amoba.devops-ora.tech npx playwright test`), auto-waiting assertions
(no flaky sleeps), and an HTML report + traces uploaded as a pipeline artifact.

## 5. Running locally

What each command needs, from the bottom of the pyramid up:

| Command | Needs | Notes |
| --------- | ------- | ------- |
| `cd backend; npm test` | nothing | unit tests only (milliseconds) |
| `cd frontend; npm test` | nothing | unit + React Testing Library |
| `cd backend; npm run test:integration` | a throwaway PostgreSQL | see below |
| `cd e2e; npm test` | the whole stack running (Docker) | see below |

If a dependency is missing, the integration and E2E suites stop with one message that says what to
start. No Docker on your machine? That's fine: CI runs every level on every push and pull request.

```powershell
# Integration tests: a throwaway Postgres on port 5433 (5432 is often taken by a local PostgreSQL install)
docker run --rm -d --name amoba-pg -p 5433:5432 -e POSTGRES_USER=amoba -e POSTGRES_PASSWORD=amoba -e POSTGRES_DB=amoba_test postgres:16-alpine
cd backend
$env:DATABASE_URL = "postgres://amoba:amoba@localhost:5433/amoba_test"
npm run test:integration
docker stop amoba-pg

# E2E: start the real 3-tier stack, then run Playwright
copy .env.example .env
docker compose up -d --build --wait
cd e2e
npm ci
npx playwright install chromium
npm test
```

The E2E suite can also target another deployment: `$env:BASE_URL = "https://..."; npm test`.
Avoid pointing it at production: the online test plays real matches that land on the leaderboard.

## 6. Resetting the database (leaderboard / match history)

All data lives in one table (`matches`); the leaderboard is computed from it. Pick one:

| Where | Command | What it does |
| ------- | --------- | -------------- |
| GitHub (one click) | Actions → **Reset leaderboard (production)** → Run workflow → type `RESET` | SSHes to the VPS, runs the script below, verifies `/api/leaderboard` is `[]` |
| On the server | `~/amoba/scripts/reset-db.sh` (asks for confirmation; `--yes` skips it) | `TRUNCATE matches RESTART IDENTITY` inside the running `db` container |
| On the server, manually | `cd ~/amoba && docker compose exec db psql -U amoba -d amoba -c "TRUNCATE matches RESTART IDENTITY;"` | same as the script |
| Nuclear (wipe the volume) | `cd ~/amoba && docker compose down -v && docker compose up -d --wait` | deletes the Postgres volume; the backend recreates the table on start |
| Local stack | `./scripts/reset-db.sh` from the repo root | same, against your local compose stack |

Containers keep running for the first three options, so the site never goes down. Never run
`docker compose down -v` inside `~/hazi-projekt` by mistake — always `cd ~/amoba` first.

To inspect the data: `cd ~/amoba && docker compose exec db psql -U amoba -d amoba -c "SELECT * FROM matches ORDER BY id DESC LIMIT 10;"`

## 7. Presentation checklist (Dec 9)

0. The day before: run **Reset leaderboard** so the demo starts with a clean board.
1. Show `docker compose ps` on the server: 3 healthy containers, DB without a host port.
2. Make a small visible change, `git push`.
3. Show the Actions run: test jobs → E2E → publish → deploy; open the Playwright HTML report artifact.
   Then show Docker Hub: both repositories have a new tag equal to the commit SHA, for amd64 and arm64.
4. Refresh `https://amoba.devops-ora.tech` — footer shows the new commit sha.
5. Open the site on two devices (e.g. laptop + phone), enter two names, press **Find Opponent** on
   both: they are paired and every move appears on the other screen. Show the leaderboard update.
6. Play a quick game against the Neon AI.

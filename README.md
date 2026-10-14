# Wishlist

One shareable wishlist instead of "I want X or Y" plus scattered Amazon/Xbox/… lists.
Friends and family open the share link, see what's still needed and mark things as bought –
the owner never sees what was bought.

```
backend/   Node + Express 5 + SQLite (better-sqlite3) REST API, TypeScript
frontend/  Ionic 9 + Angular 22 (standalone, zoneless), Capacitor-ready
```

## Getting started

Requires Node 24 (`nvm use` picks it up from `.nvmrc`).

```bash
npm run install:all   # root, backend and frontend dependencies
npm run dev           # API on http://localhost:3000, app on http://localhost:4200
npm test              # backend (node:test) + frontend (vitest) tests
```

Backend configuration lives in `backend/.env` (see [backend/.env.example](backend/.env.example)).
In development a JWT secret is generated into `backend/data/`, together with the SQLite database and uploads.

## How it works

- **Owners** (registered) create wishlists and items: title, picture (URL or upload), price, priority (1–5),
  quantity, any number of shop links and notes.
- **Paste a link** (or share-sheet text containing one) and the backend reads title, picture and price from
  JSON-LD, Amazon markup, Open Graph and microdata. When a shop blocks the request, the UI shows what was pasted,
  what was found, what's missing and why – and guesses a title from the URL.
- **Share link** `/s/<token>`: anyone with it (guest with a name, or logged in) can mark items as bought
  (partially, for quantities > 1) or undo it. Every purchase and undo is kept with name and time, and undos by
  someone other than the buyer are highlighted.
- The owner's API responses never contain purchase data, even when opening their own share link.
- Share links show a rich preview in messengers: the web container injects list-specific Open Graph tags
  (title, owner, number of wishes, a picture) into the page for `/s/<token>` – never anything about purchases.

## Deployment with Docker

The app runs as a stack of two containers defined in [docker-compose.yml](docker-compose.yml):

| Service | Image                          | Purpose                                                                       |
| ------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `api`   | `ghcr.io/marchein/wishlist-api` | Node backend; SQLite database and uploads live in the `data` volume           |
| `web`   | `ghcr.io/marchein/wishlist-web` | nginx serving the app and proxying `/api` and `/uploads` to `api` (port 8080) |

`docker-compose.yml` uses the `latest` tag of both images, i.e. always the newest release. Only `web` is
published to the host. All other configuration lives in **one `.env` file** next to `docker-compose.yml` – copy
[.env.example](.env.example) and fill it in:

```bash
cp .env.example .env
openssl rand -base64 48   # paste the output as JWT_SECRET
```

| Variable                  | Meaning                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `WISHLIST_PORT`           | Host port, e.g. `8080`, or `127.0.0.1:8080` if a reverse proxy on the same host does HTTPS     |
| `PUBLIC_URL`              | Public address, e.g. `https://wishlist.example.com` – used for link previews in messengers     |
| `JWT_SECRET`              | **Required**, ≥ 32 characters. Changing it logs everybody out                                  |
| `TRUST_PROXY`             | `1` = only the web container in front of the API, `2` = plus your HTTPS reverse proxy          |
| `CORS_ORIGINS`            | Extra origins allowed to call the API (only needed for a native app later)                     |
| `SCRAPER_ACCEPT_LANGUAGE` | Language requested from shops when reading product pages                                       |

### Build and run locally

```bash
docker compose build          # builds the images locally (tagged :latest)
docker compose up -d          # http://localhost:8080 (or whatever WISHLIST_PORT says)
docker compose logs -f
docker compose down           # stops the stack; data stays in the "wishlist_data" volume
```

### Publish images via GitHub

[.github/workflows/docker.yml](.github/workflows/docker.yml) runs the tests and then builds both images for
`linux/amd64` and `linux/arm64` whenever a version tag is pushed. Images go to the GitHub Container Registry
(no secrets to set up – the workflow uses the built-in `GITHUB_TOKEN`).

Release a version by tagging it ([semantic versioning](https://semver.org): `vMAJOR.MINOR.PATCH`):

```bash
git tag -a v1.1.0 -m "Release 1.1.0"
git push origin v1.1.0
```

The workflow (see the repository's *Actions* tab) then publishes

```
ghcr.io/marchein/wishlist-api:1.1.0  :1.1  :1  :latest  :sha-<commit>
ghcr.io/marchein/wishlist-web:1.1.0  :1.1  :1  :latest  :sha-<commit>
```

New packages are **private**. Either make them public ([your packages](https://github.com/marchein?tab=packages)
→ package → *Package settings* → *Change visibility*) or log in on the server as shown below.

<details>
<summary>Building and pushing without GitHub Actions</summary>

```bash
echo <token> | docker login ghcr.io -u marchein --password-stdin   # classic PAT with write:packages
# On Apple Silicon, build for a typical x86 server:
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build
docker compose push
```

</details>

### Deploy on your server

Requirements: Docker Engine with the Compose plugin. The server only needs `docker-compose.yml` and `.env` –
no source code.

```bash
mkdir -p ~/wishlist && cd ~/wishlist
curl -fsSLO https://raw.githubusercontent.com/marchein/wishlist/main/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/marchein/wishlist/main/.env.example
nano .env                                 # PUBLIC_URL, JWT_SECRET, …
# only for private packages: classic personal access token with the read:packages scope
echo <token> | docker login ghcr.io -u marchein --password-stdin
docker compose pull
docker compose up -d --no-build
docker compose ps                         # both services should become "healthy"
```

**HTTPS:** put a reverse proxy in front of the stack and keep `WISHLIST_PORT=127.0.0.1:8080` and
`TRUST_PROXY=2`. With [Caddy](https://caddyserver.com) (automatic Let's Encrypt certificates) the whole
`Caddyfile` is:

```
wishlist.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

**Update** to the newest release:

```bash
docker compose pull && docker compose up -d --no-build && docker image prune -f
```

**Rollback / pin a version:** replace `:latest` with e.g. `:1.0.0` in both `image:` lines of
`docker-compose.yml` and run the same command. Switch back to `:latest` to follow new releases again.

**Backup:** everything (database, uploads, nothing else) lives in the `wishlist_data` volume:

```bash
docker compose stop api
docker run --rm -v wishlist_data:/data -v "$PWD":/backup alpine tar czf /backup/wishlist-$(date +%F).tgz -C /data .
docker compose start api
```

Restore by extracting such an archive into the (empty) volume the same way with `tar xzf`.

### Native app later

Set `apiBaseUrl` in `frontend/src/environments/environment.prod.ts` to the absolute public URL and add
`capacitor://localhost,http://localhost` to `CORS_ORIGINS`.

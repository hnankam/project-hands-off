# Web app image (`hands-off-web`)

Serves the Vite-built SPA from `dist/web` via nginx.

## Test locally (Vite, no Docker)

From the **repo root**:

```bash
pnpm dev:web
```

Open **http://localhost:5174/** (default port in `pages/web/vite.config.mts`). The app immediately normalizes the URL to **`?mode=newtab`**, matching the extension’s “Open in tab” link (`side-panel/index.html?mode=newtab`), so layout and view-mode behavior match that surface.

When you’re **not signed in**, the address bar is normalized to **`/?mode=newtab#/login`** (hash routing). Pathnames like `/home?…` are corrected to `/` so the login screen matches the real routes (`#/home`, `#/sessions`, etc.) after authentication.

**App version** in the web UI matches the extension manifest: it is taken from **`chrome-extension/package.json`** at web build time (`getAppVersion()` / About, etc.).

**Backends:** For login, chat, and CopilotKit you need the API services reachable from the browser, usually:

- **Runtime:** `http://localhost:3001` (e.g. `copilot-runtime-server`)
- **Pydantic / backend:** `http://localhost:8001` (e.g. `copilotkit-pydantic`)

**Vite dev (`pnpm dev:web`):** `pages/web/vite.config.mts` proxies **`/api`** and **`/health`** to `http://localhost:3001`. When the saved API URL is empty or the default local runtime (`localhost:3001` / `127.0.0.1:3001`), the app uses **`window.location.origin`** as the API base so requests stay same-origin and Better Auth session cookies are sent (fixes CopilotKit **401 Authentication required**).

URLs come from the root `.env` (`CEB_API_URL`, `CEB_BACKEND_URL`) at dev time, or from **localStorage** after the app loads (same `api-config-storage` as the extension). If those don’t match where your servers run, update `.env` or use the in-app settings if exposed.

**CORS:** The runtime allows `http://localhost:*` when `NODE_ENV=development`. If you run the server in **production** mode locally, set e.g. `CORS_ORIGINS=http://localhost:5174` in `copilot-runtime-server/.env`.

**Wrong API host / CORS to Adobe corp:** The extension used to seed saved API URLs to `api.handsoff.corp.adobe.com`. On the **web** app, new installs now start with **empty** saved URLs so `CEB_API_URL` / `CEB_BACKEND_URL` from the repo `.env` apply (typically `http://localhost:3001` and `http://localhost:8001`). If you already loaded the web app once, **clear site data** for `localhost:5174` (or remove the `handsoff.ext.storage:local:api-config-storage-key` entry in Local Storage) so old corp URLs are not reused.

**Production-like static build:**

```bash
pnpm build:web
pnpm preview:web   # serves dist/web
```

## Build (repo root)

```bash
docker build -f docker/web-app/Dockerfile \
  --build-arg CEB_API_URL=http://localhost:3001 \
  --build-arg CEB_BACKEND_URL=http://localhost:8001 \
  -t hands-off-web:local .
```

Use URLs reachable **from the user’s browser** (often `http://localhost:3001` / `http://localhost:8001` when testing on the host).

## Compose

The `hands-off-web` service is defined in the root `docker-compose.yml` (`WEB_PORT`, default `8080`).

Ensure the Copilot runtime allows CORS for the web origin (e.g. `http://localhost:8080`).

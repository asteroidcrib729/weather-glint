# Deployment guide

This project has two distinct deployment paths. Follow **Part A** to preview it on this Windows laptop with Docker Engine inside Ubuntu on WSL 2; Docker Desktop is not required. Follow **Part B** to publish it on an always-on Linux server with a domain and HTTPS. Do not apply Part B's Caddy and Compose changes to the laptop preview checkout. This runbook is not a numbered development plan; future plans still use `development-plan-NN.md`.

The repository's current `compose.yaml` and `deploy/Caddyfile` serve plain HTTP on port 8080 for a local preview. A public site needs a different Caddy site address, ports 80/443, and persistent certificate storage. Commands marked **PowerShell** run on Windows; commands marked **Ubuntu/server** run in a Linux shell. Replace example domains, repository URLs, and release identifiers before executing commands.

## Part A — Local preview on the laptop (WSL 2, no Docker Desktop)

### A1. Confirm the WSL distribution

In **Windows PowerShell**, check your installed distributions:

```powershell
wsl --list --verbose
wsl --version
```

Use an Ubuntu distribution listed as **version 2**. If there is no Ubuntu distribution, add one using [Microsoft's WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install). If it is version 1, convert it with `wsl --set-version Ubuntu 2`, replacing `Ubuntu` with its exact listed name. Enter the distribution with `wsl -d Ubuntu` (again, use its actual name). The remaining A-steps run inside Ubuntu unless labeled PowerShell.

Check whether Ubuntu is running `systemd`:

```bash
ps -p 1 -o comm=
```

If the output is `systemd`, continue. Otherwise, follow [Microsoft's WSL systemd instructions](https://learn.microsoft.com/en-us/windows/wsl/systemd): add the following to `/etc/wsl.conf`, preserving any existing settings:

```ini
[boot]
systemd=true
```

Then run `wsl --shutdown` in **PowerShell**, reopen Ubuntu, and repeat `ps -p 1 -o comm=`. Be aware that `wsl --shutdown` stops all WSL distributions and their running containers.

### A2. Install Docker Engine and Compose inside Ubuntu

If `sudo docker version` and `sudo docker compose version` already work inside Ubuntu, skip the installation commands and continue to A3. Otherwise, these commands install Docker Engine, Buildx, and the Compose plugin **inside WSL**, not on Windows. They follow [Docker's Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/); check that guide first if your Ubuntu release or its commands differ. If Ubuntu already has conflicting `docker.io` or `docker-compose` packages, follow the guide's “Uninstall old versions” section before installing Docker's packages.

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run hello-world
sudo docker compose version
```

The `hello-world` container and Compose version output confirm the daemon and plugin are usable. Keep using `sudo docker ...` below unless you deliberately configure socket access for your user. The [Docker group confers root-level privileges](https://docs.docker.com/engine/install/linux-postinstall/), so do not add your account to it solely to avoid typing `sudo`. No Docker Desktop installation or integration is needed.

### A3. Use the existing project checkout

This laptop's checkout is available to WSL at the following path. In **Ubuntu**, change into it and confirm the two deployment files are present:

```bash
cd /mnt/c/Users/DESKTOP-Q2TMP8U/Downloads/Source-Code/weather-app
test -f compose.yaml && test -f deploy/Caddyfile
```

Leave `compose.yaml` and `deploy/Caddyfile` in their current **port-8080 HTTP** form for this preview. No domain, certificate, OpenWeather key, `.env`, host Python, or host Node.js is required. The containers supply Python 3.14 and Node.js 24; weather requests still require an internet connection to Open-Meteo.

Running builds from `/mnt/c` is supported but slower than using Ubuntu's own filesystem. For routine WSL development, [Microsoft recommends](https://learn.microsoft.com/en-us/windows/wsl/filesystems) a checkout under a Linux path such as `/home/your-user/projects/weather-app`. Preserve this checkout's uncommitted changes before making a separate copy.

### A4. Build and start the preview

Run from the directory containing `compose.yaml` in **Ubuntu**:

```bash
sudo docker compose config
sudo docker compose up -d --build
sudo docker compose ps
```

Inspect `config` before starting: only the `proxy` service should publish host port `8080`; `backend` and `frontend` should not publish host ports. The first build downloads base images and locked Python/npm dependencies and may take several minutes. `ps` should eventually show the backend as healthy and the other services running. If startup fails, go to A6.

### A5. Verify from Ubuntu and Windows

In **Ubuntu**:

```bash
curl -fsS http://localhost:8080/api/v1/health
curl -fsS 'http://localhost:8080/api/v1/locations?query=Karachi&limit=1'
curl -fsS 'http://localhost:8080/api/v1/weather?latitude=24.8608&longitude=67.0104&units=metric'
```

The health response should contain `"status":"ok"`; the other two calls check the Open-Meteo integration. In **PowerShell**, confirm Windows can reach the same WSL-published port:

```powershell
curl.exe -fsS http://localhost:8080/api/v1/health
```

Open `http://localhost:8080` in a Windows browser. Check the current weather, place search, unit switching, and error states. Browser geolocation depends on permission and a secure context; browsers generally treat `localhost` as a trustworthy local origin, but a public site must use HTTPS. Windows-to-WSL [`localhost` forwarding](https://learn.microsoft.com/en-us/windows/wsl/networking) normally makes this work without extra port forwarding.

This is only a laptop preview. Do not point public DNS at it or forward router ports 80/443 to it. WSL, laptop sleep, network changes, and shutdown can interrupt service; [systemd services do not keep a WSL instance alive](https://learn.microsoft.com/en-us/windows/wsl/systemd).

### A6. Diagnose, rebuild, and stop the preview

Run these from **Ubuntu** in the project directory:

```bash
sudo docker compose ps
sudo docker compose logs --tail=100 backend frontend proxy
```

If the backend is unhealthy, inspect its logs and confirm the health endpoint inside the proxy route. If Ubuntu reaches port 8080 but Windows does not, check the WSL networking mode, Windows firewall/security software, and whether another Windows process owns port 8080. If search/weather fails while health succeeds, check outbound access to Open-Meteo and provider limits. If you changed application code, rebuild with `sudo docker compose up -d --build`, then repeat A5.

Stop the preview when done:

```bash
sudo docker compose down
```

Do not add `-v` unless you intentionally want to delete named volumes. The local preview has no database, but preserving the distinction avoids an unsafe habit when using Part B.

## Part B — Public deployment on an always-on Linux server

This path assumes a separate Ubuntu server or VM with a public IP and a domain you control. Docker Engine runs **on that Linux server**; Docker Desktop is not required there either. WSL may be used as your local terminal or development environment, but WSL itself is not the public host in this guide.

### B1. Complete the release and security prerequisites

1. Commit and push a reviewed release of this project, including `compose.yaml`, the Dockerfiles, Caddyfile, and lockfiles. A server-side `git clone` cannot receive uncommitted files from the Windows/WSL checkout. Record the release tag or commit hash.
2. Revoke the old OpenWeather key from the original internship script **before publishing**. Deleting the script did not erase the key from Git history. Coordinate any history rewrite with collaborators; do not copy the old key into server configuration.
3. Check the [current Open-Meteo pricing and usage terms](https://open-meteo.com/en/pricing). The public free endpoint is intended for non-commercial use, has usage limits, and has no uptime guarantee. This app uses that endpoint without a key and displays attribution.
4. Provision an always-on Ubuntu server with outbound HTTPS to image registries, PyPI, npm, Open-Meteo's forecast/geocoding hosts, and certificate authorities. Arrange a public hostname such as `weather.example.com` and a way to edit its DNS and firewall rules.

### B2. Install Docker Engine on the server

Connect to the server by SSH. Follow the [official Ubuntu Docker Engine instructions](https://docs.docker.com/engine/install/ubuntu/) for its release; the commands below show the repository-based installation. Resolve any conflicting older Docker packages using that guide before proceeding.

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run hello-world
sudo docker compose version
```

Use `sudo docker ...` for the remaining server commands unless you intentionally granted Docker socket access to your account; the `docker` group has root-level privileges. Host Python and Node.js are unnecessary because the Dockerfiles contain their required versions.

### B3. Put a reviewed release on the server

On the server, replace the example URL and release identifier, then clone and select the release:

```bash
git clone https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git weather-app
cd weather-app
git switch --detach YOUR_RELEASE_TAG_OR_COMMIT
git rev-parse HEAD
```

Run every remaining server command from this `weather-app` directory. If the repository is private, use a properly scoped deploy key or credential instead of placing a token in the clone URL or shell history.

### B4. Configure DNS and inbound ports

Point the hostname's DNS `A` record to the server's public IPv4 address. Add an `AAAA` record only if the server has working public IPv6; an incorrect `AAAA` record can break certificate issuance or user access. Confirm DNS resolves before starting Caddy. Open inbound **TCP 80 and 443** at the cloud provider/security group and host network; **UDP 443** is optional for HTTP/3. Ensure no other process owns those ports.

Only Caddy should be published. Do not publish backend port 8000 or frontend port 3000. Docker's published ports can [bypass `ufw` input rules](https://docs.docker.com/engine/network/packet-filtering-firewalls/), so review the cloud firewall and Docker firewall behavior rather than relying on `ufw` alone. Public HTTPS via Caddy requires a resolvable domain, reachable 80/443, and persistent certificate storage, as described in [Caddy's automatic HTTPS documentation](https://caddyserver.com/docs/automatic-https).

### B5. Change the server copy to HTTPS

Make these edits **on the server copy**, not in the laptop's preview checkout. In `deploy/Caddyfile`, replace the first line, `:80 {`, with your actual hostname; leave the API/frontend reverse-proxy routes and security headers in place:

```caddyfile
weather.example.com {
```

In `compose.yaml`, replace the `proxy` service's existing `ports` and `volumes` blocks with the following, keeping its other fields unchanged:

```yaml
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
```

Add these named volumes at the **top level** of `compose.yaml` (outside `services:`):

```yaml
volumes:
  caddy_data:
  caddy_config:
```

Caddy uses `/data` for managed certificates; preserve both named volumes across restarts and updates, following [Caddy's container guidance](https://caddyserver.com/docs/running). A public hostname makes Caddy obtain/renew certificates and redirect HTTP to HTTPS automatically.

### B6. Pass production settings to the backend

Under the existing `backend` service in the server's `compose.yaml`, add:

```yaml
    environment:
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:?Set ALLOWED_ORIGINS in .env}
      RATE_LIMIT_PER_MINUTE: ${RATE_LIMIT_PER_MINUTE:-120}
```

Create a root `.env` beside `compose.yaml`, using your actual HTTPS origin:

```dotenv
ALLOWED_ORIGINS=https://weather.example.com
RATE_LIMIT_PER_MINUTE=120
```

Restrict it with `chmod 600 .env` and do not commit it. Compose uses `.env` for [variable interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/); it does **not** automatically inject every value into the backend. The explicit `environment` mapping above is required. The Open-Meteo URLs already have defaults in `backend/app/core/config.py`; map override variables explicitly only if you need different endpoints. `ALLOWED_ORIGINS` is a browser CORS setting, not API authentication.

Keep backend/frontend without host-published ports. Uvicorn trusts forwarded headers because only Caddy can reach it on the private Compose network. The backend disables routine access logs so coordinate-bearing query strings are not logged there; review any new CDN or proxy's query-string logging policy before adding one.

### B7. Validate, build, and start

Inspect the effective configuration before starting. Verify the backend origin, proxy ports, and Caddy volume mounts; do not post the output publicly if it later contains secrets.

```bash
sudo docker compose config
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=100 proxy backend frontend
```

The backend healthcheck probes `/api/v1/health`, and Compose waits for it before starting the frontend. The proxy's startup ordering alone does not prove the frontend is ready. First builds and certificate issuance may take several minutes. Resolve unhealthy or restarting services before calling the deployment complete.

From a machine **outside the server**, replace the example domain and test the public origin. The commands below use a Linux/macOS shell; use `curl.exe` instead of `curl` in Windows PowerShell.

```bash
curl -I http://weather.example.com/
curl -I https://weather.example.com/
curl -fsS https://weather.example.com/api/v1/health
curl -fsS 'https://weather.example.com/api/v1/locations?query=Karachi&limit=1'
curl -fsS 'https://weather.example.com/api/v1/weather?latitude=24.8608&longitude=67.0104&units=metric'
```

The HTTP URL should redirect to HTTPS; the certificate must be valid for your hostname. The health response should contain `"status":"ok"`. Search and weather responses additionally verify outbound Open-Meteo access. Open the site in a browser and test location search, unit switching, browser geolocation permission, and an error state. If DNS has an `AAAA` record, check IPv6 access too.

### B8. Monitor, update, and roll back

- Monitor `sudo docker compose ps`, the public health endpoint, a representative weather request, and user-facing behavior. The health endpoint does **not** prove Open-Meteo is reachable.
- Review logs with `sudo docker compose logs --tail=100 proxy backend frontend`. Avoid URL-bearing access logs without a privacy review because weather queries contain coordinates.
- The weather cache and rate limiter are in memory and per backend process. A restart clears them. Do not scale to several backend replicas expecting a shared cache or one global rate limit.
- Back up server-specific `compose.yaml`, `deploy/Caddyfile`, `.env`, and the Caddy named volumes. There is no application database, but the Caddy volumes contain certificate state. Test dependency and base-image updates in CI/staging before deploying; base-image tags may move even when Python/npm lockfiles do not.

Before an update, record the current release and inspect the server worktree:

```bash
git rev-parse HEAD
git status --short
```

Preserve the server-specific Compose/Caddy edits before switching releases. They modify tracked files, so Git may refuse to switch if a new commit also changes them. Keep them in a reviewed deployment branch or back them up outside the checkout, make the worktree ready for the release switch, and reapply them afterward. Do **not** use `git reset --hard` to make an update succeed. Once those edits are safely preserved, fetch and select the reviewed release:

```bash
git fetch --tags
git switch --detach YOUR_NEW_RELEASE_TAG_OR_COMMIT
```

Reapply and review the production settings from B5–B6 before starting the new containers. If `git switch` refuses because of local changes, stop and preserve/reconcile those changes; do not force checkout.

Once the new reviewed release and its production configuration are in place:

```bash
sudo docker compose config
sudo docker compose up -d --build
sudo docker compose ps
```

Repeat B7's external HTTPS, API, and browser checks. If the release fails, preserve any new local edits, switch to the commit recorded above with `git switch --detach YOUR_PREVIOUS_WORKING_COMMIT`, restore the corresponding production configuration, and run `sudo docker compose config` followed by `sudo docker compose up -d --build`. Verify the public endpoints again. To stop the stack without deleting certificate storage, use `sudo docker compose down`; **never** use `down -v` as a routine update or rollback step.

### B9. Public-deployment troubleshooting

| Symptom | What to check |
| --- | --- |
| Caddy cannot obtain a certificate | DNS `A`/`AAAA` records, inbound TCP 80/443, Caddyfile hostname, occupied ports, persistent writable `/data`, and `sudo docker compose logs proxy`. |
| HTTP works but HTTPS does not | Confirm the server no longer uses the preview `:80` Caddy address or `8080:80` Compose mapping, then check certificate logs and firewall rules. |
| Page loads but `/api/v1/...` fails | Confirm backend health, private Compose networking, and the Caddy `/api/*` route to `backend:8000`. |
| Health works but search/weather fails | Check outbound DNS/HTTPS to both Open-Meteo hosts, provider availability/limits, and backend logs. |
| Browser geolocation fails | Check the valid HTTPS origin, browser permission, and device location services. Manual city search should still work. |
| A changed `.env` has no effect | Check the `backend.environment` mapping, run `sudo docker compose config`, and recreate with `sudo docker compose up -d --force-recreate backend`. |

For a managed container platform, provide equivalent same-origin routing, HTTPS, private backend networking, environment injection, and health checks. The current port-8080 preview configuration is not a public deployment configuration.

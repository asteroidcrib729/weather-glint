# Virtual-machine deployment restore kit

This directory is a byte-for-byte snapshot of the deployment-specific files used before the Vercel + Render switch. The copies were verified against their source files when the kit was created. It includes the former [step-by-step deployment guide](development-plans/DEPLOYMENT.md) for both WSL 2 laptop preview and a public Linux VM. No credentials or `.env` file are included.

The kit contains `compose.yaml`, `deploy/Caddyfile`, both Dockerfiles, the Docker ignore files, the previous Next.js configuration and npm scripts, the old frontend package scripts, `.env.example`, and the old deployment guide. The backend Dockerfile in this kit is the original port-8000 version; the active backend Dockerfile was adapted for Render's `PORT` variable.

This is a **deployment-layer backup**, not a complete copy of the application source, Git history, lockfiles, or live server data. Reverting the approach still uses the current app code and lockfiles. If you need to reproduce an old release exactly, also restore its Git commit and any server-specific `.env`, Caddy certificate volumes, and domain settings from your own backups.

## Restore the VM files to a checkout

1. Preserve any current Vercel/Render changes you want to keep. Ensure the checkout has the app's `backend/` and `frontend/` source and lockfiles. Stop or disconnect managed auto-deploys separately in the Vercel and Render dashboards; copying files does **not** stop their live services.
2. From the repository root in PowerShell, review the list below and copy only these deployment artifacts. Existing targets with these names will be overwritten, so inspect local changes first.

   ```powershell
   $repo = (Get-Location).Path
   $kit = Join-Path $repo 'deployment-backups\virtual-machine'
   $files = @(
     'compose.yaml', 'deploy\Caddyfile', 'backend\Dockerfile',
     'frontend\Dockerfile', 'frontend\.dockerignore',
     'frontend\next.config.ts', 'frontend\package.json',
     'frontend\scripts\prepare-standalone.mjs',
     'frontend\scripts\run-e2e.mjs', '.dockerignore', '.env.example'
   )
   foreach ($file in $files) {
     $source = Join-Path $kit $file
     $target = Join-Path $repo $file
     if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing kit file: $file" }
     New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
     Copy-Item -LiteralPath $source -Destination $target -Force
   }
   ```

3. Follow the kit's [DEPLOYMENT.md](development-plans/DEPLOYMENT.md). It assumes `compose.yaml` and `deploy/Caddyfile` have been restored to the repository root. The laptop preview is plain HTTP on port 8080; the public VM requires the guide's separate HTTPS/domain edits and persistent Caddy volumes.
4. Reinstall frontend dependencies with `npm ci`, then run the repository checks and `npm run build`. Test the Compose config with `docker compose config` before starting containers. Run `docker compose up -d --build` when ready to start the VM stack; this does not replace or shut down the managed services automatically.
5. Once the VM path is verified, remove the active `render.yaml` and Vercel project settings from the release branch if you no longer want managed deploys. Do not assume deleting `render.yaml` deletes a Render service; decommission services and domains in their dashboards deliberately.

`development-plans/DEPLOYMENT.md` at the repository root documents the active Vercel + Render path. The file of the same name **inside this kit** documents the former VM path.

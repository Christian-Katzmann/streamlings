# Deploying Streamlings

Momó runs as the `streamlings` systemd unit on Christian's Contabo VPS
(`167.86.95.24`, `/opt/streamlings`, port `8787`, `EnvironmentFile=/etc/streamlings/env`
holding `WEBHOOK_SECRET`). Deploy = rsync `server/` + built assets to `/opt/streamlings`,
then `systemctl restart streamlings`. SSH: `ssh -i ~/.ssh/konsulentkortet_contabo root@167.86.95.24`.

## Ingress (deploy-proof since 2026-07-16)

TLS and routing for `momo.ktzm.dk` are terminated by the konsulentkortet Caddy container
on the same host — but Momó's site config no longer lives inside that project's deploy
artifact. It lives at **`/etc/caddy/sites/momo.caddy` on the host**, mounted read-only
into the container and glob-imported by the Caddyfile (`import /etc/caddy/sites/*.caddy`).
Both the import line and the mount are committed to the konsulentkortet repo, so its
deploys carry them instead of wiping them.

That wipe is not hypothetical: a konsulentkortet deploy on 2026-07-13 erased the old
hand-edited momo block and every README image 502'd through Camo for three days.

`momo.caddy` keeps `flush_interval -1` on the reverse proxy. The ufw rule
`172.18.0.0/16 → 8787` lets the Caddy container reach the host service.

## The artwork boundary

The Momó art never enters this public repo. `npm run build` (needs ffmpeg and the
private clip library at `~/Dev/Projects/momó/pet/`) writes `assets/frames/` locally;
rsync ships the built frames to the VPS.

## Run it locally

```sh
npm install
npm run build        # local only — requires the private clip library
npm test
PORT=8787 npm start
```

Environment: `PORT`, `BACK_URL`, `STREAM_ASSETS`, `DATA_DIR`, `REPO_SLUG`,
`WEBHOOK_SECRET`, optional `BASE_PATH`. Keep the server's `Cache-Control: no-store`
so every README load re-fetches through Camo.

## Monitoring

`.github/workflows/momo-heartbeat.yml` validates the rendered README's actual Camo
URLs twice an hour and manages the sticky `momo-down` issue (opens on failure, closes
itself on recovery — proven live on 2026-07-16). A green origin curl is not the bar;
a complete file through Camo is. A state backup from the outage lives in
`~/Dev/streamlings-vps-backup/`.

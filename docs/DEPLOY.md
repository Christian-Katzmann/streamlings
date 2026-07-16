# Deploying Streamlings

Momó lives on Fly.io as the always-on app `momo-streamlings` (region `fra`), with a
1GB volume mounted at `/data` for the ledger and the rendered episode cache. Always-on
is the product, not a luxury: Camo allows ~4.3 seconds from TLS handshake to a complete
body, and a cold resume can blow that budget exactly when a visitor loads the README.

## The artwork boundary

The Momó art never enters this public repo. `npm run build` (needs ffmpeg and the
private clip library at `~/Dev/Projects/momó/pet/`) writes `assets/frames/` locally;
those frames ride only the private Fly Docker image.

## Deploy

```sh
npm install
npm run build        # local only — requires the private clip library
npm test
fly deploy           # builds remotely from the local context (assets included)
```

One-time setup (already done): `fly apps create momo-streamlings`,
`fly volumes create momo_data --region fra --size 1`,
`fly secrets set WEBHOOK_SECRET=…`, `fly ips allocate-v4 --shared`,
`fly ips allocate-v6`, `fly certs add momo.ktzm.dk`, and the Simply.com A/AAAA
records for `momo.ktzm.dk` pointing at the app's IPs.

Environment (set in `fly.toml`): `PORT`, `DATA_DIR=/data`, `STREAM_ASSETS`,
`BACK_URL`, `REPO_SLUG`. Secret: `WEBHOOK_SECRET` (webhook HMAC). The server keeps
`Cache-Control: no-store` so every README load re-fetches through Camo.

## Monitoring

`.github/workflows/momo-heartbeat.yml` validates the rendered README's actual Camo
URLs twice an hour and manages the sticky `momo-down` issue. A green origin curl is
not the bar; a complete file through Camo is.

## History

Until 2026-07-16 the server ran on a Contabo VPS behind another project's Caddy.
That project's deploy wiped the reverse-proxy block on 2026-07-13 and every README
image 502'd for three days — the outage that motivated the Fly move. The old
`streamlings` systemd unit on the VPS is retired; a final state backup lives in
`~/Dev/streamlings-vps-backup/`.

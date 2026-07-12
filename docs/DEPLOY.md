# Deploying the pet server

The stream is a long-lived HTTP connection per viewer — this needs a small always-on box
(Fly.io, Hetzner, any VPS). **Not serverless**: lambdas time out; endless GIFs don't.

```
npm install
ASSET_DIR=/path/to/mascot-assets npm run build   # one-time: frames + palette + glyphs
PORT=8787 BACK_URL=https://github.com/Christian-Katzmann/streamlings npm start
```

Env: `PORT`, `BACK_URL` (bounce-back target), `STREAM_ASSETS` (built assets dir),
`DATA_DIR` (ledger). Put a TLS proxy in front (Caddy/Fly handles this) — GitHub's Camo
only proxies https. Keep `Cache-Control: no-store` (already set) so Camo streams through.

Sizing: ~38 KB/s per open viewer; a 256 MB instance handles a launch-day README fine.

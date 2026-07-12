# Deploying Streamlings

The server returns complete, self-looping GIFs in under Camo's ~4.3 second upstream
window. It needs persistent disk for feeder counts, recent reactions, and repo mood;
any small always-on Node host works.

```sh
npm install
ASSET_DIR=/path/to/mascot-assets npm run build
npm test
PORT=8787 BACK_URL=https://github.com/Christian-Katzmann/streamlings npm start
```

Environment: `PORT`, `BACK_URL`, `STREAM_ASSETS`, `DATA_DIR`, `REPO_SLUG`,
`WEBHOOK_SECRET`, and optional `BASE_PATH`.

Put TLS in front; Camo only proxies HTTPS. Preserve the server's `Cache-Control:
no-store` response so a refresh can render recent events. The committed artwork is only
a preview; production uses the private built frame library.

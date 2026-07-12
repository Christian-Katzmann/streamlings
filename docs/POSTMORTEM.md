# Camo postmortem

## What actually happens

Measured on 2026-07-13 against the live README and its real Camo URLs:

- Camo ends the upstream fetch at roughly **4.23–4.34 seconds**, independent of bytes.
- Stage samples ended at 68–176 KB; banners at 7–17 KB; tiny sensors at 438–858 B.
  The common duration and radically different sizes make the cutoff time-based.
- Camo buffers roughly **3.5 KB** before exposing response headers/body. A stage began
  reaching the client after 0.6–1.7 s, a banner after 1.5–2.7 s, and a tiny sensor only
  after the cutoff. Caddy's `flush_interval -1` cannot remove this Camo buffer.
- The origin continued normally beyond 15 seconds. Camo responses were `x-cache: MISS`
  with `Cache-Control: no-store`. The Camo URL is derived from the origin URL, not the
  commit, so `/stage.gif` keeps the same Camo URL across README commits.

The original endless GIF omitted the loop extension. When Camo cut it, the browser had
only an incomplete recording and froze on its final frame. Adding a loop extension to
the endless response would replay the truncated slice, but it would still not deliver
new events. That is why the transport model—not only one GIF flag—had to change.

## The new model

Every image request now gets a **complete GIF**, generated in a few hundred milliseconds
with a `NETSCAPE2.0` infinite-loop extension and a GIF trailer. The full scene reaches
Camo before its deadline, then loops locally for as long as the README remains open.

Recent actions are durable state, not ephemeral live frames:

| Mechanic | Result |
|---|---|
| Idle / greeting | Clean bounded scene selected at load |
| Feed / pat / play | Kept; the existing bounce reloads the page with the reaction |
| Star / fork | Redesigned; named event persists 30 minutes and appears after refresh or **wake Momó** |
| Whisper | Kept; reply Action works independently, and the latest whisper can appear on return |
| Boop | Redesigned; the expanded section contains its own visible reaction |
| CI / dependency mood / commits | Kept; state appears on later loads |
| Presence / scroll gaze | Cut; Camo connections do not represent a lasting viewer |
| Synchronized dollhouse | Cut; separately truncated image fetches cannot remain synchronized |

This is less magical than the original premise and much more real: Momó wakes on each
load, remembers what happened, and never freezes.

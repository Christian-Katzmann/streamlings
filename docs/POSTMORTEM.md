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

Every image request now gets a **complete GIF**, generated before Camo's deadline with a
`NETSCAPE2.0` infinite-loop extension and a GIF trailer. The initial fix used one short
scene, which avoided freezing but felt like an animated wallpaper. The stage now gets a
roughly minute-long episode assembled from 12 different clips. Three idle variants
rotate between loads. Event episodes greet first, show the reaction second, then play
four calm scenes before repeating.

Recent actions are durable state, not ephemeral live frames:

| Mechanic | Result |
|---|---|
| Idle / greeting | Varied 12-scene episode; the next request rotates to another variant |
| Feed / pat / play | Kept; the bounce reloads the page with a hello, the reaction, then four more scenes |
| Star / fork | Redesigned; named event persists 30 minutes and appears after refresh or **wake Momó** |
| Whisper | Kept; reply Action works independently, and the latest whisper can appear on return |
| Boop | Redesigned; the expanded section contains its own visible reaction |
| CI / dependency mood / commits | Kept; state appears on later loads |
| Presence / scroll gaze | Cut; Camo connections do not represent a lasting viewer |
| Synchronized dollhouse | Cut; separately truncated image fetches cannot remain synchronized |

This is less magical than the original premise and much more real: Momó wakes on each
load, remembers what happened, and changes activity for about a minute before repeating.

## Final verification

Verified on 2026-07-13 against github.com, not only the origin:

- Stage through Camo: **2.41 s**, 238,850 B, 36/36 decoded frames, 5.04 s loop, valid trailer.
- Reaction episode through Camo: **2.41 s**, 436,870 B, 90/90 decoded frames, 25.2 s, valid trailer.
- Idle episode through Camo: **1.28 s**, 892,628 B, 216/216 decoded frames, 64.26 s,
  valid trailer. Consecutive origin requests returned different episode hashes.
- Star banner through Camo: **2.10 s**, 45,891 B, 24/24 frames, valid trailer.
- Boop through Camo: **2.25 s**, 152,458 B, 36/36 frames, valid trailer.
- The GitHub browser showed different frames more than a minute apart while preserving
  the same named message: [first capture](evidence/github-star-thanks.png) ·
  [later capture](evidence/github-star-thanks-later.png).
- A real GitHub star delivered its webhook and the returned Camo image visibly rendered
  `thank you @Christian-Katzmann ★`. GitHub currently allows the owner to star the repo;
  the handoff's contrary assumption was outdated.
- CI passed syntax checks, unit tests, webhook tests, and the full-server fixture test.
- The responsive GitHub page at 390×844 loaded the complete Camo image at 320×320.
- Whisper issue #1 received Momó's reply, 👀 + ❤️ reactions, and closed successfully.

GitHub's mobile web layout is verified. Native GitHub apps and email clients may choose
to show only the first GIF frame; that is a graceful static fallback, not a live-mode
claim.

Evidence: [named star reaction](evidence/github-star-thanks.png) ·
[visible boop](evidence/github-boop.png) ·
[whisper issue](https://github.com/Christian-Katzmann/streamlings/issues/1)

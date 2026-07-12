<div align="center">

<img src="https://vmi3375405.contaboserver.net/momo/stage.gif" width="320" alt="Momó, live — this image never finishes loading" />

# Streamlings

**A live, interactive pet that lives in a GitHub README.**

This is Momó, and the image above is **live right now** — it never finishes loading.
It's an endless GIF streamed frame-by-frame from a tiny server, which makes a README
behave like a screen. Momó noticed you arrive. Momó will notice you leave.

*(Static fallback if the stream is napping: [preview.gif](assets/preview.gif))*

[How it works](#the-tricks) · [Interact](#interact) · [Status](#status) · [The plan](docs/PLAN.md)

</div>

---

## The tricks

GitHub READMEs are static markdown: no JavaScript, no CSS, no iframes. But two things
survive sanitization — **images** and **links** — and that turns out to be enough for a
full input → state → render loop:

| Trick | How | What it gives Momó |
|---|---|---|
| **The endless GIF** | The GIF format has no mandatory end. GitHub's image proxy (Camo) streams responses through without buffering, so the server just… never closes the connection, appending frames forever. | A live video screen inside static markdown. |
| **Links as a controller** | `[![](img)](url)` survives markdown sanitization. A click is a navigation, and a navigation is an input event. | Feed / pat / play buttons. |
| **The pet-house bounce** | Clicks land on the pet server first-party (a cute one-beat interstitial), which sets a cookie, then returns you to GitHub. | Momó remembers who feeds it: *"ah, you again! 3rd time ♥"* |
| **Connections = presence** | Every open profile is an open stream connection. Connect and disconnect are visible events. | Momó greets you when you arrive — and notices when you leave. |
| **Webhooks = identity** | Viewing is anonymous (Camo strips everything), but *acting* is not: star/fork/issue webhooks carry the actor's login, within ~1 second. | Star the repo → Momó celebrates you **by name**. |
| **Lazy pixels = sensors** | GitHub lazy-loads README images; hidden 1×1 streams connect only when scrolled into view. | Live scroll position → eyes that follow a cursor no script can see. |

The rendering is ink-on-paper all the way down: the mascot clips are line art on cream,
the speech bubbles are composited from a hand-lettered glyph atlas, and every frame ships
its own 24-color palette so a viewer can join the stream at any tick.

## Interact

Click one, watch the image above react — no refresh needed. You'll bounce through
Momó's house for a second and land right back here. Momó remembers repeat feeders. ♥

<div align="center">

[**🍖 feed**](https://vmi3375405.contaboserver.net/momo/act/feed?back=https://github.com/Christian-Katzmann/streamlings) &nbsp;·&nbsp; [**✋ pat**](https://vmi3375405.contaboserver.net/momo/act/pat?back=https://github.com/Christian-Katzmann/streamlings) &nbsp;·&nbsp; [**⚽ play**](https://vmi3375405.contaboserver.net/momo/act/play?back=https://github.com/Christian-Katzmann/streamlings)

⭐ starring = a celebration with your name in it *(coming in M2)*

</div>

## Status

- [x] **M1 — the core loop**: endless stream, state machine over 77 hand-tagged clips, spawn-weighted idle pool (rare clips are easter eggs), greet-on-arrival, click reactions that interrupt idling, speech bubbles, feeder memory. **Deployed and live in this README.**
- [ ] **M2 — the star eruption**: webhook → instant full-page celebration, stargazer's name in lights
- [ ] **M3 — the gaze engine**: sensor fusion over scroll + clicks + presence → cursor-following eyes
- [ ] **M4 — trojan utility**: CI mood (red build = rain), Dependabot fleas, commit metabolism
- [ ] **M5 — the world**: multi-image dollhouse, cross-repo migration, issue whispering, fork babies
- [ ] **M6 — multi-tenant**: bring your own mascot

Full design doc: **[docs/PLAN.md](docs/PLAN.md)** — the platform physics, the constraints, and every mechanic.

## Architecture

```
pipeline/build.js   private mascot clips ──ffmpeg──▶ frame library + shared palette
                    + hand-lettered glyph atlas (Bradley Hand → PNG glyphs)

server/             index.js      routes, broadcast ticker, cookie ledger
                    pet.js        the brain: clip-chaining state machine
                    compose.js    ink-on-paper bubbles from the glyph atlas
                    gif-stream.js the endless GIF: handshake + per-tick frames
```

One broadcast ticker renders each frame **once** and fans the bytes out to every open
connection. Idle costs nothing (the ticker pauses at zero viewers and Momó greets whoever
starts it again). ~38 KB/s per viewer at 10 fps, 400×400, line art.

Run it yourself: `npm install && npm run build && npm start`
(the pipeline expects a private asset dir of mascot clips + a catalog — see [docs/PLAN.md](docs/PLAN.md) §4;
the Momó artwork itself is not in this repo).

## Credits

Momó is the mascot of the Momó project by [Christian Katzmann](https://github.com/Christian-Katzmann).
Artwork © Christian Katzmann — the code is MIT, the octopus is not.

Designed and built in one session with [Claude Code](https://claude.com/claude-code),
from "wait, does GitHub allow that?" to a browser animating the stream.

<div align="center">

*The pet is a rendering of the repo's nervous system.*

🐙

</div>

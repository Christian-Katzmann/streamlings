<div align="center">

<img src="https://vmi3375405.contaboserver.net/momo/stage.gif" width="320" alt="Momó, live — this image never finishes loading" />

# Streamlings

**A live, interactive pet that lives in a GitHub README.**

This is Momó, and the image above is **live** — a GIF streamed frame-by-frame from a
tiny server, which makes a README behave like a screen. Momó greeted you when the page
opened. Each visit streams for about a minute, then Momó asks for a refresh —
every reload is a fresh hello.

<img src="https://vmi3375405.contaboserver.net/momo/banner/top.gif" width="880" alt="a hand-drawn divider — it has a second job" />

<sub>⭐ **Star this repo while the page is open.** That divider above is not decoration —
it erupts in fireworks with **your name in lights**, and Momó celebrates you by name.
(Viewing is anonymous; *acting* is not. That's the trick.)</sub>

[How it works](#the-tricks) · [Interact](#interact) · [The dollhouse](#the-dollhouse) · [Status](#status) · [The plan](docs/PLAN.md)

<img src="https://vmi3375405.contaboserver.net/momo/px/top.gif" width="72" alt="" />

</div>

---

## The tricks

GitHub READMEs are static markdown: no JavaScript, no CSS, no iframes. But two things
survive sanitization — **images** and **links** — and that turns out to be enough for a
full input → state → render loop:

| Trick | How | What it gives Momó |
|---|---|---|
| **The endless GIF** | The GIF format has no mandatory end. GitHub's image proxy (Camo) streams responses through, so the server just… keeps appending frames. | A live video screen inside static markdown. |
| **Links as a controller** | `[![](img)](url)` survives markdown sanitization. A click is a navigation, and a navigation is an input event. | Feed / pat / play buttons. |
| **The pet-house bounce** | Clicks land on the pet server first-party, which sets a cookie, then returns you to GitHub. | Momó remembers who feeds it: *"ah, you again! 3rd time ♥"* |
| **Connections = presence** | Every open page is an open stream connection. Connect and disconnect are visible events. | Momó greets you when you arrive. |
| **Webhooks = identity** | Viewing is anonymous (Camo strips everything), but *acting* is not: star/fork/issue webhooks carry the actor's login, within ~1 second. | Star → fireworks with **your name**. Fork → Momó welcomes the baby. |
| **Lazy pixels = sensors** | GitHub lazy-loads README images; the tiny bubble-trails scattered down this page only connect when scrolled into view. | Momó's eyes drift toward where you're reading. |
| **`<details>` = silent buttons** | Images inside a closed `<details>` aren't fetched until you open it. | The secret boop, below. |
| **The repo is the body** | CI runs, Dependabot alerts and pushes are all events too. | Red build → Momó is sad. Vulnerable deps → Momó has *fleas*. Commits → nom. |

The rendering is ink-on-paper all the way down: line-art clips, a hand-lettered glyph
atlas for the bubbles, procedural ink fireworks, and every frame ships its own 24-color
palette so a viewer can join the stream at any tick.

## Interact

Click one — you'll bounce through Momó's house for a second and land back here,
where Momó acts out your click the moment the page reopens. It remembers repeat feeders. ♥

<div align="center">

[**🍖 feed**](https://vmi3375405.contaboserver.net/momo/act/feed?back=https://github.com/Christian-Katzmann/streamlings) &nbsp;·&nbsp; [**✋ pat**](https://vmi3375405.contaboserver.net/momo/act/pat?back=https://github.com/Christian-Katzmann/streamlings) &nbsp;·&nbsp; [**⚽ play**](https://vmi3375405.contaboserver.net/momo/act/play?back=https://github.com/Christian-Katzmann/streamlings)

⭐ **star** = fireworks with your name &nbsp;·&nbsp; 🍴 **fork** = Momó adopts the baby &nbsp;·&nbsp; [🤫 **whisper to Momó**](https://github.com/Christian-Katzmann/streamlings/issues/new?title=whisper%3A+hello+momo&body=Whisper+something+in+the+title.+Mom%C3%B3+reads+it%2C+replies%2C+and+eats+the+issue.+%F0%9F%90%99) — it replies, then eats the issue

</div>

<details>
<summary>🫳 there is a snoot here, hidden from the lazy loader. open to boop. (no reload — watch the stage above)</summary>
<br>
<div align="center"><img src="https://vmi3375405.contaboserver.net/momo/px/boop.gif" width="72" alt="boop delivered" /><br><sub>boop delivered. Momó felt that.</sub></div>
</details>

## The dollhouse

Two rooms, one octopus. Momó is only ever in one of them — catch it napping next door,
or leave the page quiet for five minutes and it wanders off to bed.

<div align="center">

<img src="https://vmi3375405.contaboserver.net/momo/stage.gif" width="240" alt="the stage" /> <img src="https://vmi3375405.contaboserver.net/momo/room/bedroom.gif" width="240" alt="the bedroom" />

<sub>the stage &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; the bedroom</sub>

<img src="https://vmi3375405.contaboserver.net/momo/px/mid.gif" width="72" alt="" />

</div>

Momó also keeps a **[diary](DIARY.md)** — one line a day, committed by the pet itself.
And the repo is its body: a red CI run makes it cry, open Dependabot alerts give it
fleas, and every push is a snack.

## Status

- [x] **M1 — the core loop**: endless stream, 77 hand-tagged clips, spawn-weighted idles (rare clips are easter eggs), greet-on-arrival, armed reactions, speech bubbles, feeder memory
- [x] **M2 — the star eruption**: HMAC-verified webhook → banner fireworks + name-in-lights + celebration clips, fork = baby
- [x] **M3 — the gaze engine**: lazy-pixel scroll sensors + click direction fused into pupil drift on eye-mapped idle clips; `<details>` boop
- [x] **M4 — trojan utility**: CI mood (rain), Dependabot fleas, commit metabolism, diary
- [x] **M5 — the world (first rooms)**: two-room dollhouse, issue whispering with replies in Momó's voice
- [ ] **M5.5**: cross-repo migration, playdates between pets, fork-lineage genetics
- [ ] **M6 — multi-tenant**: bring your own mascot ([groundwork](docs/DEPLOY.md))

Full design doc: **[docs/PLAN.md](docs/PLAN.md)** — the platform physics, the constraints, every mechanic.

## Architecture

```
pipeline/build.js   private mascot clips ──ffmpeg──▶ frame library + shared palette
tools/eyemap.js     line-art blob detection ──▶ per-frame eye coordinates (for gaze)

server/             index.js      channels (stage/bedroom/banners/sensors), ticker, ledger
                    pet.js        the brain: clips, moods, rooms, celebrations, gaze
                    compose.js    ink compositor: bubbles, pupils, fireworks, room cards
                    hooks.js      HMAC webhook → pet events (this is how Momó learns names)
                    gif-stream.js the endless GIF: handshake + per-tick frames

.github/workflows/  momo-reply.yml  Momó's voicebox (replies to whispers, eats issues)
                    momo-diary.yml  one diary line a day, committed by the pet
                    ci.yml          the build whose color decides Momó's weather
```

One broadcast ticker advances the brain once per tick and renders only the channels
someone is watching. Idle costs nothing. ~38 KB/s per viewer on the stage; the banners
and sensors are a fraction of that.

Run your own: `npm install && npm run build && npm start` — see [docs/DEPLOY.md](docs/DEPLOY.md).
(The pipeline expects a private asset dir of mascot clips + a catalog; the Momó artwork is not in this repo.)

## Credits

Momó is the mascot of the Momó project by [Christian Katzmann](https://github.com/Christian-Katzmann).
Artwork © Christian Katzmann — the code is MIT, the octopus is not.

Designed and built with [Claude Code](https://claude.com/claude-code),
from "wait, does GitHub allow that?" to an octopus with a diary.

<img src="https://vmi3375405.contaboserver.net/momo/banner/bottom.gif" width="880" alt="" />

<div align="center">

*The pet is a rendering of the repo's nervous system.*

🐙

<img src="https://vmi3375405.contaboserver.net/momo/px/deep.gif" width="72" alt="" />

</div>

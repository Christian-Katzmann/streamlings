<div align="center">

# Streamlings

**Momó is a hand-drawn octopus who wakes up inside this README.**

<img src="https://momo.ktzm.dk/stage.svg?v=20260716" width="400" alt="Momó the octopus moving through a hand-drawn episode" />

[**🍖 feed**](https://momo.ktzm.dk/act/feed?back=https://github.com/Christian-Katzmann/streamlings) · [**✋ pat**](https://momo.ktzm.dk/act/pat?back=https://github.com/Christian-Katzmann/streamlings) · [**⚽ play**](https://momo.ktzm.dk/act/play?back=https://github.com/Christian-Katzmann/streamlings) · [**🤫 whisper**](https://github.com/Christian-Katzmann/streamlings/issues/new?title=whisper%3A+hello+momo&body=Whisper+something+in+the+title.+Mom%C3%B3+reads+it%2C+replies%2C+and+eats+the+issue.+%F0%9F%90%99)

<sub>Feed, pat, or play: one blink away and you return here with Momó already reacting.</sub>

## [🐙 Visit Momó live in the Aquarium →](https://momo.ktzm.dk/)

<sub>Watch together, see instant reactions, build a streak, and meet Momó's recent named visitors.</sub>

Momó wakes with a complete hand-drawn episode on each load and keeps moving for five
minutes before the episode starts over. Nighttime, rare surprises, and recent memories
can change the schedule. What happens in the repository changes what Momó remembers.

<img src="https://momo.ktzm.dk/banner/top.gif" width="880" alt="hand-drawn divider" />

⭐ **Star the repo, then [wake Momó](https://momo.ktzm.dk/wake?back=https://github.com/Christian-Katzmann/streamlings).**

GitHub sends Momó the star by webhook. The stage already on your screen cannot change,
so **wake Momó** starts the next load; for 30 minutes, she can thank the latest stargazer
by GitHub name.

[Meet Momó](#meet-momó) · [How it works](#how-it-works) · [Run it](#run-it) · [Camo postmortem](docs/POSTMORTEM.md)

</div>

## Meet Momó

The stage is the postcard. The **[Aquarium](https://momo.ktzm.dk/)** is Momó's real tank:
a first-party page where live presence, no-reload feed/pat/play reactions, personal action
streaks, and recent visitors all work without GitHub's image proxy in the middle.

Back here in the README:

- **Feed / pat / play** records the action, then redirects straight back to this stage.
  The returned episode opens on the reaction.
- **Star / fork** arrives through a GitHub webhook. A new load or the **wake Momó** link
  reveals the named thank-you while it is still in memory.
- **Whisper** opens an issue titled `whisper: …`. Momó replies in her own voice, reacts,
  and closes the issue.
- **Commits, CI, and dependency alerts** shape later moods and memories.

<details>
<summary>🫳 reveal a hidden boop bonus</summary>
<br>
<div align="center">
<img src="https://momo.ktzm.dk/boop.gif" width="280" alt="Momó reacts to a boop" />
<br><sub>Browsers may preload this GIF while the section is closed. Opening it reveals the bonus; it does not send Momó a new interaction.</sub>
</div>
</details>

Momó also keeps a **[diary](DIARY.md)** — one honest line a day, committed by the pet.

## How it works

GitHub READMEs allow images and links, but GitHub fetches images through its Camo proxy.
Camo cuts long-running image responses after roughly 4.3 seconds, so an endless live GIF
cannot work here.

The stage is instead one complete animated SVG. Its sprite strips and hand-lettered
bubbles arrive inside the file, then animate in your browser for a five-minute schedule.
Every README load asks Momó's server for a complete episode. The GIF banners and hidden
boop are complete self-looping files too.

| Place | What is real there |
|---|---|
| GitHub README | A complete five-minute episode; link actions return to a newly rendered reaction |
| GitHub webhooks | Named stars, forks, whispers, commits, CI, and dependency state enter Momó's memory |
| [Aquarium](https://momo.ktzm.dk/) | First-party live presence and instant shared reactions over server-sent events |
| Heartbeat | Twice-hourly, best-effort checks of the actual Camo URLs rendered by GitHub |

The renderer stays ink-on-paper throughout: private line-art clips, a shared 24-color
palette, hand-lettered speech bubbles, and procedural ink fireworks. The Momó artwork
stays private; this public repo contains the engine and a small preview only.

The measured failure and the design correction are preserved in the
**[Camo postmortem](docs/POSTMORTEM.md)**.

## Run it

```sh
npm install
ASSET_DIR=/path/to/private/mascot-assets npm run build
npm test
npm start
```

See [docs/DEPLOY.md](docs/DEPLOY.md). Full original design: [docs/PLAN.md](docs/PLAN.md).

Artwork © Christian Katzmann. Code MIT.

<div align="center">

<img src="https://momo.ktzm.dk/banner/bottom.gif" width="880" alt="hand-drawn divider" />

*The pet is a rendering of the repo's nervous system.* 🐙

</div>

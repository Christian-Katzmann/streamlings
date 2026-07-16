<div align="center">

# Streamlings

**A pet that wakes up inside a GitHub README.**

<img src="https://momo.ktzm.dk/stage.gif" width="320" alt="Momó the octopus, animated for this visit" />

[**🍖 feed**](https://momo.ktzm.dk/act/feed?back=https://github.com/Christian-Katzmann/streamlings) · [**✋ pat**](https://momo.ktzm.dk/act/pat?back=https://github.com/Christian-Katzmann/streamlings) · [**⚽ play**](https://momo.ktzm.dk/act/play?back=https://github.com/Christian-Katzmann/streamlings) · [**🤫 whisper**](https://github.com/Christian-Katzmann/streamlings/issues/new?title=whisper%3A+hello+momo&body=Whisper+something+in+the+title.+Mom%C3%B3+reads+it%2C+replies%2C+and+eats+the+issue.+%F0%9F%90%99)

<sub>Press one — the page blinks and you land right back here with Momó already reacting.<br>A cookie remembers repeat feeders.</sub>

Each load starts with a hello, then plays a different minute-long Momó episode made from
12 animations. It only loops after the full episode. Feed, pat, play, stars, forks,
whispers, commits, CI, and dependency alerts change what the next load shows.

<img src="https://momo.ktzm.dk/banner/top.gif" width="880" alt="hand-drawn divider" />

⭐ **Star the repo, then [wake Momó](https://momo.ktzm.dk/wake?back=https://github.com/Christian-Katzmann/streamlings).**
The webhook remembers the latest stargazer for 30 minutes, so Momó can thank you by
GitHub name on the return trip.

<sub>Testing again? Unstar first, star again, then click **wake Momó**.</sub>

[Interact](#interact) · [How it works](#how-it-actually-works) · [What survived](#what-survived) · [Postmortem](docs/POSTMORTEM.md)

</div>

## Interact

The buttons under the stage record the action and bounce you straight back — the reload
carries the reaction. Two more ways in:

<div align="center">

🍴 **fork** = Momó welcomes the little one on the next load<br>
🤫 **whisper** = open an issue titled `whisper: …` — Momó replies, then eats the issue

</div>

<details>
<summary>🫳 open to boop</summary>
<br>
<div align="center">
<img src="https://momo.ktzm.dk/boop.gif" width="280" alt="Momó reacts to a boop" />
<br><sub>The reaction lives here because opening this section cannot update the stage above.</sub>
</div>
</details>

## How it actually works

GitHub READMEs allow images and links, but GitHub's Camo image proxy stops fetching an
upstream image after about 4.3 seconds. So the server does not pretend it has a permanent
live connection. It builds a complete GIF before that deadline, including its loop
instruction and final trailer. Camo receives the whole file; the browser loops it.

| Input | Delivery |
|---|---|
| Page load | A hello, then one of several minute-long episodes assembled from 77 hand-tagged clips |
| Feed / pat / play | Server records the action; after the hello, the bounce shows the reaction |
| Star / fork | Webhook stores the actor's name; refresh or **wake Momó** to see it |
| Boop | Opening the section loads a dedicated visible reaction GIF |
| CI / Dependabot / commits | Persistent repo mood shown on later loads |
| Whisper | GitHub Action replies in Momó's voice and closes the issue |

The renderer is ink-on-paper throughout: private line-art clips, a shared 24-color
palette, hand-lettered speech bubbles, and procedural ink fireworks. The Momó artwork
stays private; this public repo contains the engine and a small preview only.

## What survived

- **Working:** varied pet episodes, feeder memory, named star/fork thanks, visible boop, CI and
  dependency moods, commit metabolism, whispers, diary, hand-drawn banners.
- **Removed:** live presence, scroll gaze, synchronized rooms, and instant no-reload
  stage reactions. Camo makes those delivery paths impossible.

Momó also keeps a **[diary](DIARY.md)** — one line a day, committed by the pet.

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

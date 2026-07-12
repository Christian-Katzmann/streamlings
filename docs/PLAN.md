# Momó in the README — Full Plan
**Working title: Streamlings** (final name TBD). Plan written 2026-07-12 from the design session. Status: ready for implementation, waiting on curated clips.

The pitch: a live, interactive virtual pet living in a GitHub README — Momó the octopus, streamed in real time, watching visitors, remembering feeders, greeting stargazers by name, and erupting the whole page in hand-drawn fireworks when someone stars the repo. Built entirely out of things GitHub's markdown sandbox *can't block*: server-rendered images and links.

Inspiration: Nomlings (pixel pet badge fed by commits). We keep its metabolism idea and escalate everything else.

---

## 1. Platform physics — the primitives everything is built on

These are the load-bearing tricks. Everything in §3 composes from these.

| # | Primitive | Mechanism | What it gives us |
|---|-----------|-----------|------------------|
| P1 | **Endless streaming GIF** | GIF format has no mandatory terminator; GitHub's Camo proxy streams responses through without buffering. Server keeps the connection open and appends frames forever. | A live video screen inside static markdown. Real-time output. |
| P2 | **Links = input** | `[![](img)](url)` survives sanitization. Click = navigation to our server = input event with exact identity of the *control* clicked. | Buttons. Also: exact cursor position fix at click time. |
| P3 | **The pet-house bounce** | Click lands on our domain **first-party** → we set a cookie → short cute interstitial page ("the pet's house") → link/redirect back to GitHub. The interstitial beat (not a naked 302) is deliberate: Safari's bounce-tracking protection purges cookies from pure-redirect domains; a real page with real interaction legitimizes the domain. Feature and fix in one. | Persistent per-feeder identity. |
| P4 | **`<details>` = silent buttons** | Images inside a closed `<details>` aren't fetched until it opens. Put a streaming pixel inside; the open event hits our server. No navigation, no reload flicker. | In-page controls. |
| P5 | **Lazy pixels = scroll sensor** | GitHub lazy-loads README images. Transparent 1×1 streams scattered down the page connect only when scrolled into view, and stay connected while visible. | Live vertical read-position of each visitor. |
| P6 | **Stream connections = presence** | Each open profile = open GIF connection(s). Connect/disconnect events = arrivals and departures, live viewer count. | The pet knows someone is watching *right now*, and when they leave. |
| P7 | **Webhooks = identity** | Star/fork/issue/watch webhook payloads contain the actor's **GitHub login**. Fires within ~1s. | Real usernames. Viewing is anonymous; *acting* is not. |
| P8 | **Timing correlation** | Camo anonymizes all image viewers — the stream never knows who watches. But the person watching 2s after feeder #42 clicked *is* feeder #42. Server injects personalized content into the global stream at the moment only one viewer is plausible. | Personalization without tracking. |
| P9 | **Identity graduation** | Cookie (P3) ↔ username (P7) get linked by timing correlation when a known feeder stars/opens an issue. Probabilistic but sticky once made. | The pet learns your *name* permanently the day you star it. |
| P10 | **Hidden celebration layer** | Extra streams everywhere in the README emitting fully transparent frames — invisible sleepers. On an event, all bloom simultaneously (shared server state). | Whole-page eruptions. |
| P11 | **Multi-stream sync** | Many images, one server state, frame-synchronized. Objects can cross image boundaries (exit left frame, enter right frame mid-stride). | The dollhouse. The README as one living surface. |

### Hard constraints (accepted, designed around)
- **No hover channel exists. Period.** No JS, no CSS `:hover`, no SMIL mouseover inside `<img>`. Cursor position is *inferred*, never observed (→ gaze engine, §2).
- **Stream viewers are anonymous** (Camo strips everything). Only P7–P9 yield identity.
- **Connections get cut** by proxies/browsers after ~a minute; streams must resume gracefully mid-scene on reconnect.
- **GIF = 256 colors** per frame. Non-issue for us: Momó is line art (§4).
- **One connection per viewer per image.** Viral README = many open sockets → needs a proper long-lived-connection host, not serverless (§5).
- **Platform risk:** all of this rides on current Camo behavior. If GitHub changes streaming/lazy-loading, degrade gracefully to periodic re-render (the pet gets slower, never dies).
- Cut feature: ~~dark-mode = nighttime~~ — every programmer uses dark mode; it'd be permanent bedtime. Theme-conditional images may still be used for art variants/telemetry, never for sleep state.

---

## 2. The gaze engine — eyes that follow a cursor we cannot see

Sensor fusion over GitHub's accidental telemetry, rendered as pupils:

- **Scroll row** from lazy pixels (P5) — which slice of the page is on screen, live.
- **Click fixes** (P2) — exact cursor coordinates at every interaction, still valid after the bounce back.
- **Arrival/departure** (P6) — connection opens: cursor near entry point; page priors (people arrive at top).
- **Dead reckoning** between fixes: fuse the above into a best-estimate cursor position; pupils *glide* toward it (never snap — smoothness sells it).
- **Mona Lisa fallback**: with no data, resting pupils are drawn dead-center staring straight out, which psychologically "follows" any viewer for free.

Eyes are the perfect output for probabilistic input: nobody checks a pet's gaze with a ruler — direction + liveness = feels watched.

Momó implementation detail: the resting face is two black dots on blank cream — erase dots, redraw pupils anywhere. Trivial compositing. Big dramatic looks use the existing "eyes glancing" / "looking around" clips.

---

## 3. Feature list — the full super-fun version

### A. The Screen
1. **Live pet** — endless streaming GIF; computed frames: blinks, wanders, idles, weather moods.
2. **Speech bubbles** — full dialogue system rendered in-frame, hand-drawn style.
3. **Hidden celebration layer** — transparent sleeper streams that bloom on events (P10).
4. **The dollhouse** — markdown table = rooms, one synced stream per cell (P11); Momó walks between frames, throws a ball from one image into another; being an octopus, can poke a different tentacle into every cell at once.
5. **Cross-repo migration** — the pet naps in whichever of your repos you pushed to last; hide-and-seek across your GitHub.

### B. The Sensors
6. **Click controls** — feed / pet / play via the pet-house bounce (P2+P3).
7. **Silent buttons** — `<details>` lazy-stream controls, zero navigation (P4).
8. **Gaze engine** — §2.
9. **Presence reactions** — waves at arrivals; visibly deflates for remaining viewers when someone leaves; shy when the room gets crowded.

### C. Identity & Memory
10. **The cookie ledger** — per-feeder counts and streaks: *"Ah, you fed me 3 times yesterday. More, please!"* (delivered via timing correlation, P8).
11. **Name learning** — star/issue → username (P7); identity graduation (P9) → greeted by name forever after.
12. **Favorite-humans leaderboard** — a dollhouse room showing top feeders.

### D. Social Metabolism (GitHub events as game mechanics)
13. **Star = the celebration.** Webhook fires ~1s after the click: pet backflip/curtain-call, full-page eruption of the hidden layer, stargazer's **name in lights** — "★ THANK YOU @USERNAME ★". This is the viral demo and the gratitude machine repo owners will *want* to install.
14. **Fork = a baby.** Forked pet inherits parent's traits + one mutation; the fork network *is* the family tree.
15. **Issue whispering** — "whisper to the pet" pre-filled issue; title = message; pet replies as a bot comment in its voice, drops a 👀 reaction, closes the issue (= eats it).
16. **Playdates** — one service renders all pets, so a friend's pet can wander into your dollhouse. Looks like magic, is trivial.

### E. Trojan Utility (why it's not just a toy)
17. **CI mood** — build red → pet sits in the rain until fixed; merge → confetti.
18. **Fleas** — open Dependabot vulnerabilities = pet scratching miserably until patched. Security hygiene via empathy; nobody ignores a sad pet the way they ignore a red badge.
19. **Commit metabolism** (the Nomlings core, kept): commits feed it, streaks cheer it, yearly total levels it.

### F. The Soul
20. **Traits & aging** — colors/accessories, growth over months.
21. **The diary** — a GitHub Action commits a one-line diary entry daily; the pet's life story lives in git history.
22. **Runs away, never dies** — 60 days of repo silence → leaves a committed goodbye note; comes sprinting back on your next push ("it heard you coding").

---

## 4. The Momó asset pipeline

### What we have (updated 2026-07-12 — curation + librarian pass DONE)
- `Dev/Projects/momó/library/` — 267 raw clips, 624×624 @ 24fps, ~5–9s each, MP4.
- Style: black line-art octopus on flat cream — minimal, hand-drawn.
- Clips **loop back to the same neutral start pose** → state chaining works without crossfades.
- **Christian curated 77 clips** → `pet/curated-list.txt`. A parallel **Haiku librarian pass** (8 agents, 4-keyframe contact sheets per clip) tagged every clip: action name, description, mood, props, eye style, motion size, loop-cleanliness, state hint, spawn rarity, tags.
- **Assets now live in `Dev/Projects/momó/pet/`:**
  - `catalog.json` — machine catalog (source of truth), incl. duration, source file, sheet + clip paths
  - `CATALOG.md` — human-readable table of all 77
  - `clips/` — APFS-clone copies renamed `<id>_<name>.mp4` (e.g. `072_curtsy-bow.mp4`)
  - `contact-sheets/` — `sheet_<id>.png` 2×2 keyframe grids + `index.json`
- **State coverage:** idle 22, look-around 16, sleep 9, celebrate 7, special 7, greet 6, playful 5, other/sad 3, build 2. 67/77 loop cleanly (the 10 flagged non-clean are usable as one-way transitions).
- **Librarian discoveries beyond the filenames** (jackpot for storytelling):
  - **Sad/cry clips exist** (019, 028, 039, 040, 049) → CI-red and fleas states need NO regeneration
  - **`035_hold-sign-proud`** — Momó holds up a sign → composite dynamic text onto it ("THANK YOU @USER")
  - **`052_group-gather-cycle`** — TWO octopi meeting → the playdate/fork-baby preview shot
  - **`038_play-ball-gleeful`** — ball play → the dollhouse cross-frame ball gag
  - Plus: wink, kiss, bubble-blow, water-spray, musical-note hum, flower, sparkle celebrations, headphone grooves ×2
- **Random spawn pool** (77 > needed 25, by design): `spawn` field drives idle variety — `common` idles rotate constantly, `uncommon` actions surprise, `rare` clips (kiss, cry, drowsy-rhythm) are easter eggs viewers get lucky to see. The pet essentially never repeats itself.
- Only remaining asset gap: a flea-scratching clip (regenerate on-style when M4 lands; sad clips cover the rest).

### Why this footage is best-case
1. **Line art is the cheapest thing a GIF can stream** — quantizes to ~8 colors, frames of a few KB at 12fps. The bandwidth concern for "sophisticated mascot" evaporates.
2. **No background removal needed for v1.** The cream is the *paper Momó lives on*. Stream the full frame as a cream card; draw overlays — bubbles, confetti, fireworks — as **black ink doodles on the same paper**. One-sketchbook art direction; stronger than RGB confetti. (Christian's sprite-animator background-removal tool = v2, for dollhouse room compositing.)
3. **Dot eyes = free gaze engine** (§2).

### Pipeline (build first)
```
curated clips → normalize → frame libraries → manifest
```
1. **Normalize** (per clip): remap background to one canonical cream (AI-gen clips drift slightly); auto-center + scale the octopus via ink bounding box → transitions don't jump.
2. **Extract**: ffmpeg → PNG frames, downsample 24→12fps, resize to stream resolution (~360–400px).
3. **Quantize**: shared fixed palette (cream, black, antialias grays + reserve slots for ink-overlay accents).
4. **Manifest**: `states.json` mapping state → clip(s) → frame ranges, loop points, eye coordinates on neutral frames (for pupil compositing).

---

## 5. Architecture

### Pet Server (the heart) — one service
- **Stream manager**: holds open connections, emits frames per README image; resumable mid-scene; per-image roles (main stage, sleeper pixels, banner strip, dollhouse cells).
- **State machine**: per-repo pet state (mood, level, hunger, current clip, queue of reactions). Events in → clip transitions out.
- **Frame composer**: base clip frame + overlays (pupils, speech bubble text, ink confetti, name-in-lights banner) → GIF frame encoder (shared palette, delta frames where cheap).
- **Input endpoints**: `/pet/:id/feed|play|pat` (bounce pages, cookie ledger), lazy-pixel and `<details>` sensor endpoints, `/house` interstitial.
- **Webhook receiver**: star/fork/issues/watch/push + CI status + Dependabot alerts.
- **Gaze estimator**: per-viewer-connection fusion (§2).
- **Storage**: SQLite (pets, feeders, ledgers, name links, diary queue). Solo-dev boring-reliable.
- **Hosting**: needs cheap long-lived connections → small always-on box (Fly.io / Hetzner VPS). **Not** serverless — lambdas and endless streams don't mix.

### GitHub side
- **GitHub App** (multi-tenant later; single repo first): webhook source + issue-reply bot (the pet's voice) + diary/goodbye-note commits via Action.
- **README markup kit**: the paste-in snippet — main stage image, control links, sleeper pixels, sensor pixels — generated per pet by the server (`/pet/:id/snippet`).

### Test rig
- Local HTML page that mimics GitHub's behavior (lazy loading, image proxy with buffering quirks) so we can develop without spamming a real profile; then a scratch GitHub repo for real-Camo verification (streaming survival, timing, cache behavior). Real-Camo checks early — it's the one thing we can't simulate perfectly.

---

## 6. Build order (maximum sleeve-grab per milestone)

| M | Deliverable | Contents |
|---|------------|----------|
| **M1** | **The core loop** (the "it's alive" demo) | Asset pipeline (§4) with ~5 states: idle, curtsy-greet, hug-on-feed, sleep, theater-stage. Streaming server, one pet, main stage image. Feed button + pet-house bounce + cookie ledger. Speech bubbles incl. "you fed me N times" via timing correlation. Live on a scratch repo through real Camo. |
| **M2** | **The star eruption** (the viral demo) | GitHub App webhook → instant curtain-call celebration; hidden sleeper layer blooms page-wide; "THANK YOU @USERNAME" in ink; name learning + identity graduation. |
| **M3** | **The gaze engine** | Lazy-pixel sensors, `<details>` silent buttons, fusion estimator, composited pupils, presence reactions (wave hello / deflate on leave). |
| **M4** | **Trojan utility** | CI mood, fleas (needs 2 regenerated clips: scratching, sitting-in-rain), commit metabolism. |
| **M5** | **The world** | Dollhouse multi-stream + cross-frame physics, cross-repo migration, issue whispering, diary, runs-away/comeback, forks-as-babies, playdates. |
| **M6** | **Multi-tenant launch** | Anyone installs the GitHub App + pastes their snippet; pet provisioning; leaderboard; the launch post. |

---

## 7. Open decisions
- **Name.** "Streamlings" (working) vs something Momó-native. GitHub's mascot is the Octocat; ours is an octopus that hugs stargazers — lean into it.
- **First home**: Momó repo README (single-tenant dogfood) — decided. Multi-tenant only at M6.
- **Star-eruption scale**: how many sleeper images is tasteful in the Momó README before it's clutter? (Tune in M2.)
- **Issue-bot identity**: dedicated machine account vs App bot login (cosmetic; decide at M2.)

## 8. Status
- [x] Christian: curated clip picks → 77 clips in `pet/curated-list.txt`
- [x] Librarian pass: catalog.json + CATALOG.md + renamed clips/ + contact sheets
- [ ] **M1 next**: normalization pass (canonical cream, center/scale) → frame extraction → streaming prototype (idle pool, curtsy-greet, hug-on-feed, sleep, celebration) + feed button + cookie ledger

# Streamlings — Handoff & Debug Brief

**Status: v4 shipped and verified on 2026-07-16.** GitHub now receives a complete
five-minute animated-SVG stage; Momó's first-party Aquarium owns live presence and
instant reactions; the VPS ingress survives adjacent-stack deploys; and a twice-hourly
heartbeat checks GitHub's rendered Camo URLs. Named star thanks still arrive by webhook
and appear on the next load or **wake Momó** return. See `docs/POSTMORTEM.md` for the
measured path to this design. The failure analysis below is preserved as historical
context.

Read this top to bottom before touching code. The origin server works fine when you
`curl` it directly — **that is not the bar.** The bar is: a real person on github.com,
in a browser, over minutes, sees a living, reacting pet. Everything below is oriented to
that bar.

---

## 0. TL;DR for the next agent

- **Core premise (partly false):** "an endless GIF streamed through GitHub's Camo image
  proxy makes a README animate live forever." Reality (measured, §4): **Camo passes the
  stream through live but terminates the connection after ~4 seconds / ~100–180 KB.**
- **Freeze bug:** we deliberately removed the GIF loop extension so a *dead* stream
  wouldn't deceptively replay. Combined with Camo's early cut, every image now **freezes
  on its last delivered frame** after ~2–4 s. That is the "freezes after a few frames."
- **Star "does nothing":** it actually *does* — webhook delivers, server celebrates
  (verified: `star created → 200 OK` in delivery log). But (a) you can't star your own
  repo, so the owner can't even test it; (b) starring doesn't reload the page, and Camo
  already delivered + froze its slice, so the viewer never fetches the celebration frames.
- **Whole classes of mechanics are dead through Camo** because they need a stream that
  outlives 4 seconds: gaze/scroll sensors, presence, the dollhouse second room, live
  reactions to non-reloading actions.
- **Your job:** re-derive what is actually achievable on github.com given Camo's real
  behavior, then rebuild the experience around that truth so it *actually works* — and is
  still delightful. Details and a required deliverable in §7.

---

## 1. The vision (what we set out to build)

*(Spine: `docs/PLAN.md`, written before implementation. Condensed here; read the full
plan for the platform-physics reasoning and the complete 22-feature list.)*

A **live, interactive virtual pet living in a GitHub README** — "Momó", a hand-drawn
line-art octopus. Built entirely from the two things GitHub's markdown sandbox can't
strip: **server-rendered images and links.** The intended magic:

1. **The endless GIF** — an image that never finishes loading = a live screen in static
   markdown.
2. **Links as a controller** — `[![](img)](url)`; a click is an input event.
3. **The pet-house bounce** — clicks land first-party (cookie), then redirect back;
   the pet remembers repeat feeders.
4. **Connections = presence** — an open stream = a viewer; the pet greets arrivals.
5. **Webhooks = identity** — viewing is anonymous, but *acting* (star/fork/issue) carries
   the actor's GitHub login → the pet celebrates you **by name**.
6. **Lazy pixels = sensors** — lazy-loaded images connect only when scrolled into view →
   infer scroll position → eyes that follow you.
7. **`<details>` = silent buttons** — images in a closed `<details>` load on open.
8. **The repo is the body** — CI red → sad; Dependabot alerts → "fleas"; commits → nom.

Milestones M1–M6 (core loop → star eruption → gaze → trojan-utility moods → dollhouse &
whispers → multi-tenant). See `docs/PLAN.md §3` for all of it.

---

## 2. What was actually built

Repo: `github.com/Christian-Katzmann/streamlings` (public, MIT code; the Momó artwork is
© Christian and is **not** in the repo — the pipeline consumes a private clip library at
`~/Dev/Projects/momó/pet/`).

```
pipeline/build.js   private mascot mp4 clips ──ffmpeg──▶ 77 frame-dirs + shared 24-color
                    palette + hand-lettered glyph atlas (Bradley Hand → per-glyph PNGs)
tools/eyemap.js     line-art blob detection ──▶ per-frame eye coords for 3 QA-passed clips
server/index.js     (302 lines) HTTP routes, the broadcast ticker, channels, cookie ledger,
                    webhook receiver, CI poller
server/pet.js       (225) the brain: clip state machine, spawn-weighted idles, moods,
                    rooms, celebrations, gaze targets, armed "pending" reactions
server/compose.js   (205) ink compositor: speech bubbles, gaze pupils, banner fireworks,
                    empty-room cards, sensor strips — all in ink+paper palette slots
server/hooks.js     (72)  HMAC verify + GitHub event → pet event mapping
server/gif-stream.js (28) the endless GIF: GIF89a handshake (NO loop ext) + per-tick frame
.github/workflows/  ci.yml (build → Momó's weather), momo-reply.yml (whisper→voice reply,
                    then closes issue), momo-diary.yml (daily diary commit)
.github/momo-voice.json  Momó's whisper-reply voice pack (writer-panel + judge output)
docs/PLAN.md, docs/DEPLOY.md
```

### Endpoints (all under `https://momo.ktzm.dk`)
- `GET /stage.gif` — main stage stream
- `GET /room/bedroom.gif` — dollhouse bedroom stream
- `GET /banner/top.gif`, `/banner/bottom.gif` — wide dividers; erupt in fireworks on star/fork
- `GET /px/top|mid|deep.gif` — tiny scroll-sensor streams
- `GET /px/boop.gif` — hidden in `<details>`; opening = a boop
- `GET /act/feed|pat|play` — cookie ledger + pet-house bounce HTML (302 back to GitHub)
- `POST /hooks/github` — HMAC-verified webhook
- `GET /diary/line`, `GET /healthz`

### The rendering model (this part genuinely works and is nice)
Line-art clips quantize to ~8 colors; each GIF frame ships its own local palette so a
viewer can join mid-stream. Speech bubbles, ink fireworks, and the star's "thank you
@name ★" banner are composited from a hand-lettered glyph atlas. One broadcast ticker
advances the brain once per tick (100 ms) and fans bytes to every open connection; it
pauses at zero viewers.

### Infrastructure (deployed, working at the origin)
- **Host:** Christian's Contabo VPS, `167.86.95.24` (Ubuntu 24.04). ⚠️ Also runs the
  `konsulentkortet` docker stack + a `campaigns` app — **do not disturb them.**
- **Service:** systemd unit `streamlings`, `/opt/streamlings`, listens `:8787`
  (ufw-blocked externally), `EnvironmentFile=/etc/streamlings/env` (holds `WEBHOOK_SECRET`),
  `Restart=always`. Deploy = `rsync server/ + built assets → /opt/streamlings`, `systemctl restart streamlings`.
  SSH: `ssh -i ~/.ssh/konsulentkortet_contabo root@167.86.95.24`.
- **TLS/routing:** the existing `konsulentkortet` Caddy container terminates TLS. A
  dedicated `momo.ktzm.dk { reverse_proxy 172.18.0.1:8787 { flush_interval -1 } }` block
  (Caddyfile at `/opt/konsulentkortet/infra/Caddyfile`, backups alongside). `flush_interval -1`
  is essential — it stops Caddy buffering the stream.
- **DNS:** `momo.ktzm.dk A → 167.86.95.24` added via the Simply.com API (ktzm.dk is
  Simply-managed; nameservers ns1/2/3.simply.com). Apex→Vercel, www, Outlook MX, SPF/TXT
  untouched. Let's Encrypt cert issued.
- **Webhook:** repo hook id `652110000` → `https://momo.ktzm.dk/hooks/github`, events
  star/fork/push/issues/dependabot_alert/workflow_run, HMAC secret shared with the server.

---

## 3. What is verified vs. only assumed

| Thing | How it was checked | Real-world confidence |
|---|---|---|
| Pipeline builds frames/palette/glyphs | ran it, inspected output | **High** |
| Origin server streams a valid growing GIF | curl to origin, ffprobe frame counts | **High (origin only)** |
| Speech bubble / banner / celebration rendering | captured frames from origin | **High (rendering); unverified in a real viewer over time** |
| Feed/pat/play bounce + cookie memory | curl round-trip | **Medium — never confirmed a human sees the reaction after the bounce** |
| Webhook receives events + returns 200 | GitHub delivery log shows `star created → 200 OK` | **High — pipeline is wired** |
| Star celebration is *visible to a visitor* | ❌ never | **BROKEN (see §4)** |
| Gaze / scroll sensors / presence | ❌ only origin-side logic | **Almost certainly broken through Camo (§4)** |
| Dollhouse bedroom, moods, boop, whispers | origin logic only; whispers via Action | **Unverified end-to-end** |
| "Animates live on github.com" | 2 screenshots seconds apart | **Misleading — see §4; it animates ~2–4 s then freezes** |

**The core mistake in the build:** verification was done by curling the origin server,
which always works. The Camo proxy layer — the thing that actually determines what a
github.com visitor sees — was never rigorously characterized until this brief.

---

## 4. The bugs, with evidence

### BUG 1 — the freeze (the big one)
**Symptom:** the pet animates for a few seconds, then freezes.

**Evidence (measured against the live Camo URL for `/stage.gif`):**
- A `curl -m 30` of the Camo URL **returned on its own after 4.3 s** with ~104 KB and 23
  decoded frames. Camo — not our 70 s server window — closed the connection.
- Two back-to-back fetches returned **different byte counts** (182 KB vs 113 KB) and
  **different md5s**, with `x-cache: MISS` both times. So Camo is **not** serving a stale
  cached blob; it re-streams live each page load but **truncates after a few seconds.**
- The delivered GIF has **no NETSCAPE loop extension** (we removed it in the M1 "liveness
  fix" so a dead stream wouldn't fake-replay). So when Camo cuts the stream, the browser
  **freezes on the last delivered frame** instead of looping.

**Root cause:** `endless GIF` + `Camo cuts at ~4 s` + `no loop extension` = freeze.
The premise that Camo streams indefinitely is **false**; it streams a short slice.

### BUG 2 — the star (and every non-reloading action) is invisible
**Symptom:** "nothing happens when we give a star."

**Evidence:**
- Webhook delivery log: `star created → 200 OK` (multiple), `workflow_run`, `push` all
  arriving and 200-ing. The server *does* receive them and *does* run `celebrate()`.
- Historical assumption: **the owner cannot star their own repo.** This was disproved
  during the fix: GitHub accepted Christian's star and delivered the named webhook.
- Even from another account: starring does **not reload** the starrer's page. Their
  `/stage.gif` and `/banner/*.gif` images already delivered + froze their ~4 s slice.
  The 14 s celebration plays on the origin to nobody, then expires. The armed `pending`
  reaction waits for the actor's stream to *reopen* — but nothing reopens it.

**Root cause:** the interactivity model assumes a viewer whose stream is live (or who
reloads). Camo's short slice + no auto-reload means star/fork/boop/whisper reactions have
no delivery path to the eyes that should see them. (Feed/pat/play are the exception —
their bounce *does* reload the page, so they at least have a chance.)

### BUG 3 — gaze / presence / sensors are structurally dead through Camo
The gaze engine needs sensor-pixel streams to stay connected to report scroll position,
and presence needs the main stream to represent a live viewer. Camo cuts every stream at
~4 s, so "presence" lasts 4 s and scroll-tracking never accumulates. This entire category
(M3) almost certainly does nothing for a real visitor. Unverified but structurally
doomed under BUG 1's mechanism.

### Latent issues already found & fixed (context, don't re-fix)
A prior adversarial review found and fixed 15 issues in the origin server: a
write-after-end crash, reflected XSS on the `back` param, a webhook DoS, missing
connection caps, cookie flags, celebration-pending clobbering, boop cooldown, a gaze
eyemap off-by-one, room-aware presence, bedroom farewell. These are real fixes; the
server is reasonably hardened. **The freeze/visibility problems above are separate and
were never addressed.**

### Things to double-check that may also be wrong
- Does `flush_interval -1` actually prevent buffering end-to-end, or does Camo re-buffer
  regardless? (Measure Camo's first-byte and inter-frame timing.)
- Is Camo's cutoff time-based (~4 s), byte-based (~100–180 KB), or idle-based? The two
  differing fetch sizes hint it's not a fixed byte cap. **Characterize it precisely.**
- `Cache-Control: no-store` is echoed by Camo — but does GitHub still cache per-commit
  image URLs at another layer? Confirm whether a given Camo URL is stable per commit.
- Mobile GitHub app and email-rendered READMEs: totally untested.

---

## 5. How to reproduce & instrument (do this first)

1. Get the live Camo URL: `curl -s https://github.com/Christian-Katzmann/streamlings | grep -oE 'https://camo\.githubusercontent\.com/[a-f0-9]+/[a-f0-9]+' | head -1`
2. Characterize Camo: fetch it with `curl -m 60 -w 'time=%{time_total} bytes=%{size_download}\n'`, repeat, vary. Log first-byte latency and when it closes. Try different image sizes/framerates/bitrates to see what changes the cutoff.
3. Watch it as a human: open the README in a real browser (ideally a second GitHub
   account and an incognito window), watch the pet for 30 s. Note exactly when it freezes.
4. Star from a second account while watching; confirm (as expected) nothing visibly
   changes without a reload; then reload and see whether the celebration/pending shows.
5. Server introspection: `curl https://momo.ktzm.dk/healthz` (viewers, clip, mood,
   celebration, metab). SSH + `journalctl -u streamlings -f` for live logs.
6. Webhook deliveries: `gh api repos/Christian-Katzmann/streamlings/hooks/652110000/deliveries`.

---

## 6. Design tensions you must resolve (not obvious — think hard)

- **Liveness vs. loop.** With Camo cutting at ~4 s, a frozen last frame is the worst
  outcome. Re-adding the loop extension makes the delivered slice **loop seamlessly** —
  looks alive, but the loop is fixed at fetch time (no live reactions for passive
  viewers). Is the right product a *beautiful short loop that reloads to change*, rather
  than a *live screen*? If so, the whole narrative and the README copy must change to be
  honest (no more "this image is live right now").
- **Reactions need a reload.** Feed/pat/play already bounce (reload) — lean into that.
  For star/fork/whisper/boop (no reload), consider: **persist recent events into the idle
  loop** so the *next* page load within N minutes shows "thank you @X ★" woven into the
  ordinary animation. That converts "live reaction" into "durable recent-memory," which
  Camo *can* deliver. The starrer sees their thank-you on their next visit/refresh.
- **Make each ~4 s slice self-sufficient.** Whatever the pet is "doing," the first ~3–4 s
  from a cold connect should read as complete and inviting, because that may be all a
  visitor ever sees. Design the clip scheduler so a fresh connection starts at a clean
  beat, not mid-blink.
- **Honesty.** Christian's stated value: never claim something works that doesn't. The
  rebuilt README must describe the *real* experience. If passive liveness is impossible,
  say the pet "wakes up each time you load the page" rather than implying a live feed.
- **Keep the parts that work.** Rendering, the voice pack, the clip library and tagging,
  the whisper/diary Actions (independent of the stream), and the hardened server are
  good. Don't throw them out — re-aim them.

---

## 7. Your mandate (next agent)

**Goal:** make Streamlings *actually work for a real visitor on github.com* — genuinely
alive-feeling and genuinely interactive within what Camo truly allows — and improve it.

Do all of the following:

1. **Audit everything.** Re-read `docs/PLAN.md`, this brief, and all of `server/`,
   `pipeline/`, `tools/`, `.github/`. Independently reproduce the failures in §4/§5. Do
   not trust prior "verified" claims — re-verify through Camo in a real browser, not curl.
2. **Characterize Camo precisely.** Turn the ~4 s observation into a hard spec: what
   exactly triggers the cutoff, whether `flush_interval -1` helps, whether framerate/size
   change it, and whether there's any way to keep a stream open longer. This spec drives
   every design decision.
3. **Find every problem**, not just the three named here — correctness, UX, security,
   the Camo layer, the Caddy config, the Actions, mobile/email rendering, race conditions,
   anything that stops the intended experience. Verify each finding by reproducing it.
4. **Design the solutions.** Given Camo's real behavior, decide the model (live vs.
   seamless-loop vs. recent-memory hybrid) and how each mechanic (idle, greet, feed/pat/
   play, star/fork, whisper, boop, gaze, moods, dollhouse) is delivered so it is *actually
   observed by a human*. Resolve every tension in §6 explicitly. Prefer the simplest thing
   that genuinely works over clever things that don't.
5. **Build it.** Implement the fixes end to end. Re-add/■adjust the loop extension as
   decided; make star/fork visible (likely via durable recent-event memory woven into the
   loop); fix or honestly retire the gaze/presence mechanics; rewrite the README to
   describe the true experience. Keep the origin hardening intact.
6. **Verify like it matters.** For every mechanic, prove it works *through Camo, in a
   browser, from a second GitHub account*, over minutes — with screenshots/recordings.
   A green `curl` to the origin is not acceptance. Star must demonstrably show a visitor
   their name.
7. **Improve.** Once it works, make it better — polish the animation scheduling, the
   copy, the celebration, performance, and cost. Add anything that raises delight without
   re-introducing "looks live but isn't."

**Deliverable:** a working experience + a short `docs/POSTMORTEM.md` that states, plainly:
what Camo actually does, which original mechanics survived and which were redesigned or
cut, and why. Update this HANDOFF's status line when it genuinely works.

**Constraints:** never disturb the `konsulentkortet`/`campaigns` services or the rest of
the `ktzm.dk` zone (apex→Vercel, Outlook MX). The Momó artwork stays out of the public
repo. Deploy via the systemd/rsync flow in §2. Ask Christian before anything destructive
or externally visible beyond this repo and its own subdomain.

---

## 8. Quick reference

- Repo: `github.com/Christian-Katzmann/streamlings` · live: `https://momo.ktzm.dk`
- Origin: Contabo `167.86.95.24`, systemd `streamlings` :8787, `ssh -i ~/.ssh/konsulentkortet_contabo root@167.86.95.24`
- Caddyfile: `/opt/konsulentkortet/infra/Caddyfile` (momo.ktzm.dk block); deploy dir `/opt/streamlings`
- Webhook: hook `652110000` → `/hooks/github`; secret in `/etc/streamlings/env`
- Private assets: `~/Dev/Projects/momó/pet/` (catalog.json, clips/, contact-sheets/)
- Health: `curl https://momo.ktzm.dk/healthz` · logs: `journalctl -u streamlings -f`
- Plan spine: `docs/PLAN.md` · deploy notes: `docs/DEPLOY.md`

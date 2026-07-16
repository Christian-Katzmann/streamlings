# Momó Comes Alive — own home, endless SVG stage, live aquarium

> Momó is a hand-drawn octopus that lives in a GitHub page. Its house broke and nobody noticed, so first we give it a home nobody else can knock over, plus a robot doctor that checks its pulse every half hour. Then we rebuild its stage so it can move for as long as you watch instead of repeating a one-minute loop, teach it to remember its visitors, and open a clubhouse page where you can watch it live and play with it.

## Scope

Streamlings is currently dead on GitHub: the reverse-proxy block for momo.ktzm.dk lived inside another project's deploy artifact and was wiped on 2026-07-13, so every README image 502s through Camo — and nothing noticed for three days. This campaign (1) makes Momó's hosting deploy-proof (revised from a Fly.io move to a $0 VPS fix — see Context), (2) adds a heartbeat that validates the *real* delivery path (the Camo URLs GitHub renders) and raises a sticky issue on failure, and then (3) rebuilds the experience toward the original "live pet" intent within measured platform physics: an animated-SVG stage that plays indefinitely client-side (verified: Camo serves `image/svg+xml` with data-URI images and inline CSS allowed), a reaction-priority + memory model so stars are never clobbered by snacks, and a first-party Aquarium page where everything Camo forbids — presence, instant reactions, personal streaks — is legal. Done means: a stranger loads the README and sees a living, non-repeating pet; a star visibly thanks them by name; the Aquarium shows Momó live; and an outage raises a repo issue on the next half-hourly pulse (best effort — GitHub may delay scheduled runs).

## Context (locked decisions)

- **Branch:** `main` — direct commits after each step (solo dev, no PRs).
- **Repos:** this repo only. The Contabo VPS is touched read-only plus one pre-authorized cleanup; the konsulentkortet/campaigns services on it are untouchable.
- **Hosting (REVISED 2026-07-16, Christian's call during Phase 1):** stay on the Contabo VPS, made deploy-proof. Fly.io (~$6/month, card required) was rejected. Momó's ingress now lives in `/etc/caddy/sites/momo.caddy` on the VPS host — outside the konsulentkortet deploy artifact — mounted read-only into their Caddy container and glob-imported by their Caddyfile; both the import line and the mount are committed to the konsulentkortet repo (dfccd6b) so deploys carry them. Root cause fixed: the old hand-edited block was erased by a konsulentkortet deploy on 2026-07-13. Residual risk (shared fate with that stack's Caddy) is covered by the heartbeat.
- **Delivery law (measured, docs/POSTMORTEM.md):** Camo cuts upstream fetches at ~4.3s, buffers ~3.5KB, `no-store`, URL stable per origin URL. Every image response must be a complete file served fast.
- **The SVG unlock (verified 2026-07-16):** Camo serves `image/svg+xml` with CSP `default-src 'none'; img-src data:; style-src 'unsafe-inline'`. A complete SVG with embedded base64 sprite strips + inline CSS animation plays indefinitely client-side. No fonts (glyph-atlas PNGs carry text), no scripts, no external refs. SVG becomes the stage; GIF stays for banners/boop and as graceful fallback.
- **External mutations actually performed in Phase 1:** `/etc/caddy/sites/momo.caddy` written on the VPS; the import line + read-only mount added to the live konsulentkortet Caddyfile/prod overlay AND committed to that repo (dfccd6b, unpushed — the repo was already 6 commits ahead of origin); their Caddy container recreated once (seconds of blip, cert survived in the volume). DNS untouched. The `streamlings` systemd unit stays in service — no retirement, no ledger migration (a backup from the outage sits in `~/Dev/streamlings-vps-backup/`).
- **Prerequisites for the remaining phases:** `gh auth status` green (verified — account Aistotle); private clip library built locally (verified: 77 clips, 189MB in `assets/frames/`). No Fly, no Simply credentials needed. Deploys for Phase 2 = rsync + `systemctl restart streamlings` per docs/DEPLOY.md.
- **Artwork boundary:** Momó's art never enters the public repo; built frames ship only via rsync to the VPS.
- **No new artwork:** milestones, night mode, and rare episodes recombine the existing 77 tagged clips (`assets/manifest.json` carries mood/spawn/state hints).
- **Deploys of the momo server (rsync + `systemctl restart streamlings`) are routine** within this campaign, not production hard stops. The konsulentkortet stack is out of bounds beyond the ingress seam already landed.
- Keep the origin hardening intact: `safeBack` allowlist, HMAC webhook verification, body caps.

## Unattended execution contract

This campaign runs fully unattended via `/claude-automate` — a chain of headless `claude --print` sessions, guarded by a watchdog, with no human at the keyboard. Every step MUST honor this contract or the run can stall for hours:

- **No interactive input, ever.** No step may pause for a prompt, confirmation, login, or `[y/N]` — there is no TTY to answer it.
- **Autonomous recovery, not human-in-the-loop.** If an agent can fix a blocker without crossing a hard stop, it fixes it and continues: dirty worktrees, stale locks, dead workers, merge cleanup, missing generated artifacts, deterministic retries, and pump restarts are agent work.
- **Servers bind `127.0.0.1` only — never `0.0.0.0`/LAN.** A non-loopback listener triggers the macOS firewall "accept incoming connections?" dialog, which no flag can suppress and which blocks the whole run until someone clicks it. Use `--host 127.0.0.1` / `HOST=127.0.0.1`.
- **No blocking GUI/OS dialog.** Don't trip first-run macOS permission panels (screen recording, accessibility, Automation, Full Disk Access) or Gatekeeper. Strip quarantine from any downloaded binary (`xattr -dr com.apple.quarantine`); prefer brew/npm/uv over ad-hoc downloads.
- **No interactive auth.** No `gh auth login`, `ghost login`, MitID, or MCP `authenticate` mid-run — any credential a step needs must already be in place before launch.
- **Keep writes under the repo / `~/Dev`.** Avoid `~/Desktop`, `~/Documents`, `~/Downloads` (they trip macOS privacy prompts) unless Full Disk Access is pre-granted to the launcher.
- **Hard stops only.** Stop for destructive data loss, production deploys, secret mutation, paid/provider mutation outside the campaign, or a real product decision. For everything else, repair, record the action, and keep moving.

## How prompts work in this campaign

Each step activates a skill or runs a command and pastes a short prompt. The prompt provides only what the agent cannot know on its own:

- **Scope** — the specific thing this run is about.
- **Required reading** — file paths the agent must read first.
- **Output target** — where the result goes.
- **Open questions** — what to surface, not assume.

`<UPPERCASE_TOKENS>` are user-fillable placeholders. The Campaigns app shows an editable bar in the prompt card for them; copies use the substituted text.

## Reference implementations

High-craft examples the implementer steps match. Read the one your step names.

- `campaigns/momo-comes-alive.assets/fly.toml` — Step 1.1 · *superseded* — hosting stayed on the VPS (Christian's call, 2026-07-16); kept only as the record of the rejected option.
- `campaigns/momo-comes-alive.assets/Dockerfile` — Step 1.1 · *superseded* — same.
- `campaigns/momo-comes-alive.assets/momo-heartbeat.yml` — Step 1.3 · *near-complete* · validates the Camo path, one sticky issue, always exits green (mood-webhook interaction).
- `campaigns/momo-comes-alive.assets/svg-stage.js` — Step 2.1 · *spine* · the endless-SVG renderer: defs/use dedup, delay-aligned steps() film loops, loop-period-aligned segments, static-fallback base state.
- `campaigns/momo-comes-alive.assets/aquarium-player.js` — Step 2.3 · *spine* · fixed-timestep canvas sprite player over the same strips + SSE reaction/presence glue.

## Progress checklist

### Phase 1 — Own ground: hosting, cutover, heartbeat

- [x] Step 1.1 — Deploy-proof hosting (revised: VPS ingress fix, not Fly)
- [x] Step 1.2 — Camo verification + recovery proof (revised: no DNS move, no retirement)
- [x] Step 1.3 — Heartbeat monitor + diary hardening

### Phase 2 — The pet, rebuilt toward the original intent

- [ ] Step 2.1 — The endless SVG stage
- [ ] Step 2.2 — Memory, moods, and milestones
- [ ] Step 2.3 — The Aquarium: Momó live, first-party

### Phase 3 — Tell the truth beautifully

- [ ] Step 3.1 — README and docs truth pass
- [ ] Final review

Each step heading is followed by a `Model:` line (recommended agent + thinking effort) and a `Parallel:` line (which sibling steps can run alongside it).

## Step 1.1 — Deploy-proof hosting (revised: VPS ingress fix, not Fly)

Model: Manual — no agent
Parallel: NO

**COMPLETED 2026-07-16, revised mid-flight.** The planned Fly.io move was presented with its real cost (~$6/month, card required) and Christian chose the $0 alternative: keep the healthy `streamlings` unit on the Contabo VPS and make its ingress deploy-proof instead. What shipped:

- `/etc/caddy/sites/momo.caddy` on the VPS host (reverse_proxy 172.18.0.1:8787, flush_interval -1) — outside the konsulentkortet deploy artifact.
- konsulentkortet repo commit `dfccd6b`: `import /etc/caddy/sites/*.caddy` in `infra/Caddyfile` + a read-only `/etc/caddy/sites` mount in `release/docker-compose.prod.yml`. Glob import = no-op when empty, so it is inert for konsulentkortet itself. (That repo was already 6 commits ahead of origin; the commit is local, unpushed.)
- Same edits applied to the live VPS files (backups in `/root/*.bak-pre-momo`), config validated in a throwaway caddy container BEFORE recreating, then one `docker compose … up -d --no-deps caddy` (seconds of blip; the momo cert survived in the caddy-data volume, so TLS was instant).
- State backup taken during the outage: `~/Dev/streamlings-vps-backup/` (ledger + webhook secret, chmod 600). No migration needed — the unit never stopped.
- Fly scaffolding (fly.toml/Dockerfile/.dockerignore) removed from the repo root; the `.assets` copies remain as the record of the rejected option.

## Step 1.2 — Camo verification + recovery proof (revised: no DNS move, no retirement)

Model: Manual — no agent
Parallel: NO

**COMPLETED 2026-07-16.** DNS never moved (still A → 167.86.95.24) and the VPS unit stays in service, so this step reduced to proving delivery and the monitor's recovery path:

- All 4 Camo URLs from the live README: HTTP 200, complete bodies, final byte 0x3B (stage 904,795B in 1.4s; banners + boop complete).
- `https://momo.ktzm.dk/healthz` healthy with the original ledger intact (feed=4, stars=9); `https://konsulentkortet.dk` unaffected (200).
- Heartbeat lifecycle proven on real events: outage run opened issue #3 ("Momó stopped breathing 🫀"), post-fix dispatch detected recovery, commented "Pulse is back", and closed it.


## Step 1.3 — Heartbeat monitor + diary hardening

Model: Opus 4.8 · Extra High / GPT-5.6-Sol · Extra High
Parallel: NO

The outage that motivated this campaign ran three days unnoticed because the only scheduled job swallowed failure. This step gives the repo a pulse.

```text
SCOPE: Add the momo-heartbeat workflow that validates the real Camo delivery path every 30 minutes and manages one sticky incident issue; harden the diary workflow's silent-failure path.

REFERENCE IMPLEMENTATION — read first, this is the quality bar:
  campaigns/momo-comes-alive.assets/momo-heartbeat.yml — validates Camo URLs pulled fresh from the rendered README, one labeled sticky issue (create on failure, comment only when the reason changes, close on recovery), and always exits green because hooks.js maps any failed workflow_run to the pet's sad mood.
Match its shape, its rigor, and its idioms. The inline annotations call out the decisions that aren't obvious — honor the reasoning, don't just copy the syntax.

WHAT'S YOURS TO DECIDE:
- Cadence (the reference uses an off-minute 13,43 schedule; GitHub may delay or drop scheduled runs, so detection latency is best-effort — don't promise an SLA in any copy) and whether recovery also posts a diary line.
- How momo-diary.yml stops masking outages: keep its skip-when-unreachable behavior (heartbeat is now the alarm) or write an honest "Momó was unreachable" line — your call, but the current silent `|| exit 0` must not remain the only signal.

REQUIRED READING:
1. .github/workflows/momo-diary.yml — the silent-failure line being hardened.

OUTPUT: .github/workflows/momo-heartbeat.yml; updated momo-diary.yml; the `momo-down` label created in the repo.

ACCEPTANCE:
- A workflow_dispatch run of momo-heartbeat passes on the healthy site and logs ≥3 Camo URLs found and validated (visible in the run log).
- The run creates no issue while healthy; the issue-management branch is exercised by tests or by a temporary forced-failure dispatch (e.g., an input that points one check at an invalid URL), with the created-then-closed issue linked in the receipt.
- momo-diary.yml no longer ends in a bare silent `|| exit 0` masking outages.

FORWARD SWEEP: before checking this step off, do a quick pass over the campaign's remaining step prompts. If your work moved a path, changed a contract or shape, or invalidated an assumption a later step leans on, make a surgical edit there. A quick sweep, not a rewrite — skip it if nothing downstream changed.
```

## Step 2.1 — The endless SVG stage

Model: Opus 4.8 · Max / GPT-5.6-Sol · Extra High
Parallel: NO

The flagship. GIF capped Momó at a repeating 64-second loop; a complete SVG with embedded sprite strips and CSS animation plays a non-repeating multi-minute episode forever, because the animation happens in the visitor's browser, not on the wire. This is the closest legal thing to the original "live pet" premise.

```text
SCOPE: Build the animated-SVG stage — sprite-strip encoder with disk cache, schedule builder, SVG renderer, glyph-atlas bubble cards, and a /stage.svg route — deployed and proven complete through a real Camo fetch.

REFERENCE IMPLEMENTATION — read first, this is the quality bar:
  campaigns/momo-comes-alive.assets/svg-stage.js — the renderer spine: defs/<use> dedup (episode length decoupled from bytes), animation-delay-aligned steps() film loops entering every clip on frame 0, segment durations locked to integer multiples of each clip's loop period so the master timeline realigns on wrap, opacity-only visibility windows, and an unanimated document that doubles as the static wake-pose fallback. The header lists Camo's exact CSP — data-URI images and inline styles only, no fonts.
Match its shape, its rigor, and its idioms. The inline annotations call out the decisions that aren't obvious — honor the reasoning, don't just copy the syntax.

WHAT'S YOURS TO DECIDE:
- Strip PNG encoding and its /data cache layout (the stub names the contract: pngjs from the same indexed frames pet.loadFrames returns, keyed by clip + frameCount + palette hash). The Aquarium (Step 2.3) will serve these same strip files — encode once, consume twice.
- Bubble cards from the existing Composer glyph atlas (transparent PNG, data URI).
- How the size budget degrades: fewer unique clips per schedule, never a truncated document.
- Whether /stage.svg replaces the featured-episode logic too or reactions stay on the GIF path until Step 2.2 — pick one and say so in the receipt. Either way, preserve the ordering semantics that shipped 2026-07-16 (`REACTION_FIRST` in server/index.js): actor-triggered reactions (feed/pat/play/boop) open ON the reaction — the actor lands back mid-nom via the 302 bounce; webhook events keep the greeting first.

REQUIRED READING:
1. server/pet.js — pickIdle/scene/loadFrames (the schedule builder composes these).
2. server/index.js — the /stage.gif route and episode cache, where /stage.svg slots in alongside.

OUTPUT: server/svg-stage.js (real one), route in server/index.js, strip cache under DATA_DIR, unit tests, deployed to the VPS (rsync + systemctl restart streamlings — see docs/DEPLOY.md).

ACCEPTANCE (include the actual outputs in the receipt — verification-gap is the most-cited past review failure):
- node --test includes tests asserting: wake-first schedule; every segment duration is an integer multiple of its clip's loop period; total episode ≥ 5 minutes; rendered document ≤ 1.5MB and well-formed XML; every `<use href="#…">` resolves to an id defined in `<defs>`; a schedule built from a one-clip library terminates.
- https://momo.ktzm.dk/stage.svg responds in < 1s with valid image/svg+xml.
- A Camo-proxied fetch of the SVG returns 200 and a body ending in </svg> — a throwaway secret gist embedding the image gives you a Camo URL without touching the README (`gh gist create`); delete the gist after.

FORWARD SWEEP: before checking this step off, do a quick pass over the campaign's remaining step prompts. If your work moved a path, changed a contract or shape, or invalidated an assumption a later step leans on, make a surgical edit there. A quick sweep, not a rewrite — skip it if nothing downstream changed.
```

## Step 2.2 — Memory, moods, and milestones

Model: Opus 4.8 · Extra High / GPT-5.6-Sol · Extra High
Parallel: NO

The state model grows up: reactions get priorities so a snack can't erase a star's thank-you, the pet visibly remembers recent visitors, and collective progress permanently changes what visitors see — all recombining existing clips, no new art.

```text
SCOPE: Upgrade the reaction/state model in the server: priority slots, recent-memory weave, star milestones, night mode, rare episodes, and two mood-integrity fixes.

WORK:
- Priority slots replace the single `featured` clobber in server/index.js: social (star/fork) > whisper > action (feed/pat/play) > build. A lower-priority event never overwrites a live higher one; it queues or coexists (e.g. action reaction plays, then the star thank-you resumes for its remaining TTL). Design the shape yourself — feature()/activeFeature() are the seams.
- Memory weave: idle schedules occasionally open with a bubble drawn from ledger.recent and totals — "still thinking about @X's star ★", "ate 3 meals today". Data is already in the ledger; keep sanitization (hooks.js sanitizeLogin/sanitizeText patterns).
- Milestones: star-count thresholds permanently unlock spawn=rare/uncommon clips into the idle pool and an occasional milestone bubble ("Momó has 25 stars ★"). Persist unlocks in the ledger. Measure against the high-water mark of `payload.repository.stargazers_count` from the webhook, not the metab.stars event counter — the README literally instructs testers to unstar/re-star, so event counts inflate.
- Reactions land in /stage.svg: whatever Step 2.1 decided, by the end of this step the SVG stage is the delivery path for reactions too — a reaction schedule is wake + reaction (with bubble) + idles.
- Night mode: UTC 22–06 schedules draw from the sleep pool (state_hint sleep — currently loaded but never used). Inject the clock for testability.
- Rare episodes: ~1-in-40 schedules feature a spawn=rare clip prominently.
- Mood integrity: delete the /px/boop.gif feature() clobber (any old cached README copy currently erases celebrations); narrow the workflow_run→rain mapping in hooks.js and the CI poller to the `ci` workflow by name so heartbeat/diary runs can't sadden the pet.

REQUIRED READING:
1. server/index.js — feature/activeFeature/TTL block and the routes.
2. server/pet.js — pools, episodeScenes, moodBubble.
3. server/hooks.js — handleEvent (the priority + workflow-name changes land here too).

OUTPUT: updated server code + node --test coverage for each behavior; deployed to the VPS (rsync + systemctl restart streamlings — see docs/DEPLOY.md).

ACCEPTANCE:
- Test: a star thank-you survives a subsequent feed and is visible again within its 30-minute TTL.
- End-to-end receipt: a real star webhook (or an HMAC-signed replay against the deployed app) makes /stage.svg serve an episode containing the named thank-you bubble, and it still does after a feed action — this is the campaign's headline promise, prove it on the deployed origin.
- Test: /px/boop.gif no longer mutates reaction state; a workflow_run completion from a workflow named momo-heartbeat cannot set rain mood.
- Test: with an injected 23:00 UTC clock, schedules draw from the sleep pool; with the stargazers high-water mark crossing a threshold, the unlocked clip appears in the idle pool and persists across a restart.

FORWARD SWEEP: before checking this step off, do a quick pass over the campaign's remaining step prompts. If your work moved a path, changed a contract or shape, or invalidated an assumption a later step leans on, make a surgical edit there. A quick sweep, not a rewrite — skip it if nothing downstream changed.
```

## Step 2.3 — The Aquarium: Momó live, first-party

Model: Opus 4.8 · Extra High / GPT-5.6-Sol · Extra High
Parallel: NO

Camo's 4.3-second rule only exists inside GitHub. The bounce pages are first-party — cookies, streams, and JavaScript are all legal there. This step turns "Momó's house" from a 1.6-second redirect into the destination where the original live-pet dream actually runs: README = postcard, Aquarium = the real tank.

```text
SCOPE: Build the Aquarium at momo.ktzm.dk/ — a live first-party page with a canvas sprite player over the shared strips, SSE-driven instant reactions and presence, on-page feed/pat/play, personal streaks, and a recent-visitors wall.

REFERENCE IMPLEMENTATION — read first, this is the quality bar:
  campaigns/momo-comes-alive.assets/aquarium-player.js — fixed-timestep canvas player (not one-frame-per-rAF; 120Hz screens), clamped delta after tab-hidden, reactions preempting at loop boundaries only, and the SSE contract including the ~25s comment ping that keeps presence connections alive through proxies.
Match its shape, its rigor, and its idioms. The inline annotations call out the decisions that aren't obvious — honor the reasoning, don't just copy the syntax.

WHAT'S YOURS TO DECIDE:
- The page itself: shell, ink-on-paper styling consistent with the pet's art, presence + streak UI, recent-visitors wall from ledger.recent. No frameworks needed — one HTML page, one module.
- The /events payload shape and how /act/* serves double duty: README links keep the existing bounce-back behavior (back param), on-page buttons get an instant JSON/SSE response instead.
- Strip serving: expose the Step 2.1 cache as /strips/<key>.png plus a small atlas JSON (key → frames/fps/idle) — only for clips the page needs.

REQUIRED READING:
1. server/index.js — the /act routes and cookie ledger (the old housePage interstitial was deleted 2026-07-16; /act now 302s straight back to GitHub, and that must keep working for README links).
2. campaigns/momo-comes-alive.assets/svg-stage.js — only the stripDataURI stub contract, so the two consumers share one cache.

OUTPUT: the Aquarium page served at /, /events SSE endpoint, /strips/* + atlas routes, updated /act behavior; deployed to the VPS (rsync + systemctl restart streamlings — see docs/DEPLOY.md).

ACCEPTANCE:
- Two concurrent `curl -N` connections to /events each receive a presence event with count 2 within a few seconds.
- Triggering /act/feed while a client is connected delivers a reaction event to that client in under 1 second (scripted receipt).
- Streaks and the visitors wall actually ship: a test (injected clock) covers streak persistence across a restart, and the page renders ledger.recent entries through the same sanitization discipline as hooks.js (assert a hostile login renders inert).
- The page loads with zero external-origin resources (all same-origin: page, module, strips, events).
- The README bounce flow still works: /act/feed?back=… keeps 302ing to the GitHub #readme anchor with the cookie set; on-page buttons take the instant path instead.

FORWARD SWEEP: before checking this step off, do a quick pass over the campaign's remaining step prompts. If your work moved a path, changed a contract or shape, or invalidated an assumption a later step leans on, make a surgical edit there. A quick sweep, not a rewrite — skip it if nothing downstream changed.
```

## Step 3.1 — README and docs truth pass

Model: Opus 4.8 · Extra High / GPT-5.6-Sol · Extra High
Parallel: NO

The shop window. Swap the stage to SVG, lead with the pet instead of the plumbing, link the Aquarium, and make every claim in the README true.

```text
SCOPE: Rewrite the README around the new reality (SVG stage, Aquarium, honest boop), refresh the status lines in docs, and prove the final delivery path.

ALREADY LANDED (2026-07-16, don't regress): the action row (feed/pat/play/whisper) sits directly under the stage; /act/* 302s straight back to the #readme anchor (no interstitial — housePage was deleted); actor reactions play reaction-first. Build on this, don't reintroduce a detour page or move the buttons away from the stage.

WORK:
- Stage image → https://momo.ktzm.dk/stage.svg. Banners/boop stay GIF.
- Copy leads with Momó: what a visitor sees and can do, in the pet's warm voice. "How it works," Camo physics, and any testing rituals ("unstar first…") move below the fold or into docs. Add a prominent "visit Momó live" link to the Aquarium — the README is the postcard, the Aquarium is the tank.
- Boop honesty: browsers preload images inside closed <details>, so frame it as a hidden bonus reveal, and stop counting it as an interaction anywhere copy implies otherwise.
- Consider a small "mailbox" touch if cheap (recent whispers via the glyph renderer) — optional, skip if it bloats scope.
- Update docs/POSTMORTEM.md and docs/HANDOFF.md status lines to reflect v4 (SVG stage, deploy-proof VPS ingress, heartbeat); do not rewrite their history.
- Verify: after the README lands, dispatch momo-heartbeat and confirm it validates the NEW Camo URL set including stage.svg. Fetch the stage.svg Camo URL directly — 200, image/svg+xml, ends in </svg>.

REQUIRED READING:
1. README.md — the current copy being rewritten.
2. docs/POSTMORTEM.md — the honesty bar the new copy must clear (its "What survived" framing).

OUTPUT: rewritten README.md; touched-up docs; a green heartbeat run against the new README.

ACCEPTANCE (keep criteria literal — acceptance-miss is the most-cited past review tag, 8×):
- The rendered README's Camo URL for stage.svg returns 200 image/svg+xml with a complete body.
- A dispatched momo-heartbeat run passes against the new README.
- The README makes no claim the system doesn't deliver: no live-presence-in-README claims, boop described as a hidden bonus, star flow described as it actually behaves (webhook + next load / wake link).

FORWARD SWEEP: before checking this step off, do a quick pass over the campaign's remaining step prompts. If your work moved a path, changed a contract or shape, or invalidated an assumption a later step leans on, make a surgical edit there. A quick sweep, not a rewrite — skip it if nothing downstream changed.
```

## Final review

Model: GPT-5.6-Sol · Extra High

A campaign-level final review catches **cross-phase shortcuts** — a primitive set up in one phase silently bypassed by another, intent claimed in one step but not delivered when read across the whole campaign. Run it once every phase is complete. The user copies the prompt below, opens a fresh Codex or Claude Code session in the repo, and pastes:

```text
Run a final review on the Momó Comes Alive campaign.

Plan: /Users/christiankatzmann/Dev/Projects/streamlings/campaigns/momo-comes-alive.md
Campaign: campaigns/momo-comes-alive.md

Read every `## Step N.M — name` heading in the campaign markdown. For each, locate the acceptance criteria in its prompt body, and verify against the cumulative git diff that the criteria actually landed. Don't trust step receipts — read the diff. The reference implementations under campaigns/momo-comes-alive.assets/ are the quality bar the steps claimed to match — check that the shipped code honors their annotated invariants (loop-period alignment, opacity-only visibility, fixed-timestep, sticky-issue logic), not just their surface shape.

Catch cross-step shortcuts: a primitive set up in one step silently bypassed by another, intent claimed in early steps but undermined by later ones, dead code left behind, regressions in unrelated areas.

Be honest. Lean. APPROVED if every step's acceptance criteria landed and there are no cross-step regressions. NEEDS WORK if any step cut corners or a primitive was bypassed.

Don't pad with future improvements. Just verdict the work.

Start the response exactly with:
Verdict: APPROVED
Reasons:

or:
Verdict: NEEDS WORK
Reasons: <comma-separated tags>

Use only these reason tags when NEEDS WORK: `verification-gap`, `scope-drift`, `acceptance-miss`, `cross-step-contract`, `visual-regression`, `tooling-failure`, `scheduler-failure`, `branch-prep-failure`, `data-quality-gap`, `documentation-gap`. APPROVED may leave `Reasons:` empty. After the two-line header, add one blank line and the lean human-readable review.

Run with either:
- Codex: GPT-5.6-Sol with Extra High reasoning effort
- Claude Code: Opus 4.8 with Extra High thinking
(Your call — both are acceptable for this kind of cross-file review.)
```

**Verdict-to-action mapping:**

- **APPROVED** → tick the `Final review` checkbox at the end of the progress checklist (or click "Close campaign"). Campaign is done.
- **NEEDS WORK** → reopen the named steps, close the gaps, re-run the final review. Don't tick the checkbox until APPROVED.

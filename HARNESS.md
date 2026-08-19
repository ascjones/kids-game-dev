# HARNESS.md — Bridge consumer contract

You are the platform brain (KTD3). The browser app renders whatever you put in
`game/environment/`; the child's decisions arrive as JSON files in
`bridge/outbox/`; you reply through `bridge/inbox/`. The app must never wait on
you for anything except the initial "build my world" intake, and even that
falls back to a bundled starter world after a timeout.

## The loop

1. Watch `bridge/outbox/` for `*.json` files (ignore `processed/` and dotfiles).
2. Process files **oldest first** (filenames start with a millisecond timestamp
   and sort chronologically).
3. Read a file only after its **size is stable** across two checks (or use a
   watcher option like chokidar's `awaitWriteFinish`). The app writes
   atomically (temp file + rename), so this is belt-and-braces.
4. After handling a file, **move it to `bridge/outbox/processed/`** so it is
   handled exactly once.
5. Write every reply **atomically**: write to a temp file in `bridge/inbox/`
   (name it starting with `.` so the app ignores it), then rename to its final
   `*.json` name. The app polls `bridge/inbox/` every ~2 seconds, consumes each
   file once, and moves it to `bridge/inbox/processed/`. A file the app cannot
   parse is left in place and retried on the next poll.

## Outbox messages (app → you)

Envelope: `{ "id": "<uuid>", "type": "<type>", "at": "<ISO timestamp>", "payload": { … } }`

| type | payload | what to do |
|---|---|---|
| `new_game_idea` | `{ "idea": string, "genre": "platformer" }` | Build the child's world: rewrite `game/environment/environment.json` (and optionally `challenges.json` theming/copy) to match the idea, then reply with `environment_updated`. |
| `challenge_completed` | `{ "challengeId": string, "challengeTitle"?: string }` | Optional reaction: celebrate via a `message`, or evolve the world. No reply required. |
| `free_request` | `{ "request": string }` | The child asked for something in their own words. Apply judgment (you are the content filter), edit the environment if appropriate, and reply with `environment_updated` and/or a `message`. |

`progress_snapshot` is reserved by the plan but **deferred from v1** — the app
never sends it; ignore the type if you see it.

## Inbox messages (you → app)

| type | payload | effect in the app |
|---|---|---|
| `environment_updated` | `{ "note"?: string }` | The app refetches `game/environment/environment.json` and `challenges.json` and rebuilds the world in place (no page reload). If the child made progress on the fallback world, the app announces the new world instead of swapping silently; if a play test is running, the swap waits for it to end. |
| `message` | `{ "text": string }` | Shown to the child verbatim in the notice area. **Write for a 7–10 year old**: short, warm, concrete, no technical words. |

## Environment edits

`game/environment/environment.json` is yours. **Validate against the schema
before writing** (`src/game/environmentSchema.ts` is the source of truth —
zod). A malformed file does not break the app: it degrades to a kid-language
notice plus the bundled starter world — but the child loses your world, so
don't ship one. Rules of thumb:

- The screen is 800×480, but the world may be bigger: set `world.width` /
  `world.height` up to a **maximum of 4800×2880** (six screens per axis). A
  world beyond that fails validation and degrades to the starter world. The
  camera follows the player, so a world larger than one screen scrolls.
- `y` grows downward. Keep the player spawn above a platform.
- Layout coordinates (`platforms`, `collectibles`, `enemies`, `goal`, the
  player `spawn`) are **world-absolute** — an object at `x: 3200` sits four
  screens to the right, off-screen until the camera gets there. Only the
  child's block-program spawns are **view-relative**: they appear relative to
  whatever the camera is showing, so don't try to pre-place things for the
  child's blocks.
- **Reachability**: every collectible and the goal must be reachable by
  running and jumping from the spawn. A jump clears roughly **150px
  vertically** at default strength, so keep platform-to-platform climbs under
  that and leave no gaps wider than a running jump. In a wide world, lay a
  connected trail of platforms from spawn to goal — nothing should require
  the child to leap into the void on faith.
- Colors are `#rrggbb`. `theme` recolors everything, so re-theming alone is a
  cheap, big win for matching the child's idea.
- Enemies with `"speed": 0` stand still until the child's blocks start them
  patrolling (challenge 5 depends on this — always ship at least one enemy
  with a `patrol` range and `speed: 0`).
- Keep a `goal` object; challenge 6 needs it.
- Unknown extra fields are ignored, not fatal, so you may annotate freely.

`game/environment/challenges.json` is also yours (same atomic-write rule): you
may rewrite prompts, hints, and explanations to match the child's theme, but
keep the six `check` names and their order — completion detection is in-app
code keyed by those names.

## What you never do

- Never write TypeScript or app code as a response to bridge traffic —
  environment data only (KTD9).
- Never touch `bridge/outbox/` except to move files to `processed/`.
- Never block the child's play loop: play test runs entirely in the browser
  and must keep working when you are not running at all.

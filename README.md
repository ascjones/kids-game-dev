# Kid-Led Game Builder — Platformer v1

A local browser app where a child builds their own platformer by completing six
coding challenges with Scratch-style blocks (Blockly) driving a Phaser 4 game.
An agent harness running in this repo acts as the platform brain: it generates
and updates the game world through a file bridge.

Product intent: `FABLE_BUILD_PLAN.md`. Implementation plan:
`docs/plans/2026-08-12-001-feat-kid-game-builder-platformer-plan.md`.
Harness contract: `HARNESS.md`.

## Run it

```bash
npm install
npm run dev        # v1 runs under the Vite dev server only (the bridge needs it)
```

Open http://localhost:5173. First run shows the intake screen: the child types
a game idea, and if a harness session is consuming `bridge/outbox/` it builds
their world; otherwise a bundled starter world loads after a timeout.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Dev server with the bridge middleware |
| `npm test` | Vitest unit + integration tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Build sanity (the bridge is dev-only by design) |

## Layout

- `src/game/` — Phaser 4 scene; zod environment schema + loader
- `src/blocks/` — Blockly block definitions, generators, toolbox, editor setup
- `src/runtime/` — constrained game API, sandbox, kid-language error mapping
- `src/challenges/` — challenge engine and deterministic completion checks
- `src/bridge/` — browser client + Vite middleware for the file bridge
- `src/storage/` — IndexedDB autosave, export/import
- `src/ui/` — challenge panel, play-test controls, intake, JS view, notices
- `game/environment/` — **harness-owned** world + challenge content (JSON)
- `bridge/outbox/`, `bridge/inbox/` — app ↔ harness file exchange

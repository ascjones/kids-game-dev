# Plan: Reusable Kid-Led Game Builder

## Product goal

Create a reusable browser-based platform where children make their own playable games. The platform handles setup and repetitive technical work, while children create the levels, rules, behaviors, and gameplay.

Every project ends with a saved, playable game the child can reopen, improve, and share with appropriate parent or teacher controls.

## Creation flow

1. The child describes a game idea and selects a genre.
2. The platform creates a basic playable starter game.
3. It asks one simple question about what to create next.
4. The game opens an in-game challenge panel.
5. The child builds the requested behavior using visual logic blocks.
6. They press **Play test** and immediately see the effect in the game.
7. The platform explains the result, offers a hint if needed, and suggests the next challenge.
8. Repeating this loop gradually produces a complete game.

## Child-facing editor

Use a Scratch-style block editor first.

- Children drag together colorful logic blocks.
- Blocks cover events, movement, collisions, variables, scoring, timers, conditions, sounds, and simple physics.
- The editor has syntax-like visual highlighting, clear categories, undo, reset, and save.
- The main action is **Play test**, not “Compile.”
- When code fails or a rule is incomplete, explain the issue in simple language.
- Show an optional JavaScript view beside the blocks.
- Let more advanced children edit JavaScript directly when ready.

## Platform responsibilities

- Generate the project, world, basic controls, and starter assets.
- Provide reusable genre templates.
- Give small, meaningful coding challenges.
- Run and validate each change safely.
- Give staged hints without replacing the child’s solution.
- Save progress, completed challenges, and the playable game artifact.

## Child responsibilities

- Choose the game’s idea, setting, characters, and rules.
- Build levels and place objects.
- Create gameplay logic using blocks.
- Test, observe, adjust, and debug.
- Decide when the game is finished.

## Reusable genre templates

- Platformer: jump, platforms, collectibles, enemies, win condition.
- Top-down adventure: maps, interactions, quests, inventory.
- Racing: steering, laps, checkpoints, boosts.
- Sports: player control, ball behavior, scoring.
- Puzzle: matching, rules, timers, success conditions.
- Shooter: aiming, projectiles, enemy movement, health.

## First version

Start with a platformer.

The platform creates a character, a basic level, and movement. The child then completes challenges such as:

1. Add a new platform.
2. Make the character jump.
3. Add a collectible.
4. Increase the score when it is collected.
5. Make an enemy patrol.
6. Set a win condition.

## Success criteria

A child can go from a game idea to a complete, playable game; understand that their own logic caused visible changes; and start a completely different game using the same platform.

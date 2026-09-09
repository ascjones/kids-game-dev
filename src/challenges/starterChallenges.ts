import type { ChallengeDef } from './types';

// Bundled copy of the six origin challenges (R15). game/environment/challenges.json
// is the harness-editable version; this is the fallback when that file is
// missing or broken, mirroring the environment fallback (R2).
export const starterChallenges: ChallengeDef[] = [
  {
    id: 'add-platform',
    title: 'Build a new platform!',
    prompt:
      'Your player needs somewhere new to stand. Use blocks to add a brand new platform to your world when the game starts.',
    hints: [
      'Look in the World group for a green "add a platform" block.',
      'Platforms only appear when your blocks run. Snap the platform block inside a yellow "when the game starts" block.',
      'Try: when the game starts → add a platform at x 400, y 300. Then press Play test!',
    ],
    check: 'platform_added',
    params: {},
    explanation:
      'You did it! Your blocks told the game to build a platform, and the game listened. That platform is YOURS — you made it with code!',
    toolbox: ['events', 'world'],
  },
  {
    id: 'make-jump',
    title: 'Teach your player to jump!',
    prompt:
      'Right now your player is stuck on the ground. Make them jump when you press the up arrow key!',
    hints: [
      'You just unlocked the Moving group — look for the "jump" block.',
      'A jump needs a key! Put the jump block inside a "when the up arrow key is pressed" block.',
      'Try: when the up arrow key is pressed → jump normally. Press Play test, then press the up arrow!',
    ],
    check: 'jumped',
    params: {},
    explanation:
      'Boing! You connected a key to an action: press up, and your code makes the player jump. That is exactly how real games work!',
    toolbox: ['events', 'world', 'motion'],
  },
  {
    id: 'learn-to-run',
    title: 'Make your player run!',
    prompt:
      'Your player wants to explore! Make them run to the right and to the left when you press the arrow keys.',
    hints: [
      'The Moving group has "move right" and "move left" blocks.',
      'Running needs keys! Put "move right" inside a "when the right arrow key is pressed" block.',
      'Make another one for left. Then press Play test and zoom around with the arrow keys!',
    ],
    check: 'moved',
    params: {},
    explanation:
      'Zoom! Now YOU steer the player: your code listens to the arrow keys and moves them. Running plus jumping means you can reach anything!',
    toolbox: ['events', 'world', 'motion'],
  },
  {
    id: 'add-star',
    title: 'Add a shiny star!',
    prompt: 'Every adventure needs treasure. Add a new star to your world for the player to grab.',
    hints: [
      'The World group has an "add a star" block.',
      'Stars appear where you tell them: pick an x and y near a platform so you can reach it.',
      'Try: when the game starts → add a star at x 250, y 300. Then jump up and grab it!',
    ],
    check: 'collectible_added',
    params: {},
    explanation:
      'Sparkly! You put a new star into the world with code. Everything in your game can come from your blocks — you are the game maker now.',
    toolbox: ['events', 'world', 'motion', 'sound'],
  },
  {
    id: 'score-points',
    title: 'Score points for stars!',
    prompt:
      'Grabbing stars should count for something! Make the score go up every time you collect one.',
    hints: [
      'You just unlocked the Score group — find "add 1 to the score".',
      'You need the yellow "when you collect a star" block from Events.',
      'Can your player run yet? Add: when the right arrow key is pressed → move right. Make one for left too!',
      'Try: when you collect a star → add 1 to the score. Play test, run into a star, and watch the score jump!',
    ],
    check: 'score_on_collect',
    params: {},
    explanation:
      'Cha-ching! Your code now reacts to something happening in the game: collect a star, score goes up. You made a rule, and the game follows it!',
    toolbox: ['events', 'world', 'motion', 'sound', 'scoring'],
  },
  {
    id: 'enemy-patrol',
    title: 'Wake up the enemy!',
    prompt:
      'That enemy is just standing there. Make it patrol back and forth so your game has some danger!',
    hints: [
      'You just unlocked the Enemies group — look for "make enemies patrol".',
      'Enemies wake up when your blocks run: put the patrol block inside "when the game starts".',
      'Try: when the game starts → make enemies patrol at speed 80. Watch it march back and forth!',
    ],
    check: 'enemy_patrolled',
    params: {},
    explanation:
      'Look at it go! Your code gave the enemy a brain: walk to one end, turn around, walk back. Now your game has a real challenge in it.',
    toolbox: ['events', 'world', 'motion', 'sound', 'scoring', 'enemies'],
  },
  {
    id: 'win-condition',
    title: 'Make a way to WIN!',
    prompt:
      'Every game needs a way to win. Make touching the goal flag win the game!',
    hints: [
      'You just unlocked the Winning group — find the golden "you win the game!" block.',
      'Use the "when you touch the goal flag" block from Events.',
      'Try: when you touch the goal flag → you win the game! Then run to the flag in Play test.',
    ],
    check: 'win_triggered',
    params: {},
    explanation:
      'YOU WIN! And not just this game — you built a complete game: a world, a jump, treasure, points, danger, and a way to win. All with your own code!',
    toolbox: ['events', 'world', 'motion', 'sound', 'scoring', 'enemies', 'winning', 'logic'],
  },
  {
    id: 'great-journey',
    title: 'Go on a great journey!',
    prompt:
      'Your world just grew — it is three whole screens wide! Run right, past the edge of the screen, all the way to the goal flag at the far end.',
    hints: [
      'Your world is bigger than the screen now. Hold the right arrow key and watch the world travel with you!',
      'Follow the stars. They make a trail that leads all the way to the goal flag at the far end.',
      'Try: when the right arrow key is pressed → move right. Keep "when you touch the goal flag → you win the game!" in your blocks, then run right until you find the flag!',
    ],
    check: 'win_triggered',
    params: {},
    explanation:
      'What a journey! You ran across a world three screens wide and won at the very end. Your game does not stop at the edge of the screen any more — the camera follows you wherever you go.',
    toolbox: ['events', 'world', 'motion', 'sound', 'scoring', 'enemies', 'winning', 'logic'],
    // The world this challenge brings with it (KTD4): 2400x480, three screens
    // wide. The three ground slabs abut with no gaps, so the whole journey is
    // walkable and a missed jump never strands the child. Every ledge hangs
    // clear of a running player's head (body top y 396 on the ground) so
    // holding right never snags, and sits within one jump (150px) of the
    // surface below it, so every star is a hop away.
    environment: {
      version: 1,
      title: 'The Great Journey',
      genre: 'platformer',
      theme: {
        name: 'Sunny Meadow',
        sky: '#87ceeb',
        platform: '#5cae4a',
        player: '#7c5cff',
        collectible: '#ffd23f',
        enemy: '#e0455a',
        goal: '#3fa9f5',
      },
      world: { width: 2400, height: 480 },
      player: { spawn: { x: 100, y: 360 } },
      platforms: [
        // Ground: three slabs, edge to edge, covering 0-2400. Top at y 440.
        { x: 400, y: 460, width: 800, height: 40 },
        { x: 1200, y: 460, width: 800, height: 40 },
        { x: 2000, y: 460, width: 800, height: 40 },
        // Screen one: a hop up from the ground, then a step higher.
        { x: 300, y: 360, width: 140, height: 24 },
        { x: 560, y: 290, width: 140, height: 24 },
        // Screen two: another pair, then a lone ledge on the way out.
        { x: 980, y: 350, width: 160, height: 24 },
        { x: 1240, y: 280, width: 140, height: 24 },
        { x: 1520, y: 355, width: 120, height: 24 },
        // Screen three: a climb, then a lookout beside the flag.
        { x: 1720, y: 345, width: 160, height: 24 },
        { x: 1980, y: 275, width: 140, height: 24 },
        { x: 2160, y: 355, width: 140, height: 24 },
      ],
      collectibles: [
        // A breadcrumb trail: ground stars pull the child rightwards, ledge
        // stars reward the hops. Every one is grabbed just by standing there.
        { x: 200, y: 412, kind: 'star' },
        { x: 300, y: 314, kind: 'star' },
        { x: 560, y: 244, kind: 'star' },
        { x: 700, y: 412, kind: 'star' },
        { x: 980, y: 304, kind: 'star' },
        { x: 1100, y: 412, kind: 'star' },
        { x: 1240, y: 234, kind: 'star' },
        { x: 1400, y: 412, kind: 'star' },
        { x: 1520, y: 309, kind: 'star' },
        { x: 1720, y: 299, kind: 'star' },
        { x: 1980, y: 229, kind: 'star' },
        { x: 2160, y: 309, kind: 'star' },
        { x: 2280, y: 412, kind: 'star' },
      ],
      enemies: [
        // Both asleep (speed 0) until the child's patrol block wakes them.
        { x: 1150, y: 420, patrol: { minX: 1020, maxX: 1320 }, speed: 0 },
        { x: 1850, y: 420, patrol: { minX: 1700, maxX: 2000 }, speed: 0 },
      ],
      goal: { x: 2300, y: 400, kind: 'flag' },
      weather: 'clear',
      sounds: { jump: 'boing', collect: 'ding', win: 'tada' },
    },
  },
];

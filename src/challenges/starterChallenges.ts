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
];

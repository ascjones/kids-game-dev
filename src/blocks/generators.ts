import type * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';

// Every custom block compiles to a call on the constrained game api (R13).
// KTD6: the loop trap makes Blockly insert a tick call in every generated
// loop, so a runaway loop throws inside the sandbox instead of hanging the tab.

let registered = false;

export function registerGenerators(): void {
  if (registered) return;
  registered = true;

  javascriptGenerator.INFINITE_LOOP_TRAP = 'api.__loopTick();\n';

  const statements = (block: Blockly.Block) =>
    javascriptGenerator.statementToCode(block, 'DO');

  const wrapHandler = (call: string, block: Blockly.Block) =>
    `api.${call}(function () {\n${statements(block)}});\n`;

  javascriptGenerator.forBlock['event_start'] = (block) => wrapHandler('onStart', block);
  javascriptGenerator.forBlock['event_collect'] = (block) => wrapHandler('onCollect', block);
  javascriptGenerator.forBlock['event_key'] = (block) => {
    const key = block.getFieldValue('KEY');
    return `api.onKey('${key}', function () {\n${statements(block)}});\n`;
  };
  javascriptGenerator.forBlock['event_touch'] = (block) => {
    const kind = block.getFieldValue('KIND');
    return `api.onTouch('${kind}', function () {\n${statements(block)}});\n`;
  };

  javascriptGenerator.forBlock['move_left'] = (block) =>
    `api.moveLeft(${block.getFieldValue('SPEED')});\n`;
  javascriptGenerator.forBlock['move_right'] = (block) =>
    `api.moveRight(${block.getFieldValue('SPEED')});\n`;
  javascriptGenerator.forBlock['move_stop'] = () => 'api.stop();\n';
  javascriptGenerator.forBlock['jump'] = (block) =>
    `api.jump(${block.getFieldValue('STRENGTH')});\n`;

  javascriptGenerator.forBlock['spawn_platform'] = (block) =>
    `api.spawnPlatform(${block.getFieldValue('X')}, ${block.getFieldValue('Y')}, ${block.getFieldValue('WIDTH')});\n`;
  javascriptGenerator.forBlock['spawn_collectible'] = (block) =>
    `api.spawnCollectible(${block.getFieldValue('X')}, ${block.getFieldValue('Y')});\n`;

  javascriptGenerator.forBlock['enemy_patrol'] = (block) =>
    `api.patrolEnemies(${block.getFieldValue('SPEED')});\n`;

  javascriptGenerator.forBlock['score_add'] = (block) =>
    `api.addScore(${block.getFieldValue('AMOUNT')});\n`;
  javascriptGenerator.forBlock['score_get'] = () => ['api.getScore()', Order.FUNCTION_CALL];

  javascriptGenerator.forBlock['timer_every'] = (block) =>
    `api.every(${block.getFieldValue('SECONDS')}, function () {\n${statements(block)}});\n`;
  javascriptGenerator.forBlock['timer_after'] = (block) =>
    `api.after(${block.getFieldValue('SECONDS')}, function () {\n${statements(block)}});\n`;

  javascriptGenerator.forBlock['sound_play'] = (block) =>
    `api.playSound('${block.getFieldValue('NAME')}');\n`;

  javascriptGenerator.forBlock['game_win'] = () => 'api.win();\n';
}

/** Generate the full program for a workspace, with blocks and generators registered. */
export function workspaceToProgram(workspace: Blockly.Workspace): string {
  registerGenerators();
  return javascriptGenerator.workspaceToCode(workspace);
}

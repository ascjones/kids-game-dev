import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleBridgeRequest, readInbox, writeDecision, type BridgeDirs } from './middleware';

let root: string;
let dirs: BridgeDirs;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
  dirs = {
    outbox: path.join(root, 'outbox'),
    inbox: path.join(root, 'inbox'),
    saves: path.join(root, 'saves'),
  };
  fs.mkdirSync(dirs.outbox, { recursive: true });
  fs.mkdirSync(dirs.inbox, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const outboxFiles = () => fs.readdirSync(dirs.outbox).filter((f) => !f.startsWith('.'));

describe('writeDecision', () => {
  it('writes a valid decision as exactly one well-formed file with a server name', () => {
    const result = writeDecision(dirs, {
      type: 'new_game_idea',
      payload: { idea: 'a cat that collects fish', genre: 'platformer' },
    });
    expect(result.ok).toBe(true);
    const files = outboxFiles();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d+-\d{4}-new_game_idea\.json$/);
    const envelope = JSON.parse(fs.readFileSync(path.join(dirs.outbox, files[0]), 'utf8'));
    expect(envelope.type).toBe('new_game_idea');
    expect(envelope.payload.idea).toBe('a cat that collects fish');
    expect(envelope.id).toBeTruthy();
    expect(envelope.at).toBeTruthy();
  });

  it('rejects a malformed body and writes nothing', () => {
    const result = writeDecision(dirs, { type: 'launch_missiles', payload: {} });
    expect(result.ok).toBe(false);
    expect(outboxFiles()).toHaveLength(0);
  });

  it('ignores client-supplied path names so ../ never escapes the outbox', () => {
    const before = fs.readdirSync(root);
    const result = writeDecision(dirs, {
      type: 'free_request',
      payload: { request: 'make it rain' },
      filename: '../../evil.json',
      path: '../escape',
    });
    expect(result.ok).toBe(true);
    expect(outboxFiles()).toHaveLength(1);
    expect(fs.readdirSync(root)).toEqual([...before].sort());
    expect(fs.existsSync(path.join(root, 'evil.json'))).toBe(false);
  });
});

describe('readInbox', () => {
  const drop = (name: string, content: string) =>
    fs.writeFileSync(path.join(dirs.inbox, name), content);

  it('returns pending messages once, oldest first, moving them to processed', () => {
    drop('2-message.json', JSON.stringify({ type: 'message', payload: { text: 'hi again' } }));
    drop('1-message.json', JSON.stringify({ type: 'message', payload: { text: 'hi' } }));
    const first = readInbox(dirs);
    expect(first.map((m) => (m.type === 'message' ? m.payload.text : ''))).toEqual([
      'hi',
      'hi again',
    ]);
    expect(readInbox(dirs)).toEqual([]);
    expect(fs.readdirSync(path.join(dirs.inbox, 'processed'))).toHaveLength(2);
  });

  it('skips an unparseable file without error and returns it once it parses', () => {
    drop('1-broken.json', '{ "type": "message", "payload": { "text": "hal');
    expect(readInbox(dirs)).toEqual([]);
    expect(fs.existsSync(path.join(dirs.inbox, '1-broken.json'))).toBe(true);

    drop('1-broken.json', JSON.stringify({ type: 'message', payload: { text: 'half done' } }));
    const messages = readInbox(dirs);
    expect(messages).toHaveLength(1);
  });

  it('moves a parseable but invalid-shape file aside without returning it', () => {
    drop('1-weird.json', JSON.stringify({ type: 'reboot_everything' }));
    expect(readInbox(dirs)).toEqual([]);
    expect(fs.existsSync(path.join(dirs.inbox, '1-weird.json'))).toBe(false);
  });
});

describe('handleBridgeRequest', () => {
  it('routes a POST to the outbox and returns the written filename', () => {
    const response = handleBridgeRequest(
      dirs,
      'POST',
      '/outbox',
      JSON.stringify({ type: 'challenge_completed', payload: { challengeId: 'add-platform' } }),
    );
    expect(response.status).toBe(200);
    expect(outboxFiles()).toHaveLength(1);
  });

  it('rejects a non-JSON body with a 400 and writes nothing', () => {
    const response = handleBridgeRequest(dirs, 'POST', '/outbox', 'not json at all');
    expect(response.status).toBe(400);
    expect(outboxFiles()).toHaveLength(0);
  });

  it('serves the inbox on GET', () => {
    fs.writeFileSync(
      path.join(dirs.inbox, '1-env.json'),
      JSON.stringify({ type: 'environment_updated' }),
    );
    const response = handleBridgeRequest(dirs, 'GET', '/inbox', '');
    expect(response.status).toBe(200);
    expect((response.body as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it('404s unknown routes', () => {
    expect(handleBridgeRequest(dirs, 'GET', '/other', '').status).toBe(404);
  });
});

describe('server-side game library', () => {
  const record = (id: string, idea: string, completed: string[] = []) =>
    JSON.stringify({
      id,
      idea,
      savedAt: '2026-08-15T10:00:00.000Z',
      environment: { title: `${idea} world` },
      challengeProgress: { completedIds: completed, currentIndex: 0, hintStages: {} },
    });

  it('saves a game, lists it, and loads it back', () => {
    const post = handleBridgeRequest(dirs, 'POST', '/saves', record('game-1', 'space cats', ['a']));
    expect(post.status).toBe(200);
    expect(fs.existsSync(path.join(dirs.saves, 'game-1.json'))).toBe(true);

    const list = handleBridgeRequest(dirs, 'GET', '/saves', '');
    const saves = (list.body as { saves: Array<Record<string, unknown>> }).saves;
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      id: 'game-1',
      idea: 'space cats',
      title: 'space cats world',
      completedChallenges: 1,
    });

    const get = handleBridgeRequest(dirs, 'GET', '/saves/game-1', '');
    expect(get.status).toBe(200);
    expect((get.body as { record: { idea: string } }).record.idea).toBe('space cats');
  });

  it('saving twice with the same id overwrites in place', () => {
    handleBridgeRequest(dirs, 'POST', '/saves', record('game-1', 'first'));
    handleBridgeRequest(dirs, 'POST', '/saves', record('game-1', 'second'));
    const list = handleBridgeRequest(dirs, 'GET', '/saves', '');
    expect((list.body as { saves: unknown[] }).saves).toHaveLength(1);
  });

  it('rejects a save without a usable id and strips traversal from ids', () => {
    const noId = handleBridgeRequest(dirs, 'POST', '/saves', JSON.stringify({ idea: 'x' }));
    expect(noId.status).toBe(400);

    handleBridgeRequest(dirs, 'POST', '/saves', record('../../evil', 'sneaky'));
    expect(fs.existsSync(path.join(root, 'evil.json'))).toBe(false);
    expect(fs.readdirSync(dirs.saves).every((f) => !f.includes('..'))).toBe(true);
  });

  it('404s a missing save id', () => {
    expect(handleBridgeRequest(dirs, 'GET', '/saves/nope', '').status).toBe(404);
  });
});

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'vite';
import { decisionInputSchema, inboxMessageSchema, type InboxMessage } from './messages.ts';

// KTD4: the file bridge lives in the Vite dev server. The browser POSTs
// decisions here; we write them atomically into bridge/outbox/ for the harness
// and hand back anything the harness dropped into bridge/inbox/. The server
// names every file itself — client-supplied names and paths are ignored, which
// is the path-traversal guard.

export interface BridgeDirs {
  outbox: string;
  inbox: string;
}

export type WriteResult = { ok: true; file: string } | { ok: false; error: string };

let sequence = 0;

/** Validate a decision body and write it as one atomic JSON file in the outbox. */
export function writeDecision(dirs: BridgeDirs, body: unknown): WriteResult {
  const parsed = decisionInputSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: 'not a valid bridge decision' };
  }
  const envelope = {
    id: randomUUID(),
    type: parsed.data.type,
    at: new Date().toISOString(),
    payload: parsed.data.payload,
  };
  fs.mkdirSync(dirs.outbox, { recursive: true });
  sequence += 1;
  const filename = `${Date.now()}-${String(sequence).padStart(4, '0')}-${parsed.data.type}.json`;
  const finalPath = path.join(dirs.outbox, filename);
  const tempPath = path.join(dirs.outbox, `.tmp-${filename}`);
  fs.writeFileSync(tempPath, JSON.stringify(envelope, null, 2));
  fs.renameSync(tempPath, finalPath);
  return { ok: true, file: filename };
}

/**
 * Read pending inbox messages oldest-first and move them to processed/.
 * A file with invalid JSON is left in place to retry on the next poll (the
 * harness may still be writing it); a parseable file with the wrong shape is
 * moved aside so it does not clog the inbox.
 */
export function readInbox(dirs: BridgeDirs): InboxMessage[] {
  if (!fs.existsSync(dirs.inbox)) return [];
  const processedDir = path.join(dirs.inbox, 'processed');
  const entries = fs
    .readdirSync(dirs.inbox, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  const messages: InboxMessage[] = [];
  for (const name of entries) {
    const filePath = path.join(dirs.inbox, name);
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    fs.mkdirSync(processedDir, { recursive: true });
    fs.renameSync(filePath, uniquePath(processedDir, name));
    const parsed = inboxMessageSchema.safeParse(data);
    if (parsed.success) {
      messages.push(parsed.data);
    }
  }
  return messages;
}

function uniquePath(dir: string, name: string): string {
  let candidate = path.join(dir, name);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${counter++}-${name}`);
  }
  return candidate;
}

export interface BridgeResponse {
  status: number;
  body: unknown;
}

/** Route one bridge request. Factored out of the connect adapter so tests hit it directly. */
export function handleBridgeRequest(
  dirs: BridgeDirs,
  method: string,
  url: string,
  rawBody: string,
): BridgeResponse {
  if (method === 'POST' && url.startsWith('/outbox')) {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: { ok: false, error: 'body is not JSON' } };
    }
    const result = writeDecision(dirs, body);
    return result.ok ? { status: 200, body: result } : { status: 400, body: result };
  }
  if (method === 'GET' && url.startsWith('/inbox')) {
    return { status: 200, body: { ok: true, messages: readInbox(dirs) } };
  }
  return { status: 404, body: { ok: false, error: 'unknown bridge route' } };
}

export function bridgePlugin(): Plugin {
  return {
    name: 'kid-game-bridge',
    configureServer(server) {
      const root = server.config.root;
      const dirs: BridgeDirs = {
        outbox: path.join(root, 'bridge', 'outbox'),
        inbox: path.join(root, 'bridge', 'inbox'),
      };
      fs.mkdirSync(dirs.outbox, { recursive: true });
      fs.mkdirSync(dirs.inbox, { recursive: true });

      server.middlewares.use('/__bridge', (req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const { status, body } = handleBridgeRequest(
            dirs,
            req.method ?? 'GET',
            req.url ?? '/',
            Buffer.concat(chunks).toString('utf8'),
          );
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        });
      });
    },
  };
}

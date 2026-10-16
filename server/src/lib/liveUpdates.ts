// Live updates over Server-Sent Events: every open browser keeps one stream, and any
// successful change is announced on it straight away, so other screens refresh in well
// under a second. Messages only say *what* changed; each screen refetches through the
// normal endpoints, so every permission check still applies.
import type { RequestHandler, Response } from 'express';

export interface LiveChange {
  /** The area that changed: tasks, projects, comments, users, ... */
  scope: string;
  /** Set when the change belongs to one task. */
  taskId?: string;
  /** Who made it, so their own tab can skip a refetch it doesn't need. */
  actorId?: string;
}

const clients = new Set<Response>();
const HEARTBEAT_MS = 25_000;

/** Opens the stream for a signed-in person. Runs after authenticate. */
export const openLiveStream: RequestHandler = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Proxies must pass each message on at once instead of buffering.
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  // Comments keep idle connections from being closed by proxies.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
};

export function broadcast(change: LiveChange) {
  const line = `data: ${JSON.stringify(change)}\n\n`;
  for (const res of clients) res.write(line);
}

export const liveClientCount = () => clients.size;

/** On shutdown: end every stream (browsers reconnect to the new instance on their own). */
export function closeLiveStreams() {
  for (const res of clients) res.end();
  clients.clear();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Announces every successful change (POST, PUT, PATCH, DELETE) once its response has gone
 * out, by which point the transaction has committed. Coarse on purpose: nothing that
 * changes data can be forgotten.
 */
export const announceChanges: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  // Read the path now: routers rewrite it while handling the request.
  const [scope = '', id] = req.path.split('/').filter(Boolean);
  if (!scope || scope === 'auth' || scope === 'live') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    broadcast({ scope, ...(scope === 'tasks' && id && UUID.test(id) && { taskId: id }), ...(req.user && { actorId: req.user.id }) });
  });
  next();
};

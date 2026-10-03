import { Server } from 'socket.io';
import { Server as HTTPServer } from 'node:http';
import { z } from 'zod';
import { identity, cookieName } from './lib.js';
import { projectAccess } from './access.js';
import { createTask, updateTask, createComment } from './tasks.js';
import { setIO } from './realtime.js';
export function installSockets(server: HTTPServer) {
  const io = new Server(server, {
    cors: {
      origin: (process.env.CLIENT_URL || 'http://localhost:6003').split(','),
      credentials: true,
    },
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      cb(
        null,
        !origin || (process.env.CLIENT_URL || 'http://localhost:6003').split(',').includes(origin),
      );
    },
  });
  setIO(io);
  io.use(async (socket, next) => {
    try {
      const cookies = Object.fromEntries(
        (socket.handshake.headers.cookie || '')
          .split(';')
          .filter(Boolean)
          .map((v) => {
            const [k, ...rest] = v.trim().split('=');
            return [k, decodeURIComponent(rest.join('='))];
          }),
      );
      const raw = cookies[cookieName] || socket.handshake.auth.token;
      const u = await identity(raw);
      socket.data.userId = u.id;
      socket.data.raw = raw;
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  });
  io.on('connection', (socket) => {
    socket.join('user:' + socket.data.userId);
    let windowStart = Date.now(),
      requests = 0;
    const safe = (event: string, fn: (userId: string, data: unknown) => Promise<unknown>) =>
      socket.on(event, async (data, ack) => {
        try {
          if (Date.now() - windowStart > 60000) {
            windowStart = Date.now();
            requests = 0;
          }
          if (++requests > 120) throw new Error('Too many realtime requests');
          const u = await identity(socket.data.raw);
          const result = await fn(u.id, data);
          if (typeof ack === 'function') ack({ ok: true, data: result });
        } catch (e) {
          if (typeof ack === 'function') ack({ ok: false, message: (e as Error).message });
        }
      });
    safe('join_project', async (userId, raw) => {
      const id = z.string().parse(raw);
      await projectAccess(userId, id);
      await socket.join('project:' + id);
      return { projectId: id };
    });
    safe('leave_project', async (_userId, raw) => {
      await socket.leave('project:' + z.string().parse(raw));
      return {};
    });
    safe('task:create', async (userId, raw) => {
      const { projectId, task } = z.object({ projectId: z.string(), task: z.unknown() }).parse(raw);
      return createTask(userId, projectId, task);
    });
    for (const event of ['task:update', 'task:move'])
      safe(event, async (userId, raw) => {
        const { id, changes } = z.object({ id: z.string(), changes: z.unknown() }).parse(raw);
        return updateTask(userId, id, changes);
      });
    safe('comment:create', async (userId, raw) => {
      const { taskId, body } = z.object({ taskId: z.string(), body: z.string() }).parse(raw);
      return createComment(userId, taskId, { body });
    });
  });
  return io;
}

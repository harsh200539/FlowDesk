import { Server } from 'socket.io';
import { identity } from './lib.js';
import { membership, projectAccess } from './access.js';
export let io: Server | undefined;
export function setIO(value: Server) {
  io = value;
}
export async function emitProject(
  projectId: string,
  event: string,
  payload: unknown,
  workspaceId?: string,
) {
  if (!io) return;
  const sockets = await io.in('project:' + projectId).fetchSockets();
  for (const s of sockets) {
    try {
      const u = await identity(s.data.raw);
      if (workspaceId) await membership(u.id, workspaceId);
      else await projectAccess(u.id, projectId);
      s.emit(event, payload);
    } catch {
      s.leave('project:' + projectId);
    }
  }
}
export async function emitUser(userId: string, event: string, payload: unknown) {
  if (!io) return;
  const sockets = await io.in('user:' + userId).fetchSockets();
  for (const s of sockets) {
    try {
      await identity(s.data.raw);
      s.emit(event, payload);
    } catch {
      s.disconnect();
    }
  }
}

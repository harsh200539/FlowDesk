import { db } from './db.js';
import { fail } from './lib.js';
export async function membership(userId: string, workspaceId: string, admin = false) {
  const m = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!m) fail(404, 'Workspace not found');
  if (admin && !['OWNER', 'ADMIN'].includes(m.role)) fail(403, 'Workspace administrator required');
  return m;
}
export async function projectAccess(userId: string, id: string, admin = false) {
  const p = await db.project.findUnique({ where: { id } });
  if (!p) fail(404, 'Project not found');
  await membership(userId, p.workspaceId, admin);
  return p;
}
export async function taskAccess(userId: string, id: string) {
  const t = await db.task.findUnique({
    where: { id },
    include: { project: true, assignee: { select: { id: true, name: true, email: true } } },
  });
  if (!t) fail(404, 'Task not found');
  await membership(userId, t.project.workspaceId);
  return t;
}

import { z } from 'zod';
import { db } from './db.js';
import { fail, transaction } from './lib.js';
import { projectAccess, taskAccess, membership } from './access.js';
import { emitProject, emitUser } from './realtime.js';
export const taskSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().max(10000).default(''),
    status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']).default('TODO'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    assigneeId: z.string().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    position: z.number().int().min(0).default(0),
  })
  .strict();
export const taskUpdate = taskSchema
  .partial()
  .extend({ version: z.number().int().min(0) })
  .strict();
const include = {
  assignee: { select: { id: true, name: true, email: true } },
  _count: { select: { comments: true } },
} as const;
async function notify(
  tx: import('@prisma/client').Prisma.TransactionClient,
  userId: string,
  task: { id: string; title: string; projectId: string },
) {
  return tx.notification.create({
    data: {
      userId,
      type: 'TASK_ASSIGNED',
      data: { taskId: task.id, title: task.title, projectId: task.projectId },
    },
  });
}
export async function createTask(userId: string, projectId: string, raw: unknown) {
  const data = taskSchema.parse(raw);
  const p = await projectAccess(userId, projectId);
  if (data.assigneeId) await membership(data.assigneeId, p.workspaceId);
  const { task, notification } = await transaction(async (tx) => {
    const task = await tx.task.create({ data: { ...data, projectId }, include });
    await tx.activity.create({ data: { userId, taskId: task.id, action: 'TASK_CREATED' } });
    const notification =
      task.assigneeId && task.assigneeId !== userId
        ? await notify(tx, task.assigneeId, task)
        : null;
    return { task, notification };
  });
  await emitProject(projectId, 'task:created', task);
  if (notification) await emitUser(notification.userId, 'notification:new', notification);
  return task;
}
export async function updateTask(userId: string, id: string, raw: unknown) {
  const data = taskUpdate.parse(raw);
  const old = await taskAccess(userId, id);
  if (data.assigneeId) await membership(data.assigneeId, old.project.workspaceId);
  const { version, ...changes } = data;
  const { task, notification } = await transaction(async (tx) => {
    const update = await tx.task.updateMany({
      where: { id, version },
      data: { ...changes, version: { increment: 1 } },
    });
    if (!update.count) fail(409, 'Task changed elsewhere. Refresh and retry.');
    const task = await tx.task.findUniqueOrThrow({ where: { id }, include });
    await tx.activity.create({
      data: {
        userId,
        taskId: id,
        action: changes.status && changes.status !== old.status ? 'TASK_MOVED' : 'TASK_UPDATED',
        metadata: { from: old.status, to: task.status },
      },
    });
    const notification =
      task.assigneeId && task.assigneeId !== old.assigneeId && task.assigneeId !== userId
        ? await notify(tx, task.assigneeId, task)
        : null;
    return { task, notification };
  });
  await emitProject(task.projectId, changes.status ? 'task:moved' : 'task:updated', task);
  if (notification) await emitUser(notification.userId, 'notification:new', notification);
  return task;
}
export async function createComment(userId: string, taskId: string, raw: unknown) {
  const { body } = z
    .object({ body: z.string().trim().min(1).max(5000) })
    .strict()
    .parse(raw);
  const t = await taskAccess(userId, taskId);
  const comment = await transaction(async (tx) => {
    const c = await tx.comment.create({
      data: { taskId, userId, body },
      include: { user: { select: { id: true, name: true } } },
    });
    await tx.activity.create({ data: { userId, taskId, action: 'COMMENT_ADDED' } });
    return c;
  });
  await emitProject(t.projectId, 'comment:created', comment);
  return comment;
}

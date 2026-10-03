import express, { Express } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { authenticate, asyncRoute, fail, param, pagination, transaction } from './lib.js';
import { membership, projectAccess, taskAccess } from './access.js';
import { createTask, updateTask, createComment } from './tasks.js';
import { emitProject, io } from './realtime.js';
const publicUser = { id: true, name: true, email: true } as const;
export function installRoutes(app: Express) {
  const r = express.Router();
  r.use(authenticate);
  r.get(
    '/workspaces',
    asyncRoute(async (_req, res) =>
      res.json(
        await db.workspace.findMany({
          where: { memberships: { some: { userId: res.locals.user.id } } },
          include: {
            _count: { select: { memberships: true, projects: true } },
            memberships: { where: { userId: res.locals.user.id } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ),
    ),
  );
  r.post(
    '/workspaces',
    asyncRoute(async (req, res) => {
      const { name } = z
        .object({ name: z.string().trim().min(2).max(100) })
        .strict()
        .parse(req.body);
      res
        .status(201)
        .json(
          await db.workspace.create({
            data: {
              name,
              ownerId: res.locals.user.id,
              memberships: { create: { userId: res.locals.user.id, role: 'OWNER' } },
            },
          }),
        );
    }),
  );
  r.get(
    '/workspaces/:id',
    asyncRoute(async (req, res) => {
      await membership(res.locals.user.id, param(req));
      res.json(
        await db.workspace.findUnique({
          where: { id: param(req) },
          include: { projects: true, memberships: { include: { user: { select: publicUser } } } },
        }),
      );
    }),
  );
  r.get(
    '/workspaces/:id/members',
    asyncRoute(async (req, res) => {
      await membership(res.locals.user.id, param(req));
      res.json(
        await db.membership.findMany({
          where: { workspaceId: param(req) },
          include: { user: { select: publicUser } },
          take: 100,
        }),
      );
    }),
  );
  r.post(
    '/workspaces/:id/members',
    asyncRoute(async (req, res) => {
      const actor = await membership(res.locals.user.id, param(req), true);
      const { email, role } = z
        .object({
          email: z.string().email().toLowerCase(),
          role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
        })
        .strict()
        .parse(req.body);
      if (role === 'ADMIN' && actor.role !== 'OWNER') fail(403, 'Only owner can appoint admins');
      const u = await db.user.findUnique({ where: { email } });
      if (!u) fail(404, 'This person must register first');
      res
        .status(201)
        .json(
          await db.membership.create({
            data: { workspaceId: param(req), userId: u.id, role },
            include: { user: { select: publicUser } },
          }),
        );
    }),
  );
  r.patch(
    '/workspaces/:id/members/:userId',
    asyncRoute(async (req, res) => {
      const m = await membership(res.locals.user.id, param(req), true);
      if (m.role !== 'OWNER') fail(403, 'Only owner can change roles');
      const target = await membership(String(req.params.userId), param(req));
      if (target.role === 'OWNER') fail(400, 'Owner role cannot be changed');
      const { role } = z
        .object({ role: z.enum(['ADMIN', 'MEMBER']) })
        .strict()
        .parse(req.body);
      res.json(await db.membership.update({ where: { id: target.id }, data: { role } }));
    }),
  );
  r.delete(
    '/workspaces/:id/members/:userId',
    asyncRoute(async (req, res) => {
      const actor = await membership(res.locals.user.id, param(req), true);
      const target = await membership(String(req.params.userId), param(req));
      if (target.role === 'OWNER') fail(400, 'Cannot remove workspace owner');
      if (target.role === 'ADMIN' && actor.role !== 'OWNER')
        fail(403, 'Only owner can remove an admin');
      const workspaceId = param(req);
      await transaction(async (tx) => {
        await tx.task.updateMany({
          where: { assigneeId: target.userId, project: { workspaceId } },
          data: { assigneeId: null, version: { increment: 1 } },
        });
        await tx.membership.delete({ where: { id: target.id } });
      });
      const projects = await db.project.findMany({ where: { workspaceId }, select: { id: true } });
      if (io)
        for (const p of projects) io.in('user:' + target.userId).socketsLeave('project:' + p.id);
      for (const p of projects) await emitProject(p.id, 'members:updated', { workspaceId });
      res.status(204).end();
    }),
  );
  r.get(
    '/projects',
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      if (req.query.workspaceId)
        await membership(res.locals.user.id, String(req.query.workspaceId));
      const where = {
        workspace: { memberships: { some: { userId: res.locals.user.id } } },
        ...(req.query.workspaceId ? { workspaceId: String(req.query.workspaceId) } : {}),
      };
      res.json({
        items: await db.project.findMany({
          where,
          include: { _count: { select: { tasks: true } } },
          take: p.limit,
          skip: p.skip,
          orderBy: { createdAt: 'desc' },
        }),
        total: await db.project.count({ where }),
        ...p,
      });
    }),
  );
  r.post(
    '/projects',
    asyncRoute(async (req, res) => {
      const data = z
        .object({
          workspaceId: z.string(),
          name: z.string().trim().min(2).max(100),
          description: z.string().max(5000).default(''),
        })
        .strict()
        .parse(req.body);
      await membership(res.locals.user.id, data.workspaceId, true);
      res.status(201).json(await db.project.create({ data }));
    }),
  );
  r.get(
    '/projects/:id',
    asyncRoute(async (req, res) => {
      res.json(await projectAccess(res.locals.user.id, param(req)));
    }),
  );
  r.patch(
    '/projects/:id',
    asyncRoute(async (req, res) => {
      await projectAccess(res.locals.user.id, param(req), true);
      const data = z
        .object({
          name: z.string().min(2).max(100).optional(),
          description: z.string().max(5000).optional(),
        })
        .strict()
        .parse(req.body);
      res.json(await db.project.update({ where: { id: param(req) }, data }));
    }),
  );
  r.delete(
    '/projects/:id',
    asyncRoute(async (req, res) => {
      const p = await projectAccess(res.locals.user.id, param(req), true);
      await db.project.delete({ where: { id: param(req) } });
      await emitProject(param(req), 'project:deleted', { id: param(req) }, p.workspaceId);
      res.status(204).end();
    }),
  );
  r.get(
    '/tasks',
    asyncRoute(async (req, res) => {
      const projectId = z.string().parse(req.query.projectId);
      await projectAccess(res.locals.user.id, projectId);
      const p = pagination(req);
      res.json({
        items: await db.task.findMany({
          where: { projectId },
          include: { assignee: { select: publicUser }, _count: { select: { comments: true } } },
          orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
          skip: p.skip,
          take: p.limit,
        }),
        total: await db.task.count({ where: { projectId } }),
        ...p,
      });
    }),
  );
  r.post(
    '/tasks',
    asyncRoute(async (req, res) => {
      const { projectId, ...data } = z
        .object({ projectId: z.string() })
        .passthrough()
        .parse(req.body);
      res.status(201).json(await createTask(res.locals.user.id, projectId, data));
    }),
  );
  r.get(
    '/tasks/:id',
    asyncRoute(async (req, res) => {
      const task = await taskAccess(res.locals.user.id, param(req));
      res.json({
        ...task,
        comments: await db.comment.findMany({
          where: { taskId: task.id },
          include: { user: { select: publicUser } },
          orderBy: { createdAt: 'asc' },
          take: 100,
        }),
        activities: await db.activity.findMany({
          where: { taskId: task.id },
          include: { user: { select: publicUser } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
      });
    }),
  );
  r.patch(
    '/tasks/:id',
    asyncRoute(async (req, res) =>
      res.json(await updateTask(res.locals.user.id, param(req), req.body)),
    ),
  );
  r.delete(
    '/tasks/:id',
    asyncRoute(async (req, res) => {
      const t = await taskAccess(res.locals.user.id, param(req));
      await db.task.delete({ where: { id: t.id } });
      await emitProject(t.projectId, 'task:deleted', { id: t.id });
      res.status(204).end();
    }),
  );
  r.get(
    '/tasks/:id/comments',
    asyncRoute(async (req, res) => {
      await taskAccess(res.locals.user.id, param(req));
      const p = pagination(req);
      res.json({
        items: await db.comment.findMany({
          where: { taskId: param(req) },
          include: { user: { select: publicUser } },
          orderBy: { createdAt: 'asc' },
          skip: p.skip,
          take: p.limit,
        }),
        total: await db.comment.count({ where: { taskId: param(req) } }),
        ...p,
      });
    }),
  );
  r.post(
    '/tasks/:id/comments',
    asyncRoute(async (req, res) =>
      res.status(201).json(await createComment(res.locals.user.id, param(req), req.body)),
    ),
  );
  r.get(
    '/notifications',
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      res.json({
        items: await db.notification.findMany({
          where: { userId: res.locals.user.id },
          orderBy: { createdAt: 'desc' },
          skip: p.skip,
          take: p.limit,
        }),
        total: await db.notification.count({ where: { userId: res.locals.user.id } }),
        ...p,
      });
    }),
  );
  r.patch(
    '/notifications/:id/read',
    asyncRoute(async (req, res) => {
      const n = await db.notification.findFirst({
        where: { id: param(req), userId: res.locals.user.id },
      });
      if (!n) fail(404, 'Notification not found');
      res.json(await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } }));
    }),
  );
  app.use('/api', r);
}

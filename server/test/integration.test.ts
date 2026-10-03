import 'dotenv/config';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createServer } from 'node:http';
import { io as connect, Socket } from 'socket.io-client';
import { app } from '../src/app.js';
import { db } from '../src/db.js';
import { token } from '../src/lib.js';
import { installSockets } from '../src/sockets.js';
const tag = Date.now().toString();
let owner: any,
  member: any,
  outsider: any,
  workspace: any,
  project: any,
  task: any,
  server: ReturnType<typeof createServer>,
  sockets: ReturnType<typeof installSockets>,
  url: string;
const users: string[] = [];
const clients: Socket[] = [];
const as = (u: any) => ({ Authorization: 'Bearer ' + token(u), 'X-App-Request': '1' });
async function socket(u: any) {
  const s = connect(url, {
    auth: { token: token(u) },
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
  });
  return s;
}
const ack = (s: Socket, event: string, data: unknown) =>
  new Promise<any>((resolve) => s.emit(event, data, resolve));
beforeAll(async () => {
  const hash = await bcrypt.hash('test-password-123', 4);
  for (const email of ['owner', 'member', 'outsider']) {
    const u = await db.user.create({
      data: { name: email, email: email + '-' + tag + '@example.com', passwordHash: hash },
    });
    users.push(u.id);
    if (email === 'owner') owner = u;
    if (email === 'member') member = u;
    if (email === 'outsider') outsider = u;
  }
  server = createServer(app);
  sockets = installSockets(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + (server.address() as any).port;
});
afterAll(async () => {
  for (const s of clients) s.disconnect();
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  await db.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await db.notification.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({
    where: { OR: [{ id: { in: users } }, { email: { contains: tag } }] },
  });
  await db.$disconnect();
});
describe('FlowDesk authorization and realtime', () => {
  it('requires authentication and does not accept admin role injection', async () => {
    expect((await request(app).get('/api/workspaces')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/register')
          .set('X-App-Request', '1')
          .send({
            name: 'New User',
            email: 'new-' + tag + '@example.com',
            password: 'test-password-123',
            role: 'ADMIN',
          })
      ).status,
    ).toBe(400);
  });
  it('creates workspace with owner membership atomically', async () => {
    const r = await request(app)
      .post('/api/workspaces')
      .set(as(owner))
      .send({ name: 'Test Studio' });
    expect(r.status).toBe(201);
    workspace = r.body;
    expect(
      (
        await db.membership.findUnique({
          where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
        })
      )?.role,
    ).toBe('OWNER');
  });
  it('prevents access by guessed workspace ID', async () => {
    expect(
      (
        await request(app)
          .get('/api/workspaces/' + workspace.id)
          .set(as(outsider))
      ).status,
    ).toBe(404);
    expect((await request(app).get('/api/workspaces').set(as(outsider))).body).toHaveLength(0);
  });
  it('adds registered members and prevents member self-promotion', async () => {
    const r = await request(app)
      .post('/api/workspaces/' + workspace.id + '/members')
      .set(as(owner))
      .send({ email: member.email, role: 'MEMBER' });
    expect(r.status).toBe(201);
    expect(
      (
        await request(app)
          .patch('/api/workspaces/' + workspace.id + '/members/' + member.id)
          .set(as(member))
          .send({ role: 'ADMIN' })
      ).status,
    ).toBe(403);
  });
  it('allows only workspace administrators to create projects', async () => {
    const body = {
      workspaceId: workspace.id,
      name: 'Integration project',
      description: 'A test project',
    };
    expect((await request(app).post('/api/projects').set(as(member)).send(body)).status).toBe(403);
    const r = await request(app).post('/api/projects').set(as(owner)).send(body);
    expect(r.status).toBe(201);
    project = r.body;
  });
  it('rejects assigning task to non-members', async () => {
    expect(
      (
        await request(app)
          .post('/api/tasks')
          .set(as(member))
          .send({ projectId: project.id, title: 'Task title', assigneeId: outsider.id })
      ).status,
    ).toBe(404);
  });
  it('creates task, activity and assignment notification', async () => {
    const r = await request(app)
      .post('/api/tasks')
      .set(as(owner))
      .send({
        projectId: project.id,
        title: 'Ship the test',
        assigneeId: member.id,
        priority: 'HIGH',
      });
    expect(r.status).toBe(201);
    task = r.body;
    expect((await request(app).get('/api/notifications').set(as(member))).body.items).toHaveLength(
      1,
    );
    expect(
      (
        await request(app)
          .get('/api/tasks/' + task.id)
          .set(as(outsider))
      ).status,
    ).toBe(404);
  });
  it('rejects unauthorized socket rooms and accepts members', async () => {
    const bad = await socket(outsider);
    expect((await ack(bad, 'join_project', project.id)).ok).toBe(false);
    const good = await socket(member);
    expect((await ack(good, 'join_project', project.id)).ok).toBe(true);
  });
  it('persists task moves and broadcasts after commit', async () => {
    const receiver = await socket(member);
    await ack(receiver, 'join_project', project.id);
    const received = new Promise<any>((resolve) => receiver.once('task:moved', resolve));
    const r = await request(app)
      .patch('/api/tasks/' + task.id)
      .set(as(owner))
      .send({ status: 'IN_PROGRESS', version: 0 });
    expect(r.status).toBe(200);
    const event = await received;
    expect(event.status).toBe('IN_PROGRESS');
    expect(event.version).toBe(1);
    expect((await db.task.findUnique({ where: { id: task.id } }))?.status).toBe('IN_PROGRESS');
  });
  it('rejects stale optimistic updates', async () => {
    expect(
      (
        await request(app)
          .patch('/api/tasks/' + task.id)
          .set(as(member))
          .send({ status: 'DONE', version: 0 })
      ).status,
    ).toBe(409);
    expect((await db.task.findUnique({ where: { id: task.id } }))?.status).toBe('IN_PROGRESS');
  });
  it('uses the same authorization for socket mutations', async () => {
    const bad = await socket(outsider);
    expect(
      (await ack(bad, 'task:move', { id: task.id, changes: { status: 'DONE', version: 1 } })).ok,
    ).toBe(false);
    const good = await socket(member);
    expect(
      (await ack(good, 'task:move', { id: task.id, changes: { status: 'REVIEW', version: 1 } })).ok,
    ).toBe(true);
  });
  it('creates comments with authenticated authors', async () => {
    expect(
      (
        await request(app)
          .post('/api/tasks/' + task.id + '/comments')
          .set(as(outsider))
          .send({ body: 'Injected comment' })
      ).status,
    ).toBe(404);
    const r = await request(app)
      .post('/api/tasks/' + task.id + '/comments')
      .set(as(member))
      .send({ body: 'Ready for review.' });
    expect(r.status).toBe(201);
    expect(r.body.user.id).toBe(member.id);
  });
  it('protects notification ownership', async () => {
    const n = await db.notification.findFirstOrThrow({ where: { userId: member.id } });
    expect(
      (
        await request(app)
          .patch('/api/notifications/' + n.id + '/read')
          .set(as(outsider))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch('/api/notifications/' + n.id + '/read')
          .set(as(member))
      ).status,
    ).toBe(200);
  });
  it('cannot remove owner and revokes removed-member access immediately', async () => {
    expect(
      (
        await request(app)
          .delete('/api/workspaces/' + workspace.id + '/members/' + owner.id)
          .set(as(owner))
      ).status,
    ).toBe(400);
    const m = await socket(member);
    await ack(m, 'join_project', project.id);
    expect(
      (
        await request(app)
          .delete('/api/workspaces/' + workspace.id + '/members/' + member.id)
          .set(as(owner))
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app)
          .get('/api/tasks/' + task.id)
          .set(as(member))
      ).status,
    ).toBe(404);
    expect((await ack(m, 'join_project', project.id)).ok).toBe(false);
    expect((await db.task.findUnique({ where: { id: task.id } }))?.assigneeId).toBeNull();
  });
  it('broadcasts project deletion after its committed removal', async () => {
    const receiver = await socket(owner);
    await ack(receiver, 'join_project', project.id);
    const received = new Promise<any>((resolve) => receiver.once('project:deleted', resolve));
    const r = await request(app)
      .delete('/api/projects/' + project.id)
      .set(as(owner));
    expect(r.status).toBe(204);
    expect((await received).id).toBe(project.id);
    expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull();
  });
});

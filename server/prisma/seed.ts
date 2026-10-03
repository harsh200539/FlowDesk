import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const db = new PrismaClient();
async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10)
    throw new Error('Set SEED_PASSWORD to at least 10 characters');
  const passwordHash = await bcrypt.hash(password, 12);

  const owner = await db.user.upsert({
    where: { email: 'owner@flowdesk.demo' },
    update: {},
    create: { name: 'Alex Morgan', email: 'owner@flowdesk.demo', passwordHash, role: 'USER' },
  });
  const member = await db.user.upsert({
    where: { email: 'member@flowdesk.demo' },
    update: {},
    create: { name: 'Riya Shah', email: 'member@flowdesk.demo', passwordHash, role: 'USER' },
  });
  const other = await db.user.upsert({
    where: { email: 'designer@flowdesk.demo' },
    update: {},
    create: { name: 'Jordan Lee', email: 'designer@flowdesk.demo', passwordHash, role: 'USER' },
  });
  const workspace = await db.workspace.upsert({
    where: { id: 'demo-workspace' },
    update: {},
    create: {
      id: 'demo-workspace',
      name: 'Studio North',
      ownerId: owner.id,
      memberships: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          { userId: member.id, role: 'MEMBER' },
          { userId: other.id, role: 'ADMIN' },
        ],
      },
    },
  });
  for (const [i, name] of ['Website refresh', 'Product launch', 'Customer research'].entries())
    await db.project.upsert({
      where: { id: 'demo-project-' + i },
      update: {},
      create: {
        id: 'demo-project-' + i,
        workspaceId: workspace.id,
        name,
        description: [
          'A thoughtful new home for the things we build.',
          'Bring our next collection to the world.',
          'Listen closely. Build something better.',
        ][i],
      },
    });
  const tasks = [
    ['Map the customer journey', 'TODO', 'HIGH'],
    ['Explore visual directions', 'TODO', 'MEDIUM'],
    ['Write the content outline', 'TODO', 'LOW'],
    ['Build the component library', 'IN_PROGRESS', 'HIGH'],
    ['Design the landing page', 'IN_PROGRESS', 'URGENT'],
    ['Review the mobile experience', 'REVIEW', 'MEDIUM'],
    ['Accessibility audit', 'REVIEW', 'HIGH'],
    ['Set up the project repository', 'DONE', 'LOW'],
    ['Align on project goals', 'DONE', 'MEDIUM'],
  ] as const;
  for (const [i, [title, status, priority]] of tasks.entries()) {
    const t = await db.task.upsert({
      where: { id: 'demo-task-' + i },
      update: {},
      create: {
        id: 'demo-task-' + i,
        projectId: 'demo-project-0',
        title,
        status,
        priority,
        position: i,
        assigneeId: i % 2 ? member.id : other.id,
        description:
          'Bring a considered approach to this piece of work. Share your progress, ask for feedback, and keep the next person in mind.',
        dueDate: new Date(Date.now() + (i + 2) * 86400000),
      },
    });
    await db.activity.upsert({
      where: { id: 'demo-activity-' + i },
      update: {},
      create: { id: 'demo-activity-' + i, taskId: t.id, userId: owner.id, action: 'TASK_CREATED' },
    });
    if (i === 3)
      await db.comment.upsert({
        where: { id: 'demo-comment' },
        update: {},
        create: {
          id: 'demo-comment',
          taskId: t.id,
          userId: owner.id,
          body: 'Let’s start with the core patterns and iterate together.',
        },
      });
    if (i % 2)
      await db.notification.upsert({
        where: { id: 'demo-notification-' + i },
        update: {},
        create: {
          id: 'demo-notification-' + i,
          userId: member.id,
          type: 'TASK_ASSIGNED',
          data: { taskId: t.id, title: t.title, projectId: t.projectId },
        },
      });
  }
  console.log('FlowDesk seeded. Accounts: owner / member / designer @flowdesk.demo');
}
main().finally(() => db.$disconnect());

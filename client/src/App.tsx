import { FormEvent, useEffect, useState } from 'react';
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragEndEvent,
} from '@dnd-kit/core';
import { io } from 'socket.io-client';
import {
  Layers,
  LayoutDashboard,
  Bell,
  Users,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  MessageSquare,
  CalendarDays,
  GripVertical,
  CheckCircle2,
  Clock,
  FolderKanban,
} from 'lucide-react';
import {
  api,
  useAuth,
  useData,
  useActions,
  Guard,
  Login,
  Shell,
  Heading,
  Stats,
  Loading,
  ErrorState,
  Empty,
  Badge,
  RecordForm,
  Field,
  Pager,
  Page,
  Row,
  AddButton,
  date,
  options,
  message,
} from './shared';
const nav = [
  { to: '/', label: 'Your workspaces', icon: <Layers size={17} /> },
  { to: '/notifications', label: 'Notifications', icon: <Bell size={17} /> },
];
const statuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const taskFields = (members: Row[]): Field[] => [
  { name: 'title', label: 'Task title', required: true },
  {
    name: 'priority',
    label: 'Priority',
    type: 'select',
    options: options(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    required: true,
  },
  {
    name: 'assigneeId',
    label: 'Assign to',
    type: 'select',
    options: members.map((m) => ({ value: m.userId, label: m.user.name })),
  },
  { name: 'dueDate', label: 'Due date', type: 'date' },
  { name: 'status', label: 'Stage', type: 'select', options: options(statuses), required: true },
  { name: 'description', label: 'Description', type: 'textarea' },
];
const taskPayload = (d: Record<string, any>) => ({
  ...d,
  assigneeId: d.assigneeId || null,
  dueDate: d.dueDate ? new Date(d.dueDate + 'T23:59:00').toISOString() : null,
});
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <Guard>
            <Shell nav={nav}>
              <LiveNotifications />
              <Routes>
                <Route index element={<Workspaces />} />
                <Route path="workspaces" element={<Workspaces />} />
                <Route path="workspace/:id" element={<Workspace />} />
                <Route path="workspace/:id/members" element={<Members />} />
                <Route path="project/:id" element={<Board />} />
                <Route path="task/:id" element={<TaskDetail />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="*" element={<Empty title="Page not found" />} />
              </Routes>
            </Shell>
          </Guard>
        }
      />
    </Routes>
  );
}
function LiveNotifications() {
  const cache = useQueryClient();
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, { withCredentials: true });
    socket.on('notification:new', () =>
      cache.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('/notifications'),
      }),
    );
    return () => {
      socket.disconnect();
    };
  }, [cache]);
  return null;
}
function Workspaces() {
  const q = useData<Row[]>('/workspaces');
  const [create, setCreate] = useState(false);
  const a = useActions();
  const { user } = useAuth();
  return (
    <>
      <Heading
        eyebrow="GOOD WORK STARTS HERE"
        title={`Your space, ${user?.name.split(' ')[0]}`}
        subtitle="A home for your projects, your people, and your next big idea."
        action={<AddButton onClick={() => setCreate(true)}>New workspace</AddButton>}
      />
      <div className="hero-strip">
        <div>
          <span className="eyebrow">LESS FRICTION, MORE FLOW</span>
          <h2>Turn a good idea into a great team effort.</h2>
          <p>Projects, conversations, and momentum — all in one place.</p>
        </div>
        <FolderKanban size={55} strokeWidth={1} />
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : q.data.length ? (
        <div className="cards">
          {q.data.map((w) => (
            <Link to={'/workspace/' + w.id} key={w.id} className="card">
              <span className="eyebrow">WORKSPACE</span>
              <h3>{w.name}</h3>
              <p>
                {w._count.projects} projects · {w._count.memberships} teammates
              </p>
              <div className="card-bottom">
                <Badge value={w.memberships[0].role} />
                <ArrowUpRight size={22} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="Your first workspace awaits" />
      )}
      {create && (
        <RecordForm
          title="Make room for good work"
          fields={[{ name: 'name', label: 'Workspace name', required: true }]}
          onClose={() => setCreate(false)}
          onSave={(d) => a.save(() => api.post('/workspaces', d))}
        />
      )}
    </>
  );
}
function Workspace() {
  const { id } = useParams();
  const q = useData<Row>('/workspaces/' + id);
  const projects = useData<Page>('/projects?workspaceId=' + id + '&limit=100');
  const { user } = useAuth();
  const [create, setCreate] = useState(false);
  const a = useActions();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const w = q.data,
    role = w.memberships.find((m: Row) => m.userId === user?.id)?.role,
    admin = ['OWNER', 'ADMIN'].includes(role);
  return (
    <>
      <Link className="back" to="/">
        <ArrowLeft size={15} />
        Your workspaces
      </Link>
      <Heading
        eyebrow="YOUR SHARED MOMENTUM"
        title={w.name}
        subtitle={`${w.memberships.length} people making good things happen.`}
        action={
          <div className="actions">
            <Link className="primary" to={'/workspace/' + id + '/members'}>
              <Users size={15} />
              Team & access
            </Link>
            {admin && <AddButton onClick={() => setCreate(true)}>New project</AddButton>}
          </div>
        }
      />
      <div className="member-grid">
        {w.memberships.map((m: Row) => (
          <div className="avatar" title={m.user.name} key={m.id}>
            {m.user.name[0]}
          </div>
        ))}
      </div>
      {projects.isPending ? (
        <Loading />
      ) : projects.isError ? (
        <ErrorState error={projects.error} retry={projects.refetch} />
      ) : (
        <div className="cards">
          {projects.data.items.map((p) => (
            <Link className="card" to={'/project/' + p.id} key={p.id}>
              <span className="eyebrow">PROJECT</span>
              <h3>{p.name}</h3>
              <p>{p.description || 'A little space for the next big thing.'}</p>
              <div className="card-bottom">
                <small className="muted">{p._count.tasks} tasks</small>
                <ArrowUpRight size={22} />
              </div>
            </Link>
          ))}
        </div>
      )}
      {!w.projects.length && (
        <Empty title="A fresh start" text="Create a project to bring this workspace to life." />
      )}
      {create && (
        <RecordForm
          title="Start something good"
          fields={[
            { name: 'name', label: 'Project name', required: true },
            { name: 'description', label: 'What are you building?', type: 'textarea' },
          ]}
          onClose={() => setCreate(false)}
          onSave={(d) => a.save(() => api.post('/projects', { ...d, workspaceId: id }))}
        />
      )}
    </>
  );
}
function Column({ status, tasks, onAdd }: { status: string; tasks: Row[]; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={'board-column ' + (isOver ? 'over' : '')}
      aria-label={status.replaceAll('_', ' ') + ' column'}
    >
      <div className="column-head">
        <span>{status.replaceAll('_', ' ')}</span>
        <small>{tasks.length}</small>
      </div>
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
      <button className="text-button" onClick={onAdd}>
        <Plus size={14} />
        Add task
      </button>
    </section>
  );
}
function TaskCard({ task: t }: { task: Row }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id });
  return (
    <article
      ref={setNodeRef}
      className={'task-card ' + (isDragging ? 'dragging' : '')}
      style={
        transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined
      }
    >
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <Badge value={t.priority} />
        <button
          aria-label={'Move ' + t.title}
          style={{ padding: 0, border: 0 }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>
      </div>
      <Link to={'/task/' + t.id}>
        <h3>{t.title}</h3>
      </Link>
      {t.description && <p>{t.description.slice(0, 75)}</p>}
      <div className="task-footer">
        <span>
          {t.dueDate ? (
            <>
              <CalendarDays size={10} style={{ display: 'inline', marginRight: 4 }} />
              {new Date(t.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            </>
          ) : (
            'No due date'
          )}
        </span>
        <span>
          <MessageSquare size={10} style={{ display: 'inline', marginRight: 3 }} />
          {t._count?.comments || 0}
        </span>
        <div className="avatar" title={t.assignee?.name || 'Unassigned'}>
          {t.assignee?.name[0] || '–'}
        </div>
      </div>
    </article>
  );
}
function Board() {
  const { id } = useParams();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const project = useData<Row>('/projects/' + id);
  const key = '/tasks?projectId=' + id + '&limit=100';
  const q = useData<Page>(key);
  const members = useData<Row[]>(
    project.data ? '/workspaces/' + project.data.workspaceId + '/members' : '',
  );
  const { user } = useAuth();
  const [create, setCreate] = useState<string | false>(false),
    [edit, setEdit] = useState(false),
    [connected, setConnected] = useState(false),
    [error, setError] = useState('');
  const a = useActions();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  useEffect(() => {
    if (!id) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, { withCredentials: true });
    socket.on('connect', () => {
      socket.emit('join_project', id, (ack: { ok: boolean; message?: string }) => {
        setConnected(ack.ok);
        if (!ack.ok) setError(ack.message || 'Unable to join live project');
      });
      cache.invalidateQueries({ queryKey: [key] });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    for (const event of [
      'task:created',
      'task:updated',
      'task:moved',
      'task:deleted',
      'comment:created',
      'members:updated',
    ])
      socket.on(event, () => {
        cache.invalidateQueries({ queryKey: [key] });
        cache.invalidateQueries({
          queryKey: ['/workspaces/' + project.data?.workspaceId + '/members'],
        });
      });
    socket.on('project:deleted', () => navigate('/'));
    return () => {
      socket.disconnect();
    };
  }, [id, key, cache, navigate, project.data?.workspaceId]);
  async function move(e: DragEndEvent) {
    if (!e.over || !q.data) return;
    const task = q.data.items.find((t) => t.id === e.active.id);
    const status = String(e.over.id);
    if (!task || task.status === status || !statuses.includes(status)) return;
    setError('');
    await cache.cancelQueries({ queryKey: [key] });
    const snapshot = cache.getQueryData<Page>([key]);
    cache.setQueryData<Page>([key], (old) =>
      old
        ? { ...old, items: old.items.map((t) => (t.id === task.id ? { ...t, status } : t)) }
        : old,
    );
    try {
      await api.patch('/tasks/' + task.id, { status, version: task.version });
    } catch (e) {
      cache.setQueryData([key], snapshot);
      setError(message(e));
    } finally {
      cache.invalidateQueries({ queryKey: [key] });
    }
  }
  if (project.isPending || q.isPending) return <Loading />;
  if (project.isError) return <ErrorState error={project.error} retry={project.refetch} />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const p = project.data,
    items = q.data.items;
  const role = members.data?.find((m) => m.userId === user?.id)?.role,
    admin = role === 'OWNER' || role === 'ADMIN';
  return (
    <>
      <Link className="back" to={'/workspace/' + p.workspaceId}>
        <ArrowLeft size={15} />
        Workspace projects
      </Link>
      <Heading
        eyebrow="A LITTLE PROGRESS, EVERY DAY"
        title={p.name}
        subtitle={p.description || 'Your work, moving in the right direction.'}
        action={
          <div className="actions">
            {admin && <button onClick={() => setEdit(true)}>Project settings</button>}
            <AddButton onClick={() => setCreate('TODO')}>New task</AddButton>
          </div>
        }
      />
      <Stats
        items={[
          {
            label: 'All tasks',
            value: q.data.total,
            note: 'One shared direction',
            icon: <FolderKanban size={18} />,
          },
          {
            label: 'In progress',
            value: items.filter((t) => t.status === 'IN_PROGRESS').length,
            note: 'Good things in motion',
            icon: <Clock size={18} />,
          },
          {
            label: 'In review',
            value: items.filter((t) => t.status === 'REVIEW').length,
            note: 'Ready for another pair of eyes',
            icon: <Users size={18} />,
          },
          {
            label: 'Completed',
            value: items.filter((t) => t.status === 'DONE').length,
            note: 'A little reason to celebrate',
            icon: <CheckCircle2 size={18} />,
          },
        ]}
      />
      <div className="board-tools">
        <div className="member-grid">
          {members.data?.map((m) => (
            <div className="avatar" key={m.id} title={m.user.name}>
              {m.user.name[0]}
            </div>
          ))}
        </div>
        <span className="live">
          <i style={{ background: connected ? '#719e62' : '#b2aea0' }} />
          {connected ? 'Live collaboration' : 'Reconnecting…'}
        </span>
      </div>
      {q.data.total > 100 && (
        <p className="notice">
          Showing the first 100 tasks. Use the task API’s pagination for larger boards.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} onDragEnd={move}>
        <div className="board">
          {statuses.map((s) => (
            <Column
              status={s}
              tasks={items.filter((t) => t.status === s)}
              key={s}
              onAdd={() => setCreate(s)}
            />
          ))}
        </div>
      </DndContext>
      {create && (
        <RecordForm
          title="One step closer"
          fields={taskFields(members.data || [])}
          initial={{ status: create, priority: 'MEDIUM' }}
          onClose={() => setCreate(false)}
          onSave={(d) => a.save(() => api.post('/tasks', { ...taskPayload(d), projectId: id }))}
        />
      )}
      {edit && (
        <RecordForm
          title="Project settings"
          fields={[
            { name: 'name', label: 'Project name', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
          ]}
          initial={p}
          onClose={() => setEdit(false)}
          onSave={(d) => a.save(() => api.patch('/projects/' + id, d))}
        />
      )}
      {admin && (
        <button
          className="text-button danger section-space"
          onClick={() => {
            if (confirm('Delete this project and all its tasks?'))
              a.run(async () => {
                await api.delete('/projects/' + id);
                navigate('/workspace/' + p.workspaceId);
              });
          }}
        >
          Delete project
        </button>
      )}
      {a.error && <p className="error">{a.error}</p>}
    </>
  );
}
function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const q = useData<Row>('/tasks/' + id);
  const members = useData<Row[]>(
    q.data ? '/workspaces/' + q.data.project.workspaceId + '/members' : '',
  );
  const [edit, setEdit] = useState(false),
    [comment, setComment] = useState('');
  const a = useActions();
  useEffect(() => {
    if (!q.data?.projectId) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, { withCredentials: true });
    socket.on('connect', () => socket.emit('join_project', q.data.projectId));
    for (const event of ['task:updated', 'task:moved', 'comment:created'])
      socket.on(event, () => cache.invalidateQueries({ queryKey: ['/tasks/' + id] }));
    return () => {
      socket.disconnect();
    };
  }, [q.data?.projectId, id, cache]);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const t = q.data;
  return (
    <>
      <Link className="back" to={'/project/' + t.projectId}>
        <ArrowLeft size={15} />
        {t.project.name}
      </Link>
      <Heading
        eyebrow="THE DETAILS THAT MAKE IT HAPPEN"
        title={t.title}
        subtitle={'Created ' + date(t.createdAt)}
        action={
          <button className="primary" onClick={() => setEdit(true)}>
            Edit task
          </button>
        }
      />
      {a.error && (
        <p role="alert" className="error">
          {a.error}
        </p>
      )}
      <div className="detail-grid">
        <section className="panel">
          <h2>What’s the plan?</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>
            {t.description || 'Add a little context so everyone has the same picture.'}
          </p>
          <h2 className="section-space">The conversation</h2>
          {t.comments.map((c: Row) => (
            <div className="comment" key={c.id}>
              <strong>{c.user.name}</strong>
              <p>{c.body}</p>
              <small className="muted">{date(c.createdAt)}</small>
            </div>
          ))}
          <form
            className="inline-form section-space"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              a.run(async () => {
                await api.post('/tasks/' + id + '/comments', { body: comment });
                setComment('');
              });
            }}
          >
            <input
              required
              aria-label="Comment"
              placeholder="Add a thought…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button className="primary" disabled={a.busy || !comment.trim()}>
              Send
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>At a glance</h2>
          <dl className="detail-list">
            <div>
              <dt>Stage</dt>
              <dd>
                <select
                  aria-label="Task stage"
                  value={t.status}
                  disabled={a.busy}
                  onChange={(e) =>
                    a.run(() =>
                      api.patch('/tasks/' + id, { status: e.target.value, version: t.version }),
                    )
                  }
                >
                  {options(statuses).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>
                <Badge value={t.priority} />
              </dd>
            </div>
            <div>
              <dt>Assigned to</dt>
              <dd>{t.assignee?.name || 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{t.dueDate ? date(t.dueDate) : 'No date set'}</dd>
            </div>
          </dl>
          <h3 className="section-space">Activity</h3>
          {t.activities.map((a: Row) => (
            <div className="timeline" key={a.id}>
              <div>
                <strong>{a.user.name}</strong>
                <p>{a.action.replaceAll('_', ' ').toLowerCase()}</p>
                <small>{date(a.createdAt)}</small>
              </div>
            </div>
          ))}
          <button
            className="danger section-space"
            disabled={a.busy}
            onClick={() => {
              if (confirm('Delete this task?'))
                a.run(async () => {
                  await api.delete('/tasks/' + id);
                  navigate('/project/' + t.projectId);
                });
            }}
          >
            Delete task
          </button>
        </section>
      </div>
      {edit && (
        <RecordForm
          title="Bring everyone up to speed"
          fields={taskFields(members.data || [])}
          initial={{ ...t, dueDate: t.dueDate?.slice(0, 10) }}
          onClose={() => setEdit(false)}
          onSave={(d) =>
            a.save(() => api.patch('/tasks/' + id, { ...taskPayload(d), version: t.version }))
          }
        />
      )}
    </>
  );
}
function Members() {
  const { id } = useParams();
  const w = useData<Row>('/workspaces/' + id),
    q = useData<Row[]>('/workspaces/' + id + '/members');
  const { user } = useAuth();
  const [add, setAdd] = useState(false);
  const a = useActions();
  const role = q.data?.find((m) => m.userId === user?.id)?.role,
    admin = ['OWNER', 'ADMIN'].includes(role || '');
  return (
    <>
      <Link to={'/workspace/' + id} className="back">
        <ArrowLeft size={15} />
        {w.data?.name || 'Workspace'}
      </Link>
      <Heading
        eyebrow="GOOD WORK IS A TEAM EFFORT"
        title="Your people"
        subtitle="The right access for the right people."
        action={admin && <AddButton onClick={() => setAdd(true)}>Add teammate</AddButton>}
      />
      {a.error && (
        <p role="alert" className="error">
          {a.error}
        </p>
      )}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <section className="panel">
          {q.data.map((m) => (
            <div className="list-row" key={m.id}>
              <div className="cell-person">
                <span className="avatar">{m.user.name[0]}</span>
                <div>
                  <strong>{m.user.name}</strong>
                  <small>{m.user.email}</small>
                </div>
              </div>
              <div className="actions">
                <Badge value={m.role} />
                {role === 'OWNER' && m.role !== 'OWNER' && (
                  <select
                    aria-label={'Role for ' + m.user.name}
                    value={m.role}
                    onChange={(e) =>
                      a.run(() =>
                        api.patch('/workspaces/' + id + '/members/' + m.userId, {
                          role: e.target.value,
                        }),
                      )
                    }
                  >
                    {options(['ADMIN', 'MEMBER']).map((o) => (
                      <option key={o.value}>{o.value}</option>
                    ))}
                  </select>
                )}
                {admin && m.role !== 'OWNER' && (role === 'OWNER' || m.role === 'MEMBER') && (
                  <button
                    className="danger"
                    disabled={a.busy}
                    onClick={() => {
                      if (confirm('Remove this member from the workspace?'))
                        a.run(() => api.delete('/workspaces/' + id + '/members/' + m.userId));
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      {add && (
        <RecordForm
          title="Welcome a teammate"
          fields={[
            { name: 'email', label: 'Registered email address', type: 'email', required: true },
            {
              name: 'role',
              label: 'Workspace role',
              type: 'select',
              required: true,
              options: options(role === 'OWNER' ? ['ADMIN', 'MEMBER'] : ['MEMBER']),
            },
          ]}
          initial={{ role: 'MEMBER' }}
          onClose={() => setAdd(false)}
          onSave={(d) => a.save(() => api.post('/workspaces/' + id + '/members', d))}
        />
      )}
    </>
  );
}
function Notifications() {
  const [page, setPage] = useState(1);
  const q = useData<Page>('/notifications?page=' + page);
  const a = useActions();
  return (
    <>
      <Heading
        eyebrow="STAY IN THE LOOP"
        title="A little heads-up"
        subtitle="The updates that matter to your day."
      />
      {a.error && <p className="error">{a.error}</p>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <section className="panel">
            {q.data.items.map((n) => (
              <div className="list-row" key={n.id}>
                <Link to={'/task/' + n.data.taskId}>
                  <strong>
                    {n.readAt ? '' : '● '}You were assigned: {n.data.title}
                  </strong>
                  <small>{date(n.createdAt)}</small>
                </Link>
                {!n.readAt && (
                  <button
                    disabled={a.busy}
                    onClick={() => a.run(() => api.patch('/notifications/' + n.id + '/read'))}
                  >
                    Mark read
                  </button>
                )}
              </div>
            ))}
            {!q.data.items.length && (
              <Empty title="You’re all caught up" text="Task assignments will appear here." />
            )}
          </section>
          <Pager page={page} total={q.data.total} onChange={setPage} />
        </>
      )}
    </>
  );
}

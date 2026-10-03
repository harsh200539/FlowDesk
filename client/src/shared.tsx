import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
  FormEvent,
} from 'react';
import { Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Plus,
  Search,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react';
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: { 'X-App-Request': '1' },
});
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}
export interface Row {
  id: string;
  [key: string]: any;
}
export interface Page<T = Row> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export const message = (e: unknown) =>
  axios.isAxiosError(e)
    ? e.response?.data?.message || 'Unable to reach the server'
    : e instanceof Error
      ? e.message
      : 'Something went wrong';
interface Auth {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<Auth>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  const login = async (email: string, password: string) => {
    const r = await api.post('/auth/login', { email, password });
    cache.clear();
    setUser(r.data.user);
  };
  const register = async (name: string, email: string, password: string) => {
    const r = await api.post('/auth/register', { name, email, password });
    cache.clear();
    setUser(r.data.user);
  };
  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
    cache.clear();
  };
  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function Guard({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
export function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  if (user) return <Navigate to="/" replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      if (mode)
        await register(
          String(data.get('name')),
          String(data.get('email')),
          String(data.get('password')),
        );
      else await login(String(data.get('email')), String(data.get('password')));
      navigate('/');
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login">
      <section className="login-art">
        <Link className="brand" to="/">
          <Layers size={26} /> FlowDesk
        </Link>
        <div>
          <span className="eyebrow">MADE FOR REAL WORK</span>
          <h1>Good work, in motion.</h1>
          <p>
            One thoughtful workspace.
            <br />
            Everything you need to move forward.
          </p>
          <div className="login-orbit">
            <div />
            <div />
            <div />
          </div>
        </div>
        <small>Designed & built by Harshvardhan Patil</small>
      </section>
      <section className="login-form">
        <span className="eyebrow">WELCOME TO FlowDesk</span>
        <h2>{mode ? 'Your next chapter starts here.' : 'Let’s get back to work.'}</h2>
        <p className="muted">
          {mode ? 'Create your account to get started.' : 'Sign in to your workspace.'}
        </p>
        <form onSubmit={submit}>
          {mode && (
            <label>
              Full name
              <input name="name" required minLength={2} autoComplete="name" />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={72}
              autoComplete={mode ? 'new-password' : 'current-password'}
            />
          </label>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <button className="primary" disabled={pending}>
            {pending ? 'Please wait…' : mode ? 'Create account' : 'Sign in'}{' '}
            <ArrowRight size={17} />
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setMode(!mode);
            setError('');
          }}
        >
          {mode ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
        <aside className="demo-note">
          <strong>Local demonstration</strong>
          <p>
            Use a seeded account with the password you set in SEED_PASSWORD. Demo data is fictional.
          </p>
          <small>owner@flowdesk.demo · member@flowdesk.demo</small>
        </aside>
      </section>
    </main>
  );
}
export function Shell({
  children,
  nav,
}: {
  children: ReactNode;
  nav: { to: string; label: string; icon: ReactNode; admin?: boolean }[];
}) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <aside className={'sidebar ' + (open ? 'open' : '')}>
        <Link to="/" className="brand">
          <Layers size={25} /> FlowDesk
        </Link>
        <div className="workspace-label">
          YOUR WORKSPACE <span>01</span>
        </div>
        <nav>
          {nav
            .filter((n) => !n.admin || user?.role === 'ADMIN')
            .map((n) => (
              <NavLink key={n.to} end={n.to === '/'} to={n.to} onClick={() => setOpen(false)}>
                {n.icon}
                <span>{n.label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="eyebrow">A LITTLE MOMENTUM</span>
            <p>
              Big things happen,
              <br />
              one good day at a time.
            </p>
            <ArrowUpRight size={26} />
          </div>
          <div className="account">
            <div className="avatar">{user?.name.slice(0, 1)}</div>
            <div>
              <strong>{user?.name}</strong>
              <small>{user?.role.replaceAll('_', ' ')}</small>
            </div>
            <button aria-label="Sign out" onClick={() => logout().catch((e) => alert(message(e)))}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="mobile-toggle"
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </button>
          <span>Good work, in motion.</span>
          <span className="topbar-end">
            <i /> Workspace online <div className="avatar small">{user?.name.slice(0, 1)}</div>
          </span>
        </header>
        <main className="content">{children}</main>
        <footer>
          FlowDesk <span>Built with care by Harshvardhan Patil</span>
        </footer>
      </div>
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>
          {title}
          <span className="title-dot">.</span>
        </h1>
        <p className="muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="primary" onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
export function Loading() {
  return (
    <div role="status" className="empty">
      <div className="spinner" />
      Loading your workspace…
    </div>
  );
}
export function Empty({
  title = 'Nothing here yet',
  text = 'Create your first record to get things moving.',
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <Layers size={35} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="empty error" role="alert">
      <h3>{message(error)}</h3>
      <button onClick={retry}>Try again</button>
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  return <span className={'badge ' + value.toLowerCase()}>{value.replaceAll('_', ' ')}</span>;
}
export function Stats({
  items,
}: {
  items: { label: string; value: string | number; note: string; icon: ReactNode }[];
}) {
  return (
    <div className="stats">
      {items.map((s, i) => (
        <div className="stat" key={s.label}>
          <div>
            <span>{s.label}</span>
            <div className="stat-icon">{s.icon}</div>
          </div>
          <strong>{s.value}</strong>
          <small>{s.note}</small>
          <span className="stat-num">0{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Pager({
  page,
  total,
  limit = 20,
  onChange,
}: {
  page: number;
  total: number;
  limit?: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="pager">
      <small>
        {total} records · Page {page} of {Math.max(1, Math.ceil(total / limit))}
      </small>
      <div>
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        <button
          aria-label="Next page"
          disabled={page * limit >= total}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
export interface Field {
  name: string;
  label: string;
  type?:
    'text' | 'email' | 'password' | 'number' | 'textarea' | 'select' | 'datetime-local' | 'date';
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
}
export function RecordForm({
  title,
  fields,
  initial = {},
  onSave,
  onClose,
}: {
  title: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  onSave: (d: Record<string, any>) => Promise<unknown>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    for (const field of fields) {
      const v = String(f.get(field.name) || '');
      data[field.name] = field.type === 'number' ? Number(v) : v;
    }
    try {
      await onSave(data);
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog className="modal" ref={ref} onCancel={onClose}>
      <div className="modal-head">
        <div>
          <span className="eyebrow">YOUR NEXT STEP</span>
          <h2>{title}</h2>
        </div>
        <button aria-label="Close dialog" onClick={onClose}>
          <X />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          {fields.map((f) => (
            <label key={f.name} className={f.type === 'textarea' ? 'full' : ''}>
              {f.label}
              {f.type === 'select' ? (
                <select
                  name={f.name}
                  required={f.required}
                  defaultValue={String(initial[f.name] ?? '')}
                >
                  <option value="">Choose…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  name={f.name}
                  required={f.required}
                  defaultValue={String(initial[f.name] ?? '')}
                  rows={4}
                />
              ) : (
                <input
                  name={f.name}
                  type={f.type || 'text'}
                  required={f.required}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  placeholder={f.placeholder}
                  defaultValue={String(initial[f.name] ?? '')}
                />
              )}
            </label>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function useData<T = any>(url: string) {
  return useQuery<T>({
    queryKey: [url],
    enabled: !!url,
    queryFn: async () => {
      const r = await api.get(url);
      return r.data;
    },
  });
}
export function useActions() {
  const cache = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await cache.invalidateQueries();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (fn: () => Promise<unknown>) => {
    await fn();
    await cache.invalidateQueries();
  };
  return { run, save, error, busy };
}
export const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n / 100);
export const date = (d: string) =>
  new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll('_', ' ') }));

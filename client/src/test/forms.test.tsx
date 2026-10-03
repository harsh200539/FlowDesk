import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RecordForm, Login, AuthProvider, api } from '../shared';
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Forms and authentication', () => {
  it('submits numeric and text values correctly', async () => {
    const save = vi.fn().mockResolvedValue({});
    const close = vi.fn();
    render(
      <RecordForm
        title="Create record"
        fields={[
          { name: 'name', label: 'Name', required: true },
          { name: 'quantity', label: 'Quantity', type: 'number', required: true },
        ]}
        onSave={save}
        onClose={close}
      />,
    );
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test record' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ name: 'Test record', quantity: 3 }));
    expect(close).toHaveBeenCalled();
  });
  it('keeps unsaved form open and shows server error', async () => {
    const close = vi.fn();
    render(
      <RecordForm
        title="Edit record"
        fields={[]}
        onSave={vi.fn().mockRejectedValue(new Error('Record changed elsewhere'))}
        onClose={close}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Record changed elsewhere');
    expect(close).not.toHaveBeenCalled();
  });
  it('signs in with the entered credentials', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('Not authenticated'));
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({
        data: { user: { id: '1', name: 'Test User', email: 'test@example.com', role: 'USER' } },
      });
    const cache = new QueryClient();
    render(
      <QueryClientProvider client={cache}>
        <MemoryRouter>
          <AuthProvider>
            <Login />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'test-password-123',
      }),
    );
  });
  it('shows login failure without exposing a password', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('Not authenticated'));
    vi.spyOn(api, 'post').mockRejectedValue(new Error('Invalid email or password'));
    const cache = new QueryClient();
    render(
      <QueryClientProvider client={cache}>
        <MemoryRouter>
          <AuthProvider>
            <Login />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bad-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});

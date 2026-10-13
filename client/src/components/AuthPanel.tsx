import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { User } from '../types';

export default function AuthPanel({ onDone, onCancel }: { onDone: (u: User) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      onDone(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Log in' : 'Create an account'}</h2>
      <p className="muted">You need an account to save events and submit new ones.</p>
      <label>
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        Password
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn" disabled={busy}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

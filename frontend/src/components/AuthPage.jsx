import { useState } from 'react';
import { login, register } from '../api';

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = mode === 'register'
        ? await register(form)
        : await login({ email: form.email, password: form.password });
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError.message || 'Unable to continue. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <span className="auth-brand-icon" aria-hidden="true">PG</span>
          <span>ProjectGuard <strong>AI</strong></span>
        </div>
        <div className="auth-pitch">
          <div className="eyebrow">Construction project monitoring</div>
          <h1>Monitor.<br />Predict.<br />Act.</h1>
          <p>Find which projects need attention first, understand the data behind the risk, and support timely officer review.</p>
        </div>
        <p className="auth-disclaimer">Demo authentication only. Not a government login or production identity service.</p>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="eyebrow">Project monitoring workspace</div>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your workspace account'}</h2>
          <p className="muted-text">
            {mode === 'login' ? 'Sign in to continue to your monitoring dashboard.' : 'Register a demo account to explore the synthetic project portfolio.'}
          </p>
          <form className="stacked-form auth-form" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <label>
                Full name
                <input
                  type="text"
                  autoComplete="name"
                  minLength="2"
                  maxLength="100"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                maxLength="254"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 8 : undefined}
                maxLength="128"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
              />
              {mode === 'register' && <span className="field-hint">Use at least 8 characters.</span>}
            </label>
            {error && <div className="error-banner auth-error" role="alert">{error}</div>}
            <button type="submit" className="primary-button auth-submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <div className="auth-switch">
            {mode === 'login' ? 'New to ProjectGuard?' : 'Already registered?'}
            <button type="button" className="text-action" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create account' : 'Sign in'}
            </button>
          </div>
          <div className="auth-data-note">
            <strong>Demo data notice</strong>
            <span>Sample records are synthetic. No live PAIMANA data or trained machine-learning model is connected.</span>
          </div>
        </div>
      </section>
    </main>
  );
}

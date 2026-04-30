'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/app/utils/supabase/client';
import { useAuth } from '@/app/users/authprovider';

export default function LoginForm() {
  const supabase = createClient();
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectTo =
    searchParams.get('redirect') || searchParams.get('next');

  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [testingMode, setTestingMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'link_expired'
      ? 'That link has expired. Please request a new one.'
      : null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && profile) {
      if (redirectTo) {
        router.replace(redirectTo);
      } else {
        router.replace(
          profile.role === 'ADMIN' ? '/users/admin' : '/users/member'
        );
      }
    }
  }, [loading, profile, router, redirectTo]);

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="section-copy">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (profile) return null;

  function switchMode(next: 'signin' | 'forgot') {
    setMode(next);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!testingMode && !email.endsWith('@illinois.edu')) {
      setError('Please use your @illinois.edu email address.');
      return;
    }

    setSubmitting(true);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      // redirect handled by useEffect once profile loads
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage('Check your email for a password reset link.');
      }
    }

    setSubmitting(false);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <img
          src="/nobe_logo_f.svg"
          alt="NOBE Illinois"
          className="brand-logo brand-logo-header"
          style={{ width: '150px', height: '150px' }}
        />
        <h1 className="page-title" style={{ fontSize: '2.5rem' }}>Attendance Portal</h1>
        <p className="page-subtitle">
          Sign in to view events, points, attendance, and admin tools
        </p>

        <div className="pill-nav" style={{ width: '100%', justifyContent: 'stretch', marginTop: '24px' }}>
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={mode === 'signin' ? 'pill-link-active' : 'pill-link'}
            style={{ flex: 1 }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={mode === 'signup' ? 'pill-link-active' : 'pill-link'}
            style={{ flex: 1 }}
          >
            Create account
          </button>
        </div>

        {error && (
          <div className="message-error" style={{ marginTop: '20px' }}>{error}</div>
        )}
        {message && (
          <div className="message-success" style={{ marginTop: '20px' }}>{message}</div>
        )}

        <form onSubmit={handleSubmit} className="field-group" style={{ marginTop: '20px' }}>
          {mode === 'signup' && (
            <div className="field-group">
              <label className="field-label">Full name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="field-input"
              />
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="netid@illinois.edu"
              required
              className="field-input"
            />
          </div>

          <div className="field-group">
            <label className="field-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="field-input"
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--muted)', cursor: 'pointer', marginTop: '4px' }}>
            <input
              type="checkbox"
              checked={testingMode}
              onChange={e => setTestingMode(e.target.checked)}
            />
            Testing features (allow non-illinois emails)
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="btn button-full"
            style={{ marginTop: '8px' }}
          >
            {submitting
              ? mode === 'signin' ? 'Signing in...' : 'Sending...'
              : mode === 'signin' ? 'Sign in' : 'Send reset link'}
          </button>
        </form>

        <div className="text-center text-sm">
          {mode === 'signin' ? (
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="text-blue-600 hover:underline"
            >
              Forgot password?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="text-blue-600 hover:underline"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

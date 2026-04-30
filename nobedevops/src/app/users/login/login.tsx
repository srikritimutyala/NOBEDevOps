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

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
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

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      }
      // redirect is handled by the useEffect once profile loads
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage('Account created! Check your email to confirm before signing in.');
      }
    }

    setSubmitting(false);
  }

  function switchMode(next: 'signin' | 'signup') {
    setMode(next);
    setError(null);
    setMessage(null);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow"></p>
        <h1 className="page-title" style={{ fontSize: '2.5rem' }}>NOBE Attendance Portal</h1>
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

          <button
            type="submit"
            disabled={submitting}
            className="btn button-full"
            style={{ marginTop: '8px' }}
          >
            {submitting
              ? mode === 'signin'
                ? 'Signing in...'
                : 'Creating account...'
              : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

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

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [testingMode, setTestingMode] = useState(false);
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'link_expired'
      ? 'That confirmation link has expired. Please sign up again to get a new one.'
      : null
  );
  const [message, setMessage] = useState<string | null>(
    searchParams.get('confirmed') === '1' ? 'Email confirmed! You can now sign in.' : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resending, setResending] = useState(false);

  // Parse Supabase error params from URL hash (e.g. otp_expired after clicking email link)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.slice(1));
    const errorCode = params.get('error_code');
    const errorDescription = params.get('error_description');
    if (errorCode === 'otp_expired') {
      setError('Your email confirmation link has expired. Please sign up again to receive a new one.');
    } else if (errorCode) {
      setError(errorDescription ?? 'Something went wrong. Please try again.');
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

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

  function switchMode(next: 'signin' | 'signup' | 'forgot') {
    setMode(next);
    setError(null);
    setMessage(null);
    setShowResend(false);
    setConfirmEmail('');
  }

  async function handleResend() {
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setResending(false);
    if (error) {
      setError(error.message);
    } else {
      setShowResend(false);
      setError(null);
      setMessage('Confirmation email resent! Check your inbox.');
    }
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
      if (error) {
        setError(error.message);
        if (error.message === 'Email not confirmed') setShowResend(true);
      }
      // redirect handled by useEffect once profile loads
    } else if (mode === 'signup') {
      if (email !== confirmEmail) {
        setError('Email addresses do not match.');
        setSubmitting(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`,
          },
        },
      });
      if (error) {
        setError(error.message);
      } else if (data.user?.identities?.length === 0) {
        setError('An account with this email already exists. Please sign in instead.');
        setShowResend(true);
      } else if (data.user) {
        const res = await fetch('/api/auth/update-signup-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auth_id: data.user.id,
            first_name: firstName,
            last_name: lastName,
            illinois_email: email,
          }),
        });
        if (!res.ok) {
          const body = await res.json();
          setError(`Account created but profile setup failed: ${body.error ?? 'unknown error'}. Please contact an admin.`);
        } else {
          setMessage('Sign up successful! Check your email to confirm your account.');
          setMode('signin');
        }
      }
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
          <div style={{ marginTop: '20px' }}>
            <div className="message-error">{error}</div>
            {showResend && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="btn button-full"
                style={{ marginTop: '8px' }}
              >
                {resending ? 'Resending...' : 'Resend confirmation email'}
              </button>
            )}
          </div>
        )}
        {message && (
          <div className="message-success" style={{ marginTop: '20px' }}>{message}</div>
        )}

        <form onSubmit={handleSubmit} className="field-group" style={{ marginTop: '20px' }}>
          {mode === 'signup' && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  required
                  className="field-input"
                />
              </div>
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  required
                  className="field-input"
                />
              </div>
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

          {mode === 'signup' && (
            <div className="field-group">
              <label className="field-label">Confirm email</label>
              <input
                type="email"
                value={confirmEmail}
                onChange={e => setConfirmEmail(e.target.value)}
                placeholder="netid@illinois.edu"
                required
                className="field-input"
              />
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="field-input"
                style={{ paddingRight: '60px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--muted)', padding: '0' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
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
              ? mode === 'signin' ? 'Signing in...' : mode === 'signup' ? 'Creating account...' : 'Sending...'
              : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

      </div>
    </div>
  );
}

'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/utils/supabase/client';

function ResetPasswordForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);

    // If arriving via email link with token_hash and not yet verified, verify it first
    if (tokenHash && type && !otpVerified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });

      if (verifyError) {
        // Check if user already has an active session (e.g. verified earlier)
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setError('This password reset link is invalid or has expired. Please request a new reset link below.');
          setSubmitting(false);
          return;
        }
      } else {
        setOtpVerified(true);
        // Clean URL so subsequent submits or reloads don't retry the consumed token
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    }

    // Update password for the authenticated session
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      const msg = updateError.message.toLowerCase();
      if (msg.includes('different') || msg.includes('same') || msg.includes('previous')) {
        setError('Your new password cannot be the same as your old password. Please choose a different password.');
      } else {
        setError(updateError.message);
      }
      setSubmitting(false);
      return;
    }

    setSuccess(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('People').select('role').eq('auth_id', user.id).maybeSingle();
      setTimeout(() => {
        router.replace(data?.role === 'ADMIN' ? '/users/admin' : '/users/member');
      }, 1500);
    } else {
      setTimeout(() => {
        router.replace('/users/login?confirmed=1');
      }, 1500);
    }

    setSubmitting(false);
  }

  const isFatalError = error && error.includes('link is invalid or has expired');

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <img
          src="/nobe_logo_f.svg"
          alt="NOBE Illinois"
          className="brand-logo brand-logo-header"
          style={{ width: '150px', height: '150px' }}
        />
        <h1 className="page-title" style={{ fontSize: '2.2rem' }}>Set new password</h1>
        <p className="page-subtitle">
          {success
            ? 'Password updated successfully! Redirecting you...'
            : 'Enter a new password for your account.'}
        </p>

        {error && (
          <div style={{ marginTop: '20px' }}>
            <div className="message-error">{error}</div>
            {isFatalError && (
              <Link
                href="/users/login"
                className="btn-secondary button-full"
                style={{ marginTop: '12px', textAlign: 'center', textDecoration: 'none', display: 'block' }}
              >
                Back to login
              </Link>
            )}
          </div>
        )}

        {success && (
          <div className="message-success" style={{ marginTop: '20px' }}>
            Password reset successful! Redirecting...
          </div>
        )}

        {!success && !isFatalError && (
          <form onSubmit={handleSubmit} className="field-group" style={{ marginTop: '20px' }}>
            <div className="field-group">
              <label className="field-label">New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
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

            <div className="field-group">
              <label className="field-label">Confirm password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Re-enter new password"
                  className="field-input"
                  style={{ paddingRight: '60px' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn button-full"
              style={{ marginTop: '8px' }}
            >
              {submitting ? 'Saving...' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-shell">
          <div className="auth-card">
            <p className="section-copy">Loading...</p>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

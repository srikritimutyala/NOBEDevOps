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
    return <p className="text-center mt-20 text-gray-500">Loading...</p>;
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

    if (!email.endsWith('@illinois.edu')) {
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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-black text-center">NOBE</h1>

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>
        )}
        {message && (
          <div className="p-3 bg-green-100 text-green-700 rounded text-sm">{message}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Illinois Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="netid@illinois.edu"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {mode === 'signin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition disabled:opacity-50"
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
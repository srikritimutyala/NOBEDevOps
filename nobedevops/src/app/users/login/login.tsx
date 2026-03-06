'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/utils/supabase/client';
import { useAuth } from '@/app/users/authprovider';

export default function LoginForm() {
  const supabase = createClient();
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && profile) {
      router.replace(profile.role === 'ADMIN' ? '/users/admin' : '/users/member');
    }
  }, [loading, profile, router]);

  if (loading) {
    return <p className="text-center mt-20 text-gray-500">Loading...</p>;
  }

  if (profile) return null;

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      // redirect is handled above when profile loads via AuthProvider
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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">NOBE</h1>

        {/* Mode toggle */}
        <div className="flex rounded overflow-hidden border border-gray-300">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`flex-1 py-2 text-sm font-semibold transition ${
              mode === 'signin'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 py-2 text-sm font-semibold transition ${
              mode === 'signup'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Create account
          </button>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>
        )}
        {message && (
          <div className="p-3 bg-green-100 text-green-700 rounded text-sm">{message}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

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

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition disabled:opacity-50"
          >
            {submitting
              ? mode === 'signin' ? 'Signing in...' : 'Creating account...'
              : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

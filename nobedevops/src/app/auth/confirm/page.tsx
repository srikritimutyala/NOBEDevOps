'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/app/utils/supabase/client';

export default function ConfirmPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'email' | 'recovery' | 'invite' | null;
  const next = searchParams.get('next');

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!token_hash || !type) {
      setError('Invalid confirmation link.');
      return;
    }

    setConfirming(true);
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });

    if (error) {
      setError(error.message);
      setConfirming(false);
      return;
    }

    const destination = next ?? (type === 'recovery' || type === 'email' ? '/auth/reset-password' : '/users/login');
    router.replace(destination);
  }

  const isInvalid = !token_hash || !type;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold text-black">NOBE</h1>

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>
        )}

        {isInvalid ? (
          <p className="text-gray-600 text-sm">This confirmation link is invalid or has expired.</p>
        ) : (
          <>
            <p className="text-gray-600 text-sm">
              {type === 'recovery'
                ? 'Click below to verify your identity and set a new password.'
                : 'Click below to confirm your account.'}
            </p>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="w-full py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition disabled:opacity-50"
            >
              {confirming ? 'Confirming...' : type === 'recovery' ? 'Confirm password reset' : 'Confirm account'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

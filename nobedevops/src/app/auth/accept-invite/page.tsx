'use client';

import { useSearchParams } from 'next/navigation';

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const encoded = searchParams.get('link');

  function handleAccept() {
    if (!encoded) return;
    const destination = atob(decodeURIComponent(encoded));
    window.location.href = destination;
  }

  if (!encoded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold text-black">Invalid invite link</h1>
          <p className="text-gray-600 text-sm">This invite link is missing or malformed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm text-center space-y-6">
        <h1 className="text-2xl font-bold text-black">You&apos;ve been invited to NOBE</h1>
        <p className="text-gray-600 text-sm">
          Click the button below to accept your invitation and set up your account.
        </p>
        <button
          onClick={handleAccept}
          className="w-full py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition"
        >
          Accept Invite
        </button>
      </div>
    </div>
  );
}

'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { safeInternalPath } from '@/lib/navigation/safe-redirect';

function GateForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeInternalPath(params.get('next'), '/');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace(next);
      router.refresh();
    } else {
      setError('Incorrect password');
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-neutral-900"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !password}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? 'Checking…' : 'Enter'}
      </button>
    </form>
  );
}

export default function GatePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold text-neutral-900">
          Art by Me
        </h1>
        <p className="mb-6 text-sm text-neutral-600">
          This site is private. Enter the password to continue.
        </p>
        <Suspense>
          <GateForm />
        </Suspense>
      </div>
    </main>
  );
}

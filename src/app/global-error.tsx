'use client'
// Authored by DotWin
// Last-resort boundary that replaces the root layout if it throws. Must render
// its own <html>/<body> and cannot rely on app chrome, providers, or Tailwind.
// Never leaks internals (stack/digest) to the user.
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          fontFamily: 'Georgia, "Times New Roman", serif',
          background: '#faf7f2',
          color: '#2b2b2b',
        }}
      >
        <h1 style={{ fontWeight: 300, fontSize: 30, margin: 0 }}>ArtByME</h1>
        <div style={{ width: 48, height: 1, background: '#c9a94e', margin: '16px 0' }} />
        <p style={{ maxWidth: 420, fontSize: 15, color: '#5a5a5a', margin: 0 }}>
          Something went wrong. Please try again — if the problem continues, please contact us.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 24,
            padding: '10px 22px',
            cursor: 'pointer',
            border: 'none',
            borderRadius: 3,
            background: '#2f6f6b',
            color: '#faf7f2',
            fontSize: 14,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}

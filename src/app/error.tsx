'use client'
// Authored by DotWin
// Root route error boundary. A thrown error degrades to recoverable UI instead of a white
// screen. Never leak error internals (stack, digest) to the user.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" style={{ padding: 48, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
      <p style={{ marginBottom: 20, color: '#555' }}>Please try again. If the problem continues, contact us.</p>
      <button
        onClick={() => reset()}
        style={{ padding: '10px 20px', cursor: 'pointer', border: '1px solid #333', borderRadius: 6, background: '#fff' }}
      >
        Try again
      </button>
    </div>
  );
}

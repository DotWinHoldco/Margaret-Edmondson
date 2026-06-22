// Authored by DotWin
// Root route loading boundary (streaming fallback). Keeps navigation responsive.
export default function Loading() {
  return (
    <div aria-busy="true" style={{ padding: 48, textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#555' }}>
      Loading…
    </div>
  );
}

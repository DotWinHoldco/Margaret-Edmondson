// Authored by DotWin
// Root route not-found boundary.
import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ padding: 48, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ marginBottom: 12 }}>Page not found</h2>
      <p style={{ marginBottom: 20, color: '#555' }}>The page you are looking for does not exist.</p>
      <Link href="/" style={{ textDecoration: 'underline' }}>Return home</Link>
    </div>
  );
}

import localFont from 'next/font/local'
import '@/sites/margaret-edmondson/margaret.css'
const display = localFont({ src: [
  { path: '../../../assets/fonts/cormorant-garamond/normal.ttf', style: 'normal' },
  { path: '../../../assets/fonts/cormorant-garamond/italic.ttf', style: 'italic' },
], variable: '--font-margaret-display', display: 'swap' })
/** Preserve the reviewed class artwork and styles inside Artbyme's existing navigation. */
export default function ClassesLayout({ children }: { children: React.ReactNode }) {
  return <div className={`me-site ${display.variable}`}>{children}</div>
}

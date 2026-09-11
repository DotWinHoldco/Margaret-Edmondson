import type { AnchorHTMLAttributes } from 'react'
export function useRouter() {
  return { refresh() {}, push() {} }
}
export function usePathname() { return '/admin' }
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />
}

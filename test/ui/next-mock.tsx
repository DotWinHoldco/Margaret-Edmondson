import type { AnchorHTMLAttributes } from 'react'
export function useRouter() {
  return { refresh() {}, push() {} }
}
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />
}

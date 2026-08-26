export type SenderRole = 'developer' | 'client'

const TEAM_DOMAINS: readonly string[] = ['holdco.win']
const TEAM_EMAILS: readonly string[] = ['skylar.webber@gmail.com']

/**
 * Which side of a Project Hub thread a comment belongs to.
 *
 * The hub renders `sender_role = 'developer'` as the "Dev Team" bubble and
 * anything else as the client's ("Margaret") bubble. The team is every account
 * on the DotWin domain plus the original build account; the client is everyone
 * else. Matching is case-insensitive and the domain check is an exact
 * `@holdco.win` suffix, so look-alike domains do not qualify.
 */
export function senderRoleForEmail(email: string | null | undefined): SenderRole {
  const normalized = (email ?? '').trim().toLowerCase()
  if (!normalized) return 'client'
  if (TEAM_EMAILS.includes(normalized)) return 'developer'

  const at = normalized.lastIndexOf('@')
  if (at === -1) return 'client'
  const domain = normalized.slice(at + 1)
  return TEAM_DOMAINS.includes(domain) ? 'developer' : 'client'
}

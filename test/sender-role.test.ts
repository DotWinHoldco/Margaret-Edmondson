import { describe, expect, it } from 'vitest'
import { senderRoleForEmail } from '@/lib/auth/sender-role'

describe('senderRoleForEmail', () => {
  it.each([
    'shelby@holdco.win',
    'Shelby@HoldCo.win',
    '  skylar+printproof@holdco.win ',
    'skylar.webber@gmail.com',
    'Skylar.Webber@Gmail.com',
  ])('treats a team address as the developer side (%s)', (email) => {
    expect(senderRoleForEmail(email)).toBe('developer')
  })

  it.each([
    'margaret117art@gmail.com',
    'margaret@artbyme.studio',
    'someone@holdco.win.example',
    'someone@notholdco.win',
    'holdco.win',
    '',
    null,
    undefined,
  ])('treats everyone else as the client side (%s)', (email) => {
    expect(senderRoleForEmail(email)).toBe('client')
  })
})

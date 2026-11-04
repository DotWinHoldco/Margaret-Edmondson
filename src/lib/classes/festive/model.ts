// Authored by DotWin. Shared validation for a buyer and independently chosen canvases.
import { z } from 'zod'

export const paintingId = z.enum(['snowman', 'ornament', 'reindeer', 'santa'])
export const registrationPayload = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  phone: z.string().trim().min(7).max(40).regex(/^[+()\d\s.\-]+$/),
  painters: z.array(z.object({
    name: z.string().trim().max(80).default(''),
    painting: paintingId,
  }).strict()).min(1),
}).strict()
export const registrationCapability = z.object({ id: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const registrationRequest = registrationCapability.extend({
  payload: registrationPayload,
  expectedPrice: z.number().int().positive(),
}).strict()
export type RegistrationPayload = z.infer<typeof registrationPayload>
export type ArtRegistration = {
  id: string
  payload: RegistrationPayload
  unit_price: number
  total: number
  mode: 'test' | 'live'
  status: 'pending' | 'paid' | 'failed' | 'expired'
  created_at: string
  paid_at: string | null
}

/** Group checkout lines by design, keeping every individual choice in the registration. */
export function paintingQuantities(painters: RegistrationPayload['painters']) {
  return paintingId.options.flatMap(painting => {
    const quantity = painters.filter(painter => painter.painting === painting).length
    return quantity ? [{ painting, quantity }] : []
  })
}

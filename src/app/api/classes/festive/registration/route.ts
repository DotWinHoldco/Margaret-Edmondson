import { registrationCapability, type ArtRegistration } from '@/lib/classes/festive/model'
import { artRpc, readArtRequest } from '@/lib/classes/festive/server'
/** Authored by DotWin. Private confirmation lookup: both ID and high-entropy capability are required. */
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  try {
    const input = registrationCapability.parse(await readArtRequest(request))
    const order = await artRpc<ArtRegistration | null>('festive_registration_status', { p_id: input.id, p_token: input.token })
    if (!order) return Response.json({ error: 'Registration not found. Please use the private link from checkout.' }, { status: 404, headers })
    return Response.json({ order }, { headers })
  } catch { return Response.json({ error: 'Unable to retrieve this registration. Please try again.' }, { status: 400, headers }) }
}

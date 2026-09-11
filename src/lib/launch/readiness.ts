/** Safe connection indicators; values and credentials never leave server routes. */
export function readLaunchConnections(env: Record<string, string | undefined>) {
  const has = (key: string) => Boolean(env[key]?.trim())
  const stripe = (suffix: string) => ({
    secret: has(`STRIPE_SECRET_KEY${suffix}`),
    publishable: has(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY${suffix}`),
    webhook: has(`STRIPE_WEBHOOK_SECRET${suffix}`),
  })
  return {
    stripe: { test: stripe('_TEST'), live: stripe('') },
    lumaprints: ['LUMAPRINTS_API_KEY', 'LUMAPRINTS_API_SECRET', 'LUMAPRINTS_STORE_ID'].every(has),
    email: has('RESEND_API_KEY') && has('EMAIL_FROM'),
    worker: has('CRON_SECRET'),
    preview: env.VERCEL_ENV === 'preview',
  }
}
export type LaunchConnections = ReturnType<typeof readLaunchConnections>
/** A checked box cannot bypass payment setup or open the shared store from a preview. */
export function launchConnectionBlockers(connections: LaunchConnections, stripeTestMode: boolean, lumaprintsEnabled: boolean) {
  const blockers: { code: string; message: string }[] = []
  if (connections.preview) blockers.push({ code: 'PREVIEW', message: 'Open the launch guide on artbyme.studio for the final go-live step. This preview shares the store settings.' })
  if (stripeTestMode) blockers.push({ code: 'STRIPE_TEST_MODE', message: 'Switch Stripe to live payments after your test order is complete.' })
  if (!Object.values(connections.stripe.live).every(Boolean)) blockers.push({ code: 'STRIPE_CONNECTION', message: 'Ask DotWin to finish connecting your live Stripe checkout and payment confirmations.' })
  if (lumaprintsEnabled && !connections.lumaprints) blockers.push({ code: 'LUMAPRINTS_CONNECTION', message: 'Ask DotWin to connect your Lumaprints account and store, or choose self-fulfillment.' })
  if (!connections.email) blockers.push({ code: 'EMAIL_CONNECTION', message: 'Confirm the email address customers should hear from, then have DotWin verify order emails.' })
  if (!connections.worker) blockers.push({ code: 'ORDER_WORKER', message: 'Have DotWin confirm the scheduled order-processing and shipment-email service is connected.' })
  return blockers
}

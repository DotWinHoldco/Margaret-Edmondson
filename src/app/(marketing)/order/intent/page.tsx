import { redirect } from 'next/navigation'

// Stripe Payment Elements return_url. Stripe appends ?payment_intent=pi_…;
// we bounce straight to the order confirmation page, which looks orders up by
// stripe_payment_intent_id when the param starts with "pi_".
export const dynamic = 'force-dynamic'

export default async function OrderIntentRedirect(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await props.searchParams
  const pi = sp.payment_intent
  if (typeof pi === 'string' && pi) {
    redirect(`/order/${pi}`)
  }
  redirect('/cart')
}

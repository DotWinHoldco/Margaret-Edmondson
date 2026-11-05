import { asPurchaseSpec, describePurchaseSpec, specOptionsText } from '@/lib/orders/print-options'

/** Show the purchased configuration and its fulfillment owner from the immutable order line. */
export default function OrderItemSummary({ item }: { item: {
  purchase_spec: unknown
  fulfillment_type: string | null
  quantity: number
  products?: { title?: string } | { title?: string }[] | null
} }) {
  const product = Array.isArray(item.products) ? item.products[0] : item.products
  const spec = describePurchaseSpec(asPurchaseSpec(item.purchase_spec), { productTitle: product?.title })
  const options = specOptionsText(spec.options)
  return <div className="space-y-1">
    <p className="font-medium text-charcoal">{spec.title} · Qty {item.quantity}</p>
    {spec.kind === 'original' && <p className="font-semibold text-teal">Original artwork</p>}
    {spec.line && spec.line !== 'Original artwork' && <p>{spec.line}</p>}
    {options && <p className="text-xs text-charcoal/65">{options}</p>}
    {spec.colorHex && <p className="text-xs text-charcoal/65">Wrap color: {spec.colorHex}</p>}
    <p className="text-xs text-charcoal/65">{item.fulfillment_type === 'self_ship'
      ? spec.kind === 'original' ? 'Margaret fulfills this original' : 'Margaret fulfills this item'
      : item.fulfillment_type === 'lumaprints' ? 'Lumaprints prints and ships'
      : item.fulfillment_type === 'printful' ? 'Printful fulfills this item'
      : item.fulfillment_type === 'digital' ? 'Digital delivery' : 'Check fulfillment details'}</p>
  </div>
}

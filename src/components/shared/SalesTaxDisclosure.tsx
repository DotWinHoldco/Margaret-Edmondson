export interface SalesTaxDisplay {
  enabled: boolean
  included: boolean
  states: string[]
}

/** Public display values only: never pass the full internal settings row. */
export default function SalesTaxDisclosure({ tax }: { tax: SalesTaxDisplay }) {
  if (!tax.enabled || tax.states.length === 0) return null
  return (
    <aside aria-label="Sales tax information" className="border-b border-teal/20 bg-teal/5 px-5 py-3 text-center font-body text-sm leading-relaxed text-charcoal">
      {tax.included ? (
        <>
          <p>Sales tax included for taxable orders delivered to {tax.states.join(', ')}.</p>
          {tax.states.includes('TX') && <p>Texas state and local sales and use tax is included in the sales price.</p>}
        </>
      ) : (
        <p>Sales tax is calculated at checkout for taxable orders delivered to {tax.states.join(', ')}.</p>
      )}
    </aside>
  )
}

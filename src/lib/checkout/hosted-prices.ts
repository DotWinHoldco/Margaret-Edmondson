// Allocate a validated discount across merchandise only. Splitting a quantity
// when necessary preserves every cent without discounting shipping or tax.
export function discountedHostedLines<
  T extends { price: number; quantity: number },
>(items: T[], discountCents: number) {
  const subtotal = items.reduce(
    (sum, item) => sum + Math.round(item.price * 100) * item.quantity,
    0,
  )
  if (
    !Number.isInteger(discountCents) ||
    discountCents < 0 ||
    discountCents > subtotal
  )
    throw new Error('Invalid discount')
  let remainingDiscount = discountCents,
    remainingSubtotal = subtotal
  return items.flatMap((item) => {
    const lineTotal = Math.round(item.price * 100) * item.quantity
    const allocation =
      remainingSubtotal === lineTotal
        ? remainingDiscount
        : Math.floor((remainingDiscount * lineTotal) / remainingSubtotal)
    remainingSubtotal -= lineTotal
    remainingDiscount -= allocation
    const net = lineTotal - allocation,
      unit = Math.floor(net / item.quantity),
      extra = net % item.quantity
    return [
      { item, quantity: item.quantity - extra, unitAmount: unit },
      { item, quantity: extra, unitAmount: unit + 1 },
    ].filter((line) => line.quantity > 0)
  })
}

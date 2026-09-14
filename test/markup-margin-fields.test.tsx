import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import MarkupMarginFields, { PricingRelationship } from '@/components/admin/MarkupMarginFields'
afterEach(cleanup)

function Harness({ initial = '100', commit = vi.fn(), changed = vi.fn(), valid = vi.fn() }) {
  const [value, setValue] = useState(initial)
  return <MarkupMarginFields value={value} inheritedMarkup={200} onChange={next => { changed(next); setValue(next) }} onCommit={commit} onValidityChange={valid} />
}
it('updates both directions while preserving the text being edited and full saved precision', () => {
  const changed = vi.fn()
  const commit = vi.fn()
  render(<Harness changed={changed} commit={commit} />)
  const markup = screen.getByLabelText('Markup (%)')
  const gross = screen.getByLabelText('Gross margin (%)')
  expect(gross).toHaveValue('50')
  fireEvent.change(markup, { target: { value: '200' } })
  expect(gross).toHaveValue('66.6667')
  fireEvent.change(gross, { target: { value: '33.3333' } })
  expect(gross).toHaveValue('33.3333')
  expect(changed).toHaveBeenLastCalledWith(String(33.3333 / (100 - 33.3333) * 100))
  fireEvent.blur(gross)
  expect(commit).toHaveBeenLastCalledWith(String(33.3333 / (100 - 33.3333) * 100))
  // Focusing and blurring the rounded partner must not rewrite the full value.
  fireEvent.focus(markup)
  fireEvent.blur(markup)
  expect(commit).toHaveBeenLastCalledWith(String(33.3333 / (100 - 33.3333) * 100))
})
it('keeps invalid text visible, blocks autosave, and reports invalidity until corrected', () => {
  const changed = vi.fn()
  const commit = vi.fn()
  const valid = vi.fn()
  render(<Harness changed={changed} commit={commit} valid={valid} />)
  const gross = screen.getByLabelText('Gross margin (%)')
  fireEvent.change(gross, { target: { value: '100' } })
  fireEvent.blur(gross)
  expect(gross).toHaveValue('100')
  expect(gross).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('alert')).toHaveTextContent('less than 100%')
  expect(changed).not.toHaveBeenCalled()
  expect(commit).not.toHaveBeenCalled()
  expect(valid).toHaveBeenLastCalledWith(false)
  fireEvent.change(gross, { target: { value: '50' } })
  fireEvent.blur(gross)
  expect(commit).toHaveBeenCalledWith('100')
  expect(valid).toHaveBeenLastCalledWith(true)
})
it('clearing either field restores both inheritance placeholders without turning blank into zero', () => {
  const changed = vi.fn()
  render(<Harness changed={changed} />)
  fireEvent.change(screen.getByLabelText('Gross margin (%)'), { target: { value: '' } })
  expect(screen.getByLabelText('Markup (%)')).toHaveValue('')
  expect(screen.getByLabelText('Markup (%)')).toHaveAttribute('placeholder', '200')
  expect(screen.getByLabelText('Gross margin (%)')).toHaveAttribute('placeholder', '66.6667')
  expect(changed).toHaveBeenLastCalledWith('')
})
it('respects external value updates and shows a manual loss without an editable validation error', () => {
  const props = { onChange: vi.fn(), onCommit: vi.fn(), onValidityChange: vi.fn() }
  const { rerender } = render(<MarkupMarginFields value="100" {...props} />)
  rerender(<MarkupMarginFields value="200" {...props} />)
  expect(screen.getByLabelText('Gross margin (%)')).toHaveValue('66.6667')
  rerender(<MarkupMarginFields value="-50" readOnly {...props} />)
  expect(screen.getByLabelText('Gross margin (%)')).toHaveValue('-100')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.blur(screen.getByLabelText('Markup (%)'))
  expect(props.onCommit).not.toHaveBeenCalled()
  rerender(<MarkupMarginFields value="-100" readOnly {...props} />)
  expect(screen.getByText(/unavailable when the selling price is zero/)).toBeInTheDocument()
})
it('shows the actual manual price calculation instead of the automatic markup price', () => {
  render(<PricingRelationship landedCostCents={2000} priceCents={5000} markupPct={100} />)
  expect(screen.getByText(/\$50.00 price − \$20.00 cost = \$30.00 gross profit/)).toBeInTheDocument()
  expect(screen.getByText(/60% gross margin/)).toBeInTheDocument()
})

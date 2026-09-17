import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import CartItemTitle from '@/components/shared/CartItemTitle'

afterEach(cleanup)
it('separates the exact-size suffix into a small second line and preserves unrelated legacy titles', () => {
  const title = 'Sunrise — Medium — 16 × 20 in (actual cropped size: 15.85 × 20 in)'
  const { rerender, container } = render(<CartItemTitle title={title} />)
  expect(screen.getByText('Sunrise — Medium — 16 × 20 in')).toHaveClass('block')
  expect(screen.getByText('(actual cropped size: 15.85 × 20 in)')).toHaveClass('block', 'text-[9px]', 'whitespace-normal')
  const legacy = 'Sunrise — 15.85 × 20 in (signed edition)'
  rerender(<CartItemTitle title={legacy} />)
  expect(container.textContent).toBe(legacy)
  expect(container.querySelector('span')).toBeNull()
})

describe('a configured print line', () => {
  it('shows the choices that make it its own line, with the finish named once', () => {
    render(
      <CartItemTitle
        title="Drayton Hall — 11 × 14 in"
        selection={{ summary: '1.25 in Oak frame · 2 in White mat', subcategoryLabel: '1.25 in Oak frame' }}
      />,
    )
    expect(screen.getByText('1.25 in Oak frame · 2 in White mat')).toBeInTheDocument()
  })

  it('prepends the finish when the summary does not already carry it', () => {
    render(
      <CartItemTitle
        title="Drayton Hall — 11 × 14 in"
        selection={{ summary: 'Mirror Wrap', subcategoryLabel: '1.25 in Stretched Canvas' }}
      />,
    )
    expect(screen.getByText('1.25 in Stretched Canvas · Mirror Wrap')).toBeInTheDocument()
  })

  it('adds nothing for a legacy line that carries no selection', () => {
    const { container } = render(<CartItemTitle title="Drayton Hall — Original" />)
    expect(container.textContent).toBe('Drayton Hall — Original')
    expect(container.querySelector('span')).toBeNull()
  })
})

import { afterEach, expect, it } from 'vitest'
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

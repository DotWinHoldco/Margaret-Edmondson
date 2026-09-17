// Authored by DotWin
//
// The preview's job is SCALE (plan ADR-6): every inch on screen is the same number of
// pixels, so a 3 inch mat looks like more than a 2 inch mat instead of being described
// as one. The arithmetic is proved directly, and the render is proved by the layers it
// paints and the colours it paints them.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import FramePreview, { previewLayout } from '@/components/shop/PrintConfigurator/FramePreview'

afterEach(cleanup)

describe('previewLayout', () => {
  it('grows the piece by the mat and the frame face on every side', () => {
    const layout = previewLayout({ printW: 8, printH: 10, matIn: 2, faceIn: 0.75, containerPx: 400 })

    expect(layout.outerWidthIn).toBe(13.5)
    expect(layout.outerHeightIn).toBe(15.5)
  })

  it('fills 90% of the width it is given, and scales every box by the same number', () => {
    const layout = previewLayout({ printW: 8, printH: 10, matIn: 2, faceIn: 0.75, containerPx: 400 })

    expect(layout.outer.widthPx).toBeCloseTo(360, 6)
    expect(layout.scale).toBeCloseTo(360 / 13.5, 6)
    expect(layout.outer.heightPx).toBeCloseTo(15.5 * layout.scale, 6)
    expect(layout.mat.widthPx).toBeCloseTo(12 * layout.scale, 6)
    expect(layout.mat.heightPx).toBeCloseTo(14 * layout.scale, 6)
    expect(layout.art.widthPx).toBeCloseTo(8 * layout.scale, 6)
    expect(layout.art.heightPx).toBeCloseTo(10 * layout.scale, 6)
    expect(layout.matPx).toBeCloseTo(2 * layout.scale, 6)
    expect(layout.facePx).toBeCloseTo(0.75 * layout.scale, 6)
  })

  it('draws a wider mat bigger than a narrower one at the same print size', () => {
    const two = previewLayout({ printW: 8, printH: 10, matIn: 2, faceIn: 0.75, containerPx: 400 })
    const three = previewLayout({ printW: 8, printH: 10, matIn: 3, faceIn: 0.75, containerPx: 400 })

    expect(three.outerWidthIn).toBeGreaterThan(two.outerWidthIn)
    // Both are drawn to the same 90% of the container, so the ARTWORK shrinks inside
    // the bigger mat rather than the whole piece growing off the panel.
    expect(three.art.widthPx).toBeLessThan(two.art.widthPx)
    expect(three.matPx).toBeGreaterThan(two.matPx)
  })

  it('has no scale and no boxes when there is nothing to draw into', () => {
    const layout = previewLayout({ printW: 8, printH: 10, matIn: 0, faceIn: 0, containerPx: 0 })
    expect(layout.scale).toBe(0)
    expect(layout.outer.widthPx).toBe(0)
  })

  it('treats a missing mat or face as zero rather than NaN', () => {
    const layout = previewLayout({
      printW: 11,
      printH: 14,
      matIn: Number.NaN,
      faceIn: -3,
      containerPx: 400,
    })
    expect(layout.outerWidthIn).toBe(11)
    expect(layout.outerHeightIn).toBe(14)
  })
})

describe('FramePreview', () => {
  function renderPreview(over: Partial<React.ComponentProps<typeof FramePreview>> = {}) {
    return render(
      <FramePreview
        imageUrl="https://example.test/art.jpg"
        imageAlt="Drayton Hall"
        printW={8}
        printH={10}
        matIn={2}
        faceIn={0.75}
        frameColor="#4a2f18"
        matColor="#f4efe6"
        edgeHint="none"
        containerPx={400}
        {...over}
      />,
    )
  }

  it('paints the frame and the mat in the colours the chosen options carry', () => {
    renderPreview()

    const frame = screen.getByTestId('frame-preview-frame')
    const mat = screen.getByTestId('frame-preview-mat')
    expect(frame).toHaveStyle({ backgroundColor: '#4a2f18' })
    expect(mat).toHaveStyle({ backgroundColor: '#f4efe6' })
  })

  it('sizes the frame from the same layout the arithmetic produces', () => {
    renderPreview()

    const layout = previewLayout({ printW: 8, printH: 10, matIn: 2, faceIn: 0.75, containerPx: 400 })
    expect(screen.getByTestId('frame-preview-frame')).toHaveStyle({
      width: `${layout.outer.widthPx}px`,
      height: `${layout.outer.heightPx}px`,
    })
  })

  it('says how big the piece is on the wall', () => {
    renderPreview()
    expect(screen.getByText(/About 13.5 × 15.5 in on the wall/)).toBeInTheDocument()
  })

  it('shows the artwork itself, labelled', () => {
    renderPreview()
    expect(screen.getByAltText('Drayton Hall')).toHaveAttribute('src', 'https://example.test/art.jpg')
  })

  it('hints a wrapped canvas edge only when there is no mat, and uses the solid colour when one was chosen', () => {
    const { rerender } = renderPreview({ matIn: 0, edgeHint: 'solid', solidHex: '#1a1a1a' })
    expect(screen.getByTestId('frame-preview-edge-right')).toHaveStyle({ backgroundColor: '#1a1a1a' })

    rerender(
      <FramePreview
        imageUrl="https://example.test/art.jpg"
        imageAlt="Drayton Hall"
        printW={8}
        printH={10}
        matIn={2}
        faceIn={0.75}
        frameColor="#4a2f18"
        matColor="#f4efe6"
        edgeHint="solid"
        solidHex="#1a1a1a"
        containerPx={400}
      />,
    )
    expect(screen.queryByTestId('frame-preview-edge-right')).toBeNull()
  })
})

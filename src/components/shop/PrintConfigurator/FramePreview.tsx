'use client'

// Authored by DotWin
// The layered preview (plan ADR-6). No mockup service exists for this provider, so the
// picture a shopper sees is composited here, back to front: wall, frame face, mat, the
// artwork's own web image, and for a wrapped canvas a hint of its edge.
//
// The point of it is SCALE. Every inch on screen is the same number of pixels, so an
// 8 by 10 with a 3 inch mat is visibly bigger than the same print with a 2 inch mat,
// and a shopper can see what they are buying rather than read it. The arithmetic is
// `previewLayout`, a pure function, so the thing that decides the picture is testable
// on its own.

import { useEffect, useRef, useState } from 'react'

export interface PreviewInput {
  /** Print size in inches (the artwork itself, never the glass). */
  printW: number
  printH: number
  /** Mat width per side, inches. 0 when there is no mat. */
  matIn: number
  /** Frame face width per side, inches. 0 when the finish has no frame. */
  faceIn: number
  /** Width available to draw into, pixels. */
  containerPx: number
}

export interface PreviewBox {
  widthPx: number
  heightPx: number
}

export interface PreviewLayout {
  /** Pixels per inch: ONE scale for every layer, which is what makes it true to scale. */
  scale: number
  outerWidthIn: number
  outerHeightIn: number
  /** Frame outside edge. */
  outer: PreviewBox
  /** Glass: the print plus the mat, inside the frame face. */
  mat: PreviewBox
  /** The artwork. */
  art: PreviewBox
  matPx: number
  facePx: number
}

/** How much of the available width the framed piece may fill. */
const FILL = 0.9

/**
 * Px boxes for one configuration. The outer size is the print plus the mat on both
 * sides plus the frame face on both sides, and the scale is whatever makes that outer
 * size fill 90% of the width it was given.
 */
export function previewLayout({ printW, printH, matIn, faceIn, containerPx }: PreviewInput): PreviewLayout {
  const w = Math.max(0, Number(printW) || 0)
  const h = Math.max(0, Number(printH) || 0)
  const mat = Math.max(0, Number(matIn) || 0)
  const face = Math.max(0, Number(faceIn) || 0)
  const outerWidthIn = w + 2 * mat + 2 * face
  const outerHeightIn = h + 2 * mat + 2 * face
  const available = Math.max(0, Number(containerPx) || 0)
  const scale = outerWidthIn > 0 && available > 0 ? (available * FILL) / outerWidthIn : 0
  return {
    scale,
    outerWidthIn,
    outerHeightIn,
    outer: { widthPx: outerWidthIn * scale, heightPx: outerHeightIn * scale },
    mat: { widthPx: (w + 2 * mat) * scale, heightPx: (h + 2 * mat) * scale },
    art: { widthPx: w * scale, heightPx: h * scale },
    matPx: mat * scale,
    facePx: face * scale,
  }
}

/** 13.5 -> "13.5", 14 -> "14". */
function inches(value: number): string {
  return Number(value.toFixed(2)).toString()
}

export type EdgeHint = 'mirror' | 'solid' | 'none'

export interface FramePreviewProps {
  imageUrl: string
  imageAlt: string
  printW: number
  printH: number
  matIn: number
  faceIn: number
  /** Frame face colour; the frame option's swatch, else a neutral dark wood. */
  frameColor: string
  /** A photographic frame corner the operator uploaded, tiled along the face. */
  frameImage?: string | null
  matColor: string
  edgeHint: EdgeHint
  /** The wrap colour when the shopper picked a solid colour wrap. */
  solidHex?: string | null
  /** Only for tests and for the first paint, before the element has been measured. */
  containerPx?: number
}

const DEFAULT_CONTAINER_PX = 420
const DEFAULT_FRAME_COLOR = '#3b2f2f'
const DEFAULT_MAT_COLOR = '#ffffff'

/**
 * A swatch image path we will put inside a CSS url(): site-relative or a Supabase
 * public-storage URL, with no quote, paren, backslash or whitespace. The database
 * CHECK enforces the same shape; this is the client's own refusal for anything else.
 */
const RENDERABLE_IMAGE_PATH = /^(\/[^\s"'()\\]{1,511}|https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[^\s"'()\\]{1,400})$/
export function renderableImagePath(value: string | null | undefined): string | null {
  return typeof value === 'string' && RENDERABLE_IMAGE_PATH.test(value) ? value : null
}

export default function FramePreview({
  imageUrl,
  imageAlt,
  printW,
  printH,
  matIn,
  faceIn,
  frameColor,
  frameImage: frameImageProp,
  matColor,
  edgeHint,
  solidHex,
  containerPx,
}: FramePreviewProps) {
  const frameImage = renderableImagePath(frameImageProp)
  const host = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<number | null>(null)

  useEffect(() => {
    function measure() {
      const width = host.current?.clientWidth ?? 0
      if (width > 0) setMeasured(width)
    }
    measure()
    window.addEventListener('resize', measure)
  return () => window.removeEventListener('resize', measure)
  }, [])

  const available = containerPx ?? measured ?? DEFAULT_CONTAINER_PX
  const layout = previewLayout({ printW, printH, matIn, faceIn, containerPx: available })
  const face = frameColor || DEFAULT_FRAME_COLOR
  const mat = matColor || DEFAULT_MAT_COLOR
  const edgeColor = edgeHint === 'solid' ? solidHex || face : '#d9d4cc'
  const edgePx = Math.max(2, Math.min(10, layout.scale * 0.5))

  return (
    <div ref={host} className="w-full">
      <div
        className="flex items-center justify-center rounded-sm bg-gradient-to-b from-[#f3efe8] to-[#e7e1d7] py-6"
        data-testid="frame-preview-wall"
      >
        <div
          data-testid="frame-preview-frame"
          className="relative shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
          style={{
            width: `${layout.outer.widthPx}px`,
            height: `${layout.outer.heightPx}px`,
            backgroundColor: face,
            ...(frameImage
              ? { backgroundImage: `url("${frameImage}")`, backgroundRepeat: 'repeat', backgroundSize: 'auto' }
              : {}),
            padding: `${layout.facePx}px`,
          }}
        >
          <div
            data-testid="frame-preview-mat"
            className="relative flex h-full w-full items-center justify-center"
            style={{ backgroundColor: layout.matPx > 0 ? mat : 'transparent', padding: `${layout.matPx}px` }}
          >
            <div className="relative h-full w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={imageAlt}
                className="h-full w-full object-cover"
                style={{ display: 'block' }}
              />
              {edgeHint !== 'none' && layout.matPx === 0 && (
                <>
                  <span
                    aria-hidden="true"
                    data-testid="frame-preview-edge-right"
                    className="absolute right-0 top-0 h-full"
                    style={{
                      width: `${edgePx}px`,
                      ...(edgeHint === 'mirror'
                        ? {
                            backgroundImage: `url("${imageUrl}")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'right center',
                            transform: 'scaleX(-1)',
                            filter: 'blur(1.5px) brightness(0.9)',
                          }
                        : { backgroundColor: edgeColor }),
                    }}
                  />
                  <span
                    aria-hidden="true"
                    data-testid="frame-preview-edge-bottom"
                    className="absolute bottom-0 left-0 w-full"
                    style={{
                      height: `${edgePx}px`,
                      ...(edgeHint === 'mirror'
                        ? {
                            backgroundImage: `url("${imageUrl}")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center bottom',
                            transform: 'scaleY(-1)',
                            filter: 'blur(1.5px) brightness(0.85)',
                          }
                        : { backgroundColor: edgeColor }),
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center font-body text-xs text-charcoal/55">
        About {inches(layout.outerWidthIn)} &times; {inches(layout.outerHeightIn)} in on the wall
      </p>
    </div>
  )
}

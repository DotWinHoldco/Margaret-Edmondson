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

import { useEffect, useId, useRef, useState } from 'react'
import { frameMaterial, frameProfileStops, shadeFrame } from './frame-material'
import { photoSlices, providerFramePhoto } from './frame-photo'

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
  /** Air between a floating canvas and its frame, per side. */
  gapIn?: number
  /** Optional height budget for tall artwork. */
  maxHeightPx?: number
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
  gapPx: number
}

/** How much of the available width the framed piece may fill. */
const FILL = 0.9

/**
 * Px boxes for one configuration. The outer size is the print plus the mat on both
 * sides plus the frame face on both sides, and the scale is whatever makes that outer
 * size fill 90% of the width it was given.
 */
export function previewLayout({ printW, printH, matIn, faceIn, containerPx, gapIn = 0, maxHeightPx }: PreviewInput): PreviewLayout {
  const w = Math.max(0, Number(printW) || 0)
  const h = Math.max(0, Number(printH) || 0)
  const mat = Math.max(0, Number(matIn) || 0)
  const face = Math.max(0, Number(faceIn) || 0)
  const gap = face > 0 ? Math.max(0, Number(gapIn) || 0) : 0
  const outerWidthIn = w + 2 * mat + 2 * face + 2 * gap
  const outerHeightIn = h + 2 * mat + 2 * face + 2 * gap
  const available = Math.max(0, Number(containerPx) || 0)
  const widthScale = outerWidthIn > 0 && available > 0 ? (available * FILL) / outerWidthIn : 0
  const heightScale = maxHeightPx && maxHeightPx > 0 && outerHeightIn > 0 ? maxHeightPx / outerHeightIn : widthScale
  const scale = Math.min(widthScale, heightScale)
  return {
    scale,
    outerWidthIn,
    outerHeightIn,
    outer: { widthPx: outerWidthIn * scale, heightPx: outerHeightIn * scale },
    mat: { widthPx: (w + 2 * mat) * scale, heightPx: (h + 2 * mat) * scale },
    art: { widthPx: w * scale, heightPx: h * scale },
    matPx: mat * scale,
    facePx: face * scale,
    gapPx: gap * scale,
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
  /** The exact selected provider profile/finish name. */
  frameLabel?: string
  frameMedium?: 'framed_canvas' | 'framed_fine_art_paper'
  /** Profile depth in inches, separate from its visible face width. */
  depthIn?: number
  floatingCanvas?: boolean
  gapIn?: number
  /** A provider measurement is unavailable; do not imply an exact outside size. */
  geometryEstimated?: boolean
  matColor: string
  paperBorderIn?: number
  matCoreColor?: string | null
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

/** Four trapezoidal rails meet at actual 45° mitres; grain follows each rail. */
function FrameRails({ width, height, face, label, color, image, prefix }: {
  width: number; height: number; face: number; label: string; color: string; image: string | null; prefix: string
}) {
  const material = frameMaterial(label, color)
  const stops = frameProfileStops(material.profile)
  const rails = [
    { side: 'top', points: `0,0 ${width},0 ${width-face},${face} ${face},${face}`, gradient: 'top', texture: 'horizontal' },
    { side: 'right', points: `${width},0 ${width},${height} ${width-face},${height-face} ${width-face},${face}`, gradient: 'right', texture: 'vertical' },
    { side: 'bottom', points: `${width},${height} 0,${height} ${face},${height-face} ${width-face},${height-face}`, gradient: 'bottom', texture: 'horizontal' },
    { side: 'left', points: `0,${height} 0,0 ${face},${face} ${face},${height-face}`, gradient: 'left', texture: 'vertical' },
  ]
  const gradients = [
    { id: 'top', x1: 0, y1: 0, x2: 0, y2: face, light: 0.055 },
    { id: 'bottom', x1: 0, y1: height, x2: 0, y2: height-face, light: -0.085 },
    { id: 'left', x1: 0, y1: 0, x2: face, y2: 0, light: 0.02 },
    { id: 'right', x1: width, y1: 0, x2: width-face, y2: 0, light: -0.05 },
  ]
  return <svg aria-hidden="true" data-testid="frame-preview-rails" data-material={material.kind} data-profile={material.profile}
    viewBox={`0 0 ${width} ${height}`} className="pointer-events-none absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
    <defs>
      {gradients.map(g => <linearGradient key={g.id} id={`${prefix}-${g.id}`} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
        {stops.map(([offset, tone]) => <stop key={offset} offset={offset} stopColor={shadeFrame(material.base, tone + g.light)} />)}
      </linearGradient>)}
      {['horizontal', 'vertical'].map(direction => <pattern key={direction} id={`${prefix}-${direction}`} width="190" height="38" patternUnits="userSpaceOnUse" patternTransform={direction === 'vertical' ? 'rotate(90)' : undefined}>
        {image ? <image href={image} width="190" height="38" preserveAspectRatio="xMidYMid slice" opacity="0.68" /> : <>
          {Array.from({ length: 13 }, (_, i) => {
            const y = i * 3.1
            const bend = material.kind === 'metallic' ? 0 : (i % 3 - 1) * 1.7
            return <path key={i} d={`M-4 ${y} C42 ${y+bend} 71 ${y-bend} 107 ${y+0.4} S155 ${y+bend} 194 ${y}`} fill="none" stroke={i % 3 === 0 ? '#ffffff' : '#1d140d'} strokeWidth={material.kind === 'weathered' && i % 4 === 0 ? 1.05 : 0.45} />
          })}
          {(material.kind === 'wood' || material.kind === 'weathered') && <path d="M-10 10 C25 4 44 13 92 9 S158 4 201 9 M-10 23 C45 18 64 28 119 23 S175 17 201 23" fill="none" stroke="#27170c" strokeWidth="0.6" />}
        </>}
      </pattern>)}
    </defs>
    {rails.map(rail => <g key={rail.side} data-frame-rail={rail.side}>
      <polygon points={rail.points} fill={`url(#${prefix}-${rail.gradient})`} />
      <polygon points={rail.points} fill={`url(#${prefix}-${rail.texture})`} opacity={image ? 0.6 : material.grainOpacity} />
    </g>)}
    {material.accent && material.accentInsets.map(inset => <rect key={inset} x={face*inset} y={face*inset} width={width-face*inset*2} height={height-face*inset*2} fill="none" stroke={material.accent!} strokeWidth={Math.max(0.7, face*0.05)} />)}
    <rect x="0.4" y="0.4" width={Math.max(0,width-0.8)} height={Math.max(0,height-0.8)} fill="none" stroke="#ffffff" strokeOpacity="0.21" strokeWidth="0.6" />
    <rect x={face} y={face} width={Math.max(0,width-face*2)} height={Math.max(0,height-face*2)} fill="none" stroke="#15110e" strokeOpacity="0.5" strokeWidth="0.85" />
    {[[0,0,face,face], [width,0,width-face,face], [width,height,width-face,height-face], [0,height,face,height-face]].map((p,i) => <line key={i} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} stroke="#17120e" strokeOpacity="0.28" strokeWidth="0.65" />)}
  </svg>
}

export default function FramePreview({
  imageUrl, imageAlt, printW, printH, matIn, faceIn, frameColor,
  frameImage: frameImageProp, frameLabel = '', frameMedium, depthIn = 0.875,
  floatingCanvas = false, gapIn = 0.25, geometryEstimated = false, matColor, matCoreColor, paperBorderIn = 0, edgeHint, solidHex, containerPx,
}: FramePreviewProps) {
  const frameImage = renderableImagePath(frameImageProp)
  const framePhoto = providerFramePhoto(frameLabel, frameMedium, floatingCanvas)
  const prefix = `frame-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const host = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<number | null>(null)

  useEffect(() => {
    const element = host.current
    function measure() {
      const width = element?.clientWidth ?? 0
      if (width > 0) setMeasured(width)
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (element) observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  const available = containerPx ?? measured ?? DEFAULT_CONTAINER_PX
  const layout = previewLayout({ printW, printH, matIn: floatingCanvas ? 0 : matIn, faceIn,
    gapIn: floatingCanvas ? gapIn : 0, containerPx: available, maxHeightPx: Math.min(560, available * 1.35) })
  const face = frameColor || DEFAULT_FRAME_COLOR
  const mat = matColor || DEFAULT_MAT_COLOR
  const framed = layout.facePx > 0
  const depthPx = framed || edgeHint !== 'none' ? Math.max(0, Number(depthIn) || 0) * layout.scale : 0
  const reliefPx = Math.min(12, depthPx * 0.24)
  const edgeColor = edgeHint === 'solid' ? solidHex || face : '#b3aaa0'
  const edgePx = Math.max(1, Math.min(7, depthPx * 0.13, floatingCanvas ? layout.gapPx * 0.55 : 7))
  const openingInset = layout.facePx + layout.gapPx
  const artInset = openingInset + layout.matPx

  return (
    <div ref={host} className="w-full" data-testid="frame-preview" data-frame-label={frameLabel || undefined}>
      <div className="relative flex w-full items-center justify-center overflow-hidden rounded-sm py-8"
        data-testid="frame-preview-wall"
        style={{ paddingLeft: '4%', paddingRight: '4%', background: 'radial-gradient(ellipse at 27% 14%, #f5f5f2 0%, #e9e9e4 56%, #dbdcd5 100%)' }}>
        <div data-testid="frame-preview-frame" className="relative shrink-0"
          style={{ width: `${layout.outer.widthPx}px`, height: `${layout.outer.heightPx}px`, backgroundColor: framed && !framePhoto ? face : 'transparent',
            boxShadow: `${reliefPx*0.45}px ${reliefPx*0.7}px 0 ${shadeFrame(face,-0.32)}, ${reliefPx+3}px ${reliefPx+7}px ${Math.max(12,depthPx*0.85)}px rgba(30,26,22,0.23), 0 2px 3px rgba(30,26,22,0.18)` }}>
          {floatingCanvas && framed && <div data-testid="frame-preview-floating-gap" className="absolute" style={{ inset: `${layout.facePx}px`, background: '#28251f', boxShadow: 'inset 2px 3px 5px #000000a6' }} />}
          <div data-testid="frame-preview-mat" className="absolute"
            style={{ inset: `${openingInset}px`, backgroundColor: layout.matPx > 0 ? mat : 'transparent',
              ...(layout.matPx > 0 ? { backgroundImage: 'linear-gradient(135deg, #ffffff0a, #00000007)', boxShadow: 'inset 1px 2px 4px #00000038, inset -1px -1px 2px #00000012' } : {}) }} />
          <div data-testid="frame-preview-art" className="absolute" style={{ inset: `${artInset}px`, background: '#f8f8f5', ...(matCoreColor && matIn > 0 ? { outline: `2px solid ${matCoreColor}` } : {}),
            boxShadow: layout.matPx > 0 ? '0 0 0 1px #d3d0c8, -1px -1px 0 2px #ffffffb8, 1px 1px 0 2px #8a867d75' : floatingCanvas ? '2px 3px 3px #0000009c' : undefined }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={imageAlt} className="h-full w-full object-contain" style={{ display: 'block', objectFit: 'contain', ...(paperBorderIn > 0 ? { backgroundColor: '#ffffff', padding: `${paperBorderIn * layout.scale}px` } : {}) }} />
            {framed && !floatingCanvas && <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 1px 2px 3px #00000020' }} />}
            {edgeHint !== 'none' && layout.matPx === 0 && <>
              <span aria-hidden="true" data-testid="frame-preview-edge-right" className="absolute top-0 h-full" style={{ left: '100%', width: `${edgePx}px`, transform: 'skewY(35deg)', transformOrigin: 'left top',
                ...(edgeHint === 'mirror' ? { backgroundImage: `url("${imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'right center', filter: 'brightness(0.67)' } : { backgroundColor: edgeColor }) }} />
              <span aria-hidden="true" data-testid="frame-preview-edge-bottom" className="absolute left-0 w-full" style={{ top: '100%', height: `${edgePx}px`, transform: 'skewX(55deg)', transformOrigin: 'left top',
                ...(edgeHint === 'mirror' ? { backgroundImage: `url("${imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center bottom', filter: 'brightness(0.59)' } : { backgroundColor: edgeColor }) }} />
            </>}
          </div>
          {framed && (framePhoto
            ? <div aria-hidden="true" data-testid="frame-preview-photo" data-provider-asset={framePhoto.key}
                className="pointer-events-none absolute inset-0"
                style={{ borderStyle: 'solid', borderColor: 'transparent', borderWidth: `${openingInset}px`,
                  borderImageSource: `url("${framePhoto.src}")`, borderImageSlice: photoSlices(framePhoto),
                  borderImageWidth: `${openingInset}px`, borderImageRepeat: 'stretch' }} />
            : <FrameRails width={layout.outer.widthPx} height={layout.outer.heightPx} face={layout.facePx} color={face} image={frameImage} label={frameLabel} prefix={prefix} />)}
        </div>
      </div>
      <p className="mt-2 text-center font-body text-xs text-charcoal/55">{geometryEstimated
        ? <>{inches(printW)} &times; {inches(printH)} in artwork{floatingCanvas ? ' · Floating gap shown approximately' : ''}</>
        : <>About {inches(layout.outerWidthIn)} &times; {inches(layout.outerHeightIn)} in on the wall</>}</p>
      {framed && <p className="mt-1 text-center font-body text-[11px] text-charcoal/55">This mockup gives you an idea of your selected frame. Your finished artwork will be custom framed to fit the dimensions of your piece.</p>}
    </div>
  )
}

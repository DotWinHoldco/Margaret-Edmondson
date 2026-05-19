'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'

interface AdaptiveArtworkProps {
  src: string
  alt: string
  /** 'morph' = container matches image aspect ratio (default). 'fill' = edge-color sampling fills gaps. */
  mode?: 'morph' | 'fill'
  /** Max height constraint (e.g. '70vh', '500px'). Container won't exceed this. */
  maxHeight?: string
  /** Additional className on the outer container */
  className?: string
  /** Additional className on the image itself */
  imageClassName?: string
  /** Whether to use Next.js Image (with width/height) or regular img */
  priority?: boolean
  /** Click handler */
  onClick?: () => void
  /** Sizes hint for Next.js Image */
  sizes?: string
  /** Quality for Next.js Image */
  quality?: number
  /** Inner padding between image and container edge (e.g. '4px', '8px'). Useful when container has a border/frame. */
  padding?: string
}

/**
 * AdaptiveArtwork — an image component that respects artwork aspect ratios.
 *
 * 'morph' mode: Container adapts its aspect-ratio to match the image exactly.
 *               No empty space. The image IS the container.
 *
 * 'fill' mode:  Container can be any size. Samples the edge colors of the image
 *               and fills remaining space with that color so the art "floats"
 *               on a matching background. Great for uniform grids.
 */
export default function AdaptiveArtwork({
  src,
  alt,
  mode = 'morph',
  maxHeight,
  className = '',
  imageClassName = '',
  priority = false,
  onClick,
  sizes,
  quality = 85,
  padding,
}: AdaptiveArtworkProps) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [edgeColor, setEdgeColor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleLoad = useCallback(
    (naturalWidth: number, naturalHeight: number, imgElement?: HTMLImageElement) => {
      const ratio = naturalWidth / naturalHeight
      setAspectRatio(ratio)
      setLoaded(true)

      if (mode === 'fill' && imgElement && canvasRef.current) {
        // eslint-disable-next-line react-hooks/immutability -- function declaration hoisted; reference is stable
        sampleEdgeColor(imgElement, canvasRef.current)
      }
    },
    [mode]
  )

  function sampleEdgeColor(img: HTMLImageElement, canvas: HTMLCanvasElement) {
    try {
      const size = 100 // sample at small size for performance
      const w = size
      const h = Math.round(size / (img.naturalWidth / img.naturalHeight))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h).data

      // Sample pixels along all four edges
      const colors: number[][] = []
      for (let x = 0; x < w; x++) {
        // Top edge
        const tIdx = (0 * w + x) * 4
        colors.push([data[tIdx], data[tIdx + 1], data[tIdx + 2]])
        // Bottom edge
        const bIdx = ((h - 1) * w + x) * 4
        colors.push([data[bIdx], data[bIdx + 1], data[bIdx + 2]])
      }
      for (let y = 0; y < h; y++) {
        // Left edge
        const lIdx = (y * w + 0) * 4
        colors.push([data[lIdx], data[lIdx + 1], data[lIdx + 2]])
        // Right edge
        const rIdx = (y * w + (w - 1)) * 4
        colors.push([data[rIdx], data[rIdx + 1], data[rIdx + 2]])
      }

      // Average the edge colors
      const avg = colors.reduce(
        (acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]],
        [0, 0, 0]
      )
      const n = colors.length
      const r = Math.round(avg[0] / n)
      const g = Math.round(avg[1] / n)
      const b = Math.round(avg[2] / n)
      setEdgeColor(`rgb(${r},${g},${b})`)
    } catch {
      // Canvas tainted by CORS — fall back to cream
      setEdgeColor('#FAF7F2')
    }
  }

  if (mode === 'morph') {
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        style={{
          aspectRatio: aspectRatio ? `${aspectRatio}` : undefined,
          maxHeight: maxHeight || undefined,
          width: '100%',
          padding: padding || undefined,
        }}
        onClick={onClick}
      >
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-contain ${imageClassName}`}
          onLoad={(e) => {
            const img = e.currentTarget
            handleLoad(img.naturalWidth, img.naturalHeight)
          }}
        />
      </div>
    )
  }

  // 'fill' mode — edge color sampling
  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      style={{
        backgroundColor: edgeColor || '#FAF7F2',
        maxHeight: maxHeight || undefined,
        width: '100%',
        padding: padding || undefined,
      }}
      onClick={onClick}
    >
      <canvas ref={canvasRef} className="hidden" />
      <img
        src={src}
        alt={alt}
        className={`max-w-full max-h-full object-contain ${imageClassName}`}
        style={{ maxHeight: maxHeight || undefined }}
        onLoad={(e) => {
          const img = e.currentTarget
          handleLoad(img.naturalWidth, img.naturalHeight, img)
        }}
        crossOrigin="anonymous"
      />
    </div>
  )
}

/**
 * AdaptiveArtworkGrid — a grid card variant that maintains uniform card heights
 * while sampling edge colors for seamless backgrounds.
 */
export function AdaptiveArtworkCard({
  src,
  alt,
  href,
  className = '',
  aspectRatio = '4/5',
}: {
  src: string
  alt: string
  href?: string
  className?: string
  /** Container aspect ratio for the grid (e.g. '4/5', '1/1', '3/4'). Image will be contained within. */
  aspectRatio?: string
}) {
  const [edgeColor, setEdgeColor] = useState<string>('#FAF7F2')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    if (!canvasRef.current) return

    try {
      const size = 80
      const w = size
      const h = Math.round(size / (img.naturalWidth / img.naturalHeight))
      const canvas = canvasRef.current
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h).data

      const colors: number[][] = []
      for (let x = 0; x < w; x++) {
        const tIdx = (0 * w + x) * 4
        colors.push([data[tIdx], data[tIdx + 1], data[tIdx + 2]])
        const bIdx = ((h - 1) * w + x) * 4
        colors.push([data[bIdx], data[bIdx + 1], data[bIdx + 2]])
      }
      for (let y = 0; y < h; y++) {
        const lIdx = (y * w + 0) * 4
        colors.push([data[lIdx], data[lIdx + 1], data[lIdx + 2]])
        const rIdx = (y * w + (w - 1)) * 4
        colors.push([data[rIdx], data[rIdx + 1], data[rIdx + 2]])
      }

      const avg = colors.reduce(
        (acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]],
        [0, 0, 0]
      )
      const n = colors.length
      setEdgeColor(`rgb(${Math.round(avg[0] / n)},${Math.round(avg[1] / n)},${Math.round(avg[2] / n)})`)
    } catch {
      setEdgeColor('#FAF7F2')
    }
  }

  const inner = (
    <div
      className={`relative overflow-hidden rounded-sm ${className}`}
      style={{ aspectRatio, backgroundColor: edgeColor }}
    >
      <canvas ref={canvasRef} className="hidden" />
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
        onLoad={handleLoad}
        crossOrigin="anonymous"
      />
    </div>
  )

  if (href) {
    // Caller wraps with Link — just return the div
    return inner
  }

  return inner
}

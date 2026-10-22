import type { ComponentProps, CSSProperties } from 'react'
import type { CropRotation } from '@/lib/artwork/crop-geometry.mjs'

/** Keep the editor, finished crop and mat preview in the same rotated coordinate space. */
export default function OrientedCropImage({ rotation, aspect, style, className, ...image }: ComponentProps<'img'> & {
  rotation: CropRotation; aspect: number; style?: CSSProperties
}) {
  const quarterTurn = rotation % 180 !== 0
  return <div className={className} style={style}>
    {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
    <img {...image} className="absolute max-w-none" style={{
      left: '50%', top: '50%', width: `${quarterTurn ? 100 / aspect : 100}%`,
      height: `${quarterTurn ? 100 * aspect : 100}%`,
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    }} />
  </div>
}

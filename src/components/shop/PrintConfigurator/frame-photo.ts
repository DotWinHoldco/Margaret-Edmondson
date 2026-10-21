import manifest from '../../../../public/frames/lumaprints/manifest.json'
import { frameProfileForLabel } from '@/lib/catalog/frame-profile'

export interface ProviderFramePhoto {
  key: string
  family: string
  finish: string
  src: string
  width: number
  height: number
  opening: { x: number; y: number; width: number; height: number }
  profileMatch: string
}

function finishKey(label: string): string | null {
  const name = label.toLowerCase().replace(/grey/g, 'gray')
  // Specific moldings must never fall back to a generic frame of the same color.
  if (/vintage/.test(name)) return /copper/.test(name) ? 'vintage-copper' : null
  if (/concerto/.test(name)) return /black/.test(name) && /gold/.test(name) ? 'concerto-black-gold' : null
  if (/framer.?s choice/.test(name)) return /black/.test(name) && /gold/.test(name) ? 'framers-choice-black-gold' : null
  if (/slimwoods/.test(name)) return /silver/.test(name) ? 'slimwoods-black-silver'
    : /gold/.test(name) ? 'slimwoods-black-gold' : null
  if (/driftwood|barnwood/.test(name)) return /white/.test(name) ? 'barnwood-driftwood-white'
    : /gray/.test(name) ? 'barnwood-driftwood-gray' : null
  if (/plein air/.test(name)) return /espresso/.test(name) ? 'plein-air-espresso-gold'
    : /gold/.test(name) ? 'gold-plein-air' : null
  if (/natural\s+wood/.test(name)) return 'natural-wood'
  return ['walnut', 'maple', 'espresso', 'oak', 'black', 'white', 'gold', 'silver']
    .find(finish => new RegExp(`\\b${finish}\\b`).test(name)) ?? null
}

/** Match provider source names, never customer labels or order option identifiers. */
export function providerFramePhoto(label: string, medium: 'framed_canvas' | 'framed_fine_art_paper' | undefined, floating: boolean): ProviderFramePhoto | null {
  if (!medium) return null
  const decorative = /concerto|slimwoods|barnwood|driftwood|plein air|vintage|framer.?s choice/i.test(label)
  const family = medium === 'framed_canvas'
    ? floating ? 'canvas-floating' : decorative ? 'canvas-decorative' : 'canvas-gallery'
    : decorative ? 'paper-decorative' : 'paper-standard'
  const finish = finishKey(label)
  if (!finish) return null
  const assets = manifest.assets as ProviderFramePhoto[]
  // The source has a separate wider black gallery molding; retain that profile.
  const widthSpecific = finish === 'black' && frameProfileForLabel(label).faceIn === 1.625
    ? assets.find(asset => asset.key === `${family}-black-1.625`) : undefined
  return widthSpecific ?? assets.find(asset => asset.key === `${family}-${finish}`) ?? null
}

/** Image-pixel cuts retain each photographed corner; only the rail lengths stretch. */
export function photoSlices(photo: ProviderFramePhoto): string {
  const { x, y, width, height } = photo.opening
  return `${y} ${photo.width - x - width} ${photo.height - y - height} ${x}`
}

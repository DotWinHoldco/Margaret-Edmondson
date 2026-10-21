/** Visual interpretation of the selected provider finish, never a pricing rule. */
export interface FrameMaterial {
  kind: 'painted' | 'wood' | 'weathered' | 'metallic'
  profile: 'flat' | 'stepped' | 'beaded' | 'rounded' | 'ornate'
  base: string
  accent: string | null
  accentInsets: number[]
  grainOpacity: number
}

export function frameMaterial(label: string, color: string): FrameMaterial {
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color : '#342d27'
  const weathered = /driftwood|weathered/i.test(label)
  const metallic = /gold|silver|copper/i.test(label)
  const wood = /oak|walnut|maple|natural|espresso|wood/i.test(label)
  const accent = /black.*gold|espresso.*gold/i.test(label) ? '#c7a66a'
    : /black.*silver/i.test(label) ? '#bcbdb8' : null
  return {
    kind: weathered ? 'weathered' : metallic && !accent ? 'metallic' : wood || accent ? 'wood' : 'painted',
    profile: /vintage/i.test(label) ? 'ornate' : /framer.?s choice/i.test(label) ? 'rounded'
      : /slimwoods|driftwood|barnwood|espresso.*gold/i.test(label) ? 'stepped' : /plein air/i.test(label) ? 'beaded' : 'flat',
    base,
    accent,
    accentInsets: /concerto/i.test(label) ? [0.9] : /framer.?s choice/i.test(label) ? [0.08, 0.17, 0.9] : [0.12, 0.9],
    grainOpacity: weathered ? 0.27 : wood ? 0.15 : metallic ? 0.1 : 0.055,
  }
}

/** Blend actual swatch colour with light or shadow without inventing a finish. */
export function shadeFrame(hex: string, amount: number): string {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#342d27'
  const target = amount < 0 ? 0 : 255
  const factor = Math.min(1, Math.abs(amount))
  return `#${[1, 3, 5].map(start => {
    const channel = Number.parseInt(value.slice(start, start + 2), 16)
    return Math.round(channel + (target - channel) * factor).toString(16).padStart(2, '0')
  }).join('')}`
}

export function frameProfileStops(profile: FrameMaterial['profile']): Array<[number, number]> {
  if (profile === 'ornate') return [[0, -0.35], [0.05, 0.38], [0.12, -0.12], [0.2, 0.23], [0.29, -0.37], [0.39, -0.16], [0.66, 0.08], [0.78, -0.3], [0.87, 0.3], [0.94, 0.12], [1, -0.5]]
  if (profile === 'rounded') return [[0, -0.4], [0.06, 0.23], [0.13, -0.3], [0.22, 0.04], [0.38, 0.22], [0.58, 0.12], [0.78, -0.08], [0.88, -0.3], [0.95, 0.15], [1, -0.45]]
  if (profile === 'stepped') return [[0, -0.25], [0.04, 0.27], [0.13, 0.15], [0.19, -0.2], [0.23, -0.1], [0.8, -0.02], [0.92, -0.07], [0.97, 0.16], [1, -0.32]]
  if (profile === 'beaded') return [[0, -0.2], [0.04, 0.36], [0.09, -0.22], [0.15, 0.26], [0.21, -0.13], [0.27, 0.06], [0.76, -0.03], [0.82, -0.19], [0.9, 0.32], [0.95, 0.08], [1, -0.4]]
  return [[0, -0.24], [0.045, 0.32], [0.1, 0.12], [0.23, 0.02], [0.78, -0.025], [0.91, -0.12], [0.965, 0.16], [1, -0.38]]
}

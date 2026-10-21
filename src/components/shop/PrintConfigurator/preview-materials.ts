import type { StorefrontSubcategory } from '@/lib/catalog/storefront'
import { frameProfileForLabel } from '@/lib/catalog/frame-profile'
import { swatchForOption } from '@/lib/catalog/seed-rules'
import { chosenOption } from './catalog-view'

interface SelectedLabel {
  group_key: string
  option_label: string
}

/** Resolve only the visual materials; never modifies the quote or checkout selection. */
export function previewMaterials(
  subcategory: StorefrontSubcategory | undefined,
  optionIds: readonly number[],
  quotedLabels: readonly SelectedLabel[] = [],
) {
  const optionFor = (key: string) => {
    const group = subcategory?.groups.find((candidate) => candidate.group_key === key)
    return group ? chosenOption(group, optionIds) : null
  }
  const quoteLabel = (key: string) => quotedLabels.find((label) => label.group_key === key)?.option_label
  const frameOption = optionFor('frame_style')
  const frameLabel = frameOption?.frame_label ?? frameOption?.display_label ?? quoteLabel('frame_style')
    ?? subcategory?.frame_label ?? subcategory?.display_label ?? ''
  const framed = subcategory?.medium === 'framed_canvas' || subcategory?.medium === 'framed_fine_art_paper'
  const profile = frameProfileForLabel(frameLabel)
  const swatch = frameOption?.swatch ?? subcategory?.frame_swatch
    ?? swatchForOption('frame_style', frameLabel, subcategory?.frame_label ?? '')

  // Older seeds mistook the canvas-depth prefix for face width. Correct that known
  // pattern while retaining an operator's independently calibrated swatch values.
  const canvasPrefix = Number(frameLabel.match(/^(\d+(?:\.\d+)?)\s*in\b/i)?.[1])
  const oldCanvasSeed = subcategory?.medium === 'framed_canvas'
    && swatch?.frame_face_in === canvasPrefix && swatch?.frame_depth_in === undefined
  const faceIn = framed
    ? (oldCanvasSeed ? undefined : swatch?.frame_face_in) ?? profile.faceIn ?? 0.75
    : 0
  const depthIn = framed ? swatch?.frame_depth_in ?? profile.depthIn : undefined
  const floatingCanvas = subcategory?.medium === 'framed_canvas' && profile.floating
  // LumaPrints' diagrams dimension the molding but not the clearance. The visual
  // gap is illustrative; the renderer must not report it as an exact outside size.
  const gapIn = floatingCanvas ? profile.gapIn ?? 0.25 : 0
  const geometryEstimated = framed && (
    ((oldCanvasSeed ? undefined : swatch?.frame_face_in) ?? profile.faceIn) === undefined
    || (floatingCanvas && profile.gapIn === undefined)
  )
  const matOption = optionFor('mat_size')
  const matColorOption = optionFor('mat_color')
  const quotedMatSwatch = swatchForOption('mat_color', quoteLabel('mat_color') ?? '', '')

  return {
    frameLabel,
    faceIn,
    depthIn,
    floatingCanvas,
    gapIn,
    geometryEstimated,
    frameColor: swatch?.color_hex ?? '#3b2f2f',
    frameImage: swatch?.image_path ?? null,
    matIn: subcategory?.medium === 'framed_fine_art_paper' ? matOption?.geometry?.per_side_in ?? 0 : 0,
    matColor: matColorOption?.swatch?.color_hex ?? quotedMatSwatch?.color_hex ?? '#ffffff',
  }
}

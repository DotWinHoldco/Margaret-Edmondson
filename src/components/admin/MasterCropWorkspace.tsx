'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, errorMessage } from '@/lib/api/client'
import { planMasterCrop } from '@/lib/artwork/crop-geometry.mjs'
import { availableMatchingStandardSizes } from '@/lib/pricing/standard-print-sizes'
import PrintMatSettings from './PrintMatSettings'
import OrientedCropImage from './OrientedCropImage'
import type { CropRotation, NormalizedCropBox } from '@/lib/artwork/crop-geometry.mjs'
import type { MasterCropTarget } from './MasterCropModal'

export type CropOutput = { version: 1; fit: 'crop' | 'pad'; width_in: number; height_in: number }
type Box = { x: number; y: number; w: number; h: number }
export type CropDraft = { crop_box: NormalizedCropBox; crop_output: CropOutput | null; border_mode: 'full_bleed' | 'matte'; border_color: string; valid: boolean }
const FULL: Box = { x: 0, y: 0, w: 1, h: 1 }
const SIZES = [[8,8],[12,12],[16,16],[20,20],[24,24],[5,7],[8,10],[8.5,11],[11,14],[12,16],[16,20],[18,24],[20,24],[24,36]]
const number = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
const round = (n: number) => Math.round(n * 1e10) / 1e10
const normalized = (box: Box): Box => {
  const x = round(box.x), y = round(box.y)
  return { x, y, w: round(Math.min(1, round(box.x + box.w)) - x), h: round(Math.min(1, round(box.y + box.h)) - y) }
}
const fieldClass = 'w-full rounded-md border border-charcoal/20 bg-white px-2.5 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/50'

export default function MasterCropWorkspace({ master, initialAspectRatio, onDraftChange, productId }: {
  productId?: string; master: MasterCropTarget; initialAspectRatio?: number; onDraftChange: (draft: CropDraft, edited: boolean) => void
}) {
  const [baseSource, setSource] = useState(() => master.sourceWidthPx && master.sourceHeightPx ? { width: master.sourceWidthPx, height: master.sourceHeightPx } : null)
  const [rotation, setRotation] = useState<CropRotation>(master.crop_box?.rotation ?? 0)
  const orient = master.crop_box ? master.crop_box.orient === true : true
  const proxyUrl = `${master.proxyUrl}${master.proxyUrl.includes('?') ? '&' : '?'}orientation=${orient ? 'display' : 'raw'}`
  const source = useMemo(() => baseSource && (rotation % 180 ? { width: baseSource.height, height: baseSource.width } : baseSource), [baseSource, rotation])
  const [selectionBox, setSelection] = useState<Box>(master.crop_box ?? FULL)
  const [output, setOutput] = useState<CropOutput | null>(master.crop_output ?? null)
  const [legacyBorder, setLegacyBorder] = useState(master.border_mode ?? 'full_bleed')
  const [legacyColor, setLegacyColor] = useState(master.border_color ?? '#ffffff')
  const [loaded, setLoaded] = useState(false)
  const [previewDimensions, setPreviewDimensions] = useState<{ width: number; height: number } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [metadataError, setMetadataError] = useState('')
  const [metadataUrl, setMetadataUrl] = useState<string | null>(null)
  const metadataVerified = metadataUrl === proxyUrl
  const [edited, setEdited] = useState(false)
  const [grid, setGrid] = useState(true)
  const [ratioLocked, setRatioLocked] = useState(master.crop_output?.fit === 'crop')
  const [stageWidth, setStageWidth] = useState(620)
  const canvas = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; box: Box; mode: string } | null>(null)
  const seeded = useRef(false)

  // Fit the displayed box without discarding the wider selection. Switching to
  // white space can then retain it; dragging or editing commits the new box.
  const selection = useMemo(() => {
    if (!source || !ratioLocked || !output) return selectionBox
    try {
      const { extract } = planMasterCrop({ sourceWidth: source.width, sourceHeight: source.height, cropBox: normalized(selectionBox), output: { ...output, fit: 'crop' } })
      return { x: extract.left/source.width, y: extract.top/source.height, w: extract.width/source.width, h: extract.height/source.height }
    } catch {
      // The shared geometry validation below explains invalid target dimensions.
      return selectionBox
    }
  }, [source, selectionBox, output, ratioLocked])

  useEffect(() => {
    let active = true
    const separator = proxyUrl.includes('?') ? '&' : '?'
    apiFetch<{ width: number; height: number }>(`${proxyUrl}${separator}metadata=1`, { cache: 'no-store' })
      .then(data => {
        if (!active) return
        if (!(Number.isInteger(data?.width) && Number.isInteger(data?.height) && data.width > 0 && data.height > 0)) {
          setMetadataError('The original image dimensions could not be verified. Refresh the editor and try again.')
          return
        }
        setSource({ width: data.width, height: data.height }); setMetadataUrl(proxyUrl); setMetadataError('')
        if (initialAspectRatio && !seeded.current) {
          seeded.current = true
          const ratio = initialAspectRatio / (data.width / data.height)
          const w = Math.min(1, ratio), h = w/ratio
          setSelection({ x: (1-w)/2, y: (1-h)/2, w, h })
        }
      })
      .catch(err => { if (active) setMetadataError(errorMessage(err)) })
    return () => { active = false }
  }, [proxyUrl, initialAspectRatio])

  useEffect(() => {
    const element = viewport.current
    const measure = () => setStageWidth(Math.max(120, (element?.clientWidth || 668) - 48))
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (element) observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  const geometry = useMemo(() => {
    if (!source) return { plan: null, error: '' }
    try { return { plan: planMasterCrop({ sourceWidth: source.width, sourceHeight: source.height, cropBox: normalized(selection), output }), error: '' } }
    catch (err) { return { plan: null, error: err instanceof Error ? err.message : 'Check the crop and output dimensions.' } }
  }, [source, selection, output])
  const mismatch = Boolean(baseSource && previewDimensions && Math.abs((previewDimensions.width / previewDimensions.height) / (baseSource.width / baseSource.height) - 1) > 0.01)
  const valid = Boolean(loaded && source && metadataVerified && geometry.plan && !loadError && !metadataError && !mismatch)
  useEffect(() => {
    onDraftChange({ crop_box: { ...normalized(selection), rotation, orient }, crop_output: output, border_mode: output ? 'full_bleed' : legacyBorder, border_color: output ? '#ffffff' : legacyColor, valid }, edited)
  }, [selection, output, legacyBorder, legacyColor, valid, edited, rotation, orient, onDraftChange])

  function rotateSelection(direction: 90 | -90) {
    const b = selection
    setSelection(direction === 90 ? { x: 1-b.y-b.h, y: b.x, w: b.h, h: b.w } : { x: b.y, y: 1-b.x-b.w, w: b.h, h: b.w })
    setRotation(current => ((current + direction + 360) % 360) as CropRotation)
    if (output) setOutput({ ...output, width_in: output.height_in, height_in: output.width_in })
    setEdited(true)
  }
  function changeSelection(next: Box) { setSelection(next); setEdited(true) }
  function changeOutput(next: CropOutput | null) {
    if (next?.fit === 'crop') setRatioLocked(true)
    else if (!next || output?.fit !== 'pad') setRatioLocked(false)
    setOutput(next); setEdited(true)
  }
  function setPixels(key: 'left' | 'top' | 'width' | 'height', value: number) {
    if (!source || !geometry.plan || !Number.isFinite(value)) return
    const box = { ...geometry.plan.selection, [key]: Math.round(value) }
    if (ratioLocked && output && (key === 'width' || key === 'height')) {
      const ratio = output.width_in/output.height_in
      if (key === 'width') box.height = Math.round(box.width/ratio)
      else box.width = Math.round(box.height*ratio)
      const scale = Math.min(1, source.width/box.width, source.height/box.height)
      box.width = Math.round(box.width*scale); box.height = Math.round(box.height*scale)
    }
    box.width = Math.min(source.width, Math.max(1, box.width))
    box.height = Math.min(source.height, Math.max(1, box.height))
    box.left = Math.min(source.width - box.width, Math.max(0, box.left))
    box.top = Math.min(source.height - box.height, Math.max(0, box.top))
    changeSelection({ x: box.left/source.width, y: box.top/source.height, w: box.width/source.width, h: box.height/source.height })
  }
  function nudge(dx: number, dy: number) {
    if (!source || !geometry.plan) return
    const p = geometry.plan.selection
    changeSelection({ ...selection, x: Math.max(0, Math.min(source.width-p.width, p.left+dx))/source.width, y: Math.max(0, Math.min(source.height-p.height, p.top+dy))/source.height })
  }
  const startDrag = (mode: string) => (event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation()
    if (!source) return
    drag.current = { x: event.clientX, y: event.clientY, box: selection, mode }
    canvas.current?.setPointerCapture?.(event.pointerId)
  }
  function moveDrag(event: React.PointerEvent) {
    const state = drag.current, bounds = canvas.current?.getBoundingClientRect()
    if (!state || !bounds || !source) return
    const dx = (event.clientX-state.x)/bounds.width, dy = (event.clientY-state.y)/bounds.height
    const b = state.box
    if (state.mode === 'move') { changeSelection({ ...b, x: Math.max(0, Math.min(1-b.w, b.x+dx)), y: Math.max(0, Math.min(1-b.h, b.y+dy)) }); return }
    const left = state.mode.includes('w'), top = state.mode.includes('n')
    if (ratioLocked && output) {
      const ratio = (output.width_in/output.height_in)/(source.width/source.height)
      const anchorX = left ? b.x+b.w : b.x, anchorY = top ? b.y+b.h : b.y
      const widthFromX = b.w + (left ? -dx : dx)
      const widthFromY = (b.h + (top ? -dy : dy))*ratio
      const maxWidth = Math.min(left ? anchorX : 1-anchorX, (top ? anchorY : 1-anchorY)*ratio)
      const width = Math.min(maxWidth, Math.max(1/source.width, ratio/source.height, Math.abs(dx)>=Math.abs(dy*ratio) ? widthFromX : widthFromY))
      const height = width/ratio
      changeSelection({ x: left ? anchorX-width : anchorX, y: top ? anchorY-height : anchorY, w: width, h: height })
      return
    }
    const x1 = left ? Math.max(0, Math.min(b.x+b.w-1/source.width, b.x+dx)) : b.x
    const y1 = top ? Math.max(0, Math.min(b.y+b.h-1/source.height, b.y+dy)) : b.y
    const x2 = left ? b.x+b.w : Math.min(1, Math.max(b.x+1/source.width, b.x+b.w+dx))
    const y2 = top ? b.y+b.h : Math.min(1, Math.max(b.y+1/source.height, b.y+b.h+dy))
    changeSelection({ x: x1, y: y1, w: x2-x1, h: y2-y1 })
  }
  const onImageError = useCallback(async () => {
    setLoadError('The original master could not be loaded. Refresh the editor and try again.')
    try { await apiFetch(proxyUrl, { cache: 'no-store' }) } catch (err) { setLoadError(errorMessage(err)) }
  }, [proxyUrl])
  const aspect = source ? source.width/source.height : previewDimensions ? previewDimensions.width/previewDimensions.height : 1
  const displayWidth = Math.min(stageWidth, 560 * aspect)
  const plan = geometry.plan
  const selectionRatio = plan ? plan.selection.width/plan.selection.height : 1
  const closest = SIZES.reduce((best, size) => {
    const candidate = selectionRatio > 1 ? [size[1],size[0]] : size
    return Math.abs(Math.log(selectionRatio/(candidate[0]/candidate[1]))) < Math.abs(Math.log(selectionRatio/(best[0]/best[1]))) ? candidate : best
  }, [8,8])
  const formatRatio = (width: number, height: number) => {
    let a = width, b = height
    while (b) { const next=a%b; a=b; b=next }
    return `${width/a}:${height/a} (${number(width/height)}:1)`
  }
  const presetValue = output && SIZES.some(([w,h]) => (w===output.width_in && h===output.height_in) || (h===output.width_in && w===output.height_in))
    ? `${Math.min(output.width_in,output.height_in)}x${Math.max(output.width_in,output.height_in)}` : output ? 'custom' : 'free'
  const legacyMatte = !output && legacyBorder === 'matte'
  // The retained legacy mode adds 5% of each selected axis per side.
  const legacyX = legacyMatte && plan ? Math.round(plan.width * 0.05) : 0
  const legacyY = legacyMatte && plan ? Math.round(plan.height * 0.05) : 0
  const previewScale = plan ? Math.min(260/(plan.width+2*legacyX), 260/(plan.height+2*legacyY)) : 0

  return <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
    <section className="min-w-0 bg-[#e7e9e8] p-4 sm:p-6" aria-label="Original artwork selection">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-base font-semibold text-charcoal">Original artwork</h3><p className="text-xs text-charcoal/65">{source ? `${number(source.width)} × ${number(source.height)} source pixels${metadataVerified?'':' · verifying…'}` : 'Reading original image dimensions…'}</p>{source && <p className="mt-1 text-xs text-charcoal/65">Original ratio {formatRatio(source.width,source.height)}</p>}</div>
        <button type="button" onClick={() => { setRatioLocked(output?.fit === 'crop'); changeSelection(FULL) }} className="rounded-md border border-charcoal/20 bg-white px-3 py-2 text-xs text-charcoal">Reset selection</button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!loaded || !metadataVerified} onClick={() => rotateSelection(-90)} className="rounded-md border border-charcoal/20 bg-white px-3 py-2 text-xs disabled:opacity-40">↶ Rotate left</button>
        <button type="button" disabled={!loaded || !metadataVerified} onClick={() => rotateSelection(90)} className="rounded-md border border-charcoal/20 bg-white px-3 py-2 text-xs disabled:opacity-40">↷ Rotate right</button>
        <span className="text-xs text-charcoal/65">Rotation is saved with your crop.</span>
      </div>
      <div ref={viewport} className="flex min-h-48 items-center justify-center overflow-hidden rounded-md bg-[#d5d9d7] p-6">
        <div ref={canvas} className="relative touch-none select-none" style={{ width: displayWidth, maxWidth: '100%', aspectRatio: aspect }}
          onPointerMove={moveDrag} onPointerUp={event => { drag.current=null; try { canvas.current?.releasePointerCapture?.(event.pointerId) } catch {} }} onPointerCancel={() => { drag.current=null }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <OrientedCropImage rotation={rotation} aspect={aspect} src={proxyUrl} alt={master.title} draggable={false} className="relative h-full w-full" onLoad={event => { setLoaded(true); setLoadError(''); setPreviewDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }) }} onError={() => { void onImageError() }} />
          {loaded && source && <>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute" style={{ left:`${selection.x*100}%`,top:`${selection.y*100}%`,width:`${selection.w*100}%`,height:`${selection.h*100}%`,boxShadow:'0 0 0 9999px #18251ddd' }} /></div>
            <div role="group" aria-label="Crop selection. Use arrow keys to move one source pixel; hold Shift for ten." tabIndex={0} data-testid="master-crop-selection" className="absolute cursor-move outline-2 outline-white focus:ring-4 focus:ring-teal"
              style={{ left:`${selection.x*100}%`,top:`${selection.y*100}%`,width:`${selection.w*100}%`,height:`${selection.h*100}%` }} onPointerDown={startDrag('move')}
              onKeyDown={event => { const direction = { ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1] }[event.key]; if(direction) { event.preventDefault();nudge(direction[0]*(event.shiftKey?10:1),direction[1]*(event.shiftKey?10:1)) } }}>
              {grid && <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({length:9},(_,i)=><div key={i} className="border border-white/30" />)}</div>}
              {['nw','ne','sw','se'].map(corner=><button key={corner} type="button" tabIndex={-1} aria-label={`Resize ${corner} corner`} onPointerDown={startDrag(corner)} className="absolute h-6 w-6 rounded-sm border-2 border-teal bg-transparent ring-1 ring-white/80" style={{ [corner.includes('n')?'top':'bottom']:-11,[corner.includes('w')?'left':'right']:-11,cursor:corner==='nw'||corner==='se'?'nwse-resize':'nesw-resize' }} />)}
            </div>
            {plan && output?.fit === 'crop' && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-[#e1b347]" style={{left:`${plan.extract.left/source.width*100}%`,top:`${plan.extract.top/source.height*100}%`,width:`${plan.extract.width/source.width*100}%`,height:`${plan.extract.height/source.height*100}%`}} />}
          </>}
          {!loaded && !loadError && <p className="absolute inset-0 flex items-center justify-center bg-[#e7e9e8] py-16 text-sm text-charcoal/60">Loading preview…</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-charcoal/70"><label className="flex items-center gap-2"><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)} className="accent-teal" /> Show thirds grid</label><span>{output?.fit==='crop'?'Gold outline: finished print area':'Drag the box or adjust source pixels below'}</span></div>
      {output && <div className="mt-3 text-xs text-charcoal/70"><label className="flex items-center gap-2"><input type="checkbox" checked={ratioLocked} onChange={e=>{setSelection(selection);setRatioLocked(e.target.checked);if(!e.target.checked && output.fit==='crop')setOutput(null);setEdited(true)}} className="accent-teal" />Lock selection to output ratio</label>{output.fit==='crop' && <p className="mt-2 leading-relaxed">Unlock to draw a custom shape. The finished image will follow your selection until you choose a target size again.</p>}{output.fit==='pad' && <p className="mt-2 leading-relaxed">The finished output stays locked to the target shape. This checkbox only controls the artwork selection. Lock keeps the selection the same shape as your print and may exclude artwork at the edges. Leave it off to keep a different-shaped selection and add white space.</p>}</div>}
      {(loadError || metadataError || mismatch || geometry.error) && <p role="alert" className="mt-3 rounded-md border border-coral/30 bg-white p-3 text-sm text-charcoal">{loadError || metadataError || (mismatch ? 'The saved source dimensions do not match this preview. Check the original artwork before saving.' : geometry.error)}</p>}
      <fieldset disabled={!plan} className="mt-5"><legend className="mb-2 text-sm font-semibold text-charcoal">Selection in source pixels</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(['left','top','width','height'] as const).map(key=><label key={key} className="text-xs capitalize text-charcoal/70">{key}<input aria-label={`Selection ${key} pixels`} type="number" step="1" min={key==='left'||key==='top'?0:1} value={plan?.selection[key] ?? ''} onChange={e=>setPixels(key,Number(e.target.value))} className={`${fieldClass} mt-1`} /></label>)}</div></fieldset>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Move selection one pixel">{[['←',-1,0,'left'],['↑',0,-1,'up'],['↓',0,1,'down'],['→',1,0,'right']].map(([symbol,x,y,label])=><button key={label} type="button" disabled={!plan} aria-label={`Move selection ${label} one pixel`} onClick={()=>nudge(Number(x),Number(y))} className="rounded border border-charcoal/20 bg-white px-3 py-1.5 text-sm disabled:opacity-40">{symbol}</button>)}<span className="self-center text-xs text-charcoal/60">Arrow keys move 1 px; Shift moves 10 px.</span></div>
      {plan && <p className="mt-4 text-sm text-charcoal/75">Selection ratio <strong>{formatRatio(plan.selection.width,plan.selection.height)}</strong>. Closest standard shape: <strong>{closest[0]===closest[1]?'square':selectionRatio>1?'landscape rectangle':'portrait rectangle'} {closest[0]} × {closest[1]}</strong>.</p>}
    </section>
    <aside className="min-w-0 space-y-5 bg-white p-4 sm:p-6" aria-label="Finished print settings">
      <div><h3 className="text-base font-semibold text-charcoal">Finished print</h3><p className="mt-1 text-xs leading-relaxed text-charcoal/65">Choose the dimensions you intend to print. Inches describe this target, not the image file. With a target selected, existing print sizes move to the closest matching sizes when you save. Review availability after prices refresh.</p></div>
      <label className="block text-sm font-medium text-charcoal">Target print size<select aria-label="Target print size" value={presetValue} className={`${fieldClass} mt-1.5`} onChange={event=>{const value=event.target.value;if(value==='free'){changeOutput(null);return}if(value==='custom'){changeOutput({version:1,fit:output?.fit??'crop',width_in:output?.width_in??8,height_in:output?.height_in??10});return}const [w,h]=value.split('x').map(Number);const landscape=output?output.width_in>output.height_in:selectionRatio>1;changeOutput({version:1,fit:output?.fit??'crop',width_in:landscape?h:w,height_in:landscape?w:h})}}>
        <option value="free">Custom shape · no target inches</option><optgroup label="Square">{SIZES.filter(s=>s[0]===s[1]).map(s=><option key={s.join('x')} value={s.join('x')}>{s[0]} × {s[1]} in</option>)}</optgroup><optgroup label="Rectangle">{SIZES.filter(s=>s[0]!==s[1]).map(s=><option key={s.join('x')} value={s.join('x')}>{s[0]} × {s[1]} in</option>)}</optgroup><option value="custom">Custom dimensions</option></select></label>
      {output && <><details className="text-xs leading-relaxed text-charcoal/65"><summary className="cursor-pointer">Same-shape size candidates</summary><p className="mt-2">{availableMatchingStandardSizes(output).map(size=>`${size.width_in} × ${size.height_in}${size.is_custom_size?' (custom)':''}`).join(', ')} in. These are dimension matches; available sizes still depend on print quality, catalog options, and pricing.</p></details><div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><label className="text-xs text-charcoal/70">Width in<input aria-label="Output width inches" type="number" min="1" max="100" step="0.01" value={output.width_in || ''} onChange={e=>changeOutput({...output,width_in:Number(e.target.value)})} className={`${fieldClass} mt-1`} /></label><label className="text-xs text-charcoal/70">Height in<input aria-label="Output height inches" type="number" min="1" max="100" step="0.01" value={output.height_in || ''} onChange={e=>changeOutput({...output,height_in:Number(e.target.value)})} className={`${fieldClass} mt-1`} /></label><button type="button" aria-label="Swap portrait and landscape" onClick={()=>changeOutput({...output,width_in:output.height_in,height_in:output.width_in})} className="rounded-md border border-charcoal/20 px-3 py-2 text-sm">⇄</button></div>
        <fieldset><legend className="mb-2 text-sm font-medium text-charcoal">Fit the selection</legend><div className="space-y-2">{(['crop','pad'] as const).map(fit=><label key={fit} className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${output.fit===fit?'border-teal bg-teal/5':'border-charcoal/15'}`}><input type="radio" name="crop-output-fit" checked={output.fit===fit} onChange={()=>changeOutput({...output,fit})} className="mt-0.5 accent-teal"/><span><span className="block text-sm font-medium">{fit==='crop'?'Crop to fit':'Add white space'}</span><span className="mt-1 block text-xs leading-relaxed text-charcoal/60">{fit==='crop'?'Trim within your selection to fill the chosen size.':'Keep all selected artwork without stretching it. The finished shape stays fixed; white space is centered on the sides or top and bottom as needed.'}</span></span></label>)}</div></fieldset><p className="text-xs leading-relaxed text-charcoal/65">This white space fills a different print shape and may appear on only two sides. Paper prints also receive an automatic white border on all four sides when ordered. Canvas does not receive that paper border. A physical mat is selected separately.</p></>}
      {!output && <details open={legacyMatte} className="text-xs text-charcoal/65"><summary className="cursor-pointer">Legacy border options</summary><div className="mt-2 flex gap-2">{(['full_bleed','matte'] as const).map(mode=><button key={mode} type="button" aria-pressed={legacyBorder===mode} onClick={()=>{setLegacyBorder(mode);setEdited(true)}} className={`rounded border px-3 py-2 ${legacyBorder===mode?'border-teal text-teal':'border-charcoal/20'}`}>{mode==='matte'?'Matte border':'Full bleed'}</button>)}{legacyMatte&&<input aria-label="Matte color" type="color" value={legacyColor} onChange={e=>{setLegacyColor(e.target.value);setEdited(true)}} />}</div><p className="mt-2">To fit another shape without trimming artwork, choose an output size and Add white space.</p></details>}
      {plan && source && <><div className="flex min-h-40 items-center justify-center rounded-md bg-[#e7e9e8] p-4" data-testid="finished-crop-preview"><div className="relative overflow-hidden bg-white shadow-md" style={{width:(plan.width+2*legacyX)*previewScale,height:(plan.height+2*legacyY)*previewScale,background:legacyMatte?legacyColor:'#ffffff'}}><div className="absolute overflow-hidden" style={{left:(plan.padding.left+legacyX)*previewScale,top:(plan.padding.top+legacyY)*previewScale,width:plan.extract.width*previewScale,height:plan.extract.height*previewScale}}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <OrientedCropImage rotation={rotation} aspect={aspect} src={proxyUrl} alt="Finished print preview" className="absolute max-w-none" style={{width:source.width*previewScale,height:source.height*previewScale,left:-plan.extract.left*previewScale,top:-plan.extract.top*previewScale}} /></div></div></div>
        <dl className="space-y-2 text-xs text-charcoal/75"><div className="flex justify-between gap-3"><dt>Finished ratio</dt><dd className="text-right">{formatRatio(plan.width+2*legacyX,plan.height+2*legacyY)}</dd></div><div className="flex justify-between gap-3"><dt>Selected source</dt><dd className="text-right">{number(plan.selection.width)} × {number(plan.selection.height)} px</dd></div><div className="flex justify-between gap-3"><dt>Artwork retained</dt><dd className="text-right">{number(plan.extract.width)} × {number(plan.extract.height)} px</dd></div><div className="flex justify-between gap-3"><dt>{legacyMatte?'Output before legacy matte':'Finished output'}</dt><dd className="text-right">{number(plan.width)} × {number(plan.height)} px</dd></div>{output&&<><div className="flex justify-between gap-3"><dt>Target print size</dt><dd>{number(output.width_in)} × {number(output.height_in)} in</dd></div><div className="flex justify-between gap-3"><dt>Resolution at this size</dt><dd>{number(plan.width/output.width_in)} × {number(plan.height/output.height_in)} ppi</dd></div></>}<div className="flex justify-between gap-3"><dt>Pixels trimmed to fit</dt><dd>{number(plan.removedPixels)}</dd></div><div className="flex justify-between gap-3"><dt>Source pixels excluded</dt><dd>{number(source.width*source.height-plan.extract.width*plan.extract.height)}</dd></div><div className="flex justify-between gap-3"><dt>White pixels added</dt><dd>{number(plan.addedPixels)}</dd></div></dl>
        {output?.fit==='pad'&&<p className="text-xs leading-relaxed text-charcoal/65">The finished print includes the artwork and any added white space; the artwork itself may have different proportions. To include the whole original, choose Reset selection. Padding in source pixels: left {plan.padding.left}, right {plan.padding.right}, top {plan.padding.top}, bottom {plan.padding.bottom}.</p>}</>}
    </aside>
    <div className="border-t border-charcoal/10 bg-white p-4 sm:p-6 lg:col-span-2">
      {productId ? <PrintMatSettings productId={productId} proxyUrl={proxyUrl} plan={plan} output={output} rotation={rotation} /> : <p className="text-xs text-charcoal/65">To choose a physical mat for an artwork, open its crop tool from the product editor.</p>}
    </div>
  </div>
}

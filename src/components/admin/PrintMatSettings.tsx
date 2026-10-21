'use client'

import { useEffect, useState } from 'react'
import { apiFetch, apiSend, errorMessage } from '@/lib/api/client'
import type { MasterCropPlan } from '@/lib/artwork/crop-geometry.mjs'
import type { StorefrontOption, StorefrontSubcategory } from '@/lib/catalog/storefront'
import { matChoiceAvailable, type ProductMatPreference } from '@/lib/catalog/product-mat'
import type { CropOutput } from './MasterCropWorkspace'

type Settings = { preference: ProductMatPreference | null; catalog: StorefrontSubcategory[] }
const field = 'mt-1 w-full rounded-md border border-charcoal/20 bg-white p-2 text-sm'

/** Preview and persist a physical mat for one product without baking it into the master. */
export default function PrintMatSettings({ productId, proxyUrl, plan, output }: {
  productId: string; proxyUrl: string; plan: MasterCropPlan | null; output: CropOutput | null
}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [sizeId, setSizeId] = useState<number | null>(null)
  const [colorId, setColorId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const url = `/api/admin/products/${productId}/mat-preference`

  useEffect(() => {
    let active = true
    apiFetch<Settings>(url, { cache: 'no-store' }).then(data => {
      if (!active) return
      setSettings(data); setError('')
      setEnabled(Boolean(data.preference))
      setSizeId(data.preference?.size_option_id ?? null)
      setColorId(data.preference?.color_option_id ?? null)
    }).catch(err => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [url, reload])

  function options(key: string): StorefrontOption[] {
    const unique = new Map<number, StorefrontOption>()
    for (const subcategory of settings?.catalog ?? []) {
      if (!subcategory.effective_enabled) continue
      for (const group of subcategory.groups) {
        if (group.group_key !== key || !group.effective_enabled) continue
        for (const option of group.options) {
          if (option.effective_enabled && !option.blocked && (key !== 'mat_size' || (option.geometry?.per_side_in ?? 0) > 0)) unique.set(option.option_id, option)
        }
      }
    }
    return [...unique.values()].sort((a, b) => a.sort_order - b.sort_order)
  }
  const sizes = options('mat_size'), colors = options('mat_color')
  const size = sizes.find(o => o.option_id === sizeId) ?? (sizeId === null ? sizes[0] : undefined)
  const color = colors.find(o => o.option_id === colorId) ?? (colorId === null ? colors[0] : undefined)
  const preference: ProductMatPreference | null = size && color ? { mode: 'default', size_option_id: size.option_id, color_option_id: color.option_id } : null
  const available = Boolean(preference && settings?.catalog.some(s => matChoiceAvailable(s, preference)))
  const matIn = size?.geometry?.per_side_in ?? 0
  const dirty = enabled !== Boolean(settings?.preference) || (enabled && (size?.option_id !== settings?.preference?.size_option_id || color?.option_id !== settings?.preference?.color_option_id))

  async function save(mode: 'default' | 'locked' | null) {
    if (mode && (!preference || !available)) return
    setSaving(true); setError(''); setNotice('')
    try {
      const saved = await apiSend<{ preference: ProductMatPreference | null }>(url, 'PATCH', { preference: mode && preference ? { ...preference, mode } : null })
      setSettings(current => current ? { ...current, preference: saved.preference } : current)
      setEnabled(Boolean(saved.preference))
      setNotice(saved.preference?.mode === 'locked' ? 'Saved. This is the only mat customers can order for this artwork.' : saved.preference ? 'Saved. Customers start with this mat and can change it or choose no mat.' : 'Saved. This print uses the catalog defaults again.')
    } catch (err) { setError(errorMessage(err)) }
    finally { setSaving(false) }
  }

  return <section aria-label="Default mat for this print" className="min-w-0 space-y-3 rounded-lg border border-teal/25 p-4">
    <h3 className="text-sm font-semibold text-charcoal">Mat for this print</h3>
    <p className="text-xs leading-relaxed text-charcoal/70">A physical mat surrounds the image inside a frame. This setting applies only to framed fine art paper for this artwork. It does not change the image file or other prints.</p>
    {!settings && !error && <p role="status" className="text-xs">Loading mat choices…</p>}
    {error && <div role="alert" className="text-sm text-coral">{error}{!settings && <button type="button" className="ml-2 underline" onClick={() => setReload(n => n + 1)}>Try again</button>}</div>}
    {settings && <fieldset disabled={saving} className="min-w-0 space-y-3 disabled:opacity-60">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setNotice('') }} className="mt-1 accent-teal" />Add a default mat for this print</label>
      {enabled && <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-3">
        <label className="block text-xs">Mat width on each side<select aria-label="Default mat width" value={size?.option_id ?? ''} onChange={e => { setSizeId(Number(e.target.value)); setNotice('') }} className={field}>
          {!size && <option value="">Choose an available width</option>}{sizes.map(o => <option key={o.option_id} value={o.option_id}>{o.geometry?.per_side_in} in on each side</option>)}
        </select></label>
        <fieldset className="min-w-0"><legend className="mb-2 text-xs">Mat color</legend><div className="flex flex-wrap gap-2">{colors.map(o => <button key={o.option_id} type="button" aria-pressed={color?.option_id === o.option_id} onClick={() => { setColorId(o.option_id); setNotice('') }} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${color?.option_id === o.option_id ? 'border-teal ring-1 ring-teal' : 'border-charcoal/20'}`}><span aria-hidden="true" className="h-5 w-5 rounded-sm border border-charcoal/25" style={{ backgroundColor: o.swatch?.color_hex ?? '#f4f0e6' }} />{o.display_label}</button>)}</div></fieldset>
        <p className="text-xs leading-relaxed text-charcoal/65">The mat width stays the same across print sizes. Frame limits still apply; a locked mat can make larger sizes unavailable. Mat and framing costs are included in the customer’s final quoted price.</p>
        {!available && <p role="alert" className="text-xs text-coral">This mat combination is not currently available. Choose an available width and color.</p>}
        <button type="button" disabled={!available} onClick={() => save('default')} className="w-full rounded-md bg-teal px-3 py-2 text-sm text-white disabled:opacity-40">Set default · customer can change</button>
        <button type="button" disabled={!available} onClick={() => save('locked')} className="w-full rounded-md border border-charcoal/30 px-3 py-2 text-sm disabled:opacity-40">Set and lock default · only mat option</button>
        </div>
        <div className="min-w-0 space-y-3">
        {plan && output && available ? <>
          <div className="flex justify-center rounded bg-[#e7e9e8] p-3" data-testid="physical-mat-preview">
            <div className="relative w-full max-w-[260px] shadow-md" style={{ aspectRatio: (output.width_in + 2 * matIn) / (output.height_in + 2 * matIn), backgroundColor: color?.swatch?.color_hex ?? '#f4f0e6' }}>
              <div className="absolute overflow-hidden bg-white" style={{ left: `${100 * matIn / (output.width_in + 2 * matIn)}%`, top: `${100 * matIn / (output.height_in + 2 * matIn)}%`, width: `${100 * output.width_in / (output.width_in + 2 * matIn)}%`, height: `${100 * output.height_in / (output.height_in + 2 * matIn)}%` }}>
                <div className="absolute overflow-hidden" style={{ left: `${100 * plan.padding.left / plan.width}%`, top: `${100 * plan.padding.top / plan.height}%`, width: `${100 * plan.extract.width / plan.width}%`, height: `${100 * plan.extract.height / plan.height}%` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Artwork with selected physical mat" src={proxyUrl} className="absolute max-w-none" style={{ width: `${100 * plan.source.width / plan.extract.width}%`, height: `${100 * plan.source.height / plan.extract.height}%`, left: `${-100 * plan.extract.left / plan.extract.width}%`, top: `${-100 * plan.extract.top / plan.extract.height}%` }} />
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-charcoal/70">{output.width_in} × {output.height_in} in print + {matIn} in mat on each side = {Number((output.width_in + 2 * matIn).toFixed(2))} × {Number((output.height_in + 2 * matIn).toFixed(2))} in before the frame. Preview colors are approximate.</p>
        </> : <p className="text-xs text-charcoal/65">Choose a target print size above to preview the mat in proportion.</p>}
        </div>
      </div>}
      {!enabled && settings.preference && <button type="button" onClick={() => save(null)} className="rounded-md border border-charcoal/30 px-3 py-2 text-sm">Remove print’s mat default</button>}
      <p role="status" className="text-xs leading-relaxed text-charcoal/75">{saving ? 'Saving mat preference…' : notice || (dirty ? 'Mat changes are not saved yet. Use a mat button above to save them.' : settings.preference ? `Saved mat: ${settings.preference.mode === 'locked' ? 'locked for this artwork' : 'customer can change'}.` : 'Using catalog defaults.')}</p>
      <p className="text-xs text-charcoal/55">Mat settings save separately from the crop.</p>
    </fieldset>}
  </section>
}

'use client'

import Link from 'next/link'
import { printSizeLabel } from '@/lib/pricing/print-size-label'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { MEDIUMS, mediumLabel } from '@/lib/pricing/mediums'
import type { StudioFields } from '@/lib/fulfillment/policy'
import { useEditorState, type EditorStateChange } from './useEditorState'

interface Offer extends StudioFields {
  id: string
  new?: boolean
  name: string
  price: number
  variant_type?: string
  medium: string | null
  width_in: number | null
  height_in: number | null
}
interface Product extends StudioFields {
  id: string
  title: string
  base_price: number
  product_variants: Offer[]
}
const field =
  'mt-1 w-full min-w-0 rounded-md border border-charcoal/20 bg-white px-3 py-2 font-body text-sm'

function ShippingFields({
  value,
  onChange,
}: {
  value: StudioFields
  onChange: (v: StudioFields) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="font-body text-sm">
        Shipping
        <select
          className={field}
          value={value.studio_shipping_mode || ''}
          onChange={(e) =>
            onChange({
              ...value,
              studio_shipping_mode: (e.target.value ||
                null) as StudioFields['studio_shipping_mode'],
              studio_shipping_fee_cents: value.studio_shipping_fee_cents ?? 0,
            })
          }
        >
          <option value="">Use inherited setting</option>
          <option value="included">Shipping included</option>
          <option value="flat">Flat fee per item</option>
        </select>
      </label>
      {value.studio_shipping_mode === 'flat' && (
        <label className="font-body text-sm">
          Fee per item ($)
          <input
            className={field}
            type="number"
            min="0"
            step="0.01"
            value={
              value.studio_shipping_fee_cents == null
                ? ''
                : value.studio_shipping_fee_cents / 100
            }
            onChange={(e) =>
              onChange({
                ...value,
                studio_shipping_fee_cents:
                  e.target.value === ''
                    ? null
                    : Math.round(Number(e.target.value) * 100),
              })
            }
          />
        </label>
      )}
      <label className="font-body text-sm">
        Ships within (days)
        <input
          className={field}
          type="number"
          min="0"
          max="365"
          placeholder="Use inherited time"
          value={value.studio_lead_days ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              studio_lead_days:
                e.target.value === '' ? null : Number(e.target.value),
            })
          }
        />
      </label>
    </div>
  )
}

export default function StudioProductEditor({
  productId,
  children,
  initialMode,
  showSetupHelp = false,
  onEditorState,
}: {
  productId: string
  children: ReactNode
  initialMode?: 'studio' | 'lumaprints'
  showSetupHelp?: boolean
  onEditorState?: EditorStateChange
}) {
  const [product, setProduct] = useState<Product | null>(null)
  const [mode, setMode] = useState<'studio' | 'lumaprints'>(initialMode || 'studio')
  const [liveMode, setLiveMode] = useState('')
  const [busy, setBusy] = useState(true)
  const saving = useRef(false)
  const [savedProduct, setSavedProduct] = useState<Product | null>(null)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const dirty = product !== null && JSON.stringify(product) !== JSON.stringify(savedProduct)
  useEditorState(dirty, busy, onEditorState)
  const load = useCallback(
    async (initial = false) => {
      const r = await fetch(`/api/admin/products/${productId}/studio`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not load studio settings.')
      setProduct(d.product)
      setSavedProduct(d.product)
      setLiveMode(d.policy.lumaprints_enabled ? 'Lumaprints' : 'My studio')
      if (initial)
        setMode(initialMode || (d.policy.lumaprints_enabled ? 'lumaprints' : 'studio'))
    },
    [productId, initialMode],
  )
  useEffect(() => {
    load(true).catch((e) => { setFailed(true); setMessage(e.message) }).finally(() => setBusy(false))
  }, [load])
  function update(id: string, patch: Partial<Offer>) {
    setProduct((p) =>
      p
        ? {
            ...p,
            product_variants: p.product_variants.map((v) =>
              v.id === id ? { ...v, ...patch } : v,
            ),
          }
        : p,
    )
  }
  async function save() {
    if (!product || saving.current) return
    saving.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      for (const v of product.product_variants) {
        if (v.variant_type !== 'original' && v.studio_is_active && (!v.medium || !v.width_in || !v.height_in))
          throw new Error(`Set the material, width, and height for “${v.name}” before making it live. Add a studio print size if this provider option is incomplete.`)
      }
      const shipping = (v: StudioFields) => ({
        studio_shipping_mode: v.studio_shipping_mode || null,
        studio_shipping_fee_cents: v.studio_shipping_fee_cents ?? null,
        studio_lead_days: v.studio_lead_days ?? null,
      })
      const r = await fetch(`/api/admin/products/${productId}/studio`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: {
            ...shipping(product),
            provider_shipping_mode: product.provider_shipping_mode || null,
            provider_shipping_fee_cents:
              product.provider_shipping_fee_cents ?? null,
          },
          variants: product.product_variants.map((v) => ({
            ...v,
            ...shipping(v),
            studio_price_cents:
              v.variant_type === 'original'
                ? (Number(v.price) > 0 ? Math.round(Number(v.price) * 100) : null)
                : (v.studio_price_cents ?? null),
            studio_is_active: v.variant_type !== 'original' && !!v.studio_is_active,
            studio_only: !!v.studio_only,
            studio_source_approved:
              v.variant_type === 'original' || !!v.studio_source_approved,
            studio_specs: v.studio_specs || {},
          })),
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed')
      await load()
      setMessage('Studio prices and shipping saved.')
    } catch (e) {
      setFailed(true)
      setMessage(e instanceof Error ? e.message : 'Save failed')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  function add() {
    if (!product) return
    setProduct({
      ...product,
      product_variants: [
        ...product.product_variants,
        {
          id: crypto.randomUUID(),
          new: true,
          name: 'New print',
          price: 0,
          medium: 'fine_art_paper',
          width_in: 8,
          height_in: 10,
          studio_price_cents: null,
          studio_is_active: false,
          studio_only: true,
          studio_source_approved: false,
          studio_specs: {},
        },
      ],
    })
  }
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-charcoal/10 bg-white p-4">
        <label className="font-body text-sm">
          Editing prices for{' '}
          <select
            className="ml-2 rounded-md border border-charcoal/20 p-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'studio' | 'lumaprints')}
          >
            <option value="studio">My studio</option>
            <option value="lumaprints">Lumaprints</option>
          </select>
        </label>
        <span className="font-body text-xs text-charcoal/60">
          Store currently uses: {liveMode || 'Loading…'}
        </span>
      </div>
      {mode === 'lumaprints' ? (
        <>
          {showSetupHelp && <section className="rounded-lg border border-teal/20 bg-teal/5 p-4 font-body text-sm leading-6"><h2 className="font-semibold text-teal">Your Lumaprints print options</h2><p className="mt-2">The Print sizes section below uses the available Lumaprints catalog. First add a product image, choose master artwork, and press Save Changes. Then crop the master, generate sizes, and review each price. A size can go Live only when the print master is ready.</p><p className="mt-2">If no materials or Generate S/M/L buttons appear, the Lumaprints catalog needs to be synced. The crop tool controls the print area and border; this step does not add a separate frame or mat picker.</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-medium text-teal"><a href="#product-images" className="underline">Add product images</a><a href="#product-master" className="underline">Choose master artwork</a><Link href="/admin/help/06-print-sizes-and-variants" className="underline">Print size setup guide</Link></div></section>}
          {children}
          {product && (
            <section className="rounded-xl border border-charcoal/10 bg-white p-5">
              <h2 className="font-display text-xl">
                Lumaprints profile shipping
              </h2>
              <p className="mt-1 font-body text-sm text-charcoal/65">
                Choose what customers pay. Your print and frame costs stay in
                the selling price.
              </p>
              <label className="mt-3 block font-body text-sm">
                Shipping
                <select
                  className={field}
                  value={product.provider_shipping_mode || 'integration'}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      provider_shipping_mode: e.target
                        .value as StudioFields['provider_shipping_mode'],
                    })
                  }
                >
                  <option value="included">Shipping included</option>
                  <option value="flat">Flat fee per item</option>
                  <option value="integration">Use shipping integration</option>
                </select>
              </label>
              {product.provider_shipping_mode === 'flat' && (
                <label className="mt-3 block font-body text-sm">
                  Fee per item ($)
                  <input
                    className={field}
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      product.provider_shipping_fee_cents == null
                        ? ''
                        : product.provider_shipping_fee_cents / 100
                    }
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        provider_shipping_fee_cents:
                          e.target.value === ''
                            ? null
                            : Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="mt-4 rounded-md bg-teal px-4 py-2 font-body text-sm text-white disabled:opacity-50"
              >
                Save shipping
              </button>
            </section>
          )}
        </>
      ) : (
        <section className="rounded-xl border border-charcoal/10 bg-white p-5 sm:p-6">
          <h2 className="font-display text-xl text-charcoal">
            Studio prices &amp; shipping
          </h2>
          <p className="mb-5 mt-1 font-body text-sm text-charcoal/65">
            Set the final selling price. Include printing, framing, packaging,
            and your profit. Shipping can be included or added as a flat fee.
          </p>
          {product && (
            <>
              <div className="rounded-md bg-cream p-4">
                <h3 className="mb-3 font-body text-sm font-medium">
                  Product defaults
                </h3>
                <ShippingFields
                  value={product}
                  onChange={(v) => setProduct({ ...product, ...v })}
                />
                <button
                  type="button"
                  className="mt-3 font-body text-xs text-teal underline"
                  onClick={() =>
                    setProduct({
                      ...product,
                      product_variants: product.product_variants.map((v) => ({
                        ...v,
                        studio_shipping_mode: null,
                        studio_shipping_fee_cents: null,
                        studio_lead_days: null,
                      })),
                    })
                  }
                >
                  Use these defaults for every option
                </button>
              </div>
              <div className="divide-y divide-charcoal/10">
                {product.product_variants.map((v) => (
                  <div key={v.id} className="py-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-display text-lg">
                        {v.variant_type === 'original'
                          ? 'Original artwork'
                          : <><span className="block">{printSizeLabel(v).title}</span>{printSizeLabel(v).actualNote && <span className="block font-body text-[9px] font-normal leading-4 text-charcoal/70">{printSizeLabel(v).actualNote}</span>}</>}
                      </h3>
                      {v.variant_type !== 'original' && (
                        <label className="flex items-center gap-2 font-body text-sm">
                          <input
                            type="checkbox"
                            checked={!!v.studio_is_active}
                            onChange={(e) =>
                              update(v.id, {
                                studio_is_active: e.target.checked,
                              })
                            }
                            className="h-5 w-5 accent-teal"
                          />
                          Live in my studio
                        </label>
                      )}
                    </div>
                    {(v.new || (v.studio_only && savedProduct?.product_variants.find(saved => saved.id === v.id)?.studio_only)) && v.variant_type !== 'original' && (
                      <div className="mb-3 grid gap-3 sm:grid-cols-2">
                        <label className="font-body text-sm">
                          Option name
                          <input
                            className={field}
                            maxLength={120}
                            value={v.name}
                            onChange={(e) =>
                              update(v.id, { name: e.target.value })
                            }
                          />
                        </label>
                        <label className="font-body text-sm">
                          Material
                          <select
                            className={field}
                            value={v.medium || ''}
                            onChange={(e) =>
                              update(v.id, { medium: e.target.value })
                            }
                          >
                            {MEDIUMS.map((m) => (
                              <option key={m} value={m}>
                                {mediumLabel(m)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="font-body text-sm">
                          Width (inches)
                          <input
                            className={field}
                            type="number"
                            min="0.1"
                            max="300"
                            step="0.05"
                            value={v.width_in ?? ''}
                            onChange={(e) =>
                              update(v.id, { width_in: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label className="font-body text-sm">
                          Height (inches)
                          <input
                            className={field}
                            type="number"
                            min="0.1"
                            max="300"
                            step="0.05"
                            value={v.height_in ?? ''}
                            onChange={(e) =>
                              update(v.id, {
                                height_in: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                    <div className="mb-3 max-w-xs">
                      <label className="font-body text-sm">
                        {v.variant_type === 'original'
                          ? 'Original price (edit Base price in the product editor)'
                          : 'Selling price ($)'}
                        <input
                          className={field}
                          type="number"
                          min="0.01"
                          step="0.01"
                          readOnly={v.variant_type === 'original'}
                          value={
                            v.variant_type === 'original'
                              ? v.price
                              : v.studio_price_cents == null
                                ? ''
                                : v.studio_price_cents / 100
                          }
                          onChange={(e) =>
                            update(v.id, {
                              studio_price_cents:
                                e.target.value === ''
                                  ? null
                                  : Math.round(Number(e.target.value) * 100),
                            })
                          }
                        />
                      </label>
                    </div>
                    <ShippingFields
                      value={v}
                      onChange={(patch) => update(v.id, patch)}
                    />
                    {v.variant_type !== 'original' && (
                      <details className="mt-4">
                        <summary className="cursor-pointer font-body text-sm text-teal">
                          Production details &amp; source approval
                        </summary>
                        <div className="mt-3 space-y-3">
                          <label className="block font-body text-sm">
                            Frame / finish
                            <input
                              className={field}
                              maxLength={500}
                              value={String(v.studio_specs?.frame || '')}
                              onChange={(e) =>
                                update(v.id, {
                                  studio_specs: {
                                    ...v.studio_specs,
                                    frame: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label className="block font-body text-sm">
                            Production source reference
                            <input
                              className={field}
                              maxLength={500}
                              placeholder="Approved master in library, or file held by my printer"
                              value={String(v.studio_specs?.source || '')}
                              onChange={(e) =>
                                update(v.id, {
                                  studio_specs: {
                                    ...v.studio_specs,
                                    source: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label className="block font-body text-sm">
                            Print specifications
                            <textarea
                              className={field}
                              maxLength={2000}
                              value={String(v.studio_specs?.instructions || '')}
                              onChange={(e) =>
                                update(v.id, {
                                  studio_specs: {
                                    ...v.studio_specs,
                                    instructions: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label className="flex items-start gap-2 font-body text-sm">
                            <input
                              type="checkbox"
                              checked={!!v.studio_source_approved}
                              onChange={(e) =>
                                update(v.id, {
                                  studio_source_approved: e.target.checked,
                                })
                              }
                              className="mt-0.5 h-5 w-5 accent-teal"
                            />
                            I have approved the production file or sample for
                            this size and finish.
                          </label>
                          <label className="flex items-start gap-2 font-body text-sm">
                            <input
                              type="checkbox"
                              checked={!!v.studio_only}
                              disabled={!!v.new}
                              onChange={(e) =>
                                update(v.id, { studio_only: e.target.checked })
                              }
                              className="mt-0.5 h-5 w-5 accent-teal"
                            />
                            Always fulfill this option myself, even when
                            Lumaprints is on.
                          </label>
                          {v.new && <p className="font-body text-sm text-charcoal/65">New studio sizes are fulfilled by you. They do not have a Lumaprints mapping.</p>}
                          {!v.new && v.studio_only && !savedProduct?.product_variants.find(saved => saved.id === v.id)?.studio_only && <p className="font-body text-sm text-charcoal/65">Save this option as studio-only first. You can then edit its name, material, and dimensions.</p>}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={add}
                  className="rounded-md border border-teal px-4 py-2 font-body text-sm text-teal"
                >
                  Add a studio print size
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="rounded-md bg-teal px-5 py-2 font-body text-sm text-white disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save studio prices & shipping'}
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {message && (
        <p
          role={failed ? 'alert' : 'status'}
          className="rounded-md border border-charcoal/10 bg-cream p-3 font-body text-sm"
        >
          {message}
        </p>
      )}
    </fieldset>
  )
}

'use client'

import { useState } from 'react'

export interface Address {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  is_default: boolean
}

interface FormState {
  label: string
  line1: string
  line2: string
  city: string
  state: string
  postal_code: string
  country: string
  is_default: boolean
}

const emptyForm: FormState = {
  label: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'US',
  is_default: false,
}

const fieldClass =
  'w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal'
const labelClass = 'block font-body text-sm font-medium text-charcoal/70 mb-1.5'

function toForm(a: Address): FormState {
  return {
    label: a.label,
    line1: a.line1,
    line2: a.line2 || '',
    city: a.city,
    state: a.state,
    postal_code: a.postal_code,
    country: a.country || 'US',
    is_default: a.is_default,
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    return body?.error || fallback
  } catch {
    return fallback
  }
}

export default function AddressBook({ initial }: { initial: Address[] }) {
  const [list, setList] = useState<Address[]>(initial)
  const [editingId, setEditingId] = useState<string | null>(null) // null = not editing; '' = new
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function openNew() {
    setForm(emptyForm)
    setEditingId('')
    setError(null)
  }

  function openEdit(a: Address) {
    setForm(toForm(a))
    setEditingId(a.id)
    setError(null)
  }

  function closeForm() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function refetch() {
    const res = await fetch('/api/account/addresses')
    if (res.ok) {
      const body = await res.json()
      setList(body.data as Address[])
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const isNew = editingId === ''
    const url = isNew ? '/api/account/addresses' : `/api/account/addresses/${editingId}`
    const method = isNew ? 'POST' : 'PATCH'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: form.label,
        line1: form.line1,
        line2: form.line2,
        city: form.city,
        state: form.state,
        postal_code: form.postal_code,
        country: form.country.toUpperCase(),
        is_default: form.is_default,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setError(await readError(res, 'Could not save the address.'))
      return
    }
    await refetch()
    closeForm()
  }

  async function remove(id: string) {
    setError(null)
    setBusyId(id)
    const res = await fetch(`/api/account/addresses/${id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      setError('Could not delete the address.')
      return
    }
    setList((prev) => prev.filter((a) => a.id !== id))
  }

  async function makeDefault(id: string) {
    setError(null)
    setBusyId(id)
    const res = await fetch(`/api/account/addresses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    })
    setBusyId(null)
    if (!res.ok) {
      setError(await readError(res, 'Could not set the default address.'))
      return
    }
    await refetch()
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-sm bg-coral/10 px-3 py-2 font-body text-sm text-coral">{error}</p>
      )}

      {list.length === 0 && editingId === null && (
        <div className="bg-white rounded-sm border border-charcoal/10 p-12 text-center">
          <p className="font-body text-charcoal/60">You have no saved addresses yet.</p>
        </div>
      )}

      {list.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {list.map((a) => (
            <div key={a.id} className="bg-white rounded-sm border border-charcoal/10 p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-body font-semibold text-charcoal">{a.label}</h3>
                {a.is_default && (
                  <span className="rounded-sm bg-teal/10 px-2 py-0.5 font-body text-xs font-semibold text-deep-teal">
                    Default
                  </span>
                )}
              </div>
              <address className="mt-2 not-italic font-body text-sm text-charcoal/70 leading-relaxed">
                {a.line1}
                {a.line2 ? (
                  <>
                    <br />
                    {a.line2}
                  </>
                ) : null}
                <br />
                {a.city}, {a.state} {a.postal_code}
                <br />
                {a.country}
              </address>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  className="font-body text-sm text-teal underline-offset-2 hover:underline"
                >
                  Edit
                </button>
                {!a.is_default && (
                  <button
                    type="button"
                    onClick={() => makeDefault(a.id)}
                    disabled={busyId === a.id}
                    className="font-body text-sm text-charcoal/60 underline-offset-2 hover:text-teal hover:underline disabled:opacity-50"
                  >
                    Set as default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  disabled={busyId === a.id}
                  className="font-body text-sm text-charcoal/50 underline-offset-2 hover:text-coral hover:underline disabled:opacity-50"
                >
                  {busyId === a.id ? 'Working…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingId !== null ? (
        <form onSubmit={submit} className="bg-white rounded-sm border border-charcoal/10 p-6">
          <h2 className="font-display text-xl font-light text-charcoal">
            {editingId === '' ? 'Add address' : 'Edit address'}
          </h2>
          <div className="mt-1 mb-5 w-12 h-px bg-gold" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="addr_label" className={labelClass}>
                Label
              </label>
              <input
                id="addr_label"
                type="text"
                value={form.label}
                onChange={(e) => setField('label', e.target.value)}
                className={fieldClass}
                placeholder="Home, Studio…"
                required
                maxLength={80}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="addr_line1" className={labelClass}>
                Address line 1
              </label>
              <input
                id="addr_line1"
                type="text"
                value={form.line1}
                onChange={(e) => setField('line1', e.target.value)}
                className={fieldClass}
                required
                maxLength={200}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="addr_line2" className={labelClass}>
                Address line 2
              </label>
              <input
                id="addr_line2"
                type="text"
                value={form.line2}
                onChange={(e) => setField('line2', e.target.value)}
                className={fieldClass}
                placeholder="(optional)"
                maxLength={200}
              />
            </div>
            <div>
              <label htmlFor="addr_city" className={labelClass}>
                City
              </label>
              <input
                id="addr_city"
                type="text"
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
                className={fieldClass}
                required
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="addr_state" className={labelClass}>
                State / Region
              </label>
              <input
                id="addr_state"
                type="text"
                value={form.state}
                onChange={(e) => setField('state', e.target.value)}
                className={fieldClass}
                required
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="addr_postal" className={labelClass}>
                Postal code
              </label>
              <input
                id="addr_postal"
                type="text"
                value={form.postal_code}
                onChange={(e) => setField('postal_code', e.target.value)}
                className={fieldClass}
                required
                maxLength={20}
              />
            </div>
            <div>
              <label htmlFor="addr_country" className={labelClass}>
                Country (2-letter)
              </label>
              <input
                id="addr_country"
                type="text"
                value={form.country}
                onChange={(e) => setField('country', e.target.value)}
                className={fieldClass}
                maxLength={2}
                minLength={2}
                placeholder="US"
              />
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 font-body text-sm text-charcoal/70">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setField('is_default', e.target.checked)}
              className="h-4 w-4 rounded border-charcoal/30 text-teal focus:ring-teal"
            />
            Make this my default address
          </label>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-sm bg-teal px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-deep-teal disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save address'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="font-body text-sm text-charcoal/60 hover:text-charcoal"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center rounded-sm border border-teal px-5 py-2.5 font-body text-sm font-semibold text-teal transition-colors hover:bg-teal hover:text-white"
        >
          Add new address
        </button>
      )}
    </div>
  )
}

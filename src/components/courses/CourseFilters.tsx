'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

const TYPE_OPTIONS = [
  { value: '', label: 'All formats' },
  { value: 'on_demand', label: 'On Demand' },
  { value: 'live', label: 'Live' },
  { value: 'hybrid', label: 'Hybrid' },
]

const DIFFICULTY_OPTIONS = [
  { value: '', label: 'All levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all_levels', label: 'All Levels' },
]

const PRICE_OPTIONS = [
  { value: '', label: 'Any price' },
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
]

const selectClass =
  'rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal'

export default function CourseFilters({
  type,
  difficulty,
  price,
}: {
  type: string
  difficulty: string
  price: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      // Any filter change resets pagination to page 1.
      params.delete('page')
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [router, pathname, searchParams],
  )

  const hasActive = Boolean(type || difficulty || price)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor="filter-type">
        Filter by format
      </label>
      <select
        id="filter-type"
        value={type}
        onChange={(e) => setParam('type', e.target.value)}
        className={selectClass}
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-difficulty">
        Filter by level
      </label>
      <select
        id="filter-difficulty"
        value={difficulty}
        onChange={(e) => setParam('difficulty', e.target.value)}
        className={selectClass}
      >
        {DIFFICULTY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-price">
        Filter by price
      </label>
      <select
        id="filter-price"
        value={price}
        onChange={(e) => setParam('price', e.target.value)}
        className={selectClass}
      >
        {PRICE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {hasActive && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50 underline transition-colors hover:text-teal"
        >
          Clear
        </button>
      )}
    </div>
  )
}

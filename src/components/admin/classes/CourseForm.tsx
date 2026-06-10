'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface CourseData {
  id?: string
  title?: string
  slug?: string
  description?: string
  long_description?: string
  instructor_name?: string
  course_type?: string
  difficulty_level?: string
  price?: number | null
  materials_needed?: string
  thumbnail_url?: string
  preview_video_url?: string
  status?: string
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function CourseForm({
  course,
  mode,
}: {
  course?: CourseData
  mode: 'create' | 'edit'
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(course?.title || '')
  const [slug, setSlug] = useState(course?.slug || '')
  const [slugManual, setSlugManual] = useState(!!course?.slug)
  const [description, setDescription] = useState(course?.description || '')
  const [longDescription, setLongDescription] = useState(
    course?.long_description || ''
  )
  const [instructorName, setInstructorName] = useState(
    course?.instructor_name || ''
  )
  const [courseType, setCourseType] = useState(
    course?.course_type || 'on_demand'
  )
  const [difficultyLevel, setDifficultyLevel] = useState(
    course?.difficulty_level || 'all_levels'
  )
  const [price, setPrice] = useState(
    course?.price != null ? String(course.price) : ''
  )
  const [materialsNeeded, setMaterialsNeeded] = useState(
    course?.materials_needed || ''
  )
  const [thumbnailUrl, setThumbnailUrl] = useState(
    course?.thumbnail_url || ''
  )
  const [previewVideoUrl, setPreviewVideoUrl] = useState(
    course?.preview_video_url || ''
  )
  const [status, setStatus] = useState(course?.status || 'draft')

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value)
      if (!slugManual) {
        setSlug(generateSlug(value))
      }
    },
    [slugManual]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const body = {
        title,
        slug: slug || generateSlug(title),
        description,
        long_description: longDescription,
        instructor_name: instructorName || null,
        course_type: courseType,
        difficulty_level: difficultyLevel,
        price: price ? parseFloat(price) : null,
        materials_needed: materialsNeeded || null,
        thumbnail_url: thumbnailUrl || null,
        preview_video_url: previewVideoUrl || null,
        status,
      }

      const url =
        mode === 'edit'
          ? `/api/admin/classes/${course?.id}`
          : '/api/admin/classes'
      const method = mode === 'edit' ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save course')
      }

      if (mode === 'create') {
        const data = await res.json()
        router.push(`/admin/courses/${data.data.id}`)
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal'
  const selectClass =
    'w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal'
  const labelClass = 'mb-1 block font-body text-sm font-medium text-charcoal'

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-lg border border-coral/30 bg-coral/10 p-4">
          <p className="font-body text-sm text-coral">{error}</p>
        </div>
      )}

      {/* Basic Info */}
      <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
          Basic Information
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>
              Title <span className="text-coral">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className={inputClass}
              placeholder="Enter course title"
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugManual(true)
                setSlug(e.target.value)
              }}
              className={inputClass}
              placeholder="auto-generated-from-title"
            />
            <p className="mt-1 font-body text-xs text-charcoal/40">
              Leave blank to auto-generate from title
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Short Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Brief course description for listings..."
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Full Description</label>
            <textarea
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              rows={6}
              className={inputClass}
              placeholder="Detailed course description..."
            />
          </div>

          <div>
            <label className={labelClass}>Instructor Name</label>
            <input
              type="text"
              value={instructorName}
              onChange={(e) => setInstructorName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Margaret Edmondson"
            />
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
      </section>

      {/* Course Details */}
      <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
          Course Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Course Type</label>
            <select
              value={courseType}
              onChange={(e) => setCourseType(e.target.value)}
              className={selectClass}
            >
              <option value="on_demand">On Demand</option>
              <option value="live">Live</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Difficulty Level</label>
            <select
              value={difficultyLevel}
              onChange={(e) => setDifficultyLevel(e.target.value)}
              className={selectClass}
            >
              <option value="all_levels">All Levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-body text-sm text-charcoal/50">
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg border border-charcoal/15 bg-cream py-2.5 pl-8 pr-4 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                placeholder="0.00 (leave empty for free)"
              />
            </div>
            <p className="mt-1 font-body text-xs text-charcoal/40">
              Leave empty to make this course free
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Materials Needed</label>
            <textarea
              value={materialsNeeded}
              onChange={(e) => setMaterialsNeeded(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="List any materials students will need..."
            />
          </div>
        </div>
      </section>

      {/* Media */}
      <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
          Media
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Thumbnail URL</label>
            <input
              type="url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              className={inputClass}
              placeholder="https://..."
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Preview Video URL</label>
            <input
              type="url"
              value={previewVideoUrl}
              onChange={(e) => setPreviewVideoUrl(e.target.value)}
              className={inputClass}
              placeholder="https://..."
            />
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 pt-6">
        <Link
          href="/admin/courses"
          className="rounded-lg border border-charcoal/15 px-5 py-2.5 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center rounded-lg bg-teal px-6 py-2.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
        >
          {saving ? (
            <>
              <svg
                className="mr-2 h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Saving...
            </>
          ) : mode === 'create' ? (
            'Create Course'
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </form>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Lesson {
  id: string
  title: string
  slug: string
  description: string | null
  video_url: string | null
  video_duration_minutes: number | null
  content_html: string | null
  is_preview: boolean
  sort_order: number
}

interface Module {
  id: string
  course_id: string
  title: string
  description: string | null
  sort_order: number
  lessons: Lesson[]
}

interface EnrollmentStats {
  total: number
  active: number
  completed: number
}

export default function ModuleLessonManager({
  courseId,
  modules: initialModules,
  enrollmentStats,
}: {
  courseId: string
  modules: Module[]
  enrollmentStats: EnrollmentStats
}) {
  const router = useRouter()
  const [modules, setModules] = useState<Module[]>(initialModules)
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set()
  )
  const [addingModule, setAddingModule] = useState(false)
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [savingModule, setSavingModule] = useState(false)
  const [addingLessonFor, setAddingLessonFor] = useState<string | null>(null)
  const [editingModule, setEditingModule] = useState<string | null>(null)
  const [editModuleTitle, setEditModuleTitle] = useState('')
  const [editingLesson, setEditingLesson] = useState<string | null>(null)
  const [lessonForm, setLessonForm] = useState({
    title: '',
    video_url: '',
    video_duration_minutes: '',
    is_preview: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function toggleModule(id: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // --- Module CRUD ---

  async function handleAddModule() {
    if (!newModuleTitle.trim()) return
    setSavingModule(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/classes/${courseId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newModuleTitle.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create module')
      }

      const { data } = await res.json()
      setModules((prev) => [...prev, { ...data, lessons: [] }])
      setNewModuleTitle('')
      setAddingModule(false)
      setExpandedModules((prev) => new Set([...prev, data.id]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSavingModule(false)
    }
  }

  async function handleUpdateModule(moduleId: string) {
    if (!editModuleTitle.trim()) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/admin/classes/${courseId}/modules/${moduleId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editModuleTitle.trim() }),
        }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update module')
      }

      const { data } = await res.json()
      setModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, ...data } : m))
      )
      setEditingModule(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteModule(moduleId: string) {
    if (!confirm('Delete this module and all its lessons? This cannot be undone.'))
      return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/admin/classes/${courseId}/modules/${moduleId}`,
        { method: 'DELETE' }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete module')
      }

      setModules((prev) => prev.filter((m) => m.id !== moduleId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setBusy(false)
    }
  }

  // --- Lesson CRUD ---

  function openAddLesson(moduleId: string) {
    setAddingLessonFor(moduleId)
    setLessonForm({
      title: '',
      video_url: '',
      video_duration_minutes: '',
      is_preview: false,
    })
    setExpandedModules((prev) => new Set([...prev, moduleId]))
  }

  async function handleAddLesson(moduleId: string) {
    if (!lessonForm.title.trim()) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/admin/classes/${courseId}/modules/${moduleId}/lessons`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: lessonForm.title.trim(),
            video_url: lessonForm.video_url || null,
            video_duration_minutes: lessonForm.video_duration_minutes
              ? parseFloat(lessonForm.video_duration_minutes)
              : null,
            is_preview: lessonForm.is_preview,
          }),
        }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create lesson')
      }

      const { data } = await res.json()
      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId ? { ...m, lessons: [...m.lessons, data] } : m
        )
      )
      setAddingLessonFor(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setBusy(false)
    }
  }

  function openEditLesson(lesson: Lesson) {
    setEditingLesson(lesson.id)
    setLessonForm({
      title: lesson.title,
      video_url: lesson.video_url || '',
      video_duration_minutes: lesson.video_duration_minutes
        ? String(lesson.video_duration_minutes)
        : '',
      is_preview: lesson.is_preview,
    })
  }

  async function handleUpdateLesson(moduleId: string, lessonId: string) {
    if (!lessonForm.title.trim()) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/admin/classes/${courseId}/modules/${moduleId}/lessons/${lessonId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: lessonForm.title.trim(),
            video_url: lessonForm.video_url || null,
            video_duration_minutes: lessonForm.video_duration_minutes
              ? parseFloat(lessonForm.video_duration_minutes)
              : null,
            is_preview: lessonForm.is_preview,
          }),
        }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update lesson')
      }

      const { data } = await res.json()
      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                lessons: m.lessons.map((l) =>
                  l.id === lessonId ? { ...l, ...data } : l
                ),
              }
            : m
        )
      )
      setEditingLesson(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteLesson(moduleId: string, lessonId: string) {
    if (!confirm('Delete this lesson? This cannot be undone.')) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/admin/classes/${courseId}/modules/${moduleId}/lessons/${lessonId}`,
        { method: 'DELETE' }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete lesson')
      }

      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId
            ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) }
            : m
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteCourse() {
    if (
      !confirm(
        'Delete this entire course, including all modules, lessons, and enrollments? This cannot be undone.'
      )
    )
      return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/classes/${courseId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete course')
      }

      router.push('/admin/courses')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setBusy(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal'

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-coral/30 bg-coral/10 p-4">
          <p className="font-body text-sm text-coral">{error}</p>
        </div>
      )}

      {/* Enrollment Stats */}
      <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
          Enrollment Stats
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-charcoal/[0.03] p-4 text-center">
            <p className="font-display text-2xl font-semibold text-charcoal">
              {enrollmentStats.total}
            </p>
            <p className="font-body text-xs text-charcoal/50">Total Enrolled</p>
          </div>
          <div className="rounded-lg bg-teal/5 p-4 text-center">
            <p className="font-display text-2xl font-semibold text-teal">
              {enrollmentStats.active}
            </p>
            <p className="font-body text-xs text-charcoal/50">Active</p>
          </div>
          <div className="rounded-lg bg-olive/5 p-4 text-center">
            <p className="font-display text-2xl font-semibold text-olive">
              {enrollmentStats.completed}
            </p>
            <p className="font-body text-xs text-charcoal/50">Completed</p>
          </div>
        </div>
      </section>

      {/* Modules & Lessons */}
      <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-charcoal">
            Modules & Lessons
          </h2>
          <button
            type="button"
            onClick={() => setAddingModule(true)}
            className="inline-flex items-center rounded-md bg-teal px-3 py-1.5 font-body text-xs font-medium text-cream transition-colors hover:bg-deep-teal"
          >
            <svg
              className="mr-1 h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Module
          </button>
        </div>

        {/* Add module form */}
        {addingModule && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-teal/30 bg-teal/5 p-3">
            <input
              type="text"
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddModule()
                if (e.key === 'Escape') setAddingModule(false)
              }}
              className={inputClass}
              placeholder="Module title..."
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddModule}
              disabled={savingModule || !newModuleTitle.trim()}
              className="shrink-0 rounded-md bg-teal px-3 py-2 font-body text-xs font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
            >
              {savingModule ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingModule(false)
                setNewModuleTitle('')
              }}
              className="shrink-0 rounded-md p-2 text-charcoal/40 transition-colors hover:text-charcoal"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Module list */}
        {modules.length === 0 && !addingModule ? (
          <p className="py-8 text-center font-body text-sm text-charcoal/40">
            No modules yet. Add a module to start building your course
            curriculum.
          </p>
        ) : (
          <div className="space-y-3">
            {modules.map((mod, idx) => {
              const isExpanded = expandedModules.has(mod.id)
              return (
                <div
                  key={mod.id}
                  className="overflow-hidden rounded-lg border border-charcoal/10"
                >
                  {/* Module header */}
                  <div className="flex items-center gap-3 bg-charcoal/[0.03] px-4 py-3">
                    {/* Drag handle (visual only) */}
                    <div className="shrink-0 cursor-grab text-charcoal/25">
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                        />
                      </svg>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleModule(mod.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <svg
                        className={`h-4 w-4 shrink-0 text-charcoal/40 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>

                      {editingModule === mod.id ? (
                        <input
                          type="text"
                          value={editModuleTitle}
                          onChange={(e) => setEditModuleTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateModule(mod.id)
                            if (e.key === 'Escape') setEditingModule(null)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 rounded border border-charcoal/15 bg-cream px-2 py-1 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <span className="font-body text-sm font-medium text-charcoal">
                          <span className="mr-2 font-body text-xs text-charcoal/40">
                            {idx + 1}.
                          </span>
                          {mod.title}
                        </span>
                      )}
                    </button>

                    <span className="shrink-0 font-body text-xs text-charcoal/40">
                      {mod.lessons.length} lesson
                      {mod.lessons.length !== 1 ? 's' : ''}
                    </span>

                    {/* Module actions */}
                    <div className="flex shrink-0 items-center gap-1">
                      {editingModule === mod.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleUpdateModule(mod.id)}
                            disabled={busy}
                            className="rounded-md p-1.5 text-teal transition-colors hover:bg-teal/10"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingModule(null)}
                            className="rounded-md p-1.5 text-charcoal/40 transition-colors hover:text-charcoal"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openAddLesson(mod.id)}
                            className="rounded-md p-1.5 text-teal transition-colors hover:bg-teal/10"
                            title="Add lesson"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingModule(mod.id)
                              setEditModuleTitle(mod.title)
                            }}
                            className="rounded-md p-1.5 text-charcoal/40 transition-colors hover:bg-charcoal/10 hover:text-charcoal"
                            title="Edit module"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteModule(mod.id)}
                            disabled={busy}
                            className="rounded-md p-1.5 text-charcoal/40 transition-colors hover:bg-coral/10 hover:text-coral"
                            title="Delete module"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Lessons (expanded) */}
                  {isExpanded && (
                    <div className="border-t border-charcoal/10 bg-white">
                      {mod.lessons.length === 0 && addingLessonFor !== mod.id ? (
                        <div className="px-4 py-6 text-center">
                          <p className="font-body text-sm text-charcoal/40">
                            No lessons yet.
                          </p>
                          <button
                            type="button"
                            onClick={() => openAddLesson(mod.id)}
                            className="mt-2 font-body text-sm font-medium text-teal hover:text-deep-teal"
                          >
                            Add first lesson
                          </button>
                        </div>
                      ) : (
                        <ul className="divide-y divide-charcoal/5">
                          {mod.lessons.map((lesson) => (
                            <li
                              key={lesson.id}
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-charcoal/[0.02]"
                            >
                              {editingLesson === lesson.id ? (
                                <div className="flex-1 space-y-2">
                                  <input
                                    type="text"
                                    value={lessonForm.title}
                                    onChange={(e) =>
                                      setLessonForm((prev) => ({
                                        ...prev,
                                        title: e.target.value,
                                      }))
                                    }
                                    className={inputClass}
                                    placeholder="Lesson title"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <input
                                      type="url"
                                      value={lessonForm.video_url}
                                      onChange={(e) =>
                                        setLessonForm((prev) => ({
                                          ...prev,
                                          video_url: e.target.value,
                                        }))
                                      }
                                      className={inputClass}
                                      placeholder="Video URL"
                                    />
                                    <input
                                      type="number"
                                      value={lessonForm.video_duration_minutes}
                                      onChange={(e) =>
                                        setLessonForm((prev) => ({
                                          ...prev,
                                          video_duration_minutes: e.target.value,
                                        }))
                                      }
                                      className="w-24 shrink-0 rounded-lg border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                                      placeholder="Min"
                                      min="0"
                                      step="0.5"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={lessonForm.is_preview}
                                        onChange={(e) =>
                                          setLessonForm((prev) => ({
                                            ...prev,
                                            is_preview: e.target.checked,
                                          }))
                                        }
                                        className="h-4 w-4 rounded border-charcoal/30 text-teal focus:ring-teal"
                                      />
                                      <span className="font-body text-xs text-charcoal/60">
                                        Free preview
                                      </span>
                                    </label>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateLesson(mod.id, lesson.id)
                                        }
                                        disabled={busy}
                                        className="rounded-md bg-teal px-3 py-1.5 font-body text-xs font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingLesson(null)}
                                        className="rounded-md border border-charcoal/15 px-3 py-1.5 font-body text-xs text-charcoal hover:bg-charcoal/5"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="shrink-0 font-body text-xs text-charcoal/30">
                                    {lesson.sort_order + 1}.
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-body text-sm font-medium text-charcoal">
                                      {lesson.title}
                                    </p>
                                    {lesson.video_url && (
                                      <p className="truncate font-body text-xs text-charcoal/40">
                                        {lesson.video_url}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {lesson.video_duration_minutes && (
                                      <span className="font-body text-xs text-charcoal/40">
                                        {lesson.video_duration_minutes} min
                                      </span>
                                    )}
                                    {lesson.is_preview && (
                                      <span className="inline-flex rounded-full bg-gold/15 px-2 py-0.5 font-body text-[10px] font-medium text-gold">
                                        Preview
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openEditLesson(lesson)}
                                      className="rounded-md p-1 text-charcoal/40 transition-colors hover:bg-charcoal/10 hover:text-charcoal"
                                    >
                                      <svg
                                        className="h-3.5 w-3.5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteLesson(mod.id, lesson.id)
                                      }
                                      disabled={busy}
                                      className="rounded-md p-1 text-charcoal/40 transition-colors hover:bg-coral/10 hover:text-coral"
                                    >
                                      <svg
                                        className="h-3.5 w-3.5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </>
                              )}
                            </li>
                          ))}

                          {/* Add lesson inline form */}
                          {addingLessonFor === mod.id && (
                            <li className="border-t border-teal/20 bg-teal/5 px-4 py-3">
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={lessonForm.title}
                                  onChange={(e) =>
                                    setLessonForm((prev) => ({
                                      ...prev,
                                      title: e.target.value,
                                    }))
                                  }
                                  className={inputClass}
                                  placeholder="Lesson title"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <input
                                    type="url"
                                    value={lessonForm.video_url}
                                    onChange={(e) =>
                                      setLessonForm((prev) => ({
                                        ...prev,
                                        video_url: e.target.value,
                                      }))
                                    }
                                    className={inputClass}
                                    placeholder="Video URL (optional)"
                                  />
                                  <input
                                    type="number"
                                    value={lessonForm.video_duration_minutes}
                                    onChange={(e) =>
                                      setLessonForm((prev) => ({
                                        ...prev,
                                        video_duration_minutes: e.target.value,
                                      }))
                                    }
                                    className="w-24 shrink-0 rounded-lg border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                                    placeholder="Min"
                                    min="0"
                                    step="0.5"
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={lessonForm.is_preview}
                                      onChange={(e) =>
                                        setLessonForm((prev) => ({
                                          ...prev,
                                          is_preview: e.target.checked,
                                        }))
                                      }
                                      className="h-4 w-4 rounded border-charcoal/30 text-teal focus:ring-teal"
                                    />
                                    <span className="font-body text-xs text-charcoal/60">
                                      Free preview
                                    </span>
                                  </label>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleAddLesson(mod.id)}
                                      disabled={
                                        busy || !lessonForm.title.trim()
                                      }
                                      className="rounded-md bg-teal px-3 py-1.5 font-body text-xs font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
                                    >
                                      {busy ? 'Adding...' : 'Add Lesson'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setAddingLessonFor(null)}
                                      className="rounded-md border border-charcoal/15 px-3 py-1.5 font-body text-xs text-charcoal hover:bg-charcoal/5"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Danger Zone */}
      <section className="rounded-xl border border-coral/20 bg-white p-6 shadow-sm">
        <h2 className="mb-2 font-display text-lg font-semibold text-coral">
          Danger Zone
        </h2>
        <p className="mb-4 font-body text-sm text-charcoal/60">
          Permanently delete this course and all associated modules, lessons,
          and enrollment data.
        </p>
        <button
          type="button"
          onClick={handleDeleteCourse}
          disabled={busy}
          className="rounded-lg border border-coral/30 px-4 py-2 font-body text-sm font-medium text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
        >
          Delete Course
        </button>
      </section>
    </div>
  )
}

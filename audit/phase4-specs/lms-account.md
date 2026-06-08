# Phase 4.2 LMS Student Front-End + Phase 4.3 Account Self-Service — Build Spec

**Scope:** F-7 (LMS frontend for students), F-8 (account self-service pages), F-9 (stub placeholder removals from admin settings).

## Part 1: Critical Bugfixes (Do These First)

### 1.1 Fix `auth_user_id` Column Bug (F-13)
Three files query non-existent `profiles.auth_user_id`. Replace with `profiles.id = auth.uid()` pattern (just use `user.id` directly as `profileId`).

**Query pattern (WRONG):**
```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('id')
  .eq('auth_user_id', user.id)
  .single()
const profileId = profile?.id || user.id
```

**Replace with (CORRECT):**
```ts
const profileId = user.id  // profiles.id IS the auth UID
```

## Part 2: Database Schema (Already Exist — Verified)

All LMS tables exist in DB with 0 rows:
- `courses` — full course metadata + status (draft/published/archived) + pricing
- `course_modules` — groups lessons by module, FK to courses
- `lessons` — individual lesson units with video_url, sort_order
- `enrollments` — student course memberships, status: active|completed|dropped
- `lesson_progress` — per-student lesson tracking (is_completed, last_position_seconds), composite unique (enrollment_id, lesson_id)
- `lesson_comments` — threaded comments per lesson with parent_id support
- `addresses` — customer shipping address book (label, line1, line2, city, state, postal_code, country, is_default)
- `wishlist_items` — product wishlist (profile_id, product_id)

**No schema changes needed.** Column names verified exact match with `src/lib/types/database.ts`.

## Part 3: Public Marketing Pages (LMS Student Front-End)

### 3.1 Course Catalog
`src/app/(marketing)/courses/page.tsx` — Hero + filter bar (course_type, difficulty_level, price) + grid of 12 courses/page. Cards: thumbnail, title, instructor, difficulty, price. Link to `/courses/[slug]`.

### 3.2 Course Detail
`src/app/(marketing)/courses/[slug]/page.tsx` — Hero (preview video or image), title, instructor. Long description, materials_needed. Modules accordion showing lessons. Enrollment check: if enrolled, show "Resume Learning" button to first incomplete lesson; else show "Enroll" CTA.

### 3.3 Lesson Player
`src/app/(marketing)/courses/[slug]/lesson/[lessonSlug]/page.tsx` — Enrollment-gated. Video player (video_url), lesson title/description. Right sidebar: course progress bar, module list, lesson nav buttons. Comments section below video. "Mark complete" button calls PATCH `/api/lessons/[id]/progress`.

---

## Part 4: Account Self-Service Pages (All new)

### 4.1 Settings
`src/app/(marketing)/account/settings/page.tsx` — Profile section (read-only email, full_name), password change form (current + new + confirm), email change form. Both submit to new API endpoints that use Supabase Auth.

### 4.2 Wishlist
`src/app/(marketing)/account/wishlist/page.tsx` — Grid of products from `wishlist_items` + products JOIN. "Remove" and "Add to Cart" per item. Empty state.

### 4.3 My Classes
`src/app/(marketing)/account/classes/page.tsx` — Tab view: Active | Completed | Dropped. Each enrollment shows course thumbnail, title, instructor, progress bar, "Resume" button.

### 4.4 Addresses
`src/app/(marketing)/account/addresses/page.tsx` — List of addresses with label, full address, "Default" badge. Edit/Delete buttons. "Add New Address" modal or inline form.

---

## Part 5: Admin Settings Stubs Fix (F-9)

Replace placeholder delays in `SettingsClient.tsx` with real API calls:
- "Clear Carts" → DELETE `/api/admin/carts` (delete carts older than 24h or all)
- "Revalidate Cache" → POST `/api/admin/revalidate` (Next.js revalidatePath call)

---

## Part 6: Navigation & Auth Guards

All account pages check: `if (!user) redirect('/login')` at top. Links in `/account/page.tsx` already exist and point to the new routes.

---

## Implementation Summary

**Public Pages (7):**
- courses/page.tsx (catalog)
- courses/[slug]/page.tsx (detail)
- courses/[slug]/lesson/[lessonSlug]/page.tsx (player)
- account/settings/page.tsx
- account/wishlist/page.tsx
- account/classes/page.tsx
- account/addresses/page.tsx

**API Routes (8):**
- account/password/route.ts (POST password change)
- account/email/route.ts (POST email change)
- account/wishlist/route.ts (POST add, GET list)
- account/wishlist/[id]/route.ts (DELETE)
- account/addresses/route.ts (POST, GET, PATCH)
- account/addresses/[id]/route.ts (PATCH update, DELETE)
- admin/carts/route.ts (DELETE clear old)
- admin/revalidate/route.ts (POST revalidate)

**Files to Modify (3):**
- api/courses/[id]/enroll/route.ts (remove auth_user_id query)
- api/lessons/[id]/progress/route.ts (remove auth_user_id query)
- api/lessons/[id]/comments/route.ts (remove auth_user_id query)
- (admin)/admin/settings/SettingsClient.tsx (wire real API calls)
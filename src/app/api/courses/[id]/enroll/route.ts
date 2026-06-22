import { getStripe } from '@/lib/stripe'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// POST /api/courses/[id]/enroll — enroll in a free course or start Stripe Checkout for a paid one; authenticated users.
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id: courseId } = await props.params

  try {
    const supabase = await createClient()

    // Authenticate user
    const authHeader = request.headers.get('authorization')
    let user = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const { data } = await supabase.auth.getUser(token)
      user = data.user
    }

    if (!user) {
      // Try cookie-based auth via the request
      const { data } = await supabase.auth.getUser()
      user = data.user
    }

    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Validate course exists and is published
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, slug, title, price, status')
      .eq('id', courseId)
      .single()

    if (courseError || !course) {
      return Response.json({ error: 'Course not found' }, { status: 404 })
    }

    if (course.status !== 'published') {
      return Response.json({ error: 'Course is not available' }, { status: 400 })
    }

    // profiles.id IS auth.uid() — there is no auth_user_id column.
    const profileId = user.id

    // Check if already enrolled
    const { data: existingEnrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('profile_id', profileId)
      .eq('course_id', courseId)
      .maybeSingle()

    if (existingEnrollment) {
      return Response.json({ error: 'Already enrolled in this course' }, { status: 409 })
    }

    // Free course: enroll directly. Use the service client for the INSERT —
    // enrollments RLS would otherwise drop the cookie-client write. (B-13)
    if (!course.price || course.price === 0) {
      const svc = await createServiceClient()
      const { data: enrollment, error: enrollError } = await svc
        .from('enrollments')
        .insert({
          profile_id: profileId,
          course_id: courseId,
          status: 'active',
        })
        .select()
        .single()

      if (enrollError) {
        return Response.json({ error: enrollError.message }, { status: 500 })
      }

      return Response.json({ enrolled: true, enrollment })
    }

    // Paid course: create Stripe Checkout Session
    const stripe = await getStripe()
    // Normalized env (scheme + no trailing slash) or the request origin —
    // never an invalid/relative base for Stripe URLs.
    let siteUrl: string
    try {
      const raw = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
      const candidate = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : ''
      siteUrl = new URL(candidate || new URL(request.url).origin).origin
    } catch {
      siteUrl = new URL(request.url).origin
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: course.title,
            },
            unit_amount: Math.round(course.price * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/courses/${course.slug}?enrolled=true`,
      cancel_url: `${siteUrl}/courses/${course.slug}`,
      metadata: {
        course_id: courseId,
        profile_id: profileId,
      },
      customer_email: user.email,
    })

    return Response.json({ url: session.url })
  } catch (err) {
    console.error('Enrollment error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

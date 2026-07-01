import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { z } from 'zod'

const Create = z.object({
  name: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  template_type: z.enum(['transactional', 'marketing', 'automation']).default('marketing'),
  category: z.string().nullable().optional(),
  content_html: z.string().default(''),
  content_json: z.unknown().optional(),
  variables: z.array(z.string()).optional(),
})

const Update = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).optional(),
  template_type: z.enum(['transactional', 'marketing', 'automation']).optional(),
  category: z.string().nullable().optional(),
  content_html: z.string().optional(),
  content_json: z.unknown().optional(),
  variables: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
})

// GET /api/admin/email-templates — list email templates; admin only.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('email_templates')
    .select('id, name, subject, content_json, content_html, template_type, category, variables, is_active, created_at, updated_at')
    .order('name', { ascending: true })

  if (error) return dbFail(error, 'admin/email-templates GET')
  return Response.json({ templates: data || [] })
}

// POST /api/admin/email-templates — create an email template; admin only.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, Create)
  if (!parsed.ok) return parsed.response

  const insert = {
    name: parsed.data.name,
    subject: parsed.data.subject,
    template_type: parsed.data.template_type,
    category: parsed.data.category ?? null,
    content_html: parsed.data.content_html,
    content_json: parsed.data.content_json ?? {},
    variables: parsed.data.variables ?? [],
    is_active: true,
  }

  const { data, error } = await auth.supabase
    .from('email_templates')
    .insert(insert)
    .select('id, name, subject, content_json, content_html, template_type, category, variables, is_active, created_at, updated_at')
    .single()
  if (error) return dbFail(error, 'admin/email-templates POST')
  return apiOk({ template: data }, 201)
}

// PATCH /api/admin/email-templates — update an email template by id; admin only.
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, Update)
  if (!parsed.ok) return parsed.response

  const { id, ...updates } = parsed.data

  const { data, error } = await auth.supabase
    .from('email_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return dbFail(error, 'admin/email-templates PATCH')
  return Response.json({ template: data })
}

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Normalize a stored storage reference to a bucket-relative object path.
 * Accepts a bare path ("pending/x/file.jpg"), a legacy public URL, or an
 * existing signed/authenticated URL, and returns just the object path.
 */
export function extractStoragePath(bucket: string, urlOrPath: string): string {
  if (!urlOrPath) return urlOrPath
  for (const seg of ['public', 'sign', 'authenticated']) {
    const marker = `/storage/v1/object/${seg}/${bucket}/`
    const i = urlOrPath.indexOf(marker)
    if (i !== -1) return urlOrPath.slice(i + marker.length).split('?')[0]
  }
  return urlOrPath.replace(new RegExp(`^/?${bucket}/`), '')
}

/**
 * Mint short-lived signed URLs for objects in a private bucket. Pass any
 * Supabase client whose identity is allowed to SELECT the bucket (an admin
 * cookie client, or the service client). Best-effort: on any failure the
 * original input strings are returned so the UI degrades rather than throws.
 */
export async function signBucketUrls(
  supabase: SupabaseClient,
  bucket: string,
  urlsOrPaths: Array<string | null | undefined>,
  expiresIn = 3600,
): Promise<string[]> {
  const inputs = urlsOrPaths.filter((u): u is string => !!u)
  if (inputs.length === 0) return []
  const paths = inputs.map((u) => extractStoragePath(bucket, u))
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn)
    if (error || !data) return inputs
    return data.map((d, i) => d.signedUrl || inputs[i])
  } catch {
    return inputs
  }
}

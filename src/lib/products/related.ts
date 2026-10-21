export interface RelatedCandidate {
  id: string
  title: string
  slug: string
  category_id?: string | null
  tags?: string[] | null
  description_html?: string | null
  is_original: boolean
  prints_enabled: boolean
}

function subject(product: RelatedCandidate): string | null {
  const text = `${product.title} ${product.slug} ${(product.tags ?? []).join(' ')} ${product.description_html ?? ''}`.toLowerCase()
  if (/charleston|drayton|aikens?-rhett|audubon swamp|girls.trip/.test(text)) return 'charleston'
  if (/encouragement series/.test(text)) return 'encouragement'
  if (/cactus|cactuses|saguaro/.test(text)) return 'cactus'
  if (/beach|seaside|dolphin|coastal/.test(text)) return 'beach'
  return null
}

/** Related art shares a subject or collection; commission examples are never suggested. */
export function relatedArtworks<T extends RelatedCandidate>(product: RelatedCandidate, candidates: T[], limit = 4): T[] {
  const theme = subject(product)
  const tags = new Set(product.tags ?? [])
  return candidates
    .filter(candidate => candidate.id !== product.id && (candidate.is_original || candidate.prints_enabled) && !/^custom[- ]/.test(candidate.slug))
    .map(candidate => ({ candidate, score:
      (theme && subject(candidate) === theme ? 100 : 0)
      + (product.category_id && candidate.category_id === product.category_id ? 20 : 0)
      + (candidate.tags ?? []).filter(tag => tags.has(tag)).length * 5,
    }))
    .filter(({ candidate, score }) => score > 0 && (!theme || subject(candidate) === theme))
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, limit).map(({ candidate }) => candidate)
}

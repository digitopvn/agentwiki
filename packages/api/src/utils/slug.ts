/** Slug generation + conflict resolution */

/** Generate a URL-safe slug from title */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

/** Generate unique slug, appending suffix if conflict exists */
export async function uniqueSlug(
  baseSlug: string,
  checkExists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = baseSlug || 'untitled'
  if (!(await checkExists(slug))) return slug

  for (let i = 2; i <= 100; i++) {
    const candidate = `${slug}-${i}`
    if (!(await checkExists(candidate))) return candidate
  }

  // Fallback: append random suffix
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${slug}-${suffix}`
}

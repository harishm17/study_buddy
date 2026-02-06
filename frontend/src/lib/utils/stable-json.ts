type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike }

const normalize = (value: unknown): JsonLike => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item))
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, normalize(entryValue)] as const)
    return Object.fromEntries(entries) as { [key: string]: JsonLike }
  }

  return String(value)
}

export const stableStringify = (value: unknown): string => JSON.stringify(normalize(value))

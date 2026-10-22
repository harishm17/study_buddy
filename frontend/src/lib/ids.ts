/**
 * Ids that come from a URL are looked at before they reach the database. Records are keyed by UUIDs,
 * so anything else cannot match, and some strings (a NUL byte, `/courses/%00`) are not even valid
 * database input: the query would throw instead of finding nothing. Queries that take an id from
 * the address return "not found" for an id that fails this check.
 */
export const isRecordId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)

/** True when every one of the ids is usable. */
export const areRecordIds = (...values: unknown[]): boolean => values.every(isRecordId)

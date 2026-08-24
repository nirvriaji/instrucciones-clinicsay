/**
 * Canonicalize wire-format JSON by converting all `null` values to `undefined`.
 *
 * OpenAI Structured Outputs (strict:true) requires every field to be present
 * in the response. Optional fields are modeled as `type: ['x', 'null']`.
 * The runtime types use `?` (undefined) for optional fields.
 * This function bridges the gap: it is a pure wire-format translation,
 * NOT a business logic fix.
 *
 * It is deep, idempotent, and preserves all non-null values.
 */
export function canonicalizeNullValues<T>(value: T): T {
  if (value === null) return undefined as unknown as T;
  if (Array.isArray(value)) {
    return value.map(canonicalizeNullValues) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = canonicalizeNullValues(val);
    }
    return result as unknown as T;
  }
  return value;
}

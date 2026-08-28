/**
 * Convert wire-format null values to the runtime representation.
 * OpenAI strict schemas use null for optional fields, while runtime types use
 * undefined. This translation does not apply business compatibility rules.
 */
export function canonicalizeNullValues<T>(value: T): T {
  if (value === null) return undefined as unknown as T;
  if (Array.isArray(value)) return value.map(canonicalizeNullValues) as unknown as T;
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) result[key] = canonicalizeNullValues(val);
    return result as T;
  }
  return value;
}

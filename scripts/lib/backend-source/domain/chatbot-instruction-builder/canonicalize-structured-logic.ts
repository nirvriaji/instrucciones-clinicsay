/**
 * Convert wire-format null values to the runtime representation.
 * OpenAI strict schemas use null for optional fields, while runtime types use
 * undefined. This translation does not apply business compatibility rules.
 *
 * Exception: `treatmentId` inside `globalSchedulingPolicies` (structured logic)
 * and `schedulingMinutePolicies` (builder key points) is a SEMANTIC null —
 * null identifies the clinic-wide (global) policy. That null is preserved so
 * the non-wire path does not lose the distinction between "global policy"
 * and "absent value". Everywhere else, null still becomes undefined.
 */
const ARRAYS_WITH_SEMANTIC_NULL_TREATMENT_ID = new Set(['globalSchedulingPolicies', 'schedulingMinutePolicies']);

export function canonicalizeNullValues<T>(value: T): T {
  return canonicalize(value, false) as T;
}

function canonicalize(value: unknown, insidePolicyArray: boolean): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, insidePolicyArray));
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (insidePolicyArray && key === 'treatmentId' && val === null) {
        result[key] = null;
        continue;
      }
      result[key] = canonicalize(val, ARRAYS_WITH_SEMANTIC_NULL_TREATMENT_ID.has(key) && Array.isArray(val));
    }
    return result;
  }
  return value;
}

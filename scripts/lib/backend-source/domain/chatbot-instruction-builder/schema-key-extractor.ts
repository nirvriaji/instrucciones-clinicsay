/**
 * Schema Key Extractor
 *
 * Deriva allowed keys dinámicamente desde un objeto JSON Schema.
 * Elimina la necesidad de hardcodear `new Set([...])` en validadores.
 *
 * Soporta:
 *   - properties: { type: 'object', properties: { a: ..., b: ... } }
 *   - additionalProperties: { type: 'object', additionalProperties: { type: 'object', properties: { x: ..., y: ... } } }
 *   - items: { type: 'array', items: { type: 'object', properties: { ... } } }
 *
 * Usage:
 *   const allowed = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.treatmentPolicyHints.items.properties');
 *   // Set(['treatmentId', 'treatmentName', ...])
 */

export function extractAllowedKeys(schema: unknown, path: string): Set<string> {
  const parts = path.split('.');
  let current: unknown = schema;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return new Set();
    }

    if (typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return new Set();
    }
  }

  if (current === null || current === undefined) {
    return new Set();
  }

  const obj = current as Record<string, unknown>;
  const lastPart = parts[parts.length - 1];

  // Case A: path ends with 'properties' → current IS the properties object itself
  if (lastPart === 'properties' && typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    return new Set(Object.keys(obj));
  }

  // Case B: path ends with 'additionalProperties' → current IS the additionalProperties object
  if (lastPart === 'additionalProperties' && typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    if ('properties' in obj) {
      const props = obj.properties;
      if (typeof props === 'object' && props !== null && !Array.isArray(props)) {
        return new Set(Object.keys(props));
      }
    }
    return new Set(Object.keys(obj));
  }

  // Case C: current has explicit 'properties' inside (e.g. an object definition)
  if ('properties' in obj) {
    const props = obj.properties;
    if (typeof props === 'object' && props !== null && !Array.isArray(props)) {
      return new Set(Object.keys(props));
    }
  }

  // Case D: current has 'additionalProperties' that has 'properties'
  // (e.g. responseTemplates uses additionalProperties for dynamic keys)
  if ('additionalProperties' in obj) {
    const additional = obj.additionalProperties;
    if (
      typeof additional === 'object' &&
      additional !== null &&
      !Array.isArray(additional) &&
      'properties' in (additional as Record<string, unknown>)
    ) {
      const props = (additional as Record<string, unknown>).properties;
      if (typeof props === 'object' && props !== null && !Array.isArray(props)) {
        return new Set(Object.keys(props));
      }
    }
  }

  return new Set();
}

/**
 * Convenience: batch-extract multiple paths from the same schema.
 */
export function extractAllowedKeysMap(
  schema: unknown,
  paths: Record<string, string>,
): Record<string, Set<string>> {
  const result: Record<string, Set<string>> = {};
  for (const [name, path] of Object.entries(paths)) {
    result[name] = extractAllowedKeys(schema, path);
  }
  return result;
}

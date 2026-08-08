/**
 * Schema Key Extractor (JS port)
 *
 * Deriva allowed keys dinámicamente desde un objeto JSON Schema.
 *
 * Soporta:
 *   - properties: { type: 'object', properties: { a: ..., b: ... } }
 *   - additionalProperties: { type: 'object', additionalProperties: { type: 'object', properties: { x: ..., y: ... } } }
 *   - items: { type: 'array', items: { type: 'object', properties: { ... } } }
 *
 * Usage:
 *   const allowed = extractAllowedKeys(schema, 'properties.treatmentPolicyHints.items.properties');
 */

function extractAllowedKeys(schema, path) {
  const parts = path.split('.');
  let current = schema;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return new Set();
    }
    if (typeof current === 'object' && !Array.isArray(current)) {
      current = current[part];
    } else {
      return new Set();
    }
  }

  if (current === null || current === undefined) {
    return new Set();
  }

  // Primary: object with explicit 'properties'
  const lastPart = parts[parts.length - 1];

  // Case A: path ends with 'properties' → current IS the properties object itself
  if (lastPart === 'properties' && typeof current === 'object' && current !== null && !Array.isArray(current)) {
    return new Set(Object.keys(current));
  }

  // Case B: path ends with 'additionalProperties' → current IS the additionalProperties object
  if (lastPart === 'additionalProperties' && typeof current === 'object' && current !== null && !Array.isArray(current)) {
    if ('properties' in current) {
      const props = current.properties;
      if (typeof props === 'object' && props !== null && !Array.isArray(props)) {
        return new Set(Object.keys(props));
      }
    }
    return new Set(Object.keys(current));
  }

  // Case C: current has explicit 'properties' inside (e.g. an object definition)
  if (typeof current === 'object' && 'properties' in current) {
    const props = current.properties;
    if (typeof props === 'object' && props !== null && !Array.isArray(props)) {
      return new Set(Object.keys(props));
    }
  }

  // Case D: current has 'additionalProperties' that has 'properties'
  if (typeof current === 'object' && 'additionalProperties' in current) {
    const additional = current.additionalProperties;
    if (
      typeof additional === 'object' &&
      additional !== null &&
      !Array.isArray(additional) &&
      'properties' in additional
    ) {
      const props = additional.properties;
      if (typeof props === 'object' && props !== null && !Array.isArray(props)) {
        return new Set(Object.keys(props));
      }
    }
  }

  return new Set();
}

/**
 * Batch-extract multiple paths from the same schema.
 */
function extractAllowedKeysMap(schema, paths) {
  const result = {};
  for (const [name, path] of Object.entries(paths)) {
    result[name] = extractAllowedKeys(schema, path);
  }
  return result;
}

module.exports = { extractAllowedKeys, extractAllowedKeysMap };

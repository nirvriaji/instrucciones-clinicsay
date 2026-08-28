/**
 * Diff Engine — JSON diff utility for the builder.
 *
 * Provides JSON-path diff for structured objects.
 */

export type JSONDiffResult = {
  /** Whether there are any changes */
  hasChanges: boolean;
  /** Added paths (e.g., "rules[0].message") */
  added: string[];
  /** Removed paths */
  removed: string[];
  /** Changed paths with before/after values */
  changed: Record<string, { before: unknown; after: unknown }>;
};

/**
 * Generate a JSON diff between two objects.
 *
 * Returns paths that were added, removed, or changed.
 */
export function diffJSON(before: object, after: object): JSONDiffResult {
  const result: JSONDiffResult = {
    hasChanges: false,
    added: [],
    removed: [],
    changed: {},
  };

  compareObjects(before, after, '', result);

  result.hasChanges =
    result.added.length > 0 ||
    result.removed.length > 0 ||
    Object.keys(result.changed).length > 0;

  return result;
}

function compareObjects(
  before: unknown,
  after: unknown,
  path: string,
  result: JSONDiffResult,
): void {
  // If both are the same primitive, no change
  if (before === after) return;

  // If types differ, it's a change
  const beforeType = typeof before;
  const afterType = typeof after;

  if (beforeType !== afterType || before === null || after === null) {
    if (before === null && after !== null) {
      result.added.push(path);
    } else if (before !== null && after === null) {
      result.removed.push(path);
    } else {
      result.changed[path] = { before, after };
    }
    return;
  }

  // If both are arrays
  if (Array.isArray(before) && Array.isArray(after)) {
    const maxLen = Math.max(before.length, after.length);
    for (let i = 0; i < maxLen; i++) {
      const beforeItem = before[i];
      const afterItem = after[i];
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;

      if (i >= before.length) {
        result.added.push(itemPath);
      } else if (i >= after.length) {
        result.removed.push(itemPath);
      } else {
        compareObjects(beforeItem, afterItem, itemPath, result);
      }
    }
    return;
  }

  // If both are objects
  if (beforeType === 'object' && afterType === 'object') {
    const beforeObj = before as Record<string, unknown>;
    const afterObj = after as Record<string, unknown>;
    const beforeKeys = Object.keys(beforeObj);
    const afterKeys = Object.keys(afterObj);
    const allKeys = new Set([...beforeKeys, ...afterKeys]);

    for (const key of allKeys) {
      const keyPath = path ? `${path}.${key}` : key;
      if (!(key in beforeObj)) {
        result.added.push(keyPath);
      } else if (!(key in afterObj)) {
        result.removed.push(keyPath);
      } else {
        compareObjects(beforeObj[key], afterObj[key], keyPath, result);
      }
    }
    return;
  }

  // Primitives that differ
  if (before !== after) {
    result.changed[path] = { before, after };
  }
}

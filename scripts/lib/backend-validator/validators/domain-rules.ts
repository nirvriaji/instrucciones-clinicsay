/**
 * Domain Rules Validator — validates domain-specific business rules.
 *
 * Extracted from validator.ts (section 2) to separate domain rule checks
 * from structural and cross-reference validations.
 */

import type { StructuredLogic, StructuredLogicChatMode } from '../structured-logic';
import { CRITICAL_INTENTS } from '../constants';
import { ALL_CHAT_TOOL_NAMES, StructuredLogicJsonSchema } from '../structured-logic-json-schema';
import { ALL_CHAT_TOOLS_TASKS_ONLY } from '../tool-definitions-tasks-only';
import { extractAllowedKeys } from '../schema-key-extractor';

const ALLOWED_CAPABILITY_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.capabilities.properties');
const ALLOWED_ERROR_CATEGORY_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.errorCategories.items.properties');

function rejectUnknownKeys(
  obj: Record<string, unknown> | null | undefined,
  allowedKeys: Set<string>,
  path: string,
  errors: string[],
): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Unknown property at ${path}.${key}`);
    }
  }
}

export function validateDomainRules(
  sl: Partial<StructuredLogic>,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  // 2a. Capabilities validation (mode is external to the JSON)
  if (!mode || (mode !== 'full' && mode !== 'tasks-only')) {
    errors.push('mode is required and must be "full" or "tasks-only"');
  }
  if (sl.capabilities && typeof sl.capabilities === 'object') {
    rejectUnknownKeys(
      sl.capabilities as Record<string, unknown>,
      ALLOWED_CAPABILITY_KEYS,
      'capabilities',
      errors,
    );
  }
  if (typeof sl.capabilities?.sensitiveSituations !== 'boolean') {
    errors.push('capabilities.sensitiveSituations must be a boolean');
  }
  if (typeof sl.capabilities?.protocols !== 'boolean') {
    errors.push('capabilities.protocols must be a boolean');
  }

  // 2b. Rules must have description for intent classifier
  if (Array.isArray(sl.rules)) {
    sl.rules.forEach((rule, index) => {
      if (!rule.description || rule.description.trim().length === 0) {
        errors.push(`Rule ${index} (${rule.id || rule.intent}) is missing 'description' for intent classifier.`);
      }
    });
  }

  // 2c. Critical intents must be present (semantic validation)
  const presentIntents = new Set(Array.isArray(sl.rules) ? sl.rules.map((r) => r.intent) : []);
  const missingCategories = CRITICAL_INTENTS.filter(
    (c) => !presentIntents.has(c.category)
  );
  if (missingCategories.length > 0) {
    errors.push(
      `Missing critical intent categories: ${missingCategories.map((c) => c.category).join(', ')}. ` +
      `These intents are required for the classifier to distinguish ${missingCategories.map((c) => c.description).join(', ')}.`
    );
  }

  const validTools = new Set(ALL_CHAT_TOOL_NAMES);
  const tasksOnlyToolNames = new Set(ALL_CHAT_TOOLS_TASKS_ONLY.map((t) => t.name));
  const schedulingTools = new Set(
    ALL_CHAT_TOOL_NAMES.filter((name) => !tasksOnlyToolNames.has(name)),
  );

  // 2f. errorCategories must have suggestions
  (sl.errorCategories ?? []).forEach((cat, index) => {
    rejectUnknownKeys(
      cat as unknown as Record<string, unknown>,
      ALLOWED_ERROR_CATEGORY_KEYS,
      `errorCategories[${index}]`,
      errors,
    );
    if (!cat.suggestions || cat.suggestions.length === 0) {
      errors.push(
        `ErrorCategory ${index} (${cat.id}) is missing 'suggestions'. ` +
          `Add actionable suggestions that the LLM can use when this error occurs. ` +
          `Example: ["Try a different time slot", "Contact clinic staff for assistance"]`
      );
    }
  });
}

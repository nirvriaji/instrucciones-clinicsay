/**
 * Cross-Reference Validator — validates cross-references between sections.
 *
 * Extracted from validator.ts (section 5) to separate cross-reference checks
 * from basic schema and structural validations.
 */

import type { BusinessRule, StructuredLogic } from '../structured-logic';
import { StructuredLogicJsonSchema } from '../structured-logic-json-schema';
import { extractAllowedKeys } from '../schema-key-extractor';

const ALLOWED_TPH_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.treatmentPolicyHints.items.properties');
const ALLOWED_RESPONSE_TEMPLATE_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.responseTemplates.additionalProperties.properties');
const ALLOWED_RULE_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.rules.items.properties');
const ALLOWED_CONDITION_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.rules.items.properties.conditions.items.properties');
const ALLOWED_INTENT_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.intents.additionalProperties.properties');
const TECHNICAL_TEMPLATE_TEXT = /^(?:word\d+_)+$/;

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

export function validateCrossReferences(
  sl: Partial<StructuredLogic>,
  errors: string[],
): void {
  // 5a. Optional sections must be the right type
  if (sl.identity !== undefined && typeof sl.identity !== 'object') {
    errors.push('identity must be an object');
  }
  if (sl.styleRules !== undefined && typeof sl.styleRules !== 'object') {
    errors.push('styleRules must be an object');
  }
  if (sl.responseTemplates !== undefined && typeof sl.responseTemplates !== 'object') {
    errors.push('responseTemplates must be an object');
  }
  if (sl.faq !== undefined && !Array.isArray(sl.faq)) {
    errors.push('faq must be an array');
  }
  if (sl.treatmentPolicyHints !== undefined) {
    if (!Array.isArray(sl.treatmentPolicyHints)) {
      errors.push('treatmentPolicyHints must be an array');
    } else {
      sl.treatmentPolicyHints.forEach((hint, index) => {
        rejectUnknownKeys(
          hint as unknown as Record<string, unknown>,
          ALLOWED_TPH_KEYS,
          `treatmentPolicyHints[${index}]`,
          errors,
        );
      });
    }
  }
  if (sl.systemPromptInstructions !== undefined && typeof sl.systemPromptInstructions !== 'object') {
    errors.push('systemPromptInstructions must be an object');
  }

  // 5b. Validate styleRules enum values
  const validEmojiPolicies = ['allowed', 'forbidden', 'contextual'];
  if (sl.styleRules && typeof sl.styleRules === 'object') {
    const sr = sl.styleRules as Record<string, unknown>;
    if (sr.emojiPolicy !== undefined && !validEmojiPolicies.includes(sr.emojiPolicy as string)) {
      errors.push(`styleRules.emojiPolicy must be one of: ${validEmojiPolicies.join(', ')}`);
    }
    if (sr.languagePolicy !== undefined && sr.languagePolicy !== 'auto' && typeof sr.languagePolicy !== 'string') {
      errors.push('styleRules.languagePolicy must be "auto" or a language code string');
    }
  }

  // 5b1. Validate timeGreetingRanges
  if (sl.styleRules && typeof sl.styleRules === 'object') {
    const ranges = (sl.styleRules as Record<string, unknown>).timeGreetingRanges;
    if (!Array.isArray(ranges)) {
      errors.push('styleRules.timeGreetingRanges is required and must be an array');
    } else {
      if (ranges.length !== 3) {
        errors.push(`styleRules.timeGreetingRanges must contain exactly 3 ranges, got ${ranges.length}`);
      }
      const validLabels = new Set(['dias', 'tardes', 'noches']);
      const seenLabels = new Set<string>();
      const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i] as Record<string, unknown>;
        if (!r || typeof r !== 'object' || Array.isArray(r)) {
          errors.push(`styleRules.timeGreetingRanges[${i}] must be an object`);
          continue;
        }
        const label = r.label;
        if (typeof label !== 'string' || !validLabels.has(label)) {
          errors.push(`styleRules.timeGreetingRanges[${i}].label must be one of: dias, tardes, noches`);
        } else if (seenLabels.has(label)) {
          errors.push(`styleRules.timeGreetingRanges has duplicate label: ${label}`);
        } else {
          seenLabels.add(label);
        }
        if (typeof r.start !== 'string' || !hhmmRegex.test(r.start)) {
          errors.push(`styleRules.timeGreetingRanges[${i}].start must be a valid HH:mm string`);
        }
        if (typeof r.end !== 'string' || !hhmmRegex.test(r.end)) {
          errors.push(`styleRules.timeGreetingRanges[${i}].end must be a valid HH:mm string`);
        }
        if (typeof r.greeting !== 'string' || (r.greeting as string).trim().length === 0) {
          errors.push(`styleRules.timeGreetingRanges[${i}].greeting must be a non-empty string`);
        }
      }
      // Validate 24h coverage and no overlaps
      if (ranges.length === 3 && seenLabels.size === 3) {
        const allMinutes = new Set<number>();
        for (const r of ranges as Array<Record<string, unknown>>) {
          const start = r.start as string;
          const end = r.end as string;
          const [sh, sm] = start.split(':').map(Number);
          const [eh, em] = end.split(':').map(Number);
          let s = sh * 60 + sm;
          let e = eh * 60 + em;
          if (e < s) {
            for (let m = s; m < 24 * 60; m++) allMinutes.add(m);
            for (let m = 0; m <= e; m++) allMinutes.add(m);
          } else {
            for (let m = s; m <= e; m++) allMinutes.add(m);
          }
        }
        if (allMinutes.size !== 24 * 60) {
          errors.push('styleRules.timeGreetingRanges must cover the full 24-hour cycle without gaps');
        }
      }
    }
  }

  // 5c. Validate responseTemplates shape
  const validTemplateModes = ['literal', 'model'];
  if (sl.responseTemplates && typeof sl.responseTemplates === 'object') {
    const templates = sl.responseTemplates as Record<string, unknown>;
    for (const [key, value] of Object.entries(templates)) {
      if (typeof value === 'string') {
        errors.push(`responseTemplates["${key}"] must be an object {text, mode}, not a string`);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        rejectUnknownKeys(obj, ALLOWED_RESPONSE_TEMPLATE_KEYS, `responseTemplates["${key}"]`, errors);
        if (obj.mode !== undefined && !validTemplateModes.includes(obj.mode as string)) {
          errors.push(`responseTemplates["${key}"].mode must be one of: ${validTemplateModes.join(', ')}`);
        }
        if (obj.text !== undefined && typeof obj.text !== 'string') {
          errors.push(`responseTemplates["${key}"].text must be a string`);
        }
        if (typeof obj.text === 'string' && TECHNICAL_TEMPLATE_TEXT.test(obj.text.trim())) {
          errors.push(`responseTemplates["${key}"].text "${obj.text}" must be patient-facing text, not a technical template key`);
        }
      } else if (value !== null) {
        errors.push(`responseTemplates["${key}"] must be an object {text, mode}`);
      }
    }
  }

  // 5d. Validate business rules shape
  const validActions = ['allow', 'block'];
  const validOperators = ['equals', 'in', 'not_in', 'gt', 'lt', 'gte', 'lte', 'contains', 'exists'];
  if (Array.isArray(sl.rules)) {
    sl.rules.forEach((rule, index) => {
      rejectUnknownKeys(rule as unknown as Record<string, unknown>, ALLOWED_RULE_KEYS, `rules[${index}]`, errors);
      if (rule.action !== undefined && !validActions.includes(rule.action)) {
        errors.push(`Rule ${index} (${rule.id || rule.intent}) action must be "allow" or "block"`);
      }
      if (rule.priority !== undefined && rule.priority !== null && typeof rule.priority !== 'number') {
        errors.push(`Rule ${index} (${rule.id || rule.intent}) priority must be a number or null`);
      }
      if (rule.conditionLogic !== undefined && rule.conditionLogic !== null && rule.conditionLogic !== 'and' && rule.conditionLogic !== 'or') {
        errors.push(`Rule ${index} (${rule.id || rule.intent}) conditionLogic must be "and" or "or"`);
      }
      if ((rule as any).condition !== undefined) {
        errors.push(`Rule ${index} (${rule.id || rule.intent}) uses deprecated "condition" field. Use "conditions" array with "conditionLogic" instead.`);
      }
      const conditions = rule.conditions ?? [];
      conditions.forEach((cond, condIndex) => {
        rejectUnknownKeys(cond as unknown as Record<string, unknown>, ALLOWED_CONDITION_KEYS, `rules[${index}].conditions[${condIndex}]`, errors);
        if (cond.operator !== undefined && !validOperators.includes(cond.operator)) {
          errors.push(`Rule ${index} (${rule.id || rule.intent}) condition operator "${cond.operator}" is invalid. Must be one of: ${validOperators.join(', ')}`);
        }
        if (cond.negated !== undefined && cond.negated !== null && typeof cond.negated !== 'boolean') {
          errors.push(`Rule ${index} (${rule.id || rule.intent}) condition.negated must be a boolean`);
        }
        if (cond.note !== undefined && cond.note !== null && typeof cond.note !== 'string') {
          errors.push(`Rule ${index} (${rule.id || rule.intent}) condition.note must be a string`);
        }
      });
    });
  }
}

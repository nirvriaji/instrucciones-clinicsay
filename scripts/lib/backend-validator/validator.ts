/**
 * Builder Validator — Validates draft state before saving.
 */

import type { BusinessRule, StructuredLogic, StructuredLogicChatMode, ToolFlow } from './structured-logic';
import { validateStructuredLogicMinimum } from './structured-logic-minimum';

export { validateStructuredLogicMinimum } from './structured-logic-minimum';
import { ALL_CHAT_TOOL_NAMES, StructuredLogicJsonSchema } from './structured-logic-json-schema';
import { ALL_CHAT_TOOLS_TASKS_ONLY } from './tool-definitions-tasks-only';
import { extractAllowedKeys, extractAllowedKeysMap } from './schema-key-extractor';

/**
 * Reject unknown keys in an object at a given schema path.
 * Emits errors like `Unknown property at ${path}.${key}` for every key
 * not present in `allowedKeys`. This is the runtime mirror of
 * `additionalProperties: false` in the OpenAI JSON schema.
 */
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

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Critical intent categories every clinic must have a business rule for.
 * Single source of truth shared by `validateStructuredLogic` (blocking) and
 * `detectGaps` (advisory) — they previously required two different lists,
 * which meant a structuredLogic could pass strict validation but still be
 * reported as missing categories in the builder UI, or vice versa.
 */
export const CRITICAL_INTENTS: Array<{ category: string; description: string }> = [
  { category: 'appointment_confirmation', description: 'confirmation of existing appointments' },
  { category: 'appointment_cancellation', description: 'cancellation of existing appointments' },
  { category: 'scheduling_request', description: 'scheduling of new appointments' },
];

/**
 * Capabilities that are available before the tool cycle starts and are therefore
 * safe to use in flow.selection. Capabilities that only exist during the tool
 * cycle (e.g., hasResolvedTreatment) are intentionally excluded.
 */
export const TURN_START_CAPABILITIES = ['hasResolvedPatient'] as const;
export const TURN_START_CAPABILITY_SET = new Set<string>(TURN_START_CAPABILITIES);

// ── Schema-Derived Allowed Keys (single source of truth) ──
// These Sets are derived from StructuredLogicJsonSchema so that the
// runtime validator never drifts from the authoritative schema.
const ALLOWED_CAPABILITY_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.capabilities.properties');
const ALLOWED_TOOL_ORCHESTRATION_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.toolOrchestration.properties');
const ALLOWED_ERROR_CATEGORY_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.errorCategories.items.properties');
const ALLOWED_SYSTEM_PROMPT_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.systemPromptInstructions.properties');
const ALLOWED_TPH_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.treatmentPolicyHints.items.properties');
const ALLOWED_RESPONSE_TEMPLATE_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.responseTemplates.additionalProperties.properties');
const ALLOWED_IDENTITY_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.identity.properties');
const ALLOWED_STYLE_RULES_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.styleRules.properties');
const ALLOWED_FAQ_ENTRY_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.faq.items.properties');
const ALLOWED_PROTOCOL_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.protocols.additionalProperties.properties');
const ALLOWED_RULE_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.rules.items.properties');
const ALLOWED_CONDITION_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.rules.items.properties.conditions.items.properties');
const ALLOWED_INTENT_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.intents.additionalProperties.properties');
const ALLOWED_FLOW_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.toolOrchestration.properties.flows.additionalProperties.properties');
const ALLOWED_SELECTION_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.toolOrchestration.properties.flows.additionalProperties.properties.selection.properties');
const ALLOWED_STEP_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.toolOrchestration.properties.flows.additionalProperties.properties.steps.items.properties');

/**
 * Validate structuredLogic.
 * Combines basic schema validation with domain-specific rules.
 * This is the single source of truth for structuredLogic validation.
 *
 * @param mode - The chat mode is external to the JSON: 'full' enables scheduling
 *               and reminders, 'tasks-only' disables them.
 */
export function validateStructuredLogic(
  logic: unknown,
  mode: StructuredLogicChatMode,
): ValidationResult {
  const errors: string[] = [];

  if (!logic || typeof logic !== 'object') {
    return { valid: false, errors: ['structuredLogic must be an object'] };
  }

  const sl = logic as Partial<StructuredLogic>;

  // 1. Basic schema validation
  if (!sl.version) errors.push('version is required');
  if (!sl.capabilities || typeof sl.capabilities !== 'object') {
    errors.push('capabilities is required and must be an object');
  }
  if (!sl.intents || typeof sl.intents !== 'object') {
    errors.push('intents catalog is required and must be an object');
  } else if (Object.keys(sl.intents).length === 0) {
    errors.push('intents catalog is empty. The classifier needs a non-empty menu of available intents.');
  }
  if (!sl.toolOrchestration || typeof sl.toolOrchestration !== 'object') {
    errors.push('toolOrchestration is required and must be an object');
  } else {
    rejectUnknownKeys(
      sl.toolOrchestration as Record<string, unknown>,
      ALLOWED_TOOL_ORCHESTRATION_KEYS,
      'toolOrchestration',
      errors,
    );
  }
  if (!Array.isArray(sl.rules)) {
    errors.push('rules is required and must be an array');
  } else if (sl.rules.length === 0) {
    errors.push('rules must contain at least one rule for intent classification. Empty rules array breaks flow scoping and allows all tools.');
  }

  // Reject unknown top-level properties (strict schema)
  const allowedTopLevelKeys = new Set([
    'version',
    'capabilities',
    'identity',
    'styleRules',
    'responseTemplates',
    'faq',
    'intents',
    'toolOrchestration',
    'rules',
    'protocols',
    'errorCategories',
    'treatmentPolicyHints',
    'systemPromptInstructions',
  ]);
  const unknownKeys = Object.keys(sl).filter((k) => !allowedTopLevelKeys.has(k));
  if (unknownKeys.length > 0) {
    errors.push(`Unknown top-level properties are not allowed: ${unknownKeys.join(', ')}`);
  }

  // Validate intent references exist in catalog
  const declaredIntents = new Set(sl.intents ? Object.keys(sl.intents) : []);

  if (sl.toolOrchestration?.flows && typeof sl.toolOrchestration.flows === 'object') {
    for (const [flowName, flow] of Object.entries(sl.toolOrchestration.flows as Record<string, ToolFlow>)) {
      if (!flow.intent) {
        errors.push(`Flow "${flowName}" is missing required field "intent"`);
      } else if (!declaredIntents.has(flow.intent)) {
        errors.push(`Flow "${flowName}" references intent "${flow.intent}" which is not declared in the intents catalog`);
      }
    }
  }

  if (Array.isArray(sl.rules)) {
    for (const rule of sl.rules) {
      if (!rule.intent) {
        errors.push(`Rule "${rule.id || '(unknown)'}" is missing required field "intent"`);
      } else if (!declaredIntents.has(rule.intent)) {
        errors.push(`Rule "${rule.id || '(unknown)'}" references intent "${rule.intent}" which is not declared in the intents catalog`);
      }
    }
  }

  // 2. Domain-specific validation
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
  // The backend does not hardcode intent names, but we validate that
  // the clinic has rules for common dental/medical intents.
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
  // Derive scheduling-only tools dynamically: any tool present in the full
  // catalog but absent from the tasks-only catalog is considered scheduling.
  const tasksOnlyToolNames = new Set(ALL_CHAT_TOOLS_TASKS_ONLY.map((t) => t.name));
  const schedulingTools = new Set(
    ALL_CHAT_TOOL_NAMES.filter((name) => !tasksOnlyToolNames.has(name)),
  );
  const flows = sl.toolOrchestration?.flows ?? {};

  // 2d. Flows using manage_schedule_block_status should have responseTemplate
  Object.entries(flows).forEach(([flowName, flow]) => {
    const usesStatusTool = flow.steps.some((step) =>
      step.tools.includes('manage_schedule_block_status')
    );
    if (usesStatusTool && !flow.responseTemplate) {
      errors.push(
        `Flow '${flowName}' uses 'manage_schedule_block_status' but has no 'responseTemplate'. ` +
        `The backend will use a generic fallback. ` +
        `Consider adding a custom responseTemplate for better patient experience.`
      );
    }
  });

  // 2f. errorCategories must have suggestions
  (sl.errorCategories ?? []).forEach((cat, index) => {
    rejectUnknownKeys(
      cat as unknown as Record<string, unknown>,
      ALLOWED_ERROR_CATEGORY_KEYS,
      `errorCategories[${index}]`,
      errors,
    );
    if (!cat.suggestions || cat.suggestions.length === 0) {
      errors.push(`ErrorCategory ${index} (${cat.id}) is missing 'suggestions'.`);
    }
  });

  // 4. Exhaustive structural validation (when sections are present)
  // 4a. identity structure
  if (sl.identity && typeof sl.identity === 'object') {
    const identity = sl.identity as Record<string, unknown>;
    rejectUnknownKeys(identity, ALLOWED_IDENTITY_KEYS, 'identity', errors);
    const stringOrNullFields = [
      'botName', 'clinicName', 'address', 'phone', 'email', 'website',
      'openingHours', 'persona', 'tone', 'welcomeMessage', 'farewellMessage', 'escalationMessage',
    ];
    for (const field of stringOrNullFields) {
      if (identity[field] !== undefined && identity[field] !== null && typeof identity[field] !== 'string') {
        errors.push(`identity.${field} must be a string or null`);
      }
    }
    if (identity.language !== undefined && identity.language !== null && identity.language !== 'auto' && typeof identity.language !== 'string') {
      errors.push('identity.language must be "auto", a string or null');
    }
    if (identity.socialLinks !== undefined && identity.socialLinks !== null) {
      if (!Array.isArray(identity.socialLinks)) {
        errors.push('identity.socialLinks must be an array');
      } else {
        (identity.socialLinks as unknown[]).forEach((link, index) => {
          if (!link || typeof link !== 'object' || Array.isArray(link)) {
            errors.push(`identity.socialLinks[${index}] must be an object`);
            return;
          }
          const obj = link as Record<string, unknown>;
          if (typeof obj.platform !== 'string' || obj.platform.length === 0) {
            errors.push(`identity.socialLinks[${index}].platform is required and must be a non-empty string`);
          }
          if (typeof obj.url !== 'string' || obj.url.length === 0) {
            errors.push(`identity.socialLinks[${index}].url is required and must be a non-empty string`);
          }
        });
      }
    }
    if (identity.additionalContacts !== undefined && identity.additionalContacts !== null) {
      if (!Array.isArray(identity.additionalContacts)) {
        errors.push('identity.additionalContacts must be an array');
      } else {
        (identity.additionalContacts as unknown[]).forEach((contact, index) => {
          if (!contact || typeof contact !== 'object' || Array.isArray(contact)) {
            errors.push(`identity.additionalContacts[${index}] must be an object`);
            return;
          }
          const obj = contact as Record<string, unknown>;
          if (typeof obj.type !== 'string' || obj.type.length === 0) {
            errors.push(`identity.additionalContacts[${index}].type is required and must be a non-empty string`);
          }
          if (typeof obj.value !== 'string' || obj.value.length === 0) {
            errors.push(`identity.additionalContacts[${index}].value is required and must be a non-empty string`);
          }
          if (obj.label !== undefined && obj.label !== null && typeof obj.label !== 'string') {
            errors.push(`identity.additionalContacts[${index}].label must be a string or null`);
          }
        });
      }
    }
  }

  // 4b. styleRules structure
  if (sl.styleRules && typeof sl.styleRules === 'object') {
    const sr = sl.styleRules as Record<string, unknown>;
    rejectUnknownKeys(sr, ALLOWED_STYLE_RULES_KEYS, 'styleRules', errors);
    const stringOrNullFields = ['brevity', 'format', 'tone'];
    for (const field of stringOrNullFields) {
      if (sr[field] !== undefined && sr[field] !== null && typeof sr[field] !== 'string') {
        errors.push(`styleRules.${field} must be a string or null`);
      }
    }
    const booleanOrNullFields = [
      'noMedicalDiagnosis', 'noAsterisks', 'noMarkdown', 'mustOfferHumanHandoff',
    ];
    for (const field of booleanOrNullFields) {
      if (sr[field] !== undefined && sr[field] !== null && typeof sr[field] !== 'boolean') {
        errors.push(`styleRules.${field} must be a boolean or null`);
      }
    }
    const numberOrNullFields = ['maxSentences', 'maxWordsPerSentence'];
    for (const field of numberOrNullFields) {
      if (sr[field] !== undefined && sr[field] !== null && typeof sr[field] !== 'number') {
        errors.push(`styleRules.${field} must be a number or null`);
      }
    }
    const stringArrayOrNullFields = ['avoidPhrases', 'mandatoryPhrases', 'additionalRules'];
    for (const field of stringArrayOrNullFields) {
      if (sr[field] !== undefined && sr[field] !== null && !Array.isArray(sr[field])) {
        errors.push(`styleRules.${field} must be an array of strings or null`);
      }
    }
  }

  // 4c. responseTemplates must be objects {text, mode}. Strings are no longer accepted.
  if (sl.responseTemplates && typeof sl.responseTemplates === 'object') {
    const templates = sl.responseTemplates as Record<string, unknown>;
    for (const [key, value] of Object.entries(templates)) {
      if (typeof value === 'string') {
        errors.push(`responseTemplates["${key}"] must be an object {text, mode}, not a string`);
        continue;
      }
      if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
        errors.push(`responseTemplates["${key}"] must be an object {text, mode}`);
        continue;
      }
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (obj.text !== undefined && obj.text !== null && typeof obj.text !== 'string') {
          errors.push(`responseTemplates["${key}"].text must be a string or null`);
        }
        if (obj.mode !== undefined && obj.mode !== null && obj.mode !== 'literal' && obj.mode !== 'model') {
          errors.push(`responseTemplates["${key}"].mode must be "literal", "model" or null`);
        }
      }
    }
  }

  // 4d. faq structure
  if (Array.isArray(sl.faq)) {
    sl.faq.forEach((entry, index) => {
      rejectUnknownKeys(entry as unknown as Record<string, unknown>, ALLOWED_FAQ_ENTRY_KEYS, `faq[${index}]`, errors);
      if (entry.question === undefined || entry.question === null || typeof entry.question !== 'string') {
        errors.push(`faq[${index}] question is required and must be a string`);
      }
      if (entry.answer === undefined || entry.answer === null || typeof entry.answer !== 'string') {
        errors.push(`faq[${index}] answer is required and must be a string`);
      }
      if (entry.condition !== undefined && entry.condition !== null && typeof entry.condition !== 'string') {
        errors.push(`faq[${index}] condition must be a string or null`);
      }
    });
  }

  // 4e. protocols structure
  if (sl.protocols && typeof sl.protocols === 'object') {
    const protocols = sl.protocols as Record<string, unknown>;
    for (const [key, value] of Object.entries(protocols)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`protocols["${key}"] must be an object`);
        continue;
      }
      rejectUnknownKeys(value as Record<string, unknown>, ALLOWED_PROTOCOL_KEYS, `protocols.${key}`, errors);
      const protocol = value as Record<string, unknown>;
      if (typeof protocol.name !== 'string' || protocol.name.length === 0) {
        errors.push(`protocols["${key}"].name is required and must be a non-empty string`);
      }
      if (typeof protocol.description !== 'string' || protocol.description.length === 0) {
        errors.push(`protocols["${key}"].description is required and must be a non-empty string`);
      }
      if (protocol.responseTemplate !== undefined && protocol.responseTemplate !== null && typeof protocol.responseTemplate !== 'string') {
        errors.push(`protocols["${key}"].responseTemplate must be a string or null`);
      }
      if (protocol.sections !== undefined && protocol.sections !== null && !Array.isArray(protocol.sections)) {
        errors.push(`protocols["${key}"].sections must be an array of strings or null`);
      }
    }
  }

  // 4f. systemPromptInstructions structure
  if (sl.systemPromptInstructions && typeof sl.systemPromptInstructions === 'object') {
    const spi = sl.systemPromptInstructions as Record<string, unknown>;
    rejectUnknownKeys(
      spi,
      ALLOWED_SYSTEM_PROMPT_KEYS,
      'systemPromptInstructions',
      errors,
    );
    const stringArrayFields = ['notesForAdvisor', 'knownGaps', 'recommendedNextSteps'];
    for (const field of stringArrayFields) {
      if (spi[field] === undefined || spi[field] === null) {
        errors.push(`systemPromptInstructions.${field} is required and must be an array`);
      } else if (!Array.isArray(spi[field])) {
        errors.push(`systemPromptInstructions.${field} must be an array of strings`);
      } else {
        const arr = spi[field] as unknown[];
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] !== 'string') {
            errors.push(`systemPromptInstructions.${field}[${i}] must be a string`);
          }
        }
      }
    }
  }

  // 5. Enhanced structural and cross-reference validation
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
          // Handle wrap-around (e.g., 21:01 -> 05:59)
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
      if (rule.priority !== undefined && typeof rule.priority !== 'number') {
        errors.push(`Rule ${index} (${rule.id || rule.intent}) priority must be a number`);
      }
      if (rule.conditionLogic !== undefined && rule.conditionLogic !== null && rule.conditionLogic !== 'and' && rule.conditionLogic !== 'or') {
        errors.push(`Rule ${index} (${rule.id || rule.intent}) conditionLogic must be "and" or "or"`);
      }
      // Reject legacy singular condition field
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

  // 6a. Flow steps must have unique, sequential step numbers
  Object.entries(flows).forEach(([flowName, flow]) => {
    if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
      errors.push(`Flow '${flowName}' must have at least one step`);
      return;
    }
    const stepNumbers = flow.steps.map((step) => step.step);
    const uniqueStepNumbers = new Set(stepNumbers);
    if (uniqueStepNumbers.size !== stepNumbers.length) {
      errors.push(`Flow '${flowName}' has duplicate step numbers`);
    }
    const sorted = [...stepNumbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        errors.push(`Flow '${flowName}' steps must be sequential starting at 1 (got ${stepNumbers.join(', ')})`);
        break;
      }
    }
  });

  // 6b. Validate rule field types
  (sl.rules ?? []).forEach((rule: BusinessRule, index: number) => {
    if (rule.requiredFields !== undefined && rule.requiredFields !== null && !Array.isArray(rule.requiredFields)) {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) requiredFields must be an array of strings`);
    }
    if (rule.hidePrice !== undefined && rule.hidePrice !== null && typeof rule.hidePrice !== 'boolean') {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) hidePrice must be a boolean`);
    }
    if (rule.redirectToTask !== undefined && rule.redirectToTask !== null && typeof rule.redirectToTask !== 'boolean') {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) redirectToTask must be a boolean`);
    }
    if (rule.informOnly !== undefined && rule.informOnly !== null && typeof rule.informOnly !== 'boolean') {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) informOnly must be a boolean`);
    }
    if (rule.note !== undefined && rule.note !== null && typeof rule.note !== 'string') {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) note must be a string`);
    }
  });

  // 6c. Validate intent examples are arrays of strings
  if (sl.intents && typeof sl.intents === 'object') {
    Object.entries(sl.intents).forEach(([intentId, intent]) => {
      rejectUnknownKeys(intent as Record<string, unknown>, ALLOWED_INTENT_KEYS, `intents.${intentId}`, errors);
      if (intent.examples !== undefined && intent.examples !== null && !Array.isArray(intent.examples)) {
        errors.push(`intents["${intentId}"].examples must be an array of strings`);
      } else if (Array.isArray(intent.examples)) {
        intent.examples.forEach((example, index) => {
          if (typeof example !== 'string') {
            errors.push(`intents["${intentId}"].examples[${index}] must be a string`);
          }
        });
      }
    });
  }

  // 6d. Tool names must match the bot mode profile
  Object.entries(flows).forEach(([flowName, flow]) => {
    rejectUnknownKeys(flow as unknown as Record<string, unknown>, ALLOWED_FLOW_KEYS, `flows.${flowName}`, errors);
    if (flow.responseTemplateMode !== undefined && flow.responseTemplateMode !== null &&
        flow.responseTemplateMode !== 'literal' && flow.responseTemplateMode !== 'model') {
      errors.push(`Flow '${flowName}' responseTemplateMode must be 'literal' or 'model'.`);
    }

    if (flow.selection !== undefined && flow.selection !== null) {
      if (typeof flow.selection !== 'object' || Array.isArray(flow.selection)) {
        errors.push(`Flow '${flowName}' selection must be an object`);
      } else {
        rejectUnknownKeys(flow.selection as unknown as Record<string, unknown>, ALLOWED_SELECTION_KEYS, `flows.${flowName}.selection`, errors);
        const required = (flow.selection as { requiredCapabilities?: unknown }).requiredCapabilities;
        const excluded = (flow.selection as { excludedCapabilities?: unknown }).excludedCapabilities;
        const validateCapabilityList = (list: unknown, name: string) => {
          if (list === undefined || list === null) return;
          if (!Array.isArray(list)) {
            errors.push(`Flow '${flowName}' selection.${name} must be an array`);
            return;
          }
          list.forEach((cap, index) => {
            if (typeof cap !== 'string') {
              errors.push(`Flow '${flowName}' selection.${name}[${index}] must be a string`);
            } else if (!TURN_START_CAPABILITY_SET.has(cap)) {
              errors.push(`Flow '${flowName}' selection.${name} contains unsupported capability '${cap}'. Only turn-start capabilities are allowed: ${TURN_START_CAPABILITIES.join(', ')}`);
            }
          });
        };
        validateCapabilityList(required, 'requiredCapabilities');
        validateCapabilityList(excluded, 'excludedCapabilities');
      }
    }

    if (Array.isArray(flow.allowedTools)) {
      flow.allowedTools.forEach((tool) => {
        if (!validTools.has(tool)) {
          errors.push(`Flow '${flowName}' allowedTools contains invalid tool '${tool}'.`);
        } else if (mode === 'tasks-only' && schedulingTools.has(tool)) {
          errors.push(`Flow '${flowName}' allowedTools contains scheduling tool '${tool}' but mode is 'tasks-only'.`);
        }
      });
    }

    flow.steps.forEach((step, stepIndex) => {
      rejectUnknownKeys(step as unknown as Record<string, unknown>, ALLOWED_STEP_KEYS, `flows.${flowName}.steps[${stepIndex}]`, errors);
      if ((step as any).condition !== undefined) {
        errors.push(`Flow '${flowName}' step ${stepIndex + 1} uses deprecated "condition" field. Move the condition text into the step "note" instead.`);
      }
      step.tools.forEach((tool) => {
        if (!validTools.has(tool)) {
          errors.push(`Flow '${flowName}' step ${stepIndex + 1} references invalid tool '${tool}'.`);
        } else if (mode === 'tasks-only' && schedulingTools.has(tool)) {
          errors.push(`Flow '${flowName}' step ${stepIndex + 1} uses scheduling tool '${tool}' but mode is 'tasks-only'.`);
        }
      });
    });
  });

  // 6d1. general_inquiry must have query_knowledge_base available in allowedTools or steps
  const generalInquiryFlow = flows['general_inquiry'];
  if (generalInquiryFlow) {
    const hasQkbInAllowed = (generalInquiryFlow.allowedTools || []).includes('query_knowledge_base');
    const hasQkbInSteps = generalInquiryFlow.steps.some((step) =>
      (step.tools || []).includes('query_knowledge_base')
    );
    if (!hasQkbInAllowed && !hasQkbInSteps) {
      errors.push(
        `Flow "general_inquiry" must have "query_knowledge_base" available in allowedTools or steps. ` +
        `This is required in both full and tasks-only modes so the bot can search protocols, FAQ, responseTemplates and rules when the answer is not already in context.`
      );
    }
  }

  // 6d2. Cross-reference validation: critical flows must use expected tools
  const flowUsesTool = (flow: ToolFlow, toolName: string): boolean => {
    const hasInAllowed = (flow.allowedTools || []).includes(toolName);
    const hasInSteps = flow.steps.some((step) => (step.tools || []).includes(toolName));
    return hasInAllowed || hasInSteps;
  };

  const findFlowByIntent = (intentName: string): { flowName: string; flow: ToolFlow } | null => {
    for (const [flowName, flow] of Object.entries(flows)) {
      if (flow.intent === intentName) {
        return { flowName, flow };
      }
    }
    return null;
  };

  // human_follow_up must use create_task
  const humanFlow = findFlowByIntent('human_follow_up');
  if (humanFlow && !flowUsesTool(humanFlow.flow, 'create_task')) {
    errors.push(
      `Flow "${humanFlow.flowName}" (intent: human_follow_up) must use "create_task" in allowedTools or steps. ` +
      `This is required to escalate to human staff.`
    );
  }

  // 6d3. scheduling_request rule must have redirectToTask: true in tasks-only mode
  if (mode === 'tasks-only') {
    const schedulingRules = (sl.rules ?? []).filter((r) => r.intent === 'scheduling_request');
    for (const rule of schedulingRules) {
      if (rule.action === 'allow' && !rule.redirectToTask) {
        errors.push(
          `Rule "${rule.id || '(unknown)'}" for intent "scheduling_request" must have "redirectToTask: true" in tasks-only mode. ` +
          `The bot cannot book real appointments in tasks-only mode; it must redirect to a human task.`
        );
      }
    }
  }

  // 6e. BusinessRule protocolId must reference an existing protocol
  const protocolIds = new Set(Object.keys(sl.protocols ?? {}));
  (sl.rules ?? []).forEach((rule: BusinessRule, index: number) => {
    if (rule.protocolId && !protocolIds.has(rule.protocolId)) {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) references protocolId '${rule.protocolId}' which does not exist in protocols`);
    }
  });

  // 6f. Block rules must have a patient-facing message
  (sl.rules ?? []).forEach((rule: BusinessRule, index: number) => {
    if (rule.action === 'block') {
      if (!rule.message || rule.message.trim().length === 0) {
        errors.push(`Rule ${index} (${rule.id || rule.intent}) has action='block' and must include a 'message' for the patient.`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export type GapSeverity = 'high' | 'medium' | 'low';

export type LogicGap = {
  type: 'missing_rules' | 'missing_flows' | 'missing_templates' | 'missing_protocols' | 'missing_error_categories' | 'missing_rule_description' | 'missing_response_template' | 'missing_error_suggestions' | 'missing_capability' | 'unresolved_placeholder';
  description: string;
  severity: GapSeverity;
  affectedFields?: string[];
  affectedIndices?: number[];
};

export type FixCommandType =
  | 'add_template'
  | 'add_error_categories'
  | 'add_flow'
  | 'add_rule'
  | 'auto_fix'
  | 'unknown';

export type FixCommand = {
  type: FixCommandType;
  target?: string;
  description?: string;
};

/**
 * Detect if a user message is a fix command.
 * Returns the fix command type and target if detected.
 */
export function detectFixCommand(message: string): FixCommand {
  const lower = message.toLowerCase().trim();

  // Add template to flow — requires explicit template/plantilla keyword
  // or a combination of respuesta + flow/flujo to avoid false positives
  // on normal conversational messages like "quiero una respuesta corta".
  const hasTemplateKeyword = lower.includes('template') || lower.includes('plantilla');
  const hasFlowKeyword = lower.includes('flow') || lower.includes('flujo');
  const hasRespuestaInTemplateContext = lower.includes('respuesta') && (hasTemplateKeyword || hasFlowKeyword);
  if (hasTemplateKeyword || hasRespuestaInTemplateContext) {
    const flowMatch = lower.match(/(?:flow|flujo)\s+['"]?([^'"\s]+)['"]?/);
    const target = flowMatch ? flowMatch[1] : undefined;
    return { type: 'add_template', target, description: message };
  }

  // Add error categories
  if (lower.includes('error') && (lower.includes('categor') || lower.includes('handling') || lower.includes('manejo'))) {
    return { type: 'add_error_categories', description: message };
  }

  // Add flow
  if (lower.includes('add') && (lower.includes('flow') || lower.includes('flujo'))) {
    const flowMatch = lower.match(/(?:flow|flujo)\s+['"]?([^'"\s]+)['"]?/);
    const target = flowMatch ? flowMatch[1] : undefined;
    return { type: 'add_flow', target, description: message };
  }

  // Add rule
  if (lower.includes('add') && (lower.includes('rule') || lower.includes('regla'))) {
    return { type: 'add_rule', description: message };
  }

  // Auto-fix all detected gaps
  if (lower.includes('auto') && (lower.includes('fix') || lower.includes('correct') || lower.includes('arregla'))) {
    return { type: 'auto_fix', description: message };
  }

  return { type: 'unknown', description: message };
}

/**
 * Ensure an intent is declared in the intents catalog before a fix references
 * it in a rule or flow. Rules/flows referencing undeclared intents fail
 * `validateStructuredLogic` (`references intent "X" which is not declared`).
 */
function ensureIntentDeclared(logic: StructuredLogic, intentId: string, description: string): void {
  if (!logic.intents) {
    logic.intents = {};
  }
  if (!logic.intents[intentId]) {
    logic.intents[intentId] = { description };
  }
}

/**
 * Apply a fix command to structuredLogic.
 * Returns the updated structuredLogic and a description of what was changed.
 */
export function applyFix(
  logic: StructuredLogic,
  command: FixCommand,
): { logic: StructuredLogic; changes: string[] } {
  const changes: string[] = [];
  const updated = JSON.parse(JSON.stringify(logic)) as StructuredLogic;

  switch (command.type) {
    case 'add_template': {
      const flowName = command.target ?? Object.keys(updated.toolOrchestration.flows)[0];
      if (flowName && updated.toolOrchestration.flows[flowName]) {
        updated.toolOrchestration.flows[flowName] = {
          ...updated.toolOrchestration.flows[flowName],
          responseTemplate: 'Perfecto, hemos procesado tu solicitud. ¿Necesitas algo más?',
        };
        changes.push(`Added responseTemplate to flow '${flowName}'`);
      } else {
        changes.push(`Flow '${flowName}' not found. No template added.`);
      }
      break;
    }

    case 'add_error_categories': {
      if (!updated.errorCategories) {
        updated.errorCategories = [];
      }
      updated.errorCategories.push({
        id: 'scheduling_conflict',
        description: 'El horario o slot ya está ocupado o hay conflicto de disponibilidad',
        suggestions: ['Probar con un horario diferente', 'Verificar disponibilidad con check_availability'],
      });
      updated.errorCategories.push({
        id: 'resource_not_found',
        description: 'El profesional, sala o recurso no existe en el sistema',
        suggestions: ['Verificar que el profesional o sala exista', 'Contactar al staff de la clínica'],
      });
      changes.push('Added default errorCategories: scheduling_conflict, resource_not_found');
      break;
    }

    case 'add_flow': {
      const newFlowName = command.target ?? 'new_flow';
      if (!updated.toolOrchestration.flows[newFlowName]) {
        ensureIntentDeclared(
          updated,
          'human_follow_up',
          'Solicitudes que requieren seguimiento humano y no encajan en otros intents.',
        );
        updated.toolOrchestration.flows[newFlowName] = {
          intent: 'human_follow_up',
          description: 'New conversation flow for patient requests',
          steps: [
            {
              step: 1,
              tools: ['create_task'],
              parallel: false,
              note: 'Create task for human follow-up',
            },
          ],
        };
        changes.push(`Added new flow '${newFlowName}' with default task step`);
      } else {
        changes.push(`Flow '${newFlowName}' already exists`);
      }
      break;
    }

    case 'add_rule': {
      ensureIntentDeclared(
        updated,
        'human_follow_up',
        'Solicitudes que requieren seguimiento humano y no encajan en otros intents.',
      );
      const newRuleId = `rule_${updated.rules.length + 1}`;
      updated.rules.push({
        id: newRuleId,
        intent: 'human_follow_up',
        description: 'La paciente solicita una acción específica que requiere gestión humana',
        action: 'allow',
        note: 'Nueva regla detectada: gestionar solicitud del paciente',
      });
      changes.push(`Added new rule '${newRuleId}' with allow action`);
      break;
    }

    case 'auto_fix': {
      const gaps = detectGaps(updated);
      const highSeverityGaps = gaps.filter((g) => g.severity === 'high');

      for (const gap of highSeverityGaps) {
        switch (gap.type) {
          case 'missing_error_suggestions': {
            if (!updated.errorCategories) {
              updated.errorCategories = [];
            }
            updated.errorCategories.push({
              id: 'generic_error',
              description: 'Error genérico del sistema',
              suggestions: ['Contactar al staff de la clínica', 'Verificar configuración del bot'],
            });
            changes.push('Auto-fixed: Added generic errorCategory with suggestions');
            break;
          }
          case 'missing_rule_description': {
            for (const index of gap.affectedIndices ?? []) {
              if (updated.rules[index]) {
                updated.rules[index] = {
                  ...updated.rules[index],
                  description: updated.rules[index].description || 'Regla para gestionar solicitud del paciente',
                };
              }
            }
            changes.push(`Auto-fixed: Added descriptions to ${gap.affectedIndices?.length} rules`);
            break;
          }
          // Keywords removed: classifier now uses semantic descriptions + conversational context
          default:
            break;
        }
      }

      if (changes.length === 0) {
        changes.push('No high-severity gaps detected. Nothing to auto-fix.');
      }
      break;
    }

    default:
      changes.push(`Unknown fix command: ${command.type}`);
  }

  return { logic: updated, changes };
}

export type QualityScore = {
  score: number;
  max: number;
  gaps: string[];
};

/**
 * Runtime placeholders that are always resolvable from the per-turn context
 * (Site/Clinic record). Kept in sync with `PLACEHOLDER_MAP` in
 * `src/application/chat/build-system-prompt-from-structured-logic.ts`.
 */
const RUNTIME_PLACEHOLDERS = new Set([
  'CLINIC_NAME', 'NOMBRE_BOT', 'DIRECCION', 'TELEFONO', 'EMAIL',
  'SITE_NAME', 'SITE_ADDRESS', 'SITE_PHONE', 'SITE_EMAIL', 'LOCAL_TIME',
]);

/**
 * Placeholders resolved from `identity` fields in the JSON itself (filled in
 * by the advisor through the builder), not from runtime Site/Clinic data.
 * There is intentionally NO placeholder for price: prices are per-treatment
 * and are shown via TREATMENTS_LIST or the `price_unknown` response template.
 */
const IDENTITY_PLACEHOLDERS: Record<string, 'website' | 'openingHours'> = {
  WEB: 'website',
  HORARIO: 'openingHours',
};

function extractPlaceholderNames(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/\{\{([A-Z_]+)\}\}/g) ?? [];
  return matches.map((m) => m.slice(2, -2));
}

type TextWithPath = { path: string; text: string };

function collectStructuredLogicTexts(logic: StructuredLogic): TextWithPath[] {
  const entries: TextWithPath[] = [];

  if (logic.identity) {
    for (const [key, value] of Object.entries(logic.identity)) {
      if (typeof value === 'string') {
        entries.push({ path: `identity.${key}`, text: value });
      }
    }
  }

  if (logic.responseTemplates) {
    for (const [key, value] of Object.entries(logic.responseTemplates)) {
      const text = typeof value === 'string' ? value : value?.text;
      if (typeof text === 'string') {
        entries.push({ path: `responseTemplates.${key}`, text });
      }
    }
  }

  (logic.faq ?? []).forEach((entry, index) => {
    if (typeof entry.answer === 'string') {
      entries.push({ path: `faq[${index}].answer`, text: entry.answer });
    }
  });

  if (logic.protocols) {
    for (const [key, protocol] of Object.entries(logic.protocols)) {
      if (typeof protocol.responseTemplate === 'string') {
        entries.push({ path: `protocols.${key}.responseTemplate`, text: protocol.responseTemplate });
      }
    }
  }

  return entries;
}

export type UnresolvedPlaceholderIssue = {
  path: string;
  placeholder: string;
  reason: string;
};

/**
 * Scan identity, responseTemplates, faq, and protocols text for placeholders
 * that will NOT resolve at runtime:
 * - Unknown placeholders (not part of the recognized runtime/identity set).
 * - `{{WEB}}`/`{{HORARIO}}` when `identity.website`/`identity.openingHours`
 *   is missing or is itself still an unresolved placeholder.
 *
 * Used by the builder to prompt the advisor for the missing values.
 */
export function detectUnresolvedPlaceholders(logic: StructuredLogic): UnresolvedPlaceholderIssue[] {
  const issues: UnresolvedPlaceholderIssue[] = [];

  for (const { path, text } of collectStructuredLogicTexts(logic)) {
    for (const placeholder of extractPlaceholderNames(text)) {
      if (RUNTIME_PLACEHOLDERS.has(placeholder)) continue;

      const identityKey = IDENTITY_PLACEHOLDERS[placeholder];
      if (identityKey) {
        const identityValue = logic.identity?.[identityKey];
        if (!identityValue || extractPlaceholderNames(identityValue).length > 0) {
          issues.push({
            path,
            placeholder: `{{${placeholder}}}`,
            reason: `identity.${identityKey} is missing or not yet filled in with a real value`,
          });
        }
        continue;
      }

      issues.push({
        path,
        placeholder: `{{${placeholder}}}`,
        reason: 'unknown placeholder with no runtime source',
      });
    }
  }

  return issues;
}

/**
 * Detect gaps in structuredLogic.
 * Returns structured gap information for auto-correction.
 */
export function detectGaps(logic: StructuredLogic): LogicGap[] {
  const gaps: LogicGap[] = [];

  // 0. Missing rules (empty array)
  if (logic.rules.length === 0) {
    gaps.push({
      type: 'missing_rules',
      description: 'rules array is empty. Intent classifier will fail and no flow scoping will occur, allowing all tools including create_task.',
      severity: 'high',
    });
  }

  // 0b. Missing critical intent categories (same set enforced by validateStructuredLogic)
  const presentIntents = new Set(logic.rules.map((r) => r.intent));
  const missingIntents = CRITICAL_INTENTS.filter((c) => !presentIntents.has(c.category)).map((c) => c.category);
  if (missingIntents.length > 0) {
    gaps.push({
      type: 'missing_rules',
      description: `Missing critical intent categories: ${missingIntents.join(', ')}. These are needed for the intent classifier to distinguish confirmation, cancellation, and scheduling intents.`,
      severity: 'high',
      affectedFields: missingIntents,
    });
  }

  // 1. Missing flows
  const flowNames = Object.keys(logic.toolOrchestration?.flows ?? {});
  if (flowNames.length === 0) {
    gaps.push({
      type: 'missing_flows',
      description: 'No conversation flows defined. At least one flow is needed for tool orchestration.',
      severity: 'high',
    });
  }

  // 2. Missing response templates
  const flowsWithoutTemplate = flowNames.filter((name) => {
    const flow = logic.toolOrchestration?.flows?.[name];
    return flow && !flow.responseTemplate;
  });
  if (flowsWithoutTemplate.length > 0) {
    gaps.push({
      type: 'missing_response_template',
      description: `Flows missing responseTemplate: ${flowsWithoutTemplate.join(', ')}.`,
      severity: 'medium',
      affectedFields: flowsWithoutTemplate,
    });
  }

  // 3. Missing protocols
  const protocolIds = Object.keys(logic.protocols ?? {});
  if (protocolIds.length === 0) {
    gaps.push({
      type: 'missing_protocols',
      description: 'No protocols defined. Protocols are needed for explain_protocol action.',
      severity: 'medium',
    });
  }

  // 4. Missing error categories
  if (!logic.errorCategories || logic.errorCategories.length === 0) {
    gaps.push({
      type: 'missing_error_categories',
      description: 'No errorCategories defined. These are needed for semantic error classification.',
      severity: 'medium',
    });
  }

  // 5. Missing error suggestions
  const categoriesWithoutSuggestions = (logic.errorCategories ?? []).map((cat, index) => {
    if (!cat.suggestions || cat.suggestions.length === 0) return index;
    return -1;
  }).filter((i) => i !== -1);
  if (categoriesWithoutSuggestions.length > 0) {
    gaps.push({
      type: 'missing_error_suggestions',
      description: `ErrorCategories at indices ${categoriesWithoutSuggestions.join(', ')} are missing suggestions.`,
      severity: 'high',
      affectedIndices: categoriesWithoutSuggestions,
    });
  }

  // 5b. Missing response templates for status flows
  const allFlows = logic.toolOrchestration?.flows ?? {};
  const statusFlowsWithoutTemplate = Object.entries(allFlows)
    .filter(([_, flow]) => {
      const usesStatusTool = flow.steps.some((step: { tools: string[] }) =>
        step.tools.includes('manage_schedule_block_status')
      );
      return usesStatusTool && !flow.responseTemplate;
    })
    .map(([flowName]) => flowName);
  if (statusFlowsWithoutTemplate.length > 0) {
    gaps.push({
      type: 'missing_response_template',
      description: `Flows using manage_schedule_block_status without responseTemplate: ${statusFlowsWithoutTemplate.join(', ')}. ` +
        `The backend will use generic fallbacks. Consider adding custom templates for better patient experience.`,
      severity: 'medium',
      affectedFields: statusFlowsWithoutTemplate,
    });
  }

  // 6. Missing rule descriptions
  const rulesWithoutDescription = logic.rules.map((rule, index) => {
    if (!rule.description || rule.description.trim().length === 0) return index;
    return -1;
  }).filter((i) => i !== -1);
  if (rulesWithoutDescription.length > 0) {
    gaps.push({
      type: 'missing_rule_description',
      description: `Rules at indices ${rulesWithoutDescription.join(', ')} are missing descriptions for intent classifier.`,
      severity: 'high',
      affectedIndices: rulesWithoutDescription,
    });
  }

  // 7. Capability presence validation
  const missingCapabilityFields: string[] = [];
  if (typeof logic.capabilities?.sensitiveSituations !== 'boolean') {
    missingCapabilityFields.push('capabilities.sensitiveSituations');
  }
  if (typeof logic.capabilities?.protocols !== 'boolean') {
    missingCapabilityFields.push('capabilities.protocols');
  }
  if (missingCapabilityFields.length > 0) {
    gaps.push({
      type: 'missing_capability',
      description: `Required capability fields must be boolean: ${missingCapabilityFields.join(', ')}.`,
      severity: 'high',
      affectedFields: missingCapabilityFields,
    });
  }

  // 8. Missing systemPromptInstructions (builder-only metadata, not runtime-critical)
  if (!logic.systemPromptInstructions ||
      typeof logic.systemPromptInstructions !== 'object' ||
      Array.isArray(logic.systemPromptInstructions) ||
      !Array.isArray(logic.systemPromptInstructions.notesForAdvisor) ||
      !Array.isArray(logic.systemPromptInstructions.knownGaps) ||
      !Array.isArray(logic.systemPromptInstructions.recommendedNextSteps)) {
    gaps.push({
      type: 'missing_capability',
      description: 'systemPromptInstructions is missing or incomplete. It is builder-only metadata, but the builder expects notesForAdvisor, knownGaps, and recommendedNextSteps arrays.',
      severity: 'low',
      affectedFields: ['systemPromptInstructions'],
    });
  }

  // 9. Unresolved or unknown placeholders in identity/responseTemplates/faq/protocols
  const placeholderIssues = detectUnresolvedPlaceholders(logic);
  if (placeholderIssues.length > 0) {
    gaps.push({
      type: 'unresolved_placeholder',
      description: `Unresolved or unknown placeholders found: ${placeholderIssues
        .map((issue) => `${issue.path} → ${issue.placeholder} (${issue.reason})`)
        .join('; ')}.`,
      severity: 'medium',
      affectedFields: placeholderIssues.map((issue) => issue.path),
    });
  }

  return gaps;
}

/**
 * Generate human-readable fix suggestions based on detected gaps.
 */
export function generateFixSuggestions(gaps: LogicGap[]): string[] {
  return gaps.map((gap) => {
    switch (gap.type) {
      case 'missing_flows':
        return 'Add at least one conversation flow (e.g., "schedule_appointment", "cancel_appointment"). Define trigger, description, and steps with tools.';
      case 'missing_response_template':
        return `Add responseTemplate to status flows: ${gap.affectedFields?.join(', ')}. ` +
          `Examples: confirm: "Tu cita ha quedado confirmada. Te esperamos." | ` +
          `cancel: "Tu cita ha sido cancelada. Si deseas reprogramar, podemos ayudarte." | ` +
          `running_late: "No te preocupes, si vienes con un poco de retraso te ajustamos la cita..."`;
      case 'missing_protocols':
        return 'Add protocols for common clinic procedures (e.g., "signature_implants", "first_visit"). Define name, description, and responseTemplate.';
      case 'missing_error_categories':
        return 'Add errorCategories for common errors (e.g., "scheduling_conflict", "resource_not_found"). Define id, description, and suggestions.';
      case 'missing_error_suggestions':
        return `Add suggestions to errorCategories at indices: ${gap.affectedIndices?.join(', ')}. Each category needs actionable suggestions for the LLM.`;
      case 'missing_rule_description':
        return `Add descriptions to rules at indices: ${gap.affectedIndices?.join(', ')}. Descriptions must define the patient's intent in natural language, not keyword lists.`;
      case 'missing_capability':
        return `Add required boolean capability flags: ${gap.affectedFields?.join(', ')}.`;
      case 'unresolved_placeholder':
        return `Ask the advisor for the real values needed at: ${gap.affectedFields?.join(', ')}. ` +
          `Replace unknown placeholders with actual text, or fill in identity.website/identity.openingHours ` +
          `if {{WEB}}/{{HORARIO}} are used.`;
      default:
        return gap.description;
    }
  });
}

/**
 * Generate a quality score for the structuredLogic.
 * Returns 0-100 score and list of gaps.
 *
 * Scoring breakdown:
 * - 40 points: required sections present (4 points per section).
 * - 10 points: at least 1 rule with description.
 * - 10 points: at least 1 flow.
 * - 10 points: at least 1 flow with responseTemplate.
 * - 10 points: at least 1 protocol.
 * - 10 points: at least 1 errorCategory.
 *
 * Total max = 90. The previous 0-100 scale was unreachable because the
 * hardcoded 40-point base plus the 5 bonus categories only add up to 90.
 */
export function generateQualityScore(logic: StructuredLogic): QualityScore {
  const max = 90;
  let score = 0;
  const gaps: string[] = [];

  // 40 points: required sections present (4 points per section)
  const requiredSections = [
    { key: 'identity', present: !!logic.identity && typeof logic.identity === 'object' && !Array.isArray(logic.identity) && Object.keys(logic.identity).length > 0 },
    { key: 'styleRules', present: !!logic.styleRules && typeof logic.styleRules === 'object' && !Array.isArray(logic.styleRules) && Object.keys(logic.styleRules).length > 0 },
    { key: 'responseTemplates', present: !!logic.responseTemplates && typeof logic.responseTemplates === 'object' && !Array.isArray(logic.responseTemplates) },
    { key: 'faq', present: Array.isArray(logic.faq) },
    { key: 'intents', present: !!logic.intents && typeof logic.intents === 'object' && !Array.isArray(logic.intents) && Object.keys(logic.intents).length > 0 },
    { key: 'toolOrchestration.flows', present: !!logic.toolOrchestration?.flows && typeof logic.toolOrchestration.flows === 'object' && !Array.isArray(logic.toolOrchestration.flows) && Object.keys(logic.toolOrchestration.flows).length > 0 },
    { key: 'rules', present: Array.isArray(logic.rules) && logic.rules.length > 0 },
    { key: 'protocols', present: !!logic.protocols && typeof logic.protocols === 'object' && !Array.isArray(logic.protocols) },
    { key: 'errorCategories', present: Array.isArray(logic.errorCategories) },
    { key: 'systemPromptInstructions', present: !!logic.systemPromptInstructions && typeof logic.systemPromptInstructions === 'object' && !Array.isArray(logic.systemPromptInstructions) && Array.isArray(logic.systemPromptInstructions.notesForAdvisor) && Array.isArray(logic.systemPromptInstructions.knownGaps) && Array.isArray(logic.systemPromptInstructions.recommendedNextSteps) },
  ];

  const missingRequiredSections = requiredSections.filter((s) => !s.present).map((s) => s.key);
  const presentRequiredSections = requiredSections.filter((s) => s.present).length;
  score += presentRequiredSections * 4;
  if (missingRequiredSections.length > 0) {
    gaps.push(`Missing required sections: ${missingRequiredSections.join(', ')}`);
  }

  // +10 points: has at least 1 rule with description
  const hasRichRules = logic.rules.some((r) => r.description && r.description.trim().length > 0);
  if (hasRichRules) {
    score += 10;
  } else {
    gaps.push('Rules lack description for intent classifier');
  }

  // +10 points: has at least 1 flow
  const hasFlows = Object.keys(logic.toolOrchestration?.flows ?? {}).length > 0;
  if (hasFlows) {
    score += 10;
  } else {
    gaps.push('No conversation flows defined');
  }

  // +10 points: has at least 1 flow with responseTemplate
  const hasTemplates = Object.values(logic.toolOrchestration?.flows ?? {}).some((f) => f.responseTemplate);
  if (hasTemplates) {
    score += 10;
  } else {
    gaps.push('No flows have responseTemplate for controlled responses');
  }

  // +10 points: has protocols
  const hasProtocols = logic.protocols && Object.keys(logic.protocols).length > 0;
  if (hasProtocols) {
    score += 10;
  } else {
    gaps.push('No protocols defined');
  }

  // +10 points: has errorCategories
  const hasErrorCategories = logic.errorCategories && logic.errorCategories.length > 0;
  if (hasErrorCategories) {
    score += 10;
  } else {
    gaps.push('No errorCategories defined for semantic error handling');
  }

  return { score, max, gaps };
}


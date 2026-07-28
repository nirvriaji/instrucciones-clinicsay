/**
 * StructuredLogic Minimum Validator
 *
 * The runtime refuses to chat unless the bot has a minimum functional
 * configuration. This validator is strict: it does not fill gaps or fall back.
 * It returns exactly which required sections are missing or empty.
 *
 * Empty arrays/objects are allowed for responseTemplates, faq, protocols,
 * and errorCategories as long as the section itself is present.
 */

import type { StructuredLogic } from './structured-logic';

export type MinimumValidationResult = {
  valid: boolean;
  missing: string[];
};

/**
 * Sections that must be present in the structured logic for a bot to chat.
 *
 * Note: `systemPromptInstructions` is intentionally NOT in this list. It is
 * builder-facing metadata and is not rendered into the LLM system prompt at
 * runtime. The builder still reports it as a low-severity gap when missing.
 */
export const MINIMUM_REQUIRED_SECTIONS = [
  'identity',
  'styleRules',
  'responseTemplates',
  'faq',
  'intents',
  'toolOrchestration.flows',
  'rules',
  'protocols',
  'errorCategories',
] as const;

/**
 * Validate that structured logic has the minimum functional configuration.
 *
 * Rules:
 * - identity must be a non-empty object
 * - styleRules must be a non-empty object
 * - responseTemplates must be an object (empty allowed)
 * - faq must be an array (empty allowed)
 * - intents must be a non-empty object
 * - toolOrchestration.flows must be a non-empty object
 * - rules must be a non-empty array
 * - protocols must be an object (empty allowed)
 * - errorCategories must be an array (empty allowed)
 * - systemPromptInstructions is NOT required by the runtime (builder-only metadata).
 */
export function validateStructuredLogicMinimum(logic: StructuredLogic): MinimumValidationResult {
  const missing: string[] = [];

  if (!logic.identity || typeof logic.identity !== 'object' || Array.isArray(logic.identity) || Object.keys(logic.identity).length === 0) {
    missing.push('identity');
  }

  if (!logic.styleRules || typeof logic.styleRules !== 'object' || Array.isArray(logic.styleRules) || Object.keys(logic.styleRules).length === 0) {
    missing.push('styleRules');
  } else if (!Array.isArray(logic.styleRules.timeGreetingRanges) || logic.styleRules.timeGreetingRanges.length === 0) {
    missing.push('styleRules.timeGreetingRanges');
  }

  if (!logic.responseTemplates || typeof logic.responseTemplates !== 'object' || Array.isArray(logic.responseTemplates)) {
    missing.push('responseTemplates');
  }

  if (!Array.isArray(logic.faq)) {
    missing.push('faq');
  }

  if (!logic.intents || typeof logic.intents !== 'object' || Array.isArray(logic.intents) || Object.keys(logic.intents).length === 0) {
    missing.push('intents');
  }

  if (
    !logic.toolOrchestration ||
    typeof logic.toolOrchestration !== 'object' ||
    Array.isArray(logic.toolOrchestration) ||
    !logic.toolOrchestration.flows ||
    typeof logic.toolOrchestration.flows !== 'object' ||
    Array.isArray(logic.toolOrchestration.flows) ||
    Object.keys(logic.toolOrchestration.flows).length === 0
  ) {
    missing.push('toolOrchestration.flows');
  }

  if (!Array.isArray(logic.rules) || logic.rules.length === 0) {
    missing.push('rules');
  }

  if (!logic.protocols || typeof logic.protocols !== 'object' || Array.isArray(logic.protocols)) {
    missing.push('protocols');
  }

  if (!Array.isArray(logic.errorCategories)) {
    missing.push('errorCategories');
  }

  return { valid: missing.length === 0, missing };
}

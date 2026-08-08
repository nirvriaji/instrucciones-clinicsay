/**
 * Builder Validator — Validates draft state before saving.
 *
 * Orchestrator that delegates to section-specific validators.
 * All validation logic lives in ./validators/ modules.
 */

import type { StructuredLogicChatMode } from '../structured-logic';
import { validateStructuredLogicMinimum } from './structured-logic-minimum';

export { validateStructuredLogicMinimum } from './structured-logic-minimum';
import { detectModeAdvisoryGaps } from './advisory/mode-advisory';
import { detectGaps } from './gaps';
import { applyFix, detectFixCommand } from './fix-commands';
import { detectUnresolvedPlaceholders } from './placeholders';

export { detectModeAdvisoryGaps } from './advisory/mode-advisory';
export { detectGaps, generateFixSuggestions, generateQualityScore } from './gaps';
export { applyFix, detectFixCommand } from './fix-commands';
export { detectUnresolvedPlaceholders } from './placeholders';

import { validateBasicSchema, validateServiceCatalog, validateLegacyIntents, validateRequiredTemplates, validateFarewellFlow } from './validators/basic-schema';
import { validateDomainRules } from './validators/domain-rules';
import { validateStructuralSections } from './validators/structural';
import { validateCrossReferences } from './validators/cross-reference';
import { validateFlowsAndTools } from './validators/flow-validation';
import { validateFlowSafety } from './validators/flow-safety';

export { validateFlowSafety } from './validators/flow-safety';

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export type GapSeverity = 'high' | 'medium' | 'low' | 'advisory';

export type LogicGap = {
  type: 'missing_rules' | 'missing_flows' | 'missing_templates' | 'missing_protocols' | 'missing_error_categories' | 'missing_rule_description' | 'missing_response_template' | 'missing_error_suggestions' | 'missing_capability' | 'unresolved_placeholder' | 'missing_service_catalog' | 'missing_service_catalog_treatments' | 'missing_farewell_flow' | 'mode_note';
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

export type QualityScore = {
  score: number;
  max: number;
  gaps: string[];
};

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

  const sl = logic as Partial<import('../chat/structured-logic').StructuredLogic>;

  // 1. Basic schema validation
  validateBasicSchema(sl, errors);
  validateServiceCatalog(sl, errors);
  validateLegacyIntents(sl, errors);
  validateRequiredTemplates(sl, errors);
  validateFarewellFlow(sl, errors);

  // 2. Domain-specific validation
  validateDomainRules(sl, mode, errors);

  // 4. Exhaustive structural validation (when sections are present)
  validateStructuralSections(sl, errors);

  // 5. Enhanced structural and cross-reference validation
  validateCrossReferences(sl, errors);

  // 6. Flow steps and tool validation
  validateFlowsAndTools(sl, mode, errors);

  // 7. Flow safety: destructive-before-constructive ordering and closing
  //    templates that can never (or must never) be delivered.
  validateFlowSafety(sl, mode, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

// detectGaps, generateFixSuggestions, generateQualityScore moved to ./gaps.ts
// applyFix, detectFixCommand moved to ./fix-commands.ts
// detectUnresolvedPlaceholders moved to ./placeholders.ts

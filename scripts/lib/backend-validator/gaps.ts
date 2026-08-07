/**
 * Gaps — gap detection, fix suggestions, and quality scoring.
 *
 * Extracted from validator.ts to separate gap analysis from blocking validation.
 */

import type { StructuredLogic, StructuredLogicChatMode } from './structured-logic';
import type { LogicGap } from './validator';
import { CRITICAL_INTENTS } from './constants';
import { detectModeAdvisoryGaps } from './advisory/mode-advisory';
import { detectUnresolvedPlaceholders } from './placeholders';

export type QualityScore = {
  score: number;
  max: number;
  gaps: string[];
};

export function detectGaps(
  logic: StructuredLogic,
  mode: StructuredLogicChatMode,
): LogicGap[] {
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
  const missingIntents = CRITICAL_INTENTS
    .filter((c) => !presentIntents.has(c.category) && !(c.aliases?.some((a) => presentIntents.has(a))))
    .map((c) => c.category);
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

  // 9. serviceCatalog gaps
  if (!logic.serviceCatalog || typeof logic.serviceCatalog !== 'object') {
    gaps.push({
      type: 'missing_service_catalog',
      description:
        'serviceCatalog is required. It replaces the old TREATMENTS_LIST placeholder. ' +
        'Define at least one treatment with: name (required), priceDescription (optional: exact price like "50 EUR", ' +
        'a range like "From 120 EUR", or an AI directive like "Consult clinic" / "Custom price after evaluation"), ' +
        'and requiresConsultation (optional: true/false — tells the AI if a prior consultation is needed before booking).',
      severity: 'high',
      affectedFields: ['serviceCatalog'],
    });
  } else if (!Array.isArray(logic.serviceCatalog.treatments) || logic.serviceCatalog.treatments.length === 0) {
    gaps.push({
      type: 'missing_service_catalog_treatments',
      description:
        'serviceCatalog.treatments must have at least one treatment. ' +
        'Tip: priceDescription accepts exact prices ("50 EUR"), ranges ("From 120 EUR"), or AI directives ' +
        '("Consult clinic", "Custom price after evaluation"). The AI will repeat this text verbatim when asked. ' +
        'Use requiresConsultation: true if a prior consultation is required before booking.',
      severity: 'high',
      affectedFields: ['serviceCatalog.treatments'],
    });
  }

  // 10. farewell flow presence
  const hasFarewellFlow = Object.values(logic.toolOrchestration?.flows ?? {}).some(
    (flow) => flow.intent === 'farewell'
  );
  if (!hasFarewellFlow) {
    gaps.push({
      type: 'missing_farewell_flow',
      description: 'Missing farewell flow. Required for graceful conversation end and silence control.',
      severity: 'high',
      affectedFields: ['toolOrchestration.flows'],
    });
  }

  // 11. Unresolved or unknown placeholders in identity/responseTemplates/faq/protocols
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

  // Mode-specific advisory notes (never blocking)
  gaps.push(...detectModeAdvisoryGaps(mode, logic));

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
      case 'missing_service_catalog':
        return 'Add serviceCatalog with at least one treatment. ' +
          'Each treatment needs: name (required), priceDescription (optional: exact price, range, or AI directive), ' +
          'requiresConsultation (optional: true/false). ' +
          'Example: { name: "First visit", priceDescription: "Consult clinic", requiresConsultation: true }';
      case 'missing_service_catalog_treatments':
        return 'Add at least one treatment to serviceCatalog.treatments. ' +
          'Tip: priceDescription accepts exact prices ("50 EUR"), ranges ("From 120 EUR"), or AI directives ' +
          '("Consult clinic", "Custom price after evaluation"). The AI will repeat this text verbatim when asked.';
      case 'missing_farewell_flow':
        return 'Add a farewell flow with intent "farewell" and allowsSilence: true. ' +
          'This is required for graceful conversation endings (e.g., when the patient says "thanks" or "bye"). ' +
          'Example: { intent: "farewell", description: "Say goodbye", steps: [{ step: 1, tools: [], parallel: false }], responseTemplate: "farewell", allowsSilence: true }';
      case 'unresolved_placeholder':
        return `Ask the advisor for the real values needed at: ${gap.affectedFields?.join(', ')}. ` +
          `Replace unknown placeholders with actual text, or fill in identity.website/identity.openingHours ` +
          `if {{WEB}}/{{HORARIO}} are used.`;
      case 'mode_note':
        return `Considera si tu sede quiere seguir el patrón típico del modo. ${gap.description}`;
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
 * - 44 points: required sections present (4 points per section).
 * - 10 points: at least 1 rule with description.
 * - 10 points: at least 1 flow.
 * - 10 points: at least 1 flow with responseTemplate.
 * - 10 points: at least 1 protocol.
 * - 10 points: at least 1 errorCategory.
 *
 * Total max = 94.
 */
export function generateQualityScore(logic: StructuredLogic): QualityScore {
  const max = 94;
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
    { key: 'serviceCatalog', present: !!logic.serviceCatalog && typeof logic.serviceCatalog === 'object' && Array.isArray(logic.serviceCatalog.treatments) && logic.serviceCatalog.treatments.length > 0 },
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

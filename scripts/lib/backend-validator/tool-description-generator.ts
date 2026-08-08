/**
 * ToolDescriptionGenerator — Generates tool descriptions automatically from structured logic.
 *
 * Big Tech pattern: One source of truth (JSON) drives all downstream behavior.
 * The advisor only edits the JSON; the backend generates everything else.
 *
 * This eliminates:
 * - Dual maintenance (descriptions + JSON)
 * - Contradictions (JSON says "NO schedule" but description says "Search availability")
 * - Confusion for the advisor (only one place to edit)
 *
 * Generated descriptions are injected into OpenAI as the function calling interface.
 */

import type { StructuredLogic, StructuredLogicChatMode } from './structured-logic';
import { getSchedulingCapability } from './structured-logic';
import {
  TASKS_ONLY_OVERRIDES,
  FULL_MODE_ENHANCEMENTS,
} from './system-tool-descriptions';

/**
 * Generate tool descriptions from structured logic.
 *
 * This is the main entry point. Scheduling capability is derived from the chat mode.
 * and produces the appropriate descriptions for OpenAI.
 */
export function generateToolDescriptionsFromStructuredLogic(
  logic: StructuredLogic,
  chatMode: StructuredLogicChatMode,
): Record<string, string> {
  const hasScheduling = getSchedulingCapability(chatMode);

  if (!hasScheduling) {
    return generateTasksOnlyDescriptions(logic);
  }

  return generateFullDescriptions(logic);
}

/**
 * Generate descriptions for TASKS_ONLY mode.
 */
function generateTasksOnlyDescriptions(logic: StructuredLogic): Record<string, string> {
  const descriptions: Record<string, string> = {};

  // Start with TASKS_ONLY overrides
  for (const [toolName, description] of Object.entries(TASKS_ONLY_OVERRIDES)) {
    descriptions[toolName] = description;
  }

  // Inject flow response templates into tool descriptions
  injectFlowResponseTemplates(logic, descriptions);

  return descriptions;
}

/**
 * Generate descriptions for FULL mode.
 */
function generateFullDescriptions(logic: StructuredLogic): Record<string, string> {
  const descriptions: Record<string, string> = {};

  // Start with FULL mode enhancements
  for (const [toolName, description] of Object.entries(FULL_MODE_ENHANCEMENTS)) {
    descriptions[toolName] = description;
  }

  // Inject flow response templates into tool descriptions
  injectFlowResponseTemplates(logic, descriptions);

  return descriptions;
}

/**
 * Tools that must NEVER receive a forced response template, even when they
 * happen to sit in the terminal step of a flow.
 *
 * Two families live here:
 * - Search/retrieval tools (query_knowledge_base, query_protocol,
 *   check_availability): the LLM needs freedom to synthesise what it just
 *   retrieved into an answer that addresses the patient. A canned "ya está
 *   hecho" after a search makes the tool useless and, worse, pushes the model
 *   to act as if the flow had already completed.
 * - Resolver tools (resolve_*, lookup_patient): they only translate patient
 *   wording into ids/dates. They never conclude a flow, so a closing template
 *   after them is always wrong.
 *
 * This is the safety belt. The structural rule (only the terminal step gets a
 * template) is the primary defence — see injectFlowResponseTemplates.
 */
export const NEVER_TEMPLATED_TOOLS = new Set([
  'query_knowledge_base',
  'query_protocol',
  'check_availability',
  'resolve_availability_query',
  'resolve_treatment',
  'resolve_professional',
  'resolve_patient',
  'lookup_patient',
]);

/**
 * Inject response templates from tool flows into tool descriptions.
 *
 * A flow's responseTemplate describes how to CLOSE the flow, so it is only
 * injected into the tools of the flow's TERMINAL step (the last entry of
 * `steps`). Injecting it into every step made the LLM believe the flow was
 * already finished right after a mid-flow search, which is what caused the
 * bot to answer "he movido tu cita" straight after listing availability.
 *
 * Edge cases:
 * - Single-step flow: the first step is also the terminal one (unchanged).
 * - `steps: []`, missing `steps`, or a terminal step with `tools: []`:
 *   nothing to inject, no throw.
 * - A tool present in both an intermediate and the terminal step gets the
 *   template exactly once (only the terminal step is walked).
 * - `allowedTools`: deliberately ignored here. It is an unordered whitelist
 *   (see ResolveActiveFlow, which uses it to scope the tools offered to the
 *   LLM), so it carries no information about which tool closes the flow.
 *   Injecting into all of them would reproduce the very bug this fixes.
 *   Flows that need a closing template must declare `steps`.
 */
function injectFlowResponseTemplates(
  logic: StructuredLogic,
  descriptions: Record<string, string>,
): Record<string, string> {
  for (const [flowName, flow] of Object.entries(logic.toolOrchestration.flows)) {
    if (!flow.responseTemplate) {
      continue;
    }

    const steps = Array.isArray(flow.steps) ? flow.steps : [];
    const terminalStep = steps[steps.length - 1];
    const terminalTools = Array.isArray(terminalStep?.tools) ? terminalStep.tools : [];
    if (terminalTools.length === 0) {
      continue;
    }

    // Resolve template reference: if the flow.responseTemplate matches a key
    // in logic.responseTemplates, use the actual text; otherwise treat as literal.
    const resolvedTemplate =
      logic.responseTemplates?.[flow.responseTemplate]?.text ?? flow.responseTemplate;

    const mode = flow.responseTemplateMode ?? 'literal';
    const instruction =
      mode === 'model'
        ? `Usa este modelo como base para responder: "${resolvedTemplate}". ` +
          `Puedes adaptarlo a la pregunta del paciente usando los datos disponibles, ` +
          `pero no pierdas la información clave ni el tono.`
        : `Responde EXACTAMENTE con este texto: "${resolvedTemplate}". ` +
          `No anadir nombres, horas, tratamientos ni variaciones.`;

    // Dedupe in case the terminal step lists the same tool twice.
    for (const toolName of new Set(terminalTools)) {
      // Safety belt: search/resolver tools never close a flow.
      if (NEVER_TEMPLATED_TOOLS.has(toolName)) {
        continue;
      }

      const current = descriptions[toolName] || '';
      descriptions[toolName] =
        current +
        `\n\nRESPUESTA OBLIGATORIA DESPUES de esta herramienta en el flujo "${flowName}": ` +
        instruction;
    }
  }
  return descriptions;
}

/**
 * Get the complete set of tool descriptions for a bot.
 *
 * This is the main function used by OrchestrateConversation.
 * It reads the bot's structuredLogic and returns descriptions generated from it.
 * Legacy tool descriptions are no longer supported; structuredLogic is the single source of truth.
 */
export function getToolDescriptionsForBot(
  structuredLogic: StructuredLogic | null | undefined,
  chatMode: StructuredLogicChatMode,
): Record<string, string> {
  if (!structuredLogic) {
    throw new Error(
      'Tool descriptions cannot be generated: structuredLogic is missing. ' +
      'Ensure the bot has structuredLogic configured.',
    );
  }

  return generateToolDescriptionsFromStructuredLogic(structuredLogic, chatMode);
}

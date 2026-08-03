/**
 * Flow Validation — validates flow steps, tools, and cross-references.
 *
 * Extracted from validator.ts (section 6) to separate flow-specific checks
 * from basic schema and structural validations.
 */

import type { BusinessRule, StructuredLogic, StructuredLogicChatMode, ToolFlow } from '../structured-logic';
import { StructuredLogicJsonSchema } from '../structured-logic-json-schema';
import { extractAllowedKeys } from '../schema-key-extractor';
import { ALL_CHAT_TOOL_NAMES } from '../structured-logic-json-schema';
import { TURN_START_CAPABILITIES, TURN_START_CAPABILITY_SET, VALID_CAPABILITIES, CAPABILITY_ESTABLISHERS } from '../constants';

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

function closestValidCapability(name: string): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const cap of VALID_CAPABILITIES) {
    const dist = levenshtein(String(name), cap);
    if (dist < bestDist) { bestDist = dist; best = cap; }
  }
  return bestDist <= 4 ? best : null;
}
import { ALL_CHAT_TOOLS_TASKS_ONLY } from '../tool-definitions-tasks-only';

const ALLOWED_FLOW_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.toolOrchestration.properties.flows.additionalProperties.properties');
const ALLOWED_SELECTION_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.toolOrchestration.properties.flows.additionalProperties.properties.selection.properties');
const ALLOWED_STEP_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.toolOrchestration.properties.flows.additionalProperties.properties.steps.items.properties');
const ALLOWED_INTENT_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.intents.additionalProperties.properties');
const ALLOWED_RULE_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.rules.items.properties');
const ALLOWED_CONDITION_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.rules.items.properties.conditions.items.properties');

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

export function validateFlowsAndTools(
  sl: Partial<StructuredLogic>,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  const flows = sl.toolOrchestration?.flows ?? {};
  const validTools = new Set(ALL_CHAT_TOOL_NAMES);
  const tasksOnlyToolNames = new Set(ALL_CHAT_TOOLS_TASKS_ONLY.map((t) => t.name));
  const schedulingTools = new Set(
    ALL_CHAT_TOOL_NAMES.filter((name) => !tasksOnlyToolNames.has(name)),
  );

  // 6a. Flow steps must have unique, sequential step numbers
  Object.entries(flows).forEach(([flowName, flow]) => {
    if (!Array.isArray(flow.steps)) {
      errors.push(`Flow '${flowName}' steps must be an array`);
      return;
    }
    if (flow.steps.length === 0) {
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
          errors.push(
            `Flow '${flowName}' step ${stepIndex + 1} uses scheduling tool '${tool}' but mode is 'tasks-only'. ` +
              `Scheduling tools are: ${Array.from(schedulingTools).join(', ')}. ` +
              `In tasks-only mode, use create_task for human follow-up instead.`
          );
        }
      });
      if (Array.isArray(step.required)) {
        step.required.forEach((req) => {
          if (ALL_CHAT_TOOL_NAMES.includes(req)) {
            errors.push(
              `Flow '${flowName}' step ${stepIndex + 1} has invalid required capability '${req}'. Must be one of: ${Array.from(VALID_CAPABILITIES).join(', ')}. Tool names in 'required' will block execution at runtime.`,
            );
          } else if (!VALID_CAPABILITIES.has(req)) {
            const suggestion = closestValidCapability(req);
            errors.push(
              `Flow '${flowName}' step ${stepIndex + 1} has unknown required capability '${req}'. Must be one of: ${Array.from(VALID_CAPABILITIES).join(', ')}.${suggestion ? ` Did you mean '${suggestion}'?` : ''}`,
            );
          }
        });

        // Anti-circular requirement (technical invariant — always a bug, blocking).
        // A step may only REQUIRE capabilities established by EARLIER steps; if a tool
        // in the SAME step establishes the required capability, the tool can never run
        // at runtime (step_requirements_failed) and the flow deadlocks.
        for (const req of step.required) {
          const establishers = CAPABILITY_ESTABLISHERS[req] ?? [];
          const circularTools = step.tools.filter((tool) => establishers.includes(tool));
          if (circularTools.length > 0) {
            errors.push(
              `Flow '${flowName}' step ${stepIndex + 1} has a circular requirement: it requires '${req}', but ${circularTools
                .map((t) => `'${t}'`)
                .join(', ')} — the tool that ESTABLISHES that capability — is in the same step, so it can never run at runtime (step_requirements_failed). ` +
                `FIX: 'required' must list what must be true BEFORE the step runs, established by EARLIER steps. Remove it from this step and declare it where the capability is CONSUMED ` +
                `(e.g., check_availability requires 'hasResolvedTreatment' from a previous resolve_treatment step; schedule_block requires 'hasResolvedPatient' from a previous resolve_patient step).`,
            );
          }
        }
      }
    });

    // 4.3 Validate that flows without tools have response mechanism
    const hasTools = flow.steps.some((step) => step.tools.length > 0);
    const hasAllowedTools = (flow.allowedTools || []).length > 0;
    const hasResponse = !!flow.responseTemplate || flow.allowsSilence === true;
    if (!hasTools && !hasAllowedTools && !hasResponse) {
      errors.push(
        `Flow '${flowName}' has no tools and no response mechanism (responseTemplate or allowsSilence). The bot will not know how to respond.`,
      );
    }
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

  // NOTE: redirectToTask is NOT mandatory in any mode. The advisor decides whether
  // scheduling requests redirect to human tasks or are handled conversationally.
  // Previously enforced as blocking; now advisory only via detectModeAdvisoryGaps.

  // NOTE: create_task is NOT mandatory in tasks-only scheduling flows. The advisor
  // may design tasks-only flows with other approaches (e.g., informational responses).
  // Previously enforced as blocking; now advisory only via detectModeAdvisoryGaps.

  // 6d5. appointment_reschedule_request flows in full must have manage_schedule_block_status (cancel step)
  if (mode === 'full') {
    const rescheduleFlows = Object.entries(flows).filter(([, flow]) => flow.intent === 'appointment_reschedule_request');
    for (const [flowName, flow] of rescheduleFlows) {
      if (!flowUsesTool(flow, 'manage_schedule_block_status')) {
        errors.push(
          `Flow "${flowName}" (intent: appointment_reschedule_request) in full mode must use "manage_schedule_block_status" ` +
            `(action: cancel) in allowedTools or steps before scheduling the new appointment. ` +
            `This prevents double-booking by canceling the existing appointment first.`
        );
      }
    }
  }

  // NOTE: create_task is NOT mandatory in tasks-only reschedule flows.
  // The advisor decides whether reschedule requests redirect to human tasks.
  // Previously enforced as blocking; now advisory only via detectModeAdvisoryGaps.

  // 6d7. appointment_cancellation flows must have responseTemplate
  const cancellationFlows = Object.entries(flows).filter(([, flow]) => flow.intent === 'appointment_cancellation');
  for (const [flowName, flow] of cancellationFlows) {
    if (!flow.responseTemplate) {
      errors.push(
        `Flow "${flowName}" (intent: appointment_cancellation) must have a "responseTemplate". ` +
          `The patient needs confirmation that the cancellation was processed.`
      );
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
        errors.push(
          `Rule ${index} (${rule.id || rule.intent}) has action='block' and must include a 'message' for the patient. ` +
            `The 'message' field is what the bot tells the patient when blocking this request. ` +
            `Example: "I'm unable to process this request. Please contact the clinic directly."`
        );
      }
    }
  });
}

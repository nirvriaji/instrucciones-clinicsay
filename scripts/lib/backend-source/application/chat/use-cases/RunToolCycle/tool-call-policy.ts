import type { ConversationCapabilities } from '../../../../domain/chat/conversation-state';
import type { ToolFlow } from '../../../../domain/chat/structured-logic';
import { getFlowToolNames } from '../../../../domain/chat/flow-terminal-tools';
import { ALL_TOOL_NAMES } from '../../../../domain/chat/tool-names';
import { getActiveSteps } from '../../../../domain/chat/step-conditions';
import type { StepConditionFacts } from '../../../../domain/chat/step-conditions';

export function checkStepRequirements(
  toolName: string,
  toolArguments: Record<string, unknown>,
  activeFlow: ToolFlow | null,
  capabilities: ConversationCapabilities,
  chatMode: 'full' | 'tasks-only',
  customStateValues: Record<string, string> = {},
  conditionFacts: StepConditionFacts = { customStateValues },
): { allowed: boolean; reason?: string } {
  if (
    chatMode === 'full' &&
    toolName === 'schedule_block' &&
    !capabilities.hasShownSlots
  ) {
    return {
      allowed: false,
      reason: activeFlow?.intent === 'existing_appointment_rescheduling'
        ? 'Full rescheduling must have shown slots (call check_availability first) before schedule_block.'
        : 'Full booking requires shown slots before schedule_block.',
    };
  }

  // Hard gate: patient must be resolved before scheduling in a new appointment.
  if (
    toolName === 'schedule_block' &&
    activeFlow?.intent === 'new_appointment_scheduling' &&
    !capabilities.hasResolvedPatient
  ) {
    return {
      allowed: false,
      reason: 'No se puede agendar sin resolver al paciente. Llama resolve_patient primero y confirma nombre, apellido y telefono.',
    };
  }

  // Hard gate: patient must be resolved before creating a booking task in tasks-only mode.
  if (
    chatMode === 'tasks-only' &&
    toolName === 'create_task' &&
    activeFlow?.intent === 'new_appointment_scheduling' &&
    !capabilities.hasResolvedPatient
  ) {
    return {
      allowed: false,
      reason: 'No se puede crear una tarea de agendamiento sin resolver al paciente. Llama resolve_patient primero y confirma nombre, apellido y telefono.',
    };
  }

  if (!activeFlow) {
    return { allowed: true };
  }

  const activeStepsWithTool = getActiveSteps(activeFlow, conditionFacts)
    .filter((step) => step.tools.includes(toolName));
  const terminalStep = TERMINAL_TOOL_NAMES.has(toolName) && activeStepsWithTool.some((step) => (step.customState?.length ?? 0) > 0);
  if (terminalStep) {
    const missing = Array.from(new Set(activeStepsWithTool.flatMap((step) => (step.customState ?? []).map((field) => field.key))))
      .filter((key) => !customStateValues[key]);
    if (missing.length > 0) {
      return { allowed: false, reason: `No se puede ejecutar '${toolName}': faltan campos custom del step activo: ${missing.join(', ')}.` };
    }
  }

  if (
    activeFlow.intent === 'existing_appointment_rescheduling' &&
    toolName === 'manage_schedule_block_status' &&
    toolArguments.action === 'cancel'
  ) {
    return {
      allowed: false,
      reason:
        'Rescheduling must use cancel_for_rescheduling, not manage_schedule_block_status(action=cancel).',
    };
  }

  // Full booking/rescheduling is backend-owned: schedule_block needs a current
  // availability result or a confirmed consultant selection.
  if (chatMode === 'full' && (
    activeFlow.intent === 'existing_appointment_rescheduling' ||
    activeFlow.intent === 'new_appointment_scheduling'
  )) {
    if (
      activeFlow.intent === 'existing_appointment_rescheduling' &&
      toolName !== 'cancel_for_rescheduling' &&
      !capabilities.hasCancelledRescheduleTarget
    ) {
      return {
        allowed: false,
        reason: 'Full rescheduling must call cancel_for_rescheduling before continuing.',
      };
    }
    if (toolName === 'check_availability' && !capabilities.hasResolvedAvailabilityQuery) {
      return {
        allowed: false,
        reason:
          'Full rescheduling must call resolve_availability_query before check_availability.',
      };
    }
    if (
      toolName === 'schedule_block' &&
      !capabilities.hasShownSlots
    ) {
      return {
        allowed: false,
        reason:
          'Full booking must have shown slots before schedule_block.',
      };
    }
  }

  // Derive the allowed set of tools for this flow
  const flowTools = new Set(getFlowToolNames(activeFlow));
  // If the tool is not in the flow's allowed set, deny it
  if (!flowTools.has(toolName)) {
    const available = Array.from(flowTools).join(', ') || 'none';
    return {
      allowed: false,
      reason: `Tool '${toolName}' is not available in flow '${activeFlow.intent}'. Available: ${available}`,
    };
  }

  // Find all steps that include this tool
  const stepsWithTool = activeFlow.steps?.filter((step) => step.tools.includes(toolName)) ?? [];

  // If the tool is in the allowed set but no step declares it, allow unconditionally
  if (stepsWithTool.length === 0) {
    return { allowed: true };
  }

  // A tool is allowed if at least one of the steps that declare it has all its required capabilities satisfied.
  const anyStepAllowed = stepsWithTool.some((step) => {
    if (!step.required || step.required.length === 0) {
      return true;
    }
    return step.required.every((req) => capabilities[req as keyof typeof capabilities] === true);
  });

  if (anyStepAllowed) {
    return { allowed: true };
  }

  // Build a human-readable reason from the first blocked step
  const firstBlocked = stepsWithTool.find((step) => {
    if (!step.required || step.required.length === 0) return false;
    return step.required.some((req) => capabilities[req as keyof typeof capabilities] !== true);
  });
  const missing =
    firstBlocked?.required?.filter(
      (req) => capabilities[req as keyof typeof capabilities] !== true,
    ) ?? [];

  // Detect if the missing requirement looks like a tool name (common mistake)
  const toolNameMistakes = missing.filter((req) => ALL_TOOL_NAMES.includes(req));

  let reason: string;
  if (toolNameMistakes.length > 0) {
    reason =
      `Step requirements not met: ${missing.join(', ')}. ` +
      `WARNING: '${toolNameMistakes[0]}' is a tool name, not a capability flag. ` +
      `The 'required' field must contain capability flags (e.g., 'scheduling', 'protocols', 'reminders') or be empty []. ` +
      `Tool names in 'required' will ALWAYS block execution. Fix the JSON in the clinic's structuredLogic.`;
  } else {
    reason = `Step requirements not met: ${missing.join(', ')}`;
  }
  return { allowed: false, reason };
}

const TERMINAL_TOOL_NAMES = new Set(['create_task', 'schedule_block', 'manage_schedule_block_status', 'cancel_for_rescheduling']);

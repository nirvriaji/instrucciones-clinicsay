/**
 * Canonical flow selection — keeps flow eligibility working on bots whose
 * structured logic was persisted before a gate was fixed.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ResolveActiveFlow` picks a flow by intent plus `selection`, evaluated against
 * the three capabilities computed at turn start. The structured logic it reads
 * is not the seed in `default-structured-logic.ts`: it is the copy persisted in
 * the bot's metadata when the bot was created or last updated. So a gate fixed
 * in the seed stays broken for every bot persisted before the fix.
 *
 * That is exactly what happened while rescheduling (2026-08-19). The flow
 * required `hasActiveAppointment`, but `cancel_for_rescheduling` releases the
 * block precisely in the middle of the flow: from the next turn on the patient
 * has no future appointment, the capability disappears and the flow stops
 * matching — dropping the conversation to "no flow", with every tool exposed
 * and no step guidance, right before the booking. The seed already carries the
 * escape (`hasCancelledRescheduleTarget`); the deployed bot did not.
 *
 * Rather than re-generating every bot, reconcile at read time. Pure function:
 * no I/O, no clock.
 */

import type { ToolFlow, ToolFlowSelection, ToolOrchestration } from './structured-logic';

/**
 * Escapes that every flow for a given intent must offer, whatever its persisted
 * config says. Keyed by intent because bots may rename the flow itself.
 */
const CANONICAL_ALTERNATIVE_CAPABILITIES: Record<string, readonly string[]> = {
  // A rescheduling in progress survives its own preparatory cancellation.
  existing_appointment_rescheduling: ['hasCancelledRescheduleTarget'],
};

/**
 * Capabilities a `selection` may declare but the runtime never computes, so a
 * flow requiring one can never be selected. Dropping them from
 * `requiredCapabilities` turns a permanently dead flow into a usable one; the
 * builder still uses them to shape the steps it generates.
 */
const NON_RUNTIME_CAPABILITIES = new Set(['hasConcreteDateTime']);

/** Reconcile the flows of a persisted `toolOrchestration`. Returns a new object. */
export function reconcileFlowSelections(orchestration: ToolOrchestration): ToolOrchestration {
  const flows = orchestration?.flows;
  if (!flows || typeof flows !== 'object') return orchestration;

  let changed = false;
  const reconciled: Record<string, ToolFlow> = {};

  for (const [name, flow] of Object.entries(flows)) {
    const selection = reconcileSelection(flow?.selection, flow?.intent);
    if (selection === flow?.selection) {
      reconciled[name] = flow;
      continue;
    }
    changed = true;
    reconciled[name] = { ...flow, selection };
  }

  return changed ? { ...orchestration, flows: reconciled } : orchestration;
}

function reconcileSelection(
  selection: ToolFlowSelection | undefined,
  intent: string | undefined,
): ToolFlowSelection | undefined {
  // No selection means "always eligible for this intent" — nothing to repair.
  if (!selection) return selection;

  const required = selection.requiredCapabilities ?? [];
  const runtimeRequired = required.filter((c) => !NON_RUNTIME_CAPABILITIES.has(c));

  const canonical: readonly string[] = intent ? CANONICAL_ALTERNATIVE_CAPABILITIES[intent] ?? [] : [];
  const alternatives = selection.alternativeRequiredCapabilities ?? [];
  const missing = canonical.filter((c) => !alternatives.includes(c));

  if (runtimeRequired.length === required.length && missing.length === 0) {
    return selection;
  }

  const next: ToolFlowSelection = { ...selection };
  if (runtimeRequired.length !== required.length) {
    next.requiredCapabilities = runtimeRequired;
  }
  if (missing.length > 0) {
    next.alternativeRequiredCapabilities = [...alternatives, ...missing];
  }
  return next;
}

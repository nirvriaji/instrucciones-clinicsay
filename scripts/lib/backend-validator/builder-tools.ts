import type { StructuredLogic, StructuredLogicChatMode } from './structured-logic';
import { buildDefaultStructuredLogicForMode } from './default-structured-logic';

/**
 * Tools for the chatbot instruction builder agent.
 *
 * These functions are pure domain helpers consumed by the builder agent.
 * They give the LLM deterministic access to defaults and guidelines
 * instead of forcing everything into a giant prompt.
 */

export function getDefaultStructuredLogic(mode: StructuredLogicChatMode): StructuredLogic {
  return buildDefaultStructuredLogicForMode(mode);
}

export function getTreatmentPolicyHintsGuidelines(): string {
  return `Guidelines for treatmentPolicyHints and globalSchedulingPolicies:

- Start-minute constraints (e.g. "appointments start at :00, :15, :30 or :45") belong in globalSchedulingPolicies, NOT in treatmentPolicyHints. Use treatmentId null for the clinic-wide policy or a treatment ID for a specific one; allowedStartMinutes holds a non-empty list of unique integers between 0 and 59.
- Use treatmentPolicyHints ONLY for scheduling constraints that cannot be encoded as rules, flows, or globalSchedulingPolicies.
- Examples: allowed days/hours for a specific treatment, required professionals, minimum notice, black-out dates.
- DO NOT put clinical protocols here; use the protocols section.
- These hints are shown to the advisor in the builder UI but are NEVER injected into the runtime bot prompt.
- The actual calendar constraints must be configured in the Scheduling Policies module.`;
}

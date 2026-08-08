import type { StructuredLogic, StructuredLogicChatMode } from '../structured-logic';
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
  return `Guidelines for treatmentPolicyHints:

- Use treatmentPolicyHints ONLY for scheduling constraints that cannot be encoded as rules or flows.
- Examples: allowed days/hours for a specific treatment, required professionals, minimum notice, black-out dates.
- DO NOT put clinical protocols here; use the protocols section.
- These hints are shown to the advisor in the builder UI but are NEVER injected into the runtime bot prompt.
- The actual calendar constraints must be configured in the Scheduling Policies module.`;
}

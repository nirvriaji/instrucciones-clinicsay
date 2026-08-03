/**
 * Constants — shared values used across validator modules.
 *
 * Extracted to avoid circular dependencies and to allow advisory modules
 * to import only the constants they need instead of the full validator.
 */

import type { StructuredLogicChatMode } from './structured-logic';

/**
 * Critical intent categories every clinic must have a business rule for.
 * Single source of truth shared by `validateStructuredLogic` (blocking) and
 * `detectGaps` (advisory).
 */
export const CRITICAL_INTENTS: Array<{ category: string; description: string }> = [
  { category: 'appointment_confirmation', description: 'confirmation of existing appointments' },
  { category: 'appointment_cancellation', description: 'cancellation of existing appointments' },
  { category: 'scheduling_request', description: 'scheduling of new appointments' },
];

/**
 * Capabilities that are available before the tool cycle starts and are therefore
 * safe to use in flow.selection.
 */
export const TURN_START_CAPABILITIES = ['hasResolvedPatient'] as const;
export const TURN_START_CAPABILITY_SET = new Set<string>(TURN_START_CAPABILITIES);

export const VALID_CAPABILITIES = new Set([
  'hasResolvedTreatment',
  'hasResolvedPatient',
  'hasResolvedProfessional',
  'hasShownSlots',
  'hasSelectedSlot',
  'hasCreatedAppointment',
  'hasCreatedTask',
  'hasResolvedAvailabilityQuery',
]);

/**
 * Tools that ESTABLISH each capability at runtime (technical invariant).
 * A step may only REQUIRE a capability established by EARLIER steps — never
 * by a tool in the same step, or the requirement can never be satisfied
 * (runtime error: step_requirements_failed).
 */
export const CAPABILITY_ESTABLISHERS: Record<string, string[]> = {
  hasResolvedTreatment: ['resolve_treatment'],
  hasResolvedPatient: ['resolve_patient', 'lookup_patient'],
  hasResolvedProfessional: ['resolve_professional'],
  hasShownSlots: ['check_availability'],
  hasSelectedSlot: [], // established by the patient choosing a slot, not by a tool
  hasCreatedAppointment: ['schedule_block'],
  hasCreatedTask: ['create_task'],
  hasResolvedAvailabilityQuery: ['resolve_availability_query'],
};

/**
 * Runtime placeholders that are always resolvable from the per-turn context
 * (Site/Clinic record). Kept in sync with `PLACEHOLDER_MAP` in
 * `src/application/chat/build-system-prompt-from-structured-logic.ts`.
 */
export const RUNTIME_PLACEHOLDERS = new Set([
  'CLINIC_NAME', 'NOMBRE_BOT', 'DIRECCION', 'TELEFONO', 'EMAIL',
  'SITE_NAME', 'SITE_ADDRESS', 'SITE_PHONE', 'SITE_EMAIL', 'LOCAL_TIME',
]);

/**
 * Placeholders resolved from `identity` fields in the JSON itself (filled in
 * by the advisor through the builder), not from runtime Site/Clinic data.
 */
export const IDENTITY_PLACEHOLDERS: Record<string, 'website' | 'openingHours'> = {
  WEB: 'website',
  HORARIO: 'openingHours',
};

/**
 * Scheduling-only tools dynamically derived: any tool present in the full
 * catalog but absent from the tasks-only catalog is considered scheduling.
 */
export function getSchedulingTools(allTools: string[], tasksOnlyTools: string[]): Set<string> {
  const tasksOnlySet = new Set(tasksOnlyTools);
  return new Set(allTools.filter((name) => !tasksOnlySet.has(name)));
}

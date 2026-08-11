/**
 * Canonical intent taxonomy.
 *
 * WHY THIS EXISTS
 * ---------------
 * `full` and `tasks-only` are only LIMITS. The advisor decides, in the chatbot
 * instruction builder JSON, which flows exist, which steps they run and in which
 * order. But safety rules — both the configuration-time validator and the
 * server-side runtime guards — need to know what a flow MEANS: "is this flow
 * moving an appointment the patient already has?".
 *
 * Deriving that from free-form ids does not work. The guards used to compare
 * against the literal `'reschedule_appointment'` flow key, so an advisor who
 * renamed the flow silently lost the protection. Intent ids are the stable
 * semantic contract instead: every safety rule keys off the sets below rather
 * than off a string literal sprinkled across the codebase.
 *
 * A CLOSED PERIMETER, NOT A CLOSED VOCABULARY
 * -------------------------------------------
 * There are effectively infinite intents a clinic may want, and they are not
 * only conversational. This set is therefore closed ONLY inside the reserved
 * namespaces below, and kept as small as the safety rules allow. Outside them
 * the advisor is free: `insurance_coverage_inquiry`, `parking_info`,
 * `payment_inquiry`, `farewell` or `physio_program_followup` are perfectly
 * valid intents that no safety rule needs to classify, and the validator
 * accepts them without a word. The clinic owns its conversation; the taxonomy
 * only owns the part of it that can destroy a patient's appointment.
 *
 * Two things are therefore enforced at configuration time:
 *   1. An id under a RESERVED namespace must be canonical. An invented
 *      `existing_appointment_moving` LOOKS like rescheduling but falls outside
 *      `RESCHEDULING_INTENTS`, so the server-side guard would not protect it —
 *      a silent loss of protection, exactly what this taxonomy exists to kill.
 *   2. A flow that creates, moves or destroys appointments must carry a
 *      canonical intent, whatever it is named otherwise: that flow has safety
 *      semantics and the guards must be able to classify it.
 *
 * NAMING CONVENTION (the reserved namespaces)
 * -------------------------------------------
 * Appointment-related intents are prefixed by what they act on:
 *   - `new_appointment_*`      → the patient does not have the appointment yet.
 *   - `existing_appointment_*` → the patient already has it; the flow reads,
 *                                moves, confirms, keeps or destroys it.
 * Non-appointment intents keep a plain topical name.
 *
 * Adding a canonical intent is a deliberate act: add it here, classify it in
 * the sets below, and the validator will accept it. Unknown ids under a
 * reserved prefix are rejected, never tolerated — a typo must fail loudly at
 * configuration time, not degrade a safety rule into a no-op at runtime.
 */

/**
 * The canonical set is deliberately SMALL: it contains only intents that a
 * safety rule has to reason about, and it lives entirely inside the reserved
 * namespaces. Conversation intents — payments, parking, insurance, farewells,
 * post-treatment follow-up, escalation to a human — are the clinic's business,
 * not the taxonomy's, and are declared freely.
 *
 * Grow this list only when a new intent genuinely needs to be classified by a
 * guard or a validator rule. Every addition here removes freedom from every
 * clinic, so it must earn its place.
 */
export const CANONICAL_INTENTS = [
  // Appointment the patient does not have yet
  'new_appointment_scheduling',
  'new_appointment_inquiry',

  // Appointment the patient already has
  'existing_appointment_rescheduling',
  'existing_appointment_reschedule_inquiry',
  'existing_appointment_confirmation',
  'existing_appointment_cancellation',
  'existing_appointment_cancellation_inquiry',
  'existing_appointment_inquiry',
  'existing_appointment_keep',
  'existing_appointment_delay_notice',
] as const;

export type CanonicalIntent = (typeof CANONICAL_INTENTS)[number];

const CANONICAL_INTENT_SET: ReadonlySet<string> = new Set(CANONICAL_INTENTS);

export function isCanonicalIntent(value: unknown): value is CanonicalIntent {
  return typeof value === 'string' && CANONICAL_INTENT_SET.has(value);
}

/**
 * Namespaces the taxonomy owns. Any id starting with one of these MUST be
 * canonical: it claims appointment semantics, so a safety rule will try to
 * classify it, and an unrecognised id would silently classify as "not my
 * business" instead of failing.
 */
export const RESERVED_INTENT_NAMESPACES = ['new_appointment_', 'existing_appointment_'] as const;

/** True when `id` claims one of the reserved appointment namespaces. */
export function usesReservedIntentNamespace(id: string): boolean {
  return RESERVED_INTENT_NAMESPACES.some((prefix) => id.startsWith(prefix));
}

/**
 * Intents whose fulfilment MOVES an existing appointment. The current contract
 * cancels PREPARATORILY first (`cancel_for_rescheduling`, which persists the
 * backend-owned target) and rebooks afterwards from that target — there is no
 * atomic create+cancel route anymore. These intents drive the flow-safety
 * validator rules and the server-side `schedule_block` gate that requires the
 * persisted target.
 */
export const RESCHEDULING_INTENTS: ReadonlySet<CanonicalIntent> = new Set<CanonicalIntent>([
  'existing_appointment_rescheduling',
]);

/**
 * Intents that can only be fulfilled by CREATING an appointment. A flow serving
 * one of these must be able to reach `schedule_block`.
 */
export const APPOINTMENT_CREATING_INTENTS: ReadonlySet<CanonicalIntent> = new Set<CanonicalIntent>([
  'new_appointment_scheduling',
  'existing_appointment_rescheduling',
]);

/**
 * Intents that act on an appointment the patient already has. Flows serving
 * these are the ones that legitimately require the `hasActiveAppointment`
 * capability gate.
 */
export const EXISTING_APPOINTMENT_INTENTS: ReadonlySet<CanonicalIntent> = new Set<CanonicalIntent>([
  'existing_appointment_rescheduling',
  'existing_appointment_reschedule_inquiry',
  'existing_appointment_confirmation',
  'existing_appointment_cancellation',
  'existing_appointment_cancellation_inquiry',
  'existing_appointment_inquiry',
  'existing_appointment_keep',
  'existing_appointment_delay_notice',
]);

/** True when a flow serving `intent` moves an appointment the patient already has. */
export function isReschedulingIntent(intent: string | undefined): boolean {
  return isCanonicalIntent(intent) && RESCHEDULING_INTENTS.has(intent);
}

/**
 * Intents whose arrival abandons a pending reschedule continuation: the
 * persisted `cancelledRescheduleTarget` must be dropped when the classifier
 * lands on one of these.
 *
 * - `new_appointment_scheduling`: the patient now wants a NEW appointment. The
 *   schedule_block handler forces the persisted target's patient and rejects
 *   other patients while a target exists, so a stale target would hijack the
 *   new booking.
 * - `existing_appointment_cancellation`: the patient abandons the reschedule
 *   in favour of a definitive cancellation. The preparatory cancellation
 *   already happened; the target is dead weight.
 *
 * Everything else (rescheduling itself, inquiries, confirmation, keep, delay,
 * non-canonical topical intents) KEEPS the target: the patient may still be
 * mid-reschedule and the rebooking path revalidates it against the live DB.
 */
const RESCHEDULE_TARGET_DROPPING_INTENTS: ReadonlySet<CanonicalIntent> = new Set<CanonicalIntent>([
  'new_appointment_scheduling',
  'existing_appointment_cancellation',
]);

/** True when detecting `intent` must drop a persisted rescheduling target. */
export function dropsCancelledRescheduleTarget(intent: string | undefined): boolean {
  return isCanonicalIntent(intent) && RESCHEDULE_TARGET_DROPPING_INTENTS.has(intent);
}

/** True when a flow serving `intent` can only succeed by creating an appointment. */
export function isAppointmentCreatingIntent(intent: string | undefined): boolean {
  return isCanonicalIntent(intent) && APPOINTMENT_CREATING_INTENTS.has(intent);
}

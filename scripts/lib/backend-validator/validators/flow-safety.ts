/**
 * Flow Safety — configuration-time guards against advisor-authored flows that
 * are dangerous or silently broken at runtime.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `full` and `tasks-only` are only LIMITS (which tools exist at all). The
 * advisor decides, in the chatbot instruction builder JSON, WHICH steps run,
 * IN WHICH ORDER and WITH WHICH TOOLS. The backend therefore cannot assume any
 * particular flow shape — it can only reject shapes that are provably unsafe.
 *
 * Two of those shapes caused a production incident (lead 23415677):
 *
 *  1. The reschedule flow cancelled the patient's appointment in step 1, in
 *     PARALLEL with resolving the requested dates — i.e. before any
 *     alternative existed. When no slot matched, the patient was left with no
 *     appointment at all. Irrecoverable business data loss.
 *  2. The closing template ("He movido tu cita") was reachable from a flow
 *     whose terminal step was a SEARCH tool, so the model announced the move
 *     right after merely listing availability.
 *
 * Both are configuration mistakes, so they are rejected here — loudly, at
 * configuration time — instead of being silently patched at runtime. Messages
 * are written in Spanish and addressed to a non-technical advisor: what is
 * wrong, why it is dangerous, and how to fix it.
 *
 * Pure functions, no I/O.
 */

import {
  CANONICAL_INTENTS,
  EXISTING_APPOINTMENT_INTENTS,
  RESERVED_INTENT_NAMESPACES,
  isCanonicalIntent,
  isReschedulingIntent,
  usesReservedIntentNamespace,
} from '../canonical-intents';
import type { StructuredLogic, StructuredLogicChatMode, ToolFlow } from '../structured-logic';
import { NEVER_TEMPLATED_TOOLS } from '../tool-description-generator';

/** Tool that destroys an existing appointment (action `cancel`). */
const DESTRUCTIVE_TOOL = 'manage_schedule_block_status';

/** Tool that creates the replacement appointment. */
const CONSTRUCTIVE_TOOL = 'schedule_block';

/** Tool that cancels/confirms EVERY appointment the patient has on a date. */
const BULK_DESTRUCTIVE_TOOL = 'manage_all_schedule_blocks_for_date';

/**
 * Tools that WRITE on the patient's appointments: they create, move or destroy
 * them. Every other chat tool (`check_availability`, `resolve_*`,
 * `lookup_patient`, `query_*`, `create_task`) only reads or produces work for a
 * human, so it carries no appointment-safety semantics.
 *
 * Their presence is what forces a flow to carry a canonical intent, and — when
 * that intent is `existing_appointment_*` — what forces the
 * `hasActiveAppointment` gate.
 */
const APPOINTMENT_WRITING_TOOLS = [CONSTRUCTIVE_TOOL, DESTRUCTIVE_TOOL, BULK_DESTRUCTIVE_TOOL];

const APPOINTMENT_WRITING_TOOLS_TEXT = APPOINTMENT_WRITING_TOOLS.join('", "');

/** Deterministic gate proving the patient really has an appointment to act on. */
const ACTIVE_APPOINTMENT_CAPABILITY = 'hasActiveAppointment';

/**
 * Flow safety rules stated for the LLMs that draft the JSON with the advisor.
 *
 * Single source of truth: the builder prompts embed this text so the model is
 * told the same rules that `validateFlowSafety` enforces. Keep both in sync.
 */
export const FLOW_SAFETY_PROMPT_RULES =
  `FLOW SAFETY RULES (the backend validator REJECTS the JSON when any of these is violated):\n` +
  `S1. NEVER put a destructive tool before its constructive counterpart. In particular, ` +
  `"manage_schedule_block_status" (cancel) must NEVER be in a step earlier than "schedule_block", and never in the SAME step ` +
  `(with or without "parallel": true). Cancelling before the new appointment exists leaves the patient WITH NO APPOINTMENT ` +
  `when no slot is found or the patient drops the conversation. This happened in production.\n` +
  `S2. Safe reschedule order in full mode: resolve dates -> check availability -> schedule the NEW appointment -> cancel the old one. ` +
  `The cancellation is the LAST movement of the flow and is additionally blocked server-side until the new appointment exists.\n` +
  `S3. A reschedule flow (intent "existing_appointment_rescheduling") in full mode that can cancel MUST also be able to book: ` +
  `"schedule_block" must be present in steps or allowedTools.\n` +
  `S3b. "allowedTools" is an UNORDERED whitelist, so it can never anchor the safe order. If ` +
  `"manage_schedule_block_status" is a numbered STEP, then "schedule_block" must ALSO be a numbered step, placed EARLIER — ` +
  `having the booking tool only in "allowedTools" is REJECTED. The reverse is the safe default: the cancellation lives in ` +
  `"allowedTools" (last movement, blocked server-side until the new appointment exists) while "schedule_block" is the ` +
  `terminal step. In a reschedule flow, "schedule_block" must always appear in "steps".\n` +
  `S4. "responseTemplate" is injected ONLY into the tools of the flow's TERMINAL step (the LAST element of the steps array). ` +
  `So the terminal step must be the tool that performs the real action (schedule_block, manage_schedule_block_status, create_task). ` +
  `A template whose terminal step only contains search/resolver tools (check_availability, resolve_*, lookup_patient, query_*) is REJECTED: ` +
  `it makes the bot announce a result it has not produced.\n` +
  `S5. A flow that uses tools and declares "responseTemplate" MUST declare "steps" with the closing tool in the last step. ` +
  `"allowedTools" is an unordered whitelist and carries no closing information; optional/conditional tools belong there, not in the terminal step.\n` +
  `S6. Write the "steps" array in execution order: its numbering must be ascending (1, 2, 3...), because the terminal step is the LAST array item.\n` +
  `S7. Intent ids are FREE except inside two RESERVED namespaces. The clinic owns its conversation: ids like ` +
  `"insurance_coverage_inquiry", "parking_info" or "physio_program_followup" are perfectly valid in "intents" and in ` +
  `"flow.intent", and no rule complains about them. What is CLOSED are the prefixes "new_appointment_" and ` +
  `"existing_appointment_": an id starting with either MUST be one of the canonical ids: ${CANONICAL_INTENTS.join(', ')}. ` +
  `An invented "existing_appointment_moving" LOOKS like rescheduling but is not recognised by the safety rules nor by the ` +
  `server-side guards, so the protection would be silently off. Convention: "new_appointment_*" when the patient does not have ` +
  `the appointment yet, "existing_appointment_*" when the flow reads, moves, confirms, keeps or destroys an appointment the ` +
  `patient already has.\n` +
  `S7b. A flow that CREATES, MOVES or DESTROYS appointments (it uses "${APPOINTMENT_WRITING_TOOLS_TEXT}", in "steps" or in ` +
  `"allowedTools") MUST declare a canonical "intent", even if the flow name is the clinic's own. That flow carries safety ` +
  `semantics and the guards need to classify it. A flow with a free intent and no appointment-writing tools (only ` +
  `"query_knowledge_base", "create_task", "lookup_patient", "check_availability", resolvers...) is valid.\n` +
  `S8. A flow whose intent is "existing_appointment_*" AND that uses an appointment-writing tool MUST ` +
  `declare "selection": { "requiredCapabilities": ["hasActiveAppointment"] }. Without that deterministic gate a bare "sí" can ` +
  `select the flow when the patient has no appointment at all, and the bot acts on an appointment that does not exist. ` +
  `Informational flows (no tools) do not need the gate.\n`;

function toolsOf(step: { tools?: string[] } | undefined): string[] {
  return Array.isArray(step?.tools) ? step!.tools : [];
}

function stepsOf(flow: ToolFlow): Array<{ step: number; tools: string[]; parallel?: boolean }> {
  return Array.isArray(flow.steps) ? (flow.steps as Array<{ step: number; tools: string[]; parallel?: boolean }>) : [];
}

/** First array position (execution position) whose step declares `tool`. */
function firstPositionWith(flow: ToolFlow, tool: string): number {
  return stepsOf(flow).findIndex((step) => toolsOf(step).includes(tool));
}

function flowUsesTool(flow: ToolFlow, tool: string): boolean {
  const inAllowed = Array.isArray(flow.allowedTools) && flow.allowedTools.includes(tool);
  return inAllowed || firstPositionWith(flow, tool) >= 0;
}

function header(flowName: string, flow: ToolFlow): string {
  return `Flujo "${flowName}" (intención "${flow.intent}")`;
}

function inAllowedTools(flow: ToolFlow, tool: string): boolean {
  return Array.isArray(flow.allowedTools) && flow.allowedTools.includes(tool);
}

/**
 * A destructive tool must never run before — or alongside — the tool that
 * creates its replacement.
 *
 * ORDER CAN ONLY BE READ FROM `steps`. `allowedTools` is an UNORDERED whitelist:
 * a tool that lives only there may be called at any moment of the flow, so it
 * carries no guarantee whatsoever. That asymmetry is what separates the safe
 * shape from the dangerous one:
 *
 *  - SAFE (the shipped default): the cancellation lives ONLY in `allowedTools`
 *    and `schedule_block` is a numbered step. Booking is anchored in the
 *    ordered part of the flow and the cancellation is additionally blocked
 *    server-side until the new appointment exists.
 *  - DANGEROUS: the cancellation is a numbered step and the ONLY way to book
 *    lives in `allowedTools`. The destruction is scheduled, the construction is
 *    not — nothing forces the booking to happen first, or at all.
 */
function validateDestructiveOrder(flowName: string, flow: ToolFlow, errors: string[]): void {
  const steps = stepsOf(flow);
  const cancelPos = firstPositionWith(flow, DESTRUCTIVE_TOOL);
  const schedulePos = firstPositionWith(flow, CONSTRUCTIVE_TOOL);
  const usesCancel = cancelPos >= 0 || inAllowedTools(flow, DESTRUCTIVE_TOOL);
  const usesSchedule = schedulePos >= 0 || inAllowedTools(flow, CONSTRUCTIVE_TOOL);

  // A flow that cannot do both things has no ordering problem: either it never
  // destroys anything, or `validateRescheduleCanRebook` reports the missing
  // constructive counterpart.
  if (!usesCancel || !usesSchedule) return;

  const cancelStepNumber = steps[cancelPos]?.step ?? cancelPos + 1;
  const scheduleStepNumber = steps[schedulePos]?.step ?? schedulePos + 1;

  const why =
    `POR QUÉ ES PELIGROSO: si la búsqueda no encuentra hueco, si el paciente no elige ninguno ` +
    `o si abandona la conversación, la cita antigua ya está cancelada y el paciente se queda SIN CITA. ` +
    `Es una pérdida de datos irrecuperable y ya ocurrió en producción.`;
  const how =
    `CÓMO SE CORRIGE: coloca "${CONSTRUCTIVE_TOOL}" en un paso ANTERIOR al de "${DESTRUCTIVE_TOOL}". ` +
    `Orden seguro: resolver fechas → buscar huecos → agendar la cita nueva → cancelar la antigua. ` +
    `Nunca pongas las dos herramientas en el mismo paso ni con "parallel": true.`;

  // Both tools are ordered steps: compare their execution positions below.
  if (cancelPos >= 0 && schedulePos >= 0) {
    validateOrderedPositions(flowName, flow, errors, {
      cancelPos,
      schedulePos,
      cancelStepNumber,
      scheduleStepNumber,
      why,
      how,
    });
    return;
  }

  // The cancellation is a numbered step but booking only exists in the
  // unordered whitelist: the destruction is scheduled and the construction is
  // not. This is the shape that escaped the original ordering rule.
  if (cancelPos >= 0) {
    errors.push(
      `${header(flowName, flow)}: el paso ${cancelStepNumber} CANCELA la cita ("${DESTRUCTIVE_TOOL}"), pero la única forma de ` +
        `AGENDAR la nueva ("${CONSTRUCTIVE_TOOL}") está en "allowedTools", que es una lista SIN ORDEN. ` +
        `Nada garantiza que se agende antes de cancelar, ni siquiera que se agende. ` +
        `${why} ${how}`,
    );
    return;
  }

  // The cancellation lives only in `allowedTools`. If booking is a numbered
  // step, this is the safe shape: nothing to report.
  if (schedulePos >= 0) return;

  // Neither tool is a numbered step: the whole move is unordered. Harmless for
  // flows that merely have both tools available, dangerous for a flow whose
  // very purpose is moving an appointment.
  if (isReschedulingIntent(flow.intent)) {
    errors.push(
      `${header(flowName, flow)}: es un flujo de reagendamiento que puede CANCELAR ("${DESTRUCTIVE_TOOL}") y AGENDAR ` +
        `("${CONSTRUCTIVE_TOOL}"), pero ninguna de las dos herramientas aparece en ningún paso numerado: ambas viven solo en ` +
        `"allowedTools", que es una lista SIN ORDEN. ${why} ` +
        `CÓMO SE CORRIGE: declara "${CONSTRUCTIVE_TOOL}" como paso final de "steps" (resolver fechas → buscar huecos → agendar) ` +
        `y deja "${DESTRUCTIVE_TOOL}" en "allowedTools" como último movimiento; el servidor bloquea esa cancelación ` +
        `mientras la cita nueva no exista.`,
    );
  }
}

function validateOrderedPositions(
  flowName: string,
  flow: ToolFlow,
  errors: string[],
  args: {
    cancelPos: number;
    schedulePos: number;
    cancelStepNumber: number;
    scheduleStepNumber: number;
    why: string;
    how: string;
  },
): void {
  const steps = stepsOf(flow);
  const { cancelPos, schedulePos, cancelStepNumber, scheduleStepNumber, why, how } = args;

  if (cancelPos === schedulePos) {
    const parallel = steps[cancelPos]?.parallel === true;
    errors.push(
      `${header(flowName, flow)}: el paso ${cancelStepNumber} CANCELA la cita ("${DESTRUCTIVE_TOOL}") y AGENDA la nueva ` +
        `("${CONSTRUCTIVE_TOOL}") en el mismo paso${parallel ? ' con "parallel": true' : ''}, así que no hay ningún orden garantizado entre las dos. ` +
        `${why} ${how}`,
    );
    return;
  }

  if (cancelPos < schedulePos) {
    errors.push(
      `${header(flowName, flow)}: el paso ${cancelStepNumber} CANCELA la cita ("${DESTRUCTIVE_TOOL}") antes del paso ` +
        `${scheduleStepNumber}, que es el que AGENDA la nueva ("${CONSTRUCTIVE_TOOL}"). ` +
        `${why} ${how}`,
    );
  }
}

/**
 * A reschedule flow that can cancel must also be able to book the replacement.
 */
function validateRescheduleCanRebook(
  flowName: string,
  flow: ToolFlow,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  if (mode !== 'full') return;
  if (!isReschedulingIntent(flow.intent)) return;
  if (!flowUsesTool(flow, DESTRUCTIVE_TOOL)) return;
  if (flowUsesTool(flow, CONSTRUCTIVE_TOOL)) return;

  errors.push(
    `${header(flowName, flow)}: puede CANCELAR la cita ("${DESTRUCTIVE_TOOL}") pero sin ninguna forma de agendar la nueva, ` +
      `porque "${CONSTRUCTIVE_TOOL}" no aparece ni en los pasos ni en "allowedTools". ` +
      `POR QUÉ ES PELIGROSO: reagendar sin poder agendar equivale a cancelar; el paciente se queda sin cita. ` +
      `CÓMO SE CORRIGE: añade "${CONSTRUCTIVE_TOOL}" al flujo (en un paso anterior a la cancelación), ` +
      `o quita "${DESTRUCTIVE_TOOL}" y trata la petición como una cancelación normal.`,
  );
}

/**
 * The closing template is injected into the tools of the TERMINAL step. If
 * every tool of that step is a search/resolver tool, the template either never
 * reaches the model or orders it to announce a result it has not produced.
 */
function validateTerminalTemplate(flowName: string, flow: ToolFlow, errors: string[]): void {
  if (!flow.responseTemplate) return;
  const steps = stepsOf(flow);
  if (steps.length === 0) return;

  const terminalTools = toolsOf(steps[steps.length - 1]);
  if (terminalTools.length === 0) return;
  if (!terminalTools.every((tool) => NEVER_TEMPLATED_TOOLS.has(tool))) return;

  const mode = flow.responseTemplateMode ?? 'literal';
  errors.push(
    `${header(flowName, flow)}: declara una plantilla de respuesta ("responseTemplate", modo "${mode}") pero su paso final ` +
      `solo usa herramientas de búsqueda o de identificación (${terminalTools.join(', ')}). ` +
      `POR QUÉ ES PELIGROSO: la plantilla se entrega justo después de buscar, así que el bot anuncia como hecho ` +
      `algo que todavía no ha hecho (por ejemplo "he movido tu cita" nada más listar horarios), y el paciente cree ` +
      `que su cita ya cambió. ` +
      `CÓMO SE CORRIGE: termina el flujo con la herramienta que realiza la acción real ` +
      `(por ejemplo "schedule_block", "manage_schedule_block_status" o "create_task") y deja la plantilla en ese paso final; ` +
      `si el flujo solo informa, quita la plantilla y deja que el bot redacte la respuesta con los resultados.`,
  );
}

/**
 * A template on a flow that has tools but no terminal step carrying them can
 * never be delivered: the injection point does not exist.
 */
function validateTemplateIsDeliverable(flowName: string, flow: ToolFlow, errors: string[]): void {
  if (!flow.responseTemplate) return;

  const steps = stepsOf(flow);
  const hasToolsInSteps = steps.some((step) => toolsOf(step).length > 0);
  const hasAllowedTools = Array.isArray(flow.allowedTools) && flow.allowedTools.length > 0;
  if (!hasToolsInSteps && !hasAllowedTools) return; // Purely conversational flow: valid.

  const terminalTools = steps.length > 0 ? toolsOf(steps[steps.length - 1]) : [];
  if (terminalTools.length > 0) return;

  errors.push(
    `${header(flowName, flow)}: declara una plantilla de respuesta ("responseTemplate") y usa herramientas, ` +
      `pero su paso final no declara ninguna herramienta${steps.length === 0 ? ' (no hay "steps")' : ''}, ` +
      `así que la plantilla nunca se aplica. ` +
      `POR QUÉ ES PELIGROSO: la respuesta que has escrito no llega nunca al paciente y el bot improvisa el cierre del flujo. ` +
      `CÓMO SE CORRIGE: declara los pasos del flujo en "steps" y pon la herramienta que cierra el flujo en el último paso. ` +
      `"allowedTools" es solo una lista sin orden: no sirve para saber cuál es el paso final.`,
  );
}

/**
 * The terminal step is the LAST element of the array, so the array order must
 * match the declared execution order.
 */
function validateStepArrayOrder(flowName: string, flow: ToolFlow, errors: string[]): void {
  const steps = stepsOf(flow);
  if (steps.length < 2) return;

  const numbers = steps.map((step) => step.step);
  const isAscending = numbers.every((value, index) => index === 0 || numbers[index - 1] < value);
  if (isAscending) return;

  errors.push(
    `${header(flowName, flow)}: los pasos están escritos en un orden distinto a su numeración (${numbers.join(', ')}). ` +
      `POR QUÉ ES PELIGROSO: el sistema considera paso final el ÚLTIMO de la lista, no el de número más alto, ` +
      `así que la plantilla de cierre y el orden de ejecución se aplican al paso equivocado. ` +
      `CÓMO SE CORRIGE: escribe los pasos en la lista en el mismo orden en que deben ejecutarse (1, 2, 3...).`,
  );
}

/**
 * Tokens that appear in almost every appointment intent and therefore carry no
 * discriminating power when suggesting a canonical replacement.
 */
const NON_DISCRIMINATING_TOKENS = new Set(['appointment', 'appointments', 'cita', 'citas', 'new', 'existing', 'patient', 'request', 'flow']);

/**
 * Canonical ids that look like the unknown one, so the advisor gets a concrete
 * replacement instead of a wall of options. Falls back to the full list when no
 * id is recognisably close.
 */
function suggestCanonicalIntents(unknownIntent: string): readonly string[] {
  const stems = unknownIntent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !NON_DISCRIMINATING_TOKENS.has(token))
    .map((token) => token.slice(0, 6));

  const scored = CANONICAL_INTENTS.map((candidate) => ({
    candidate,
    score: stems.filter((stem) => candidate.includes(stem)).length,
  })).filter((entry) => entry.score > 0);

  if (scored.length === 0) return CANONICAL_INTENTS;

  return scored
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
    .slice(0, 6)
    .map((entry) => entry.candidate);
}

const RESERVED_NAMESPACES_TEXT = RESERVED_INTENT_NAMESPACES.map((prefix) => `"${prefix}"`).join(' y ');

const RESERVED_NAMESPACE_WHY =
  `POR QUÉ ES PELIGROSO: los prefijos ${RESERVED_NAMESPACES_TEXT} están RESERVADOS para la taxonomía canónica. ` +
  `Un identificador inventado dentro de ellos PARECE de citas (por ejemplo "existing_appointment_moving" parece un ` +
  `reagendamiento), pero no coincide con ninguna de las reglas de seguridad ni con los guards del servidor, ` +
  `así que la protección se apaga en silencio y el error solo aparece cuando ya ha causado daño.`;

function reservedNamespaceHow(unknownIntent: string): string {
  return (
    `CÓMO SE CORRIGE: sustitúyela por la intención canónica equivalente. ` +
    `Parecidas: ${suggestCanonicalIntents(unknownIntent).join(', ')}. ` +
    `Si lo que quieres describir NO es una acción sobre una cita, renómbrala sin esos prefijos: fuera de ellos eres libre ` +
    `de inventar las intenciones que necesite tu clínica (por ejemplo "insurance_coverage_inquiry" o "parking_info").`
  );
}

/**
 * Rule 1 — an id inside a reserved namespace must be canonical.
 *
 * Outside those namespaces the advisor owns the vocabulary: a free id is a
 * conversational intent of the clinic and is accepted without comment.
 */
function reservedNamespaceError(id: string, where: string): string | undefined {
  if (isCanonicalIntent(id)) return undefined;
  if (!usesReservedIntentNamespace(id)) return undefined;

  return (
    `${where}: el identificador "${id}" usa un prefijo RESERVADO pero no pertenece a la taxonomía canónica de intenciones. ` +
    `${RESERVED_NAMESPACE_WHY} ${reservedNamespaceHow(id)}`
  );
}

/**
 * Canonical intents that fit what the flow actually does, so the message names
 * the replacement instead of listing the whole taxonomy.
 */
function canonicalIntentsForTools(writingTools: string[]): readonly string[] {
  const creates = writingTools.includes(CONSTRUCTIVE_TOOL);
  const destroys = writingTools.includes(DESTRUCTIVE_TOOL) || writingTools.includes(BULK_DESTRUCTIVE_TOOL);

  if (creates && destroys) return ['existing_appointment_rescheduling'];
  if (creates) return ['new_appointment_scheduling', 'existing_appointment_rescheduling'];
  return [
    'existing_appointment_cancellation',
    'existing_appointment_confirmation',
    'existing_appointment_delay_notice',
  ];
}

/**
 * Rules 1 and 3 for `flow.intent`.
 *
 * A free intent is legitimate — the advisor's clinic, the advisor's
 * conversation — UNLESS the flow claims a reserved namespace (rule 1) or writes
 * on appointments (rule 3), in which case the guards must be able to classify
 * it and only a canonical id can be classified.
 */
function validateFlowIntentIsClassifiable(flowName: string, flow: ToolFlow, errors: string[]): void {
  const intent = String(flow.intent ?? '');

  const reserved = reservedNamespaceError(intent, header(flowName, flow));
  if (reserved) {
    errors.push(reserved);
    return;
  }

  if (isCanonicalIntent(flow.intent)) return;

  const writingTools = APPOINTMENT_WRITING_TOOLS.filter((tool) => flowUsesTool(flow, tool));
  if (writingTools.length === 0) return; // Rule 2: free conversational intent.

  errors.push(
    `${header(flowName, flow)}: crea, mueve o destruye citas (${writingTools.join(', ')}), pero su intención "${intent}" ` +
      `no pertenece a la taxonomía canónica. ` +
      `POR QUÉ ES PELIGROSO: las reglas de seguridad y los guards del servidor (orden destructivo, puerta de cita activa, ` +
      `bloqueo de la cancelación hasta que exista la cita nueva) clasifican los flujos por su intención. Con una intención ` +
      `libre ninguna de esas protecciones reconoce el flujo, así que se apagan en silencio justo en el flujo que sí puede ` +
      `dejar al paciente sin cita. ` +
      `CÓMO SE CORRIGE: por lo que hace este flujo, la intención canónica que le corresponde es ` +
      `${canonicalIntentsForTools(writingTools).join(' o ')}. ` +
      `Si en realidad no debe tocar la cita del paciente, quita las herramientas ${writingTools.join(', ')} y conserva tu ` +
      `intención propia.`,
  );
}

/**
 * Rule 1 on the catalog the classifier is offered. Free ids are valid: the
 * classifier returning `parking_info` reaches no safety rule and none is
 * needed. A reserved-prefix id that is not canonical is not.
 */
function validateIntentCatalogNamespaces(sl: Partial<StructuredLogic>, errors: string[]): void {
  const intents = sl.intents;
  if (!intents || typeof intents !== 'object' || Array.isArray(intents)) return;

  for (const intentId of Object.keys(intents)) {
    const error = reservedNamespaceError(intentId, `intents["${intentId}"]`);
    if (error) errors.push(error);
  }
}

/**
 * A flow that WRITES on an appointment the patient already has must declare the
 * deterministic gate. Blocking, not advisory: the gate is the only thing that
 * stops a bare "sí" from acting on an appointment that does not exist, and it
 * is now trustworthy (the date-format bug that neutered it is fixed).
 */
function validateActiveAppointmentGate(flowName: string, flow: ToolFlow, errors: string[]): void {
  if (!isCanonicalIntent(flow.intent) || !EXISTING_APPOINTMENT_INTENTS.has(flow.intent)) return;

  const mutatingTools = APPOINTMENT_WRITING_TOOLS.filter((tool) => flowUsesTool(flow, tool));
  if (mutatingTools.length === 0) return;

  const required = flow.selection?.requiredCapabilities;
  if (Array.isArray(required) && required.includes(ACTIVE_APPOINTMENT_CAPABILITY)) return;

  errors.push(
    `${header(flowName, flow)}: actúa sobre una cita que el paciente YA tiene y la modifica ` +
      `(${mutatingTools.join(', ')}), pero no declara "selection": { "requiredCapabilities": ["${ACTIVE_APPOINTMENT_CAPABILITY}"] }. ` +
      `POR QUÉ ES PELIGROSO: sin esa puerta determinista el flujo puede seleccionarse cuando el paciente NO tiene ninguna cita activa ` +
      `(por ejemplo con un "sí" suelto), y el bot intenta confirmar, mover o cancelar una cita inexistente o la equivocada. ` +
      `CÓMO SE CORRIGE: añade "selection": { "requiredCapabilities": ["${ACTIVE_APPOINTMENT_CAPABILITY}"] } al flujo; ` +
      `si el flujo solo informa y no debe tocar la cita, quita las herramientas ${mutatingTools.join(', ')}.`,
  );
}

/**
 * Validate advisor-authored flow safety invariants.
 * Every finding is blocking: a silent degradation is worse than a loud error.
 */
export function validateFlowSafety(
  sl: Partial<StructuredLogic>,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  const flows = sl.toolOrchestration?.flows ?? {};

  validateIntentCatalogNamespaces(sl, errors);

  for (const [flowName, flow] of Object.entries(flows)) {
    if (!flow || typeof flow !== 'object') continue;

    validateFlowIntentIsClassifiable(flowName, flow, errors);
    validateActiveAppointmentGate(flowName, flow, errors);
    validateStepArrayOrder(flowName, flow, errors);
    validateDestructiveOrder(flowName, flow, errors);
    validateRescheduleCanRebook(flowName, flow, mode, errors);
    validateTerminalTemplate(flowName, flow, errors);
    validateTemplateIsDeliverable(flowName, flow, errors);
  }
}

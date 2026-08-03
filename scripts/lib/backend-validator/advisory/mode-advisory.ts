/**
 * Mode Advisory — canonical mode notes for the builder.
 *
 * Emits advisory gaps (never blocking) so the builder can proactively ask:
 * "In mode X the typical pattern is Y. Is your deviation intentional?"
 *
 * These are NOT personalized comparisons against the advisor's JSON.
 * They are canonical notes about what each mode typically enables.
 */

import type { StructuredLogic, StructuredLogicChatMode } from '../structured-logic';
import type { LogicGap } from '../validator';

export function detectModeAdvisoryGaps(
  mode: StructuredLogicChatMode,
  logic: StructuredLogic,
): LogicGap[] {
  const gaps: LogicGap[] = [];

  const allTools = new Set<string>();
  const allFlows = Object.values(logic.toolOrchestration?.flows ?? {});
  for (const flow of allFlows) {
    for (const step of flow.steps ?? []) {
      for (const tool of step.tools ?? []) {
        allTools.add(tool);
      }
    }
  }

  const schedulingTools = new Set([
    'check_availability',
    'schedule_block',
    'resolve_patient',
    'resolve_treatment',
    'resolve_professional',
    'resolve_availability_query',
  ]);

  // ── Caso A: Modo full + scheduling_request solo con create_task ──
  if (mode === 'full') {
    const schedulingFlows = allFlows.filter((f) => f.intent === 'scheduling_request');
    if (schedulingFlows.length > 0) {
      const hasRealScheduling = schedulingFlows.some((f) =>
        (f.steps ?? []).some((s) => s.tools.some((t) => schedulingTools.has(t))),
      );
      if (!hasRealScheduling) {
        gaps.push({
          severity: 'advisory',
          type: 'mode_note',
          description:
            'Para tu información: en modo FULL, el patrón típico para agendar citas es un flujo de scheduling_request con herramientas de resolución y agendamiento (resolve_patient, resolve_treatment, check_availability, schedule_block) para que el paciente agende directamente sin intervención humana. ' +
            'Tu flujo de scheduling_request no usa ninguna de estas herramientas. Si tu sede prefiere que recepción valide cada solicitud antes de agendar, está perfecto — solo asegúrate de que la tarea (create_task) incluya toda la información necesaria: nombre, apellido, teléfono, tratamiento y fecha preferida.',
        });
      }
    }
  }

  // ── Caso B: Modo full + no hay schedule_block en ningún flujo ──
  if (mode === 'full' && !allTools.has('schedule_block')) {
    gaps.push({
      severity: 'advisory',
      type: 'mode_note',
      description:
        'Para tu información: en modo FULL lo habitual es incluir "schedule_block" en al menos un flujo de scheduling para que el paciente pueda agendar citas directamente. ' +
        'En tu configuración actual no se encuentra "schedule_block". Si tu clínica prefiere que todas las citas pasen por recepción (modelo tarea humana), quizá el modo "tasks-only" describa mejor tu operativa. Si lo dejas en full, no pasa nada — el bot seguirá funcionando con las herramientas que tengas configuradas.',
    });
  }

  // ── Caso C: Modo tasks-only + resolve_patient o resolve_treatment presente ──
  if (mode === 'tasks-only' && (allTools.has('resolve_patient') || allTools.has('resolve_treatment'))) {
    gaps.push({
      severity: 'advisory',
      type: 'mode_note',
      description:
        'Para tu información: en modo TASKS-ONLY no es típico usar resolve_patient ni resolve_treatment porque no se agendan citas directamente. ' +
        'Si los incluyes en tus flujos, asegúrate de que es intencional (por ejemplo, para que la tarea humana ya tenga el patientId identificado y no tenga que volver a preguntar). Si no los necesitas, puedes simplificar el flujo quitándolos.',
    });
  }

  // ── Caso D: Modo tasks-only + regla scheduling_request sin redirectToTask ──
  if (mode === 'tasks-only') {
    const schedulingRules = (logic.rules ?? []).filter((r) => r.intent === 'scheduling_request');
    if (schedulingRules.length > 0) {
      const anyHasRedirect = schedulingRules.some((r) => r.redirectToTask === true);
      if (!anyHasRedirect) {
        gaps.push({
          severity: 'advisory',
          type: 'mode_note',
          description:
            'Para tu información: en modo TASKS-ONLY lo común es que las reglas de scheduling_request tengan redirectToTask: true, porque este modo no permite agendar citas reales (no tiene check_availability ni schedule_block). ' +
            'Si tu regla no tiene redirectToTask, el bot responderá sin crear tarea humana. Está bien si prefieres una respuesta informativa — solo asegúrate de que el paciente tenga claro cuál es su siguiente paso y que no quede esperando una acción del bot.',
        });
      }
    }
  }

  // ── Caso E: Cualquier modo + create_task SIN resolve_patient ni lookup_patient ──
  if (allTools.has('create_task') && !allTools.has('resolve_patient') && !allTools.has('lookup_patient')) {
    gaps.push({
      severity: 'advisory',
      type: 'mode_note',
      description:
        'Para tu información: la herramienta create_task SIEMPRE requiere nombre, apellido y número de teléfono del paciente para que recepción pueda contactarlo y gestionar la solicitud. ' +
        'En tu configuración actual no veo resolve_patient ni lookup_patient en ningún flujo. Esto está bien si el paciente ya se identifica de otra forma (por ejemplo, porque viene de un flujo previo donde ya se pidieron los datos). Si no, asegúrate de que create_task reciba esos datos de alguna manera, o incluye una nota en el flujo para que el bot los pida explícitamente antes de crear la tarea.',
    });
  }

  return gaps;
}

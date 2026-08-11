/**
 * Fix Commands — detect and apply fix commands to structuredLogic.
 *
 * Extracted from validator.ts to separate fix application from blocking validation.
 */

import type { StructuredLogic, StructuredLogicChatMode } from './structured-logic';
import { detectGaps } from './gaps';

export type FixCommandType =
  | 'add_template'
  | 'add_error_categories'
  | 'add_flow'
  | 'add_rule'
  | 'auto_fix'
  | 'unknown';

export type FixCommand = {
  type: FixCommandType;
  target?: string;
  description?: string;
};

/**
 * Detect if a user message is a fix command.
 * Returns the fix command type and target if detected.
 */
export function detectFixCommand(message: string): FixCommand {
  const lower = message.toLowerCase().trim();

  // Add template to flow — requires explicit template/plantilla keyword
  // or a combination of respuesta + flow/flujo to avoid false positives
  // on normal conversational messages like "quiero una respuesta corta".
  const hasTemplateKeyword = lower.includes('template') || lower.includes('plantilla');
  const hasFlowKeyword = lower.includes('flow') || lower.includes('flujo');
  const hasRespuestaInTemplateContext = lower.includes('respuesta') && (hasTemplateKeyword || hasFlowKeyword);
  if (hasTemplateKeyword || hasRespuestaInTemplateContext) {
    const flowMatch = lower.match(/(?:flow|flujo)\s+['"]?([^'"\s]+)['"]?/);
    const target = flowMatch ? flowMatch[1] : undefined;
    return { type: 'add_template', target, description: message };
  }

  // Add error categories
  if (lower.includes('error') && (lower.includes('categor') || lower.includes('handling') || lower.includes('manejo'))) {
    return { type: 'add_error_categories', description: message };
  }

  // Add flow
  if (lower.includes('add') && (lower.includes('flow') || lower.includes('flujo'))) {
    const flowMatch = lower.match(/(?:flow|flujo)\s+['"]?([^'"\s]+)['"]?/);
    const target = flowMatch ? flowMatch[1] : undefined;
    return { type: 'add_flow', target, description: message };
  }

  // Add rule
  if (lower.includes('add') && (lower.includes('rule') || lower.includes('regla'))) {
    return { type: 'add_rule', description: message };
  }

  // Auto-fix all detected gaps
  if (lower.includes('auto') && (lower.includes('fix') || lower.includes('correct') || lower.includes('arregla'))) {
    return { type: 'auto_fix', description: message };
  }

  return { type: 'unknown', description: message };
}

/**
 * Ensure an intent is declared in the intents catalog before a fix references
 * it in a rule or flow. Rules/flows referencing undeclared intents fail
 * `validateStructuredLogic` (`references intent "X" which is not declared`).
 */
function ensureIntentDeclared(logic: StructuredLogic, intentId: string, description: string): void {
  if (!logic.intents) {
    logic.intents = {};
  }
  if (!logic.intents[intentId]) {
    logic.intents[intentId] = { description };
  }
}

/**
 * Apply a fix command to structuredLogic.
 * Returns the updated structuredLogic and a description of what was changed.
 */
export function applyFix(
  logic: StructuredLogic,
  command: FixCommand,
  mode: StructuredLogicChatMode,
): { logic: StructuredLogic; changes: string[] } {
  const changes: string[] = [];
  const updated = JSON.parse(JSON.stringify(logic)) as StructuredLogic;

  switch (command.type) {
    case 'add_template': {
      const flowName = command.target ?? Object.keys(updated.toolOrchestration.flows)[0];
      if (flowName && updated.toolOrchestration.flows[flowName]) {
        updated.toolOrchestration.flows[flowName] = {
          ...updated.toolOrchestration.flows[flowName],
          responseTemplate: 'Perfecto, hemos procesado tu solicitud. ¿Necesitas algo más?',
        };
        changes.push(`Added responseTemplate to flow '${flowName}'`);
      } else {
        changes.push(`Flow '${flowName}' not found. No template added.`);
      }
      break;
    }

    case 'add_error_categories': {
      if (!updated.errorCategories) {
        updated.errorCategories = [];
      }
      updated.errorCategories.push({
        id: 'scheduling_conflict',
        description: 'El horario o slot ya está ocupado o hay conflicto de disponibilidad',
        suggestions: ['Probar con un horario diferente', 'Verificar disponibilidad con check_availability'],
      });
      updated.errorCategories.push({
        id: 'resource_not_found',
        description: 'El profesional, sala o recurso no existe en el sistema',
        suggestions: ['Verificar que el profesional o sala exista', 'Contactar al staff de la clínica'],
      });
      changes.push('Added default errorCategories: scheduling_conflict, resource_not_found');
      break;
    }

    case 'add_flow': {
      const newFlowName = command.target ?? 'new_flow';
      if (!updated.toolOrchestration.flows[newFlowName]) {
        ensureIntentDeclared(
          updated,
          'human_follow_up',
          'Solicitudes que requieren seguimiento humano y no encajan en otros intents.',
        );
        updated.toolOrchestration.flows[newFlowName] = {
          intent: 'human_follow_up',
          description: 'New conversation flow for patient requests',
          steps: [
            {
              step: 1,
              tools: ['create_task'],
              parallel: false,
              note: 'Create task for human follow-up',
            },
          ],
        };
        changes.push(`Added new flow '${newFlowName}' with default task step`);
      } else {
        changes.push(`Flow '${newFlowName}' already exists`);
      }
      break;
    }

    case 'add_rule': {
      ensureIntentDeclared(
        updated,
        'human_follow_up',
        'Solicitudes que requieren seguimiento humano y no encajan en otros intents.',
      );
      const newRuleId = `rule_${updated.rules.length + 1}`;
      updated.rules.push({
        id: newRuleId,
        intent: 'human_follow_up',
        description: 'La paciente solicita una acción específica que requiere gestión humana',
        action: 'allow',
        note: 'Nueva regla detectada: gestionar solicitud del paciente',
      });
      changes.push(`Added new rule '${newRuleId}' with allow action`);
      break;
    }

    case 'auto_fix': {
      const gaps = detectGaps(updated, mode);
      const highSeverityGaps = gaps.filter((g) => g.severity === 'high');

      for (const gap of highSeverityGaps) {
        switch (gap.type) {
          case 'missing_error_suggestions': {
            if (!updated.errorCategories) {
              updated.errorCategories = [];
            }
            updated.errorCategories.push({
              id: 'generic_error',
              description: 'Error genérico del sistema',
              suggestions: ['Contactar al staff de la clínica', 'Verificar configuración del bot'],
            });
            changes.push('Auto-fixed: Added generic errorCategory with suggestions');
            break;
          }
          case 'missing_rule_description': {
            for (const index of gap.affectedIndices ?? []) {
              if (updated.rules[index]) {
                updated.rules[index] = {
                  ...updated.rules[index],
                  description: updated.rules[index].description || 'Regla para gestionar solicitud del paciente',
                };
              }
            }
            changes.push(`Auto-fixed: Added descriptions to ${gap.affectedIndices?.length} rules`);
            break;
          }
          // Keywords removed: classifier now uses semantic descriptions + conversational context
          default:
            break;
        }
      }

      if (changes.length === 0) {
        changes.push('No high-severity gaps detected. Nothing to auto-fix.');
      }
      break;
    }

    default:
      changes.push(`Unknown fix command: ${command.type}`);
  }

  return { logic: updated, changes };
}

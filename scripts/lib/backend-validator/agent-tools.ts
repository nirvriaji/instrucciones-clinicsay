/**
 * Agent Tools — deterministic functions used by the instruction-builder agent.
 *
 * These tools give the LLM (or any caller) structured access to the schema,
 * defaults, validation, gaps, and partial updates of the bot's structured
 * logic. They are pure and side-effect free.
 */

import { buildEmptyStructuredLogicForMode } from '../chat/structured-logic-skeleton';
import type { StructuredLogic, StructuredLogicChatMode } from '../chat/structured-logic';
import { StructuredLogicWireJsonSchema } from './structured-logic-wire-schema';
import { validateStructuredLogic, detectGaps } from './validator';

export type ToolValidationResult = {
  valid: boolean;
  errors: string[];
};

export type ToolGapsResult = ReturnType<typeof detectGaps>;

export type PartialUpdateResult = {
  logic: StructuredLogic;
  validation: ToolValidationResult;
};

export type MissingField = {
  path: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  currentValue?: unknown;
};

export type TextGenerationResult = {
  text: string;
  responseId?: string;
};

export type QuestionGenerator = (prompt: string) => Promise<TextGenerationResult>;

/**
 * Return the wire-format JSON schema for StructuredLogic.
 *
 * The schema uses entry arrays for maps (intents, flows, protocols,
 * responseTemplates) so it is compatible with OpenAI strict:true.
 */
export function getSchema(): Record<string, unknown> {
  return StructuredLogicWireJsonSchema;
}

/**
 * Return an empty structured logic skeleton for the given mode.
 */
export function getEmptyLogic(mode: StructuredLogicChatMode): StructuredLogic {
  return buildEmptyStructuredLogicForMode(mode);
}

/**
 * Return the current draft as-is (deep clone).
 */
export function getCurrentDraft(logic: StructuredLogic): StructuredLogic {
  return JSON.parse(JSON.stringify(logic)) as StructuredLogic;
}

/**
 * Validate a draft against the mode.
 */
export function validateDraft(
  logic: unknown,
  mode: StructuredLogicChatMode,
): ToolValidationResult {
  return validateStructuredLogic(logic, mode);
}

/**
 * Detect quality gaps in the draft.
 */
export function getGaps(
  logic: StructuredLogic,
  mode: StructuredLogicChatMode,
): ToolGapsResult {
  return detectGaps(logic, mode);
}

/**
 * Apply a partial update to the current draft.
 *
 * Uses a deep merge for objects and replaces arrays/primitives. The resulting
 * logic is validated against the mode.
 */
export function applyPartialUpdate(
  current: StructuredLogic,
  partial: Record<string, unknown>,
  mode: StructuredLogicChatMode,
): PartialUpdateResult {
  const merged = deepMerge(
    current as Record<string, unknown>,
    partial,
  ) as StructuredLogic;
  const validation = validateStructuredLogic(merged, mode);

  return {
    logic: merged,
    validation: { valid: validation.valid, errors: validation.errors },
  };
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }

    if (value === null) {
      result[key] = null;
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value;
      continue;
    }

    const current = result[key];
    if (
      typeof value === 'object' &&
      current !== null &&
      current !== undefined &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      result[key] = deepMerge(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }

    result[key] = value;
  }

  return result;
}

/**
 * Return the next missing field that the advisor should fill.
 * Priority: identity -> styleRules -> intents -> rules -> flows -> other sections.
 */
export function getNextMissingField(logic: StructuredLogic): MissingField | null {
  const candidateFields: MissingField[] = [
    { path: 'identity.botName', label: 'Nombre del asistente', priority: 'high' },
    { path: 'identity.clinicName', label: 'Nombre de la clínica', priority: 'high' },
    { path: 'identity.persona', label: 'Personalidad del asistente', priority: 'medium' },
    { path: 'identity.tone', label: 'Tono del asistente', priority: 'medium' },
    { path: 'styleRules.tone', label: 'Tono de las respuestas', priority: 'high' },
    { path: 'styleRules.brevity', label: 'Nivel de brevedad', priority: 'high' },
    { path: 'styleRules.format', label: 'Formato de las respuestas', priority: 'medium' },
    { path: 'intents', label: 'Catálogo de intenciones', priority: 'high' },
    { path: 'rules', label: 'Reglas de negocio', priority: 'high' },
    { path: 'toolOrchestration.flows', label: 'Flujos de conversación', priority: 'high' },
    { path: 'responseTemplates', label: 'Plantillas de respuesta', priority: 'medium' },
    { path: 'faq', label: 'Preguntas frecuentes', priority: 'medium' },
    { path: 'protocols', label: 'Protocolos', priority: 'medium' },
    { path: 'errorCategories', label: 'Categorías de error', priority: 'medium' },
    { path: 'systemPromptInstructions', label: 'Notas para el asesor', priority: 'low' },
  ];

  for (const field of candidateFields) {
    const value = getValueByPath(logic as Record<string, unknown>, field.path);
    if (isEmptyValue(value)) {
      return { ...field, currentValue: value };
    }
  }

  return null;
}

/**
 * Generate a natural-language question in Spanish for a missing field.
 */
export async function generateQuestionForField(
  field: MissingField,
  generateText: QuestionGenerator,
): Promise<TextGenerationResult> {
  const prompt = [
    'Eres un asistente de configuración de chatbots para clínicas médicas.',
    `El asesor está configurando el campo "${field.label}" (ruta: ${field.path}).`,
    'Haz una pregunta natural, clara y breve en español para obtener el valor necesario.',
    'La pregunta debe ser directa y fácil de responder. No expliques el formato JSON; solo pregunta por la información.',
    'Devuelve únicamente la pregunta, sin markdown ni comillas adicionales.',
  ].join('\n');

  return generateText(prompt);
}

/**
 * Generate a human-readable diff preview between two structured logic objects.
 */
export function generateDiffPreview(
  current: StructuredLogic,
  proposed: StructuredLogic,
): string {
  const lines = buildDiffLines(current, proposed, '');
  if (lines.length === 0) {
    return 'No hay cambios.';
  }
  return lines.join('\n');
}

function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Placeholder pattern used in default structured logic values.
 * e.g. {{NOMBRE_BOT}}, {{CLINIC_NAME}}, {{DIRECCION}}.
 */
const PLACEHOLDER_PATTERN = /\{\{[A-Z_]+\}\}/g;

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    const withoutPlaceholders = value.replace(PLACEHOLDER_PATTERN, '').trim();
    return withoutPlaceholders.length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return false;
}

function buildDiffLines(
  current: unknown,
  proposed: unknown,
  path: string,
): string[] {
  const lines: string[] = [];

  if (current === proposed) {
    return lines;
  }

  if (
    typeof current !== 'object' ||
    typeof proposed !== 'object' ||
    current === null ||
    proposed === null ||
    Array.isArray(current) ||
    Array.isArray(proposed)
  ) {
    const displayPath = path || 'root';
    lines.push(`${displayPath}: ${JSON.stringify(current)} → ${JSON.stringify(proposed)}`);
    return lines;
  }

  const currentObj = current as Record<string, unknown>;
  const proposedObj = proposed as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(currentObj), ...Object.keys(proposedObj)]);

  for (const key of allKeys) {
    const childPath = path ? `${path}.${key}` : key;
    const hasCurrent = Object.prototype.hasOwnProperty.call(currentObj, key);
    const hasProposed = Object.prototype.hasOwnProperty.call(proposedObj, key);

    if (!hasCurrent) {
      lines.push(`+ ${childPath}: ${JSON.stringify(proposedObj[key])}`);
    } else if (!hasProposed) {
      lines.push(`- ${childPath}: ${JSON.stringify(currentObj[key])}`);
    } else {
      lines.push(...buildDiffLines(currentObj[key], proposedObj[key], childPath));
    }
  }

  return lines;
}

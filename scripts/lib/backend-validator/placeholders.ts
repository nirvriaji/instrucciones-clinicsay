/**
 * Placeholders — detection of unresolved template placeholders.
 *
 * Scans identity, responseTemplates, faq, and protocols text for placeholders
 * that will NOT resolve at runtime.
 */

import type { StructuredLogic } from '../chat/structured-logic';
import { RUNTIME_PLACEHOLDERS, IDENTITY_PLACEHOLDERS } from './constants';

export type UnresolvedPlaceholderIssue = {
  path: string;
  placeholder: string;
  reason: string;
};

type TextWithPath = { path: string; text: string };

function extractPlaceholderNames(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/\{\{([A-Z_]+)\}\}/g) ?? [];
  return matches.map((m) => m.slice(2, -2));
}

function collectStructuredLogicTexts(logic: StructuredLogic): TextWithPath[] {
  const entries: TextWithPath[] = [];

  if (logic.identity) {
    for (const [key, value] of Object.entries(logic.identity)) {
      if (typeof value === 'string') {
        entries.push({ path: `identity.${key}`, text: value });
      }
    }
  }

  if (logic.responseTemplates) {
    for (const [key, value] of Object.entries(logic.responseTemplates)) {
      const text = typeof value === 'string' ? value : value?.text;
      if (typeof text === 'string') {
        entries.push({ path: `responseTemplates.${key}`, text });
      }
    }
  }

  (logic.faq ?? []).forEach((entry, index) => {
    if (typeof entry.answer === 'string') {
      entries.push({ path: `faq[${index}].answer`, text: entry.answer });
    }
  });

  if (logic.protocols) {
    for (const [key, protocol] of Object.entries(logic.protocols)) {
      if (typeof protocol.responseTemplate === 'string') {
        entries.push({ path: `protocols.${key}.responseTemplate`, text: protocol.responseTemplate });
      }
    }
  }

  return entries;
}

/**
 * Scan identity, responseTemplates, faq, and protocols text for placeholders
 * that will NOT resolve at runtime:
 * - Unknown placeholders (not part of the recognized runtime/identity set).
 * - `{{WEB}}`/`{{HORARIO}}` when `identity.website`/`identity.openingHours`
 *   is missing or is itself still an unresolved placeholder.
 *
 * Used by the builder to prompt the advisor for the missing values.
 */
export function detectUnresolvedPlaceholders(logic: StructuredLogic): UnresolvedPlaceholderIssue[] {
  const issues: UnresolvedPlaceholderIssue[] = [];

  for (const { path, text } of collectStructuredLogicTexts(logic)) {
    for (const placeholder of extractPlaceholderNames(text)) {
      if (RUNTIME_PLACEHOLDERS.has(placeholder)) continue;

      const identityKey = IDENTITY_PLACEHOLDERS[placeholder];
      if (identityKey) {
        const identityValue = logic.identity?.[identityKey];
        if (!identityValue || extractPlaceholderNames(identityValue).length > 0) {
          issues.push({
            path,
            placeholder: `{{${placeholder}}}`,
            reason: `identity.${identityKey} is missing or not yet filled in with a real value`,
          });
        }
        continue;
      }

      issues.push({
        path,
        placeholder: `{{${placeholder}}}`,
        reason: 'unknown placeholder with no runtime source',
      });
    }
  }

  return issues;
}

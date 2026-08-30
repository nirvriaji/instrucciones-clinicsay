/**
 * Structural Validator — validates optional sections structure.
 *
 * Extracted from validator.ts (section 4) to separate structural checks
 * from basic schema and cross-reference validations.
 */

import type { StructuredLogic } from '../structured-logic';
import { StructuredLogicJsonSchema } from '../structured-logic-json-schema';
import { extractAllowedKeys } from '../schema-key-extractor';

const ALLOWED_IDENTITY_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.identity.properties');
const ALLOWED_STYLE_RULES_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.styleRules.properties');
const ALLOWED_FAQ_ENTRY_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.faq.items.properties');
const ALLOWED_PROTOCOL_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.protocols.additionalProperties.properties');
const ALLOWED_SYSTEM_PROMPT_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.systemPromptInstructions.properties');
const ALLOWED_RESUMPTION_INSTRUCTION_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.conversationResumption.properties.instructions.properties');

function rejectUnknownKeys(
  obj: Record<string, unknown> | null | undefined,
  allowedKeys: Set<string>,
  path: string,
  errors: string[],
): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Unknown property at ${path}.${key}`);
    }
  }
}

export function validateStructuralSections(
  sl: Partial<StructuredLogic>,
  errors: string[],
): void {
  // 4a. identity structure
  if (sl.identity && typeof sl.identity === 'object') {
    const identity = sl.identity as Record<string, unknown>;
    rejectUnknownKeys(identity, ALLOWED_IDENTITY_KEYS, 'identity', errors);
    const stringOrNullFields = [
      'botName', 'clinicName', 'address', 'phone', 'email', 'website',
      'openingHours', 'persona', 'tone', 'farewellMessage', 'escalationMessage',
    ];
    for (const field of stringOrNullFields) {
      if (identity[field] !== undefined && identity[field] !== null && typeof identity[field] !== 'string') {
        errors.push(`identity.${field} must be a string or null`);
      }
    }
    if (identity.language !== undefined && identity.language !== null && identity.language !== 'auto' && typeof identity.language !== 'string') {
      errors.push('identity.language must be "auto", a string or null');
    }
    if (identity.socialLinks !== undefined && identity.socialLinks !== null) {
      if (!Array.isArray(identity.socialLinks)) {
        errors.push('identity.socialLinks must be an array');
      } else {
        (identity.socialLinks as unknown[]).forEach((link, index) => {
          if (!link || typeof link !== 'object' || Array.isArray(link)) {
            errors.push(`identity.socialLinks[${index}] must be an object`);
            return;
          }
          const obj = link as Record<string, unknown>;
          if (typeof obj.platform !== 'string' || obj.platform.length === 0) {
            errors.push(`identity.socialLinks[${index}].platform is required and must be a non-empty string`);
          }
          if (typeof obj.url !== 'string' || obj.url.length === 0) {
            errors.push(`identity.socialLinks[${index}].url is required and must be a non-empty string`);
          }
        });
      }
    }
    if (identity.additionalContacts !== undefined && identity.additionalContacts !== null) {
      if (!Array.isArray(identity.additionalContacts)) {
        errors.push('identity.additionalContacts must be an array');
      } else {
        (identity.additionalContacts as unknown[]).forEach((contact, index) => {
          if (!contact || typeof contact !== 'object' || Array.isArray(contact)) {
            errors.push(`identity.additionalContacts[${index}] must be an object`);
            return;
          }
          const obj = contact as Record<string, unknown>;
          if (typeof obj.type !== 'string' || obj.type.length === 0) {
            errors.push(`identity.additionalContacts[${index}].type is required and must be a non-empty string`);
          }
          if (typeof obj.value !== 'string' || obj.value.length === 0) {
            errors.push(`identity.additionalContacts[${index}].value is required and must be a non-empty string`);
          }
          if (obj.label !== undefined && obj.label !== null && typeof obj.label !== 'string') {
            errors.push(`identity.additionalContacts[${index}].label must be a string or null`);
          }
        });
      }
    }
  }

  // 4b. styleRules structure
  if (sl.styleRules && typeof sl.styleRules === 'object') {
    const sr = sl.styleRules as Record<string, unknown>;
    rejectUnknownKeys(sr, ALLOWED_STYLE_RULES_KEYS, 'styleRules', errors);
    const stringOrNullFields = ['brevity', 'format', 'tone'];
    for (const field of stringOrNullFields) {
      if (sr[field] !== undefined && sr[field] !== null && typeof sr[field] !== 'string') {
        errors.push(`styleRules.${field} must be a string or null`);
      }
    }
    const booleanOrNullFields = [
      'noMedicalDiagnosis', 'noAsterisks', 'noMarkdown', 'mustOfferHumanHandoff',
    ];
    for (const field of booleanOrNullFields) {
      if (sr[field] !== undefined && sr[field] !== null && typeof sr[field] !== 'boolean') {
        errors.push(`styleRules.${field} must be a boolean or null`);
      }
    }
    const numberOrNullFields = ['maxSentences', 'maxWordsPerSentence'];
    for (const field of numberOrNullFields) {
      if (sr[field] !== undefined && sr[field] !== null && typeof sr[field] !== 'number') {
        errors.push(`styleRules.${field} must be a number or null`);
      }
    }
    const stringArrayOrNullFields = ['avoidPhrases', 'mandatoryPhrases', 'additionalRules'];
    for (const field of stringArrayOrNullFields) {
      if (sr[field] !== undefined && sr[field] !== null && !Array.isArray(sr[field])) {
        errors.push(`styleRules.${field} must be an array of strings or null`);
      }
    }
  }

  // 4c. responseTemplates must be objects {text, mode}. Strings are no longer accepted.
  if (sl.responseTemplates && typeof sl.responseTemplates === 'object') {
    const templates = sl.responseTemplates as Record<string, unknown>;
    for (const [key, value] of Object.entries(templates)) {
      if (typeof value === 'string') {
        errors.push(`responseTemplates["${key}"] must be an object {text, mode}, not a string`);
        continue;
      }
      if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
        errors.push(`responseTemplates["${key}"] must be an object {text, mode}`);
        continue;
      }
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (obj.text !== undefined && obj.text !== null && typeof obj.text !== 'string') {
          errors.push(`responseTemplates["${key}"].text must be a string or null`);
        }
        if (obj.mode !== undefined && obj.mode !== null && obj.mode !== 'literal' && obj.mode !== 'model') {
          errors.push(`responseTemplates["${key}"].mode must be "literal", "model" or null`);
        }
      }
    }
  }

  // 4d. faq structure
  if (Array.isArray(sl.faq)) {
    sl.faq.forEach((entry, index) => {
      rejectUnknownKeys(entry as unknown as Record<string, unknown>, ALLOWED_FAQ_ENTRY_KEYS, `faq[${index}]`, errors);
      if (entry.question === undefined || entry.question === null || typeof entry.question !== 'string') {
        errors.push(`faq[${index}] question is required and must be a string`);
      }
      if (entry.answer === undefined || entry.answer === null || typeof entry.answer !== 'string') {
        errors.push(`faq[${index}] answer is required and must be a string`);
      }
      if (entry.condition !== undefined && entry.condition !== null && typeof entry.condition !== 'string') {
        errors.push(`faq[${index}] condition must be a string or null`);
      }
    });
  }

  // 4e. protocols structure
  if (sl.protocols && typeof sl.protocols === 'object') {
    const protocols = sl.protocols as Record<string, unknown>;
    for (const [key, value] of Object.entries(protocols)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`protocols["${key}"] must be an object`);
        continue;
      }
      rejectUnknownKeys(value as Record<string, unknown>, ALLOWED_PROTOCOL_KEYS, `protocols.${key}`, errors);
      const protocol = value as Record<string, unknown>;
      if (typeof protocol.name !== 'string' || protocol.name.length === 0) {
        errors.push(`protocols["${key}"].name is required and must be a non-empty string`);
      }
      if (typeof protocol.description !== 'string' || protocol.description.length === 0) {
        errors.push(`protocols["${key}"].description is required and must be a non-empty string`);
      }
      if (protocol.responseTemplate !== undefined && protocol.responseTemplate !== null && typeof protocol.responseTemplate !== 'string') {
        errors.push(`protocols["${key}"].responseTemplate must be a string or null`);
      }
      if (protocol.sections !== undefined && protocol.sections !== null && !Array.isArray(protocol.sections)) {
        errors.push(`protocols["${key}"].sections must be an array of strings or null`);
      }
    }
  }

  // 4f. conversationResumption structure
  if (sl.conversationResumption && typeof sl.conversationResumption === 'object') {
    const cr = sl.conversationResumption as Record<string, unknown>;
    rejectUnknownKeys(cr, extractAllowedKeys(StructuredLogicJsonSchema, 'properties.conversationResumption.properties'), 'conversationResumption', errors);

    if (cr.instructions === undefined || cr.instructions === null) {
      errors.push('conversationResumption.instructions is required');
    } else if (typeof cr.instructions !== 'object' || Array.isArray(cr.instructions)) {
      errors.push('conversationResumption.instructions must be an object');
    } else {
      const instructions = cr.instructions as Record<string, unknown>;
      rejectUnknownKeys(
        instructions,
        ALLOWED_RESUMPTION_INSTRUCTION_KEYS,
        'conversationResumption.instructions',
        errors,
      );
      for (const [key, value] of Object.entries(instructions)) {
        if (value !== undefined && value !== null && typeof value !== 'string') {
          errors.push(`conversationResumption.instructions.${key} must be a string or null`);
        }
      }
    }
  }

  // 4g. systemPromptInstructions structure
  if (sl.systemPromptInstructions && typeof sl.systemPromptInstructions === 'object') {
    const spi = sl.systemPromptInstructions as Record<string, unknown>;
    rejectUnknownKeys(
      spi,
      ALLOWED_SYSTEM_PROMPT_KEYS,
      'systemPromptInstructions',
      errors,
    );
    const stringArrayFields = ['notesForAdvisor', 'knownGaps', 'recommendedNextSteps'];
    for (const field of stringArrayFields) {
      if (spi[field] === undefined || spi[field] === null) {
        errors.push(`systemPromptInstructions.${field} is required and must be an array`);
      } else if (!Array.isArray(spi[field])) {
        errors.push(`systemPromptInstructions.${field} must be an array of strings`);
      } else {
        const arr = spi[field] as unknown[];
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] !== 'string') {
            errors.push(`systemPromptInstructions.${field}[${i}] must be a string`);
          }
        }
      }
    }
  }
}

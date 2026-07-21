#!/usr/bin/env node
/**
 * validate-and-save.js
 *
 * Validates structuredLogic draft against schema, cross-references, and mode compliance.
 * If valid: copies draft to structured-logic.json
 * If invalid: reports categorized errors and exits 1.
 *
 * Usage:
 *   node scripts/validate-and-save.js --sede <SEDE> --mode <full|tasks-only>
 */

const fs = require('fs');
const { getSedePaths, getSchemaPath, getActiveJsonPath } = require('./lib/paths');
const { validateMode } = require('./lib/mode-enforcer');
const { ALL_TOOLS } = require('./lib/tool-registry');
const { extractAllowedKeys } = require('./lib/schema-key-extractor');
const logger = require('./lib/logger');

// Load JSON Schema once and derive allowed-key Sets programmatically
const SCHEMA_PATH = getSchemaPath();
const JSON_SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const ALLOWED_CAPABILITY_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.capabilities.properties');
const ALLOWED_TOOL_ORCHESTRATION_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.toolOrchestration.properties');
const ALLOWED_FLOW_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.toolOrchestration.properties.flows.additionalProperties.properties');
const ALLOWED_STEP_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.toolOrchestration.properties.flows.additionalProperties.properties.steps.items.properties');
const ALLOWED_INTENT_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.intents.additionalProperties.properties');
const ALLOWED_RULE_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.rules.items.properties');
const ALLOWED_SYSTEM_PROMPT_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.systemPromptInstructions.properties');
const ALLOWED_ERROR_CATEGORY_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.errorCategories.items.properties');
const ALLOWED_PROTOCOL_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.protocols.additionalProperties.properties');
const ALLOWED_TPH_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.treatmentPolicyHints.items.properties');
const ALLOWED_RESPONSE_TEMPLATE_VALUE_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.responseTemplates.additionalProperties.properties');

function parseArgs() {
  const args = process.argv.slice(2);
  const sedeIdx = args.indexOf('--sede');
  const modeIdx = args.indexOf('--mode');
  return {
    sede: sedeIdx >= 0 ? args[sedeIdx + 1] : null,
    mode: modeIdx >= 0 ? args[modeIdx + 1] : 'full',
  };
}

function validateRequired(data, path, required, errors) {
  for (const key of required) {
    if (!(key in data)) {
      errors.push({ category: 'schema', message: `Missing required field: ${path}.${key}` });
    }
  }
}

function validateType(value, expectedType, path, errors) {
  if (value === null || value === undefined) return;
  const actual = Array.isArray(value) ? 'array' : typeof value;
  if (actual !== expectedType) {
    errors.push({ category: 'schema', message: `Type mismatch at ${path}: expected ${expectedType}, got ${actual}` });
  }
}

/**
 * Reject unknown keys in an object. Mirrors backend's rejectUnknownKeys.
 * This enforces additionalProperties: false at every schema level.
 */
function rejectUnknownKeys(obj, allowedKeys, path, errors) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      errors.push({ category: 'schema', message: `Unknown property at ${path}.${key}` });
    }
  }
}

function validateSchema(data, errors) {
  // 0. Top-level strict schema (reject unknown properties)
  const allowedTopLevelKeys = new Set([
    'version', 'capabilities', 'identity', 'styleRules', 'responseTemplates',
    'faq', 'intents', 'toolOrchestration', 'rules', 'protocols',
    'errorCategories', 'treatmentPolicyHints', 'systemPromptInstructions',
  ]);
  rejectUnknownKeys(data, allowedTopLevelKeys, 'root', errors);

  // Top-level required
  validateRequired(data, 'root', ['version', 'capabilities', 'intents', 'toolOrchestration', 'rules'], errors);

  // version
  validateType(data.version, 'string', 'version', errors);

  // capabilities
  if (data.capabilities) {
    validateType(data.capabilities, 'object', 'capabilities', errors);
    rejectUnknownKeys(data.capabilities, ALLOWED_CAPABILITY_KEYS, 'capabilities', errors);
    validateRequired(data.capabilities, 'capabilities', ['sensitiveSituations', 'protocols'], errors);
    validateType(data.capabilities.sensitiveSituations, 'boolean', 'capabilities.sensitiveSituations', errors);
    validateType(data.capabilities.protocols, 'boolean', 'capabilities.protocols', errors);
  }

  // intents
  if (data.intents) {
    validateType(data.intents, 'object', 'intents', errors);
    if (Object.keys(data.intents).length === 0) {
      errors.push({ category: 'schema', message: 'intents catalog is empty' });
    }
    for (const [id, intent] of Object.entries(data.intents)) {
      validateType(intent, 'object', `intents.${id}`, errors);
      if (intent) {
        rejectUnknownKeys(intent, ALLOWED_INTENT_KEYS, `intents.${id}`, errors);
        validateRequired(intent, `intents.${id}`, ['description'], errors);
        validateType(intent.description, 'string', `intents.${id}.description`, errors);
        if (intent.examples !== undefined && intent.examples !== null) {
          if (!Array.isArray(intent.examples)) {
            errors.push({ category: 'schema', message: `intents["${id}"].examples must be an array of strings` });
          } else {
            intent.examples.forEach((example, index) => {
              if (typeof example !== 'string') {
                errors.push({ category: 'schema', message: `intents["${id}"].examples[${index}] must be a string` });
              }
            });
          }
        }
      }
    }
  }

  // toolOrchestration.flows
  if (data.toolOrchestration) {
    validateType(data.toolOrchestration, 'object', 'toolOrchestration', errors);
    rejectUnknownKeys(data.toolOrchestration, ALLOWED_TOOL_ORCHESTRATION_KEYS, 'toolOrchestration', errors);
    if (data.toolOrchestration.flows) {
      validateType(data.toolOrchestration.flows, 'object', 'toolOrchestration.flows', errors);
      if (Object.keys(data.toolOrchestration.flows).length === 0) {
        errors.push({ category: 'schema', message: 'toolOrchestration.flows is empty' });
      }
      for (const [name, flow] of Object.entries(data.toolOrchestration.flows)) {
        validateType(flow, 'object', `flows.${name}`, errors);
        if (flow) {
          rejectUnknownKeys(flow, ALLOWED_FLOW_KEYS, `flows.${name}`, errors);
          validateRequired(flow, `flows.${name}`, ['intent', 'description', 'steps'], errors);
          validateType(flow.intent, 'string', `flows.${name}.intent`, errors);
          validateType(flow.description, 'string', `flows.${name}.description`, errors);
          validateType(flow.steps, 'array', `flows.${name}.steps`, errors);
          if (Array.isArray(flow.steps) && flow.steps.length === 0) {
            errors.push({ category: 'schema', message: `Flow "${name}" has no steps` });
          }
          for (let i = 0; i < (flow.steps || []).length; i++) {
            const step = flow.steps[i];
            validateType(step, 'object', `flows.${name}.steps[${i}]`, errors);
            if (step) {
              rejectUnknownKeys(step, ALLOWED_STEP_KEYS, `flows.${name}.steps[${i}]`, errors);
              validateRequired(step, `flows.${name}.steps[${i}]`, ['step', 'tools', 'parallel'], errors);
              validateType(step.step, 'number', `flows.${name}.steps[${i}].step`, errors);
              validateType(step.tools, 'array', `flows.${name}.steps[${i}].tools`, errors);
              validateType(step.parallel, 'boolean', `flows.${name}.steps[${i}].parallel`, errors);
              // Validate that required does not contain tool names (must be capabilities or empty)
              if (step.required && Array.isArray(step.required)) {
                const invalid = step.required.filter(r => ALL_TOOLS.includes(r));
                if (invalid.length > 0) {
                  errors.push({ category: 'schema', message: `Flow "${name}" step ${step.step} has tool names in "required": [${invalid.map(s => `"${s}"`).join(', ')}]. Use capability flags (e.g., "scheduling") or [] instead.` });
                }
              }
            }
          }
        }
      }
    } else {
      errors.push({ category: 'schema', message: 'Missing toolOrchestration.flows' });
    }
  }

  // rules
  if (data.rules) {
    validateType(data.rules, 'array', 'rules', errors);
    if (!Array.isArray(data.rules) || data.rules.length === 0) {
      errors.push({ category: 'business', message: 'rules array is empty (must have at least 1 rule)' });
    }
    for (let i = 0; i < (data.rules || []).length; i++) {
      const rule = data.rules[i];
      validateType(rule, 'object', `rules[${i}]`, errors);
      if (rule) {
        rejectUnknownKeys(rule, ALLOWED_RULE_KEYS, `rules[${i}]`, errors);
        validateRequired(rule, `rules[${i}]`, ['id', 'intent', 'description', 'action'], errors);
        validateType(rule.action, 'string', `rules[${i}].action`, errors);
        if (rule.action && !['allow', 'block'].includes(rule.action)) {
          errors.push({ category: 'business', message: `Rule ${i} has invalid action: "${rule.action}" (must be "allow" or "block")` });
        }
      }
    }
  }

  // 4a. identity structure (aligned with backend validator.ts)
  if (data.identity && typeof data.identity === 'object') {
    const allowedIdentityKeys = new Set([
      'botName', 'clinicName', 'address', 'phone', 'email', 'website',
      'openingHours', 'language', 'persona', 'tone', 'welcomeMessage',
      'farewellMessage', 'escalationMessage', 'socialLinks', 'additionalContacts',
    ]);
    for (const key of Object.keys(data.identity)) {
      if (!allowedIdentityKeys.has(key)) {
        errors.push({ category: 'schema', message: `Unknown property at identity.${key}` });
      }
    }
    const stringOrNullFields = [
      'botName', 'clinicName', 'address', 'phone', 'email', 'website',
      'openingHours', 'persona', 'tone', 'welcomeMessage', 'farewellMessage', 'escalationMessage',
    ];
    for (const field of stringOrNullFields) {
      const value = data.identity[field];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        errors.push({ category: 'schema', message: `identity.${field} must be a string or null` });
      }
    }
    if (data.identity.language !== undefined && data.identity.language !== null && data.identity.language !== 'auto' && typeof data.identity.language !== 'string') {
      errors.push({ category: 'schema', message: 'identity.language must be "auto", a string or null' });
    }
    if (data.identity.socialLinks !== undefined && data.identity.socialLinks !== null) {
      if (!Array.isArray(data.identity.socialLinks)) {
        errors.push({ category: 'schema', message: 'identity.socialLinks must be an array' });
      } else {
        data.identity.socialLinks.forEach((link, index) => {
          if (!link || typeof link !== 'object' || Array.isArray(link)) {
            errors.push({ category: 'schema', message: `identity.socialLinks[${index}] must be an object` });
            return;
          }
          if (typeof link.platform !== 'string' || link.platform.length === 0) {
            errors.push({ category: 'schema', message: `identity.socialLinks[${index}].platform is required and must be a non-empty string` });
          }
          if (typeof link.url !== 'string' || link.url.length === 0) {
            errors.push({ category: 'schema', message: `identity.socialLinks[${index}].url is required and must be a non-empty string` });
          }
        });
      }
    }
    if (data.identity.additionalContacts !== undefined && data.identity.additionalContacts !== null) {
      if (!Array.isArray(data.identity.additionalContacts)) {
        errors.push({ category: 'schema', message: 'identity.additionalContacts must be an array' });
      } else {
        data.identity.additionalContacts.forEach((contact, index) => {
          if (!contact || typeof contact !== 'object' || Array.isArray(contact)) {
            errors.push({ category: 'schema', message: `identity.additionalContacts[${index}] must be an object` });
            return;
          }
          if (typeof contact.type !== 'string' || contact.type.length === 0) {
            errors.push({ category: 'schema', message: `identity.additionalContacts[${index}].type is required and must be a non-empty string` });
          }
          if (typeof contact.value !== 'string' || contact.value.length === 0) {
            errors.push({ category: 'schema', message: `identity.additionalContacts[${index}].value is required and must be a non-empty string` });
          }
          if (contact.label !== undefined && contact.label !== null && typeof contact.label !== 'string') {
            errors.push({ category: 'schema', message: `identity.additionalContacts[${index}].label must be a string or null` });
          }
        });
      }
    }
  }

  // 4b. styleRules structure
  if (data.styleRules && typeof data.styleRules === 'object') {
    const allowedStyleKeys = new Set([
      'brevity', 'format', 'tone', 'emojiPolicy', 'languagePolicy',
      'noMedicalDiagnosis', 'noAsterisks', 'noMarkdown',
      'maxSentences', 'maxWordsPerSentence', 'avoidPhrases',
      'mandatoryPhrases', 'additionalRules', 'mustGreet', 'mustOfferHumanHandoff',
    ]);
    for (const key of Object.keys(data.styleRules)) {
      if (!allowedStyleKeys.has(key)) {
        errors.push({ category: 'schema', message: `Unknown property at styleRules.${key}` });
      }
    }
    const stringOrNullFields = ['brevity', 'format', 'tone'];
    for (const field of stringOrNullFields) {
      const value = data.styleRules[field];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        errors.push({ category: 'schema', message: `styleRules.${field} must be a string or null` });
      }
    }
    const booleanOrNullFields = [
      'noMedicalDiagnosis', 'noAsterisks', 'noMarkdown', 'mustGreet', 'mustOfferHumanHandoff',
    ];
    for (const field of booleanOrNullFields) {
      const value = data.styleRules[field];
      if (value !== undefined && value !== null && typeof value !== 'boolean') {
        errors.push({ category: 'schema', message: `styleRules.${field} must be a boolean or null` });
      }
    }
    const numberOrNullFields = ['maxSentences', 'maxWordsPerSentence'];
    for (const field of numberOrNullFields) {
      const value = data.styleRules[field];
      if (value !== undefined && value !== null && typeof value !== 'number') {
        errors.push({ category: 'schema', message: `styleRules.${field} must be a number or null` });
      }
    }
    const stringArrayOrNullFields = ['avoidPhrases', 'mandatoryPhrases', 'additionalRules'];
    for (const field of stringArrayOrNullFields) {
      const value = data.styleRules[field];
      if (value !== undefined && value !== null && !Array.isArray(value)) {
        errors.push({ category: 'schema', message: `styleRules.${field} must be an array of strings or null` });
      }
    }
    if (data.styleRules.emojiPolicy !== undefined && !['allowed', 'forbidden', 'contextual'].includes(data.styleRules.emojiPolicy)) {
      errors.push({ category: 'schema', message: `styleRules.emojiPolicy must be one of: allowed, forbidden, contextual` });
    }
  }

  // 4c. responseTemplates structure
  if (data.responseTemplates && typeof data.responseTemplates === 'object') {
    const templates = data.responseTemplates;
    for (const [key, value] of Object.entries(templates)) {
      if (typeof value === 'string') {
        errors.push({ category: 'schema', message: `responseTemplates["${key}"] must be an object {text, mode}, not a string` });
        continue;
      }
      if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
        errors.push({ category: 'schema', message: `responseTemplates["${key}"] must be an object {text, mode}` });
        continue;
      }
      if (value && typeof value === 'object') {
        if (value.text !== undefined && value.text !== null && typeof value.text !== 'string') {
          errors.push({ category: 'schema', message: `responseTemplates["${key}"].text must be a string or null` });
        }
        if (value.mode !== undefined && value.mode !== null && value.mode !== 'literal' && value.mode !== 'model') {
          errors.push({ category: 'schema', message: `responseTemplates["${key}"].mode must be "literal", "model" or null` });
        }
      }
    }
  }

  // 4d. faq structure
  if (Array.isArray(data.faq)) {
    data.faq.forEach((entry, index) => {
      const allowedFaqKeys = new Set(['question', 'answer', 'condition']);
      for (const key of Object.keys(entry)) {
        if (!allowedFaqKeys.has(key)) {
          errors.push({ category: 'schema', message: `Unknown property at faq[${index}].${key}` });
        }
      }
      if (entry.question === undefined || entry.question === null || typeof entry.question !== 'string') {
        errors.push({ category: 'schema', message: `faq[${index}] question is required and must be a string` });
      }
      if (entry.answer === undefined || entry.answer === null || typeof entry.answer !== 'string') {
        errors.push({ category: 'schema', message: `faq[${index}] answer is required and must be a string` });
      }
      if (entry.condition !== undefined && entry.condition !== null && typeof entry.condition !== 'string') {
        errors.push({ category: 'schema', message: `faq[${index}] condition must be a string or null` });
      }
    });
  }

  // 4e. protocols structure (CRITICAL: must match backend schema exactly)
  if (data.protocols && typeof data.protocols === 'object') {
    const protocols = data.protocols;
    for (const [key, value] of Object.entries(protocols)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push({ category: 'schema', message: `protocols["${key}"] must be an object` });
        continue;
      }
      const allowedProtocolKeys = new Set(['name', 'description', 'responseTemplate', 'sections']);
      for (const prop of Object.keys(value)) {
        if (!allowedProtocolKeys.has(prop)) {
          errors.push({ category: 'schema', message: `Unknown property at protocols.${key}.${prop}` });
        }
      }
      if (typeof value.name !== 'string' || value.name.length === 0) {
        errors.push({ category: 'schema', message: `protocols["${key}"].name is required and must be a non-empty string` });
      }
      if (typeof value.description !== 'string' || value.description.length === 0) {
        errors.push({ category: 'schema', message: `protocols["${key}"].description is required and must be a non-empty string` });
      }
      if (value.responseTemplate !== undefined && value.responseTemplate !== null && typeof value.responseTemplate !== 'string') {
        errors.push({ category: 'schema', message: `protocols["${key}"].responseTemplate must be a string or null` });
      }
      if (value.sections !== undefined && value.sections !== null && !Array.isArray(value.sections)) {
        errors.push({ category: 'schema', message: `protocols["${key}"].sections must be an array of strings or null` });
      }
    }
  }

  // 4f. systemPromptInstructions structure
  if (data.systemPromptInstructions && typeof data.systemPromptInstructions === 'object') {
    rejectUnknownKeys(data.systemPromptInstructions, ALLOWED_SYSTEM_PROMPT_KEYS, 'systemPromptInstructions', errors);
    const stringArrayFields = ['notesForAdvisor', 'knownGaps', 'recommendedNextSteps'];
    for (const field of stringArrayFields) {
      const value = data.systemPromptInstructions[field];
      if (value === undefined || value === null) {
        errors.push({ category: 'schema', message: `systemPromptInstructions.${field} is required and must be an array` });
      } else if (!Array.isArray(value)) {
        errors.push({ category: 'schema', message: `systemPromptInstructions.${field} must be an array of strings` });
      } else {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] !== 'string') {
            errors.push({ category: 'schema', message: `systemPromptInstructions.${field}[${i}] must be a string` });
          }
        }
      }
    }
  }

  // 4g. errorCategories structure
  if (Array.isArray(data.errorCategories)) {
    data.errorCategories.forEach((cat, index) => {
      rejectUnknownKeys(cat, ALLOWED_ERROR_CATEGORY_KEYS, `errorCategories[${index}]`, errors);
      if (!cat.id || typeof cat.id !== 'string') {
        errors.push({ category: 'schema', message: `errorCategories[${index}].id is required and must be a string` });
      }
      if (!cat.description || typeof cat.description !== 'string') {
        errors.push({ category: 'schema', message: `errorCategories[${index}].description is required and must be a string` });
      }
      if (!cat.suggestions || !Array.isArray(cat.suggestions) || cat.suggestions.length === 0) {
        errors.push({ category: 'schema', message: `errorCategories[${index}].suggestions is required and must be a non-empty array` });
      }
    });
  }

  // 4h. treatmentPolicyHints structure
  if (data.treatmentPolicyHints !== undefined) {
    if (!Array.isArray(data.treatmentPolicyHints)) {
      errors.push({ category: 'schema', message: 'treatmentPolicyHints must be an array' });
    } else {
      data.treatmentPolicyHints.forEach((hint, index) => {
        rejectUnknownKeys(hint, ALLOWED_TPH_KEYS, `treatmentPolicyHints[${index}]`, errors);
      });
    }
  }
}

function validateCrossReferences(data, errors) {
  const intentIds = new Set(Object.keys(data.intents || {}));

  // Check flow intents
  const flows = data.toolOrchestration?.flows || {};
  for (const [name, flow] of Object.entries(flows)) {
    if (flow.intent && !intentIds.has(flow.intent)) {
      errors.push({ category: 'cross-ref', message: `Flow "${name}" references unknown intent: "${flow.intent}"` });
    }
  }

  // Check rule intents
  const rules = data.rules || [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.intent && !intentIds.has(rule.intent)) {
      errors.push({ category: 'cross-ref', message: `Rule ${i} (${rule.id || 'no-id'}) references unknown intent: "${rule.intent}"` });
    }
  }

  // Check for duplicate intent IDs in catalog
  // (Object keys are inherently unique, so no check needed)

  // Check for duplicate flow names
  // (Object keys are inherently unique, so no check needed)

  // Check responseTemplates referenced by flows exist
  const templateKeys = new Set(Object.keys(data.responseTemplates || {}));
  for (const [name, flow] of Object.entries(flows)) {
    if (flow.responseTemplate && !templateKeys.has(flow.responseTemplate)) {
      // responseTemplate can be a literal string, not just a key
      // So we only flag if it looks like a key reference (short, no spaces)
      if (flow.responseTemplate.length < 50 && !flow.responseTemplate.includes(' ')) {
        errors.push({ category: 'cross-ref', message: `Flow "${name}" references unknown template key: "${flow.responseTemplate}"` });
      }
    }
  }
}

function validateMinimumIntents(data, mode, errors) {
  const requiredIntents = [
    'appointment_confirmation',
    'appointment_cancellation',
    'appointment_inquiry',
    'scheduling_request',
    'general_inquiry',
  ];
  const present = new Set(Object.keys(data.intents || {}));
  for (const req of requiredIntents) {
    if (!present.has(req)) {
      errors.push({ category: 'business', message: `Missing required intent: "${req}"` });
    }
  }

  // Mode-specific critical flows
  if (mode === 'full') {
    const flows = data.toolOrchestration?.flows || {};
    const hasBookingFlow = Object.values(flows).some(f =>
      f.intent === 'scheduling_request' &&
      f.steps?.some(s => s.tools?.includes('schedule_block'))
    );
    if (!hasBookingFlow) {
      errors.push({ category: 'business', message: 'Full mode requires at least one scheduling flow with "schedule_block" tool' });
    }
  }

  if (mode === 'tasks-only') {
    const flows = data.toolOrchestration?.flows || {};
    const hasTaskFlow = Object.values(flows).some(f =>
      f.intent === 'scheduling_request' &&
      f.steps?.some(s => s.tools?.includes('create_task'))
    );
    if (!hasTaskFlow) {
      errors.push({ category: 'business', message: 'Tasks-only mode requires scheduling_request flow to use "create_task" tool' });
    }
  }
}

function main() {
  const { sede, mode } = parseArgs();
  if (!sede) {
    logger.error('Usage: node scripts/validate-and-save.js --sede <SEDE> --mode <full|tasks-only>');
    process.exit(1);
  }

  const paths = getSedePaths(sede);

  // The draft is the active working document. Prefer it whenever present so
  // validation never succeeds against a stale final while a newer draft exists.
  const jsonPath = getActiveJsonPath(paths);
  if (!fs.existsSync(jsonPath)) {
    logger.error(`JSON not found: ${jsonPath}`);
    logger.info('Generate the JSON first. The agent creates it by reading all files in input/ and prompts.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const errors = [];

  // Run all validators
  validateSchema(data, errors);
  validateCrossReferences(data, errors);
  validateMinimumIntents(data, mode, errors);

  const modeErrors = validateMode(data, mode);
  for (const e of modeErrors) {
    errors.push({ category: 'mode', message: e });
  }

  if (errors.length === 0) {
    // Valid: promote the exact draft that was validated.
    if (jsonPath === paths.draft) {
      fs.copyFileSync(paths.draft, paths.final);
    }
    logger.info(`✅ Valid structuredLogic (${mode} mode)`);
    logger.info(`Validated ${jsonPath}`);
    if (jsonPath === paths.draft) {
      logger.info(`Promoted draft to ${paths.final}`);
    }

    // Print summary
    const summary = {
      status: 'valid',
      mode,
      intents: Object.keys(data.intents || {}).length,
      flows: Object.keys(data.toolOrchestration?.flows || {}).length,
      rules: (data.rules || []).length,
      templates: Object.keys(data.responseTemplates || {}).length,
      file: paths.final,
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } else {
    // Invalid: report errors
    logger.error(`❌ ${errors.length} validation error(s):`);
    const byCategory = {};
    for (const e of errors) {
      byCategory[e.category] = byCategory[e.category] || [];
      byCategory[e.category].push(e.message);
    }

    for (const [cat, msgs] of Object.entries(byCategory)) {
      logger.error(`  [${cat.toUpperCase()}] ${msgs.length} error(s):`);
      for (const m of msgs) {
        logger.error(`    - ${m}`);
      }
    }

    console.log(JSON.stringify({ status: 'invalid', errors: byCategory }, null, 2));
    process.exit(1);
  }
}

main();

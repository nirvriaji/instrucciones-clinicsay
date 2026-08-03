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
const ALLOWED_SERVICE_CATALOG_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.serviceCatalog.properties');
const ALLOWED_CHAT_SERVICE_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.serviceCatalog.properties.treatments.items.properties');
const ALLOWED_CONVERSATION_RESUMPTION_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.conversationResumption.properties');
const ALLOWED_RESUMPTION_INSTRUCTION_KEYS = extractAllowedKeys(JSON_SCHEMA, 'properties.conversationResumption.properties.instructions.properties');

function parseArgs() {
  const args = process.argv.slice(2);
  const sedeIdx = args.indexOf('--sede');
  const modeIdx = args.indexOf('--mode');
  return {
    sede: sedeIdx >= 0 ? args[sedeIdx + 1] : null,
    // Mode is mandatory (no fallback), matching the backend validator.
    mode: modeIdx >= 0 ? args[modeIdx + 1] : null,
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
    'faq', 'serviceCatalog', 'intents', 'toolOrchestration', 'rules', 'protocols',
    'errorCategories', 'treatmentPolicyHints', 'systemPromptInstructions',
    'conversationResumption',
  ]);
  rejectUnknownKeys(data, allowedTopLevelKeys, 'root', errors);

  // Top-level required
  validateRequired(data, 'root', ['version', 'capabilities', 'serviceCatalog', 'intents', 'toolOrchestration', 'rules'], errors);

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

  // 1b. serviceCatalog validation (aligned with backend)
  if (!data.serviceCatalog || typeof data.serviceCatalog !== 'object') {
    errors.push({ category: 'schema', message: 'serviceCatalog is required. It replaces the old TREATMENTS_LIST placeholder. Define at least one treatment with: name (required), priceDescription (optional), and requiresConsultation (optional).' });
  } else {
    rejectUnknownKeys(data.serviceCatalog, ALLOWED_SERVICE_CATALOG_KEYS, 'serviceCatalog', errors);
    if (!Array.isArray(data.serviceCatalog.treatments) || data.serviceCatalog.treatments.length === 0) {
      errors.push({ category: 'schema', message: 'serviceCatalog.treatments must have at least one treatment.' });
    } else {
      data.serviceCatalog.treatments.forEach((treatment, index) => {
        rejectUnknownKeys(treatment, ALLOWED_CHAT_SERVICE_KEYS, `serviceCatalog.treatments[${index}]`, errors);
        if (!treatment.name || typeof treatment.name !== 'string' || treatment.name.trim().length === 0) {
          errors.push({ category: 'schema', message: `serviceCatalog.treatments[${index}].name is required and must be a non-empty string` });
        }
        if (treatment.priceDescription !== undefined && treatment.priceDescription !== null && (typeof treatment.priceDescription !== 'string' || treatment.priceDescription.trim().length === 0)) {
          errors.push({ category: 'schema', message: `serviceCatalog.treatments[${index}].priceDescription must be a non-empty string` });
        }
        if (treatment.requiresConsultation !== undefined && treatment.requiresConsultation !== null && typeof treatment.requiresConsultation !== 'boolean') {
          errors.push({ category: 'schema', message: `serviceCatalog.treatments[${index}].requiresConsultation must be a boolean` });
        }
      });
    }
    if (data.serviceCatalog.packs !== undefined && data.serviceCatalog.packs !== null) {
      if (!Array.isArray(data.serviceCatalog.packs)) {
        errors.push({ category: 'schema', message: 'serviceCatalog.packs must be an array' });
      } else {
        data.serviceCatalog.packs.forEach((pack, index) => {
          rejectUnknownKeys(pack, ALLOWED_CHAT_SERVICE_KEYS, `serviceCatalog.packs[${index}]`, errors);
          if (!pack.name || typeof pack.name !== 'string' || pack.name.trim().length === 0) {
            errors.push({ category: 'schema', message: `serviceCatalog.packs[${index}].name is required and must be a non-empty string` });
          }
        });
      }
    }
  }

  // 1c. Prohibit legacy intent price_inquiry
  const declaredIntents = new Set(data.intents ? Object.keys(data.intents) : []);
  if (declaredIntents.has('price_inquiry')) {
    errors.push({ category: 'business', message: 'Intent "price_inquiry" is prohibited. Use "general_inquiry" instead and configure serviceCatalog.treatments[].priceDescription for each treatment.' });
  }

  // 1d. Required response templates
  const requiredTemplates = ['information_not_available', 'out_of_scope', 'farewell'];
  const availableTemplates = new Set(Object.keys(data.responseTemplates ?? {}));
  for (const templateKey of requiredTemplates) {
    if (!availableTemplates.has(templateKey)) {
      errors.push({ category: 'business', message: `responseTemplates must include template "${templateKey}". Add: { "${templateKey}": { "text": "Your text here", "mode": "literal" } }` });
    }
  }

  // 1e. farewell flow with allowsSilence validation
  let hasFarewellFlow = false;
  const flows = data.toolOrchestration?.flows ?? {};
  Object.entries(flows).forEach(([flowName, flow]) => {
    if (flow.intent === 'farewell') {
      hasFarewellFlow = true;
      if (flow.allowsSilence !== true) {
        errors.push({ category: 'business', message: `Flow "${flowName}" (intent: farewell) must have allowsSilence: true` });
      }
    } else if (flow.allowsSilence === true) {
      errors.push({ category: 'business', message: `Flow "${flowName}" has allowsSilence: true. Only the farewell flow may have this flag.` });
    }
  });
  if (!hasFarewellFlow) {
    errors.push({ category: 'business', message: 'toolOrchestration.flows must include a flow with intent "farewell" and allowsSilence: true' });
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
          // Backend requires a patient-facing responseTemplate when a flow mutates schedule blocks
          const usesScheduleBlockTool = (flow.steps || []).some(s => Array.isArray(s.tools) && s.tools.some(t => ['manage_schedule_block_status', 'manage_all_schedule_blocks_for_date'].includes(t)));
          if (usesScheduleBlockTool && (!flow.responseTemplate || String(flow.responseTemplate).trim() === '')) {
            errors.push({ category: 'business', message: `Flow '${name}' uses 'manage_schedule_block_status' but has no 'responseTemplate'. The backend will use a generic fallback. Consider adding a custom responseTemplate for better patient experience.` });
          }

          // Search tools must NOT have literal responseTemplates — they need freedom to synthesise retrieved results
          const searchTools = ['query_knowledge_base', 'query_protocol'];
          const usesSearchTool = (flow.steps || []).some(s => Array.isArray(s.tools) && s.tools.some(t => searchTools.includes(t)));
          if (usesSearchTool && flow.responseTemplate) {
            const templateMode = flow.responseTemplateMode ?? 'literal';
            if (templateMode === 'literal') {
              errors.push({ category: 'business', message: `Flow '${name}' uses search tools (${searchTools.join('/')}) but has a literal 'responseTemplate'. Search tools must synthesise retrieved results into an answer, so a forced literal template makes them useless. Remove responseTemplate or set responseTemplateMode to 'model'.` });
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
        // Backend requires block rules to include a patient-facing message
        if (rule.action === 'block') {
          if (!('message' in rule) || rule.message === null || rule.message === undefined) {
            errors.push({ category: 'business', message: `Rule ${i} (${rule.id || 'unknown'}) has action='block' and must include a 'message' for the patient.` });
          } else if (typeof rule.message !== 'string' || rule.message.trim() === '') {
            errors.push({ category: 'business', message: `Rule ${i} (${rule.id || 'unknown'}) has action='block' and 'message' must be a non-empty string.` });
          }
        }
      }
    }
  }

  // 4a. identity structure (aligned with backend validator.ts)
  if (data.identity && typeof data.identity === 'object') {
    const allowedIdentityKeys = new Set([
      'botName', 'clinicName', 'address', 'phone', 'email', 'website',
      'openingHours', 'language', 'persona', 'tone',
      'farewellMessage', 'escalationMessage', 'socialLinks', 'additionalContacts',
    ]);
    for (const key of Object.keys(data.identity)) {
      if (!allowedIdentityKeys.has(key)) {
        errors.push({ category: 'schema', message: `Unknown property at identity.${key}` });
      }
    }
    const stringOrNullFields = [
      'botName', 'clinicName', 'address', 'phone', 'email', 'website',
      'openingHours', 'persona', 'tone', 'farewellMessage', 'escalationMessage',
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
      'mandatoryPhrases', 'additionalRules', 'mustOfferHumanHandoff', 'timeGreetingRanges',
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
      'noMedicalDiagnosis', 'noAsterisks', 'noMarkdown', 'mustOfferHumanHandoff',
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

    // timeGreetingRanges validation (aligned with backend)
    const ranges = data.styleRules.timeGreetingRanges;
    if (!Array.isArray(ranges)) {
      errors.push({ category: 'schema', message: 'styleRules.timeGreetingRanges is required and must be an array' });
    } else {
      if (ranges.length !== 3) {
        errors.push({ category: 'schema', message: `styleRules.timeGreetingRanges must contain exactly 3 ranges, got ${ranges.length}` });
      }
      const validLabels = new Set(['dias', 'tardes', 'noches']);
      const seenLabels = new Set();
      const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        if (!r || typeof r !== 'object' || Array.isArray(r)) {
          errors.push({ category: 'schema', message: `styleRules.timeGreetingRanges[${i}] must be an object` });
          continue;
        }
        if (r.label === undefined || !validLabels.has(r.label)) {
          errors.push({ category: 'schema', message: `styleRules.timeGreetingRanges[${i}].label must be one of: dias, tardes, noches` });
        } else if (seenLabels.has(r.label)) {
          errors.push({ category: 'schema', message: `styleRules.timeGreetingRanges has duplicate label: ${r.label}` });
        } else {
          seenLabels.add(r.label);
        }
        if (r.start === undefined || !hhmmRegex.test(r.start)) {
          errors.push({ category: 'schema', message: `styleRules.timeGreetingRanges[${i}].start must be a valid HH:mm string` });
        }
        if (r.end === undefined || !hhmmRegex.test(r.end)) {
          errors.push({ category: 'schema', message: `styleRules.timeGreetingRanges[${i}].end must be a valid HH:mm string` });
        }
        if (r.greeting === undefined || typeof r.greeting !== 'string' || r.greeting.trim() === '') {
          errors.push({ category: 'schema', message: `styleRules.timeGreetingRanges[${i}].greeting must be a non-empty string` });
        }
      }
      // Check 24h coverage (simple sorted check)
      if (ranges.length === 3) {
        const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
        const expected = ['dias', 'tardes', 'noches'];
        for (let i = 0; i < 3; i++) {
          if (sorted[i].label !== expected[i]) {
            errors.push({ category: 'schema', message: `styleRules.timeGreetingRanges must cover the full 24-hour cycle without gaps. Expected order: dias, tardes, noches.` });
            break;
          }
        }
      }
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
      if (typeof value.responseTemplate !== 'string' || value.responseTemplate.length === 0) {
        errors.push({ category: 'schema', message: `protocols["${key}"].responseTemplate is required and must be a non-empty string` });
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

  // 4i. conversationResumption structure
  if (data.conversationResumption && typeof data.conversationResumption === 'object') {
    rejectUnknownKeys(data.conversationResumption, ALLOWED_CONVERSATION_RESUMPTION_KEYS, 'conversationResumption', errors);
    if (data.conversationResumption.instructions && typeof data.conversationResumption.instructions === 'object') {
      rejectUnknownKeys(data.conversationResumption.instructions, ALLOWED_RESUMPTION_INSTRUCTION_KEYS, 'conversationResumption.instructions', errors);
      const instructionFields = ['continuous', 'short_break', 'same_period', 'recent', 'distant'];
      for (const field of instructionFields) {
        const value = data.conversationResumption.instructions[field];
        if (value !== undefined && value !== null && typeof value !== 'string') {
          errors.push({ category: 'schema', message: `conversationResumption.instructions.${field} must be a string or null` });
        }
      }
    }
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

function main() {
  const { sede, mode } = parseArgs();
  if (!sede || !mode || (mode !== 'full' && mode !== 'tasks-only')) {
    logger.error('Usage: node scripts/validate-and-save.js --sede <SEDE> --mode <full|tasks-only>');
    process.exit(1);
  }

  const paths = getSedePaths(sede);

  // The draft is the active working document. Prefer it whenever present so
  // validation never succeeds against a stale final while a newer draft exists.
  const jsonPath = getActiveJsonPath(paths);
  if (!fs.existsSync(jsonPath)) {
    logger.error(`JSON not found: ${jsonPath}`);
    logger.info('Generate the JSON first. The agent creates it by reading anotaciones.md and prompts.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // ── Backend-real validation (replicated, not imported from external repo) ──
  // Output shape: { valid, errors, gaps, qualityScore }
  //   - errors: blocking (prevent saving)
  //   - gaps: NON-blocking (severity high|medium|low|advisory; advisory = canonical mode notes)
  const { execSync } = require('child_process');
  const path = require('path');
  const validatorScript = path.join(__dirname, 'lib', 'backend-validator', 'run-validation.ts');
  let backendResult;
  try {
    const stdout = execSync(
      `npx tsx "${validatorScript}" "${jsonPath}" "${mode}"`,
      { encoding: 'utf8', cwd: path.join(__dirname, '..'), shell: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    backendResult = JSON.parse(stdout);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    // If the validator emitted valid JSON to stdout even on non-zero exit, use it
    try {
      backendResult = JSON.parse(stdout);
    } catch {
      // Emergency structural fallback when tsx is unavailable.
      // Minimal structural checks ONLY — mode/business rules belong to the
      // replicated backend validator (single source of truth).
      logger.warn('Backend validator (tsx) not available. Falling back to minimal structural checks. Results may differ from production.');
      logger.warn(`tsx stderr: ${stderr}`);
      const errors = [];
      validateSchema(data, errors);
      validateCrossReferences(data, errors);
      backendResult = {
        valid: errors.length === 0,
        errors: errors.map(e => e.message || e),
        gaps: [],
        qualityScore: { score: 0, max: 94, gaps: ['minimal fallback active; run with tsx for full validation'] },
      };
    }
  }

  const allErrors = [...(backendResult.errors || [])];
  const gaps = backendResult.gaps || [];
  const qualityScore = backendResult.qualityScore || null;

  if (backendResult.valid && allErrors.length === 0) {
    // Valid: promote the exact draft that was validated.
    if (jsonPath === paths.draft) {
      fs.copyFileSync(paths.draft, paths.final);
    }
    logger.info(`✅ Valid structuredLogic (${mode} mode)`);
    logger.info(`Validated ${jsonPath}`);
    if (jsonPath === paths.draft) {
      logger.info(`Promoted draft to ${paths.final}`);
    }

    // Non-blocking gaps: educate, never block (backend advisory philosophy)
    if (gaps.length > 0) {
      logger.warn(`⚠️  ${gaps.length} warning(s) — NO bloqueantes:`);
      for (const g of gaps) {
        const sev = (g.severity || 'info').toUpperCase();
        logger.warn(`    [${sev}] ${g.description || g}`);
      }
    }
    if (qualityScore) {
      logger.info(`Quality score: ${qualityScore.score}/${qualityScore.max}`);
    }

    // Print summary
    const summary = {
      status: 'valid',
      mode,
      intents: Object.keys(data.intents || {}).length,
      flows: Object.keys(data.toolOrchestration?.flows || {}).length,
      rules: (data.rules || []).length,
      templates: Object.keys(data.responseTemplates || {}).length,
      warnings: gaps.map(g => ({ severity: g.severity, type: g.type, description: g.description })),
      qualityScore,
      file: paths.final,
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } else {
    // Invalid: report errors
    logger.error(`❌ ${allErrors.length} validation error(s):`);
    const byCategory = {};
    // Categorize backend errors
    for (const e of allErrors) {
      const msg = typeof e === 'string' ? e : (e.message || String(e));
      // Simple heuristic categorization
      let cat = 'schema';
      if (msg.includes('intent') && (msg.includes('references') || msg.includes('Missing'))) cat = 'cross-ref';
      if (msg.includes('scheduling') || msg.includes('tasks-only') || msg.includes('create_task')) cat = 'mode';
      if (msg.includes('responseTemplate')) cat = 'business';
      byCategory[cat] = byCategory[cat] || [];
      byCategory[cat].push(msg);
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

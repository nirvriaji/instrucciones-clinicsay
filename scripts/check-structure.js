#!/usr/bin/env node
/**
 * check-structure.js
 *
 * Verifica que el JSON tiene todas las secciones requeridas
 * y que cada sección tiene contenido mínimo.
 *
 * Usage:
 *   node scripts/check-structure.js --sede <SEDE>
 */

const fs = require('fs');
const { getSedePaths, getActiveJsonPath } = require('./lib/paths');
const logger = require('./lib/logger');

const REQUIRED_SECTIONS = [
  'version',
  'capabilities',
  'identity',
  'styleRules',
  'intents',
  'toolOrchestration',
  'rules',
  'responseTemplates',
  'faq',
  'protocols',
  'errorCategories',
  'treatmentPolicyHints',
  'systemPromptInstructions',
];

const MINIMUM_INTENTS = 5;
const MINIMUM_RULES = 1;
const MINIMUM_FLOWS = 1;
const MINIMUM_FAQ = 0; // FAQ puede estar vacío si no hay en anotaciones

function parseArgs() {
  const args = process.argv.slice(2);
  const sedeIdx = args.indexOf('--sede');
  return {
    sede: sedeIdx >= 0 ? args[sedeIdx + 1] : null,
  };
}

function checkSection(data, sectionName, required) {
  const value = data[sectionName];
  const errors = [];

  if (required && (value === undefined || value === null)) {
    errors.push({ section: sectionName, issue: 'missing', message: `Sección "${sectionName}" está ausente` });
    return errors;
  }

  if (value === undefined || value === null) {
    return errors; // Opcional, ok que falte
  }

  // Check emptiness
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (Object.keys(value).length === 0) {
      errors.push({ section: sectionName, issue: 'empty', message: `Sección "${sectionName}" está vacía` });
    }
  }

  if (Array.isArray(value) && value.length === 0) {
    // Arrays vacíos pueden ser ok para secciones opcionales
    if (['faq', 'protocols', 'errorCategories', 'treatmentPolicyHints'].includes(sectionName)) {
      // Está bien que estén vacíos
    } else {
      errors.push({ section: sectionName, issue: 'empty', message: `Sección "${sectionName}" está vacía` });
    }
  }

  return errors;
}

function checkContent(data) {
  const errors = [];

  // Check intents
  const intents = data.intents || {};
  const intentCount = Object.keys(intents).length;
  if (intentCount < MINIMUM_INTENTS) {
    errors.push({
      section: 'intents',
      issue: 'insufficient',
      message: `Catálogo de intents tiene ${intentCount} entries. Mínimo requerido: ${MINIMUM_INTENTS}`,
    });
  }

  // Check each intent has description
  for (const [id, intent] of Object.entries(intents)) {
    if (!intent.description || intent.description.length < 10) {
      errors.push({
        section: 'intents',
        issue: 'incomplete',
        message: `Intent "${id}" no tiene descripción o es demasiado corta`,
      });
    }
  }

  // Check rules
  const rules = data.rules || [];
  if (rules.length < MINIMUM_RULES) {
    errors.push({
      section: 'rules',
      issue: 'insufficient',
      message: `Array rules tiene ${rules.length} rules. Mínimo requerido: ${MINIMUM_RULES}`,
    });
  }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule.id) {
      errors.push({ section: 'rules', issue: 'incomplete', message: `Rule ${i} no tiene id` });
    }
    if (!rule.intent) {
      errors.push({ section: 'rules', issue: 'incomplete', message: `Rule ${i} no tiene intent` });
    }
    if (!rule.description || rule.description.length < 10) {
      errors.push({ section: 'rules', issue: 'incomplete', message: `Rule ${i} no tiene descripción semántica` });
    }
    if (!rule.action || !['allow', 'block'].includes(rule.action)) {
      errors.push({ section: 'rules', issue: 'invalid', message: `Rule ${i} tiene action inválida: "${rule.action}"` });
    }
  }

  // Check flows
  const flows = data.toolOrchestration?.flows || {};
  const flowCount = Object.keys(flows).length;
  if (flowCount < MINIMUM_FLOWS) {
    errors.push({
      section: 'toolOrchestration.flows',
      issue: 'insufficient',
      message: `Flows tiene ${flowCount} entries. Mínimo requerido: ${MINIMUM_FLOWS}`,
    });
  }

  for (const [name, flow] of Object.entries(flows)) {
    if (!flow.intent) {
      errors.push({ section: 'toolOrchestration.flows', issue: 'incomplete', message: `Flow "${name}" no tiene intent` });
    }
    if (!flow.description || flow.description.length < 10) {
      errors.push({ section: 'toolOrchestration.flows', issue: 'incomplete', message: `Flow "${name}" no tiene descripción` });
    }
    if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
      errors.push({ section: 'toolOrchestration.flows', issue: 'incomplete', message: `Flow "${name}" no tiene steps` });
    }
  }

  // Check identity
  const identity = data.identity || {};
  if (!identity.botName) {
    errors.push({ section: 'identity', issue: 'incomplete', message: 'identity.botName está vacío' });
  }
  if (!identity.clinicName) {
    errors.push({ section: 'identity', issue: 'incomplete', message: 'identity.clinicName está vacío' });
  }

  // Check capabilities
  const caps = data.capabilities || {};
  if (typeof caps.sensitiveSituations !== 'boolean') {
    errors.push({ section: 'capabilities', issue: 'incomplete', message: 'capabilities.sensitiveSituations debe ser boolean' });
  }
  if (typeof caps.protocols !== 'boolean') {
    errors.push({ section: 'capabilities', issue: 'incomplete', message: 'capabilities.protocols debe ser boolean' });
  }

  // Check version
  if (!data.version || typeof data.version !== 'string') {
    errors.push({ section: 'version', issue: 'incomplete', message: 'version debe ser un string no vacío' });
  }

  return errors;
}

function main() {
  const { sede } = parseArgs();
  if (!sede) {
    logger.error('Usage: node scripts/check-structure.js --sede <SEDE>');
    process.exit(1);
  }

  const paths = getSedePaths(sede);
  // Check the active draft when present; fall back to the final otherwise.
  const jsonPath = getActiveJsonPath(paths);

  if (!fs.existsSync(jsonPath)) {
    logger.error(`JSON no encontrado: ${jsonPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  let allErrors = [];

  // Check sections exist
  for (const section of REQUIRED_SECTIONS) {
    const required = ['version', 'capabilities', 'intents', 'toolOrchestration', 'rules'].includes(section);
    allErrors = allErrors.concat(checkSection(data, section, required));
  }

  // Check content quality
  allErrors = allErrors.concat(checkContent(data));

  const result = {
    status: allErrors.length === 0 ? 'complete' : 'incomplete',
    sede,
    checked_at: new Date().toISOString(),
    sections_checked: REQUIRED_SECTIONS.length,
    errors_found: allErrors.length,
    errors: allErrors,
    sections_present: REQUIRED_SECTIONS.filter(s => data[s] !== undefined && data[s] !== null),
    sections_missing: REQUIRED_SECTIONS.filter(s => data[s] === undefined || data[s] === null),
  };

  logger.info(`Structure check: ${result.status}`);
  if (allErrors.length > 0) {
    logger.info(`Found ${allErrors.length} structural issues:`);
    for (const err of allErrors) {
      logger.info(`  [${err.section}] ${err.issue}: ${err.message}`);
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main();

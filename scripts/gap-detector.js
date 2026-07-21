#!/usr/bin/env node
/**
 * gap-detector.js
 *
 * Compara todos los archivos de sedes/<nombre>/input/ (.md y .json) contra structured-logic.json
 * Detecta inconsistencias, información faltante, y genera gaps.json
 *
 * Usage:
 *   node scripts/gap-detector.js --sede <SEDE> --mode <full|tasks-only>
 */

const fs = require('fs');
const path = require('path');
const { getSedePaths, getActiveJsonPath } = require('./lib/paths');
const logger = require('./lib/logger');

function parseArgs() {
  const args = process.argv.slice(2);
  const sedeIdx = args.indexOf('--sede');
  const modeIdx = args.indexOf('--mode');
  return {
    sede: sedeIdx >= 0 ? args[sedeIdx + 1] : null,
    mode: modeIdx >= 0 ? args[modeIdx + 1] : 'full',
  };
}

function extractEntitiesFromAnotaciones(text) {
  const entities = {
    services: [],
    professionals: [],
    signals: [],
    prices: [],
    constraints: [],
    contact: {},
    hours: null,
    faq: [],
    protocols: [],
    taskSituations: [],
  };

  // Extract services from "Tratamientos y Servicios Disponibles" or "Tratamientos que se pueden agendar"
  const servicesSection = text.match(/#\s*(?:Tratamientos y Servicios|Tratamientos que se pueden agendar|Servicios).*?\n([\s\S]*?)(?=\n#\s|\Z)/i);
  if (servicesSection) {
    const lines = servicesSection[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'));
    for (const line of lines) {
      const clean = line.replace(/^[-*\s]+/, '').trim();
      if (clean && clean.length > 3) {
        entities.services.push({
          name: clean,
          raw: clean,
          hasProfessional: /(?:con|Dr\.|Dra\.)\s+\w+/i.test(clean),
          hasSignal: /señal\s+de\s+\d+/i.test(clean),
          hasPrice: /\d+\s*€/i.test(clean),
          isNewPatientOnly: /paciente\s+nuevo/i.test(clean) && !/salvo|excepto/i.test(clean),
        });
      }
    }
  }

  // Extract professionals
  const profSection = text.match(/#\s*(?:Profesionales asignados|Equipo médico).*?\n([\s\S]*?)(?=\n#\s|\Z)/i);
  if (profSection) {
    const lines = profSection[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'));
    for (const line of lines) {
      const clean = line.replace(/^[-*\s]+/, '').trim();
      const match = clean.match(/(Dr\.\s+\w+(?:\s+\w+)?|Dra\.\s+\w+(?:\s+\w+)?|Natalia|Victoria)/i);
      if (match) {
        const profName = match[1];
        const treatments = clean.split(/[:\-]/).pop()?.split(/[,;]/).map(s => s.trim()).filter(Boolean) || [];
        entities.professionals.push({ name: profName, treatments, raw: clean });
      }
    }
  }

  // Extract signals/deposits
  const signalMatches = text.matchAll(/(?:señal|depósito)\s+de\s+(\d+)\s*€?/gi);
  for (const m of signalMatches) {
    entities.signals.push({ amount: parseInt(m[1]), raw: m[0] });
  }

  // Extract prices mentioned
  const priceMatches = text.matchAll(/(\d+)\s*€/gi);
  for (const m of priceMatches) {
    const context = text.substring(Math.max(0, m.index - 50), m.index + m[0].length + 50);
    entities.prices.push({ amount: parseInt(m[1]), context });
  }

  // Extract contact info
  const phone = text.match(/(?:tel[eé]fono|whatsapp|tlf)[\s:]\s*([\d\s\+\-]+)/i);
  const email = text.match(/(?:correo|email)[\s:]\s*([^\s\n\r]+@[^\s\n\r]+)/i);
  const address = text.match(/(?:direcci[oó]n|direccion)[\s:]\s*([^\n\r]+)/i);
  if (phone) entities.contact.phone = phone[1].trim();
  if (email) entities.contact.email = email[1].trim();
  if (address) entities.contact.address = address[1].trim();

  // Extract opening hours
  const hoursMatch = text.match(/(?:horario|horarios)[\s:]\s*([^\n\r]+(?:\n[^#\n\r]+)*)/i);
  if (hoursMatch) entities.hours = hoursMatch[1].trim();

  // Extract FAQ
  const faqSection = text.match(/#\s*(?:Preguntas Frecuentes|FAQ).*?\n([\s\S]*?)(?=\n#\s|\Z)/i);
  if (faqSection) {
    const lines = faqSection[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'));
    for (const line of lines) {
      const clean = line.replace(/^[-*\s]+/, '').trim();
      if (clean.includes('?')) {
        entities.faq.push(clean);
      }
    }
  }

  return entities;
}

function detectGaps(entities, json, mode) {
  const gaps = [];

  // 1. Check services vs intents
  const intentIds = Object.keys(json.intents || {});
  for (const svc of entities.services) {
    const svcId = svc.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const hasIntent = intentIds.some(id => id.includes(svcId) || svcId.includes(id));
    if (!hasIntent) {
      gaps.push({
        severity: 'error',
        category: 'missing_intent',
        description: `Servicio "${svc.name}" mencionado en anotaciones pero no hay intent correspondiente en el JSON`,
        anotacion_ref: svc.raw.substring(0, 100),
        json_path: 'intents',
        suggestion: `Crear intent "${svcId}_inquiry" con descripción semántica`,
        question_for_advisor: `¿Confirmas que ofrecéis el servicio "${svc.name}"?`,
      });
    }
  }

  // 2. Check professionals mentioned in services vs intents
  for (const svc of entities.services) {
    if (svc.hasProfessional) {
      const profMatch = svc.raw.match(/(?:con\s+)?(Dr\.\s+\w+(?:\s+\w+)?|Dra\.\s+\w+(?:\s+\w+)?|Natalia|Victoria)/i);
      if (profMatch) {
        const profName = profMatch[1];
        const svcId = svc.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const intentKey = intentIds.find(id => id.includes(svcId));
        if (intentKey) {
          const intent = json.intents[intentKey];
          if (intent && !intent.description?.includes(profName)) {
            gaps.push({
              severity: 'warning',
              category: 'missing_professional',
              description: `El servicio "${svc.name}" menciona a ${profName} en anotaciones pero el intent no lo incluye`,
              anotacion_ref: svc.raw.substring(0, 100),
              json_path: `intents.${intentKey}.description`,
              suggestion: `Incluir "${profName}" en la descripción del intent`,
              question_for_advisor: `¿${profName} es el profesional exclusivo para ${svc.name}?`,
            });
          }
        }
      }
    }
  }

  // 3. Check signals vs treatmentPolicyHints
  const hints = json.treatmentPolicyHints || [];
  for (const sig of entities.signals) {
    const hasHint = hints.some(h => h.reason?.includes(`${sig.amount}€`) || h.reason?.includes('señal'));
    if (!hasHint) {
      gaps.push({
        severity: 'warning',
        category: 'missing_signal',
        description: `Señal de ${sig.amount}€ mencionada en anotaciones pero no hay treatmentPolicyHint`,
        anotacion_ref: sig.raw,
        json_path: 'treatmentPolicyHints',
        suggestion: `Agregar treatmentPolicyHint para la señal de ${sig.amount}€`,
        question_for_advisor: `¿La señal de ${sig.amount}€ aplica a todos los pacientes o solo a pacientes nuevos?`,
      });
    }
  }

  // 4. Check contact info vs identity
  const identity = json.identity || {};
  if (entities.contact.phone && !identity.phone) {
    gaps.push({
      severity: 'error',
      category: 'missing_contact',
      description: 'Teléfono mencionado en anotaciones pero faltante en identity.phone',
      anotacion_ref: entities.contact.phone,
      json_path: 'identity.phone',
      suggestion: 'Copiar teléfono de anotaciones a identity.phone',
      question_for_advisor: null,
    });
  }
  if (entities.contact.email && !identity.email) {
    gaps.push({
      severity: 'warning',
      category: 'missing_contact',
      description: 'Email mencionado en anotaciones pero faltante en identity.email',
      anotacion_ref: entities.contact.email,
      json_path: 'identity.email',
      suggestion: 'Copiar email de anotaciones a identity.email',
      question_for_advisor: null,
    });
  }
  if (entities.contact.address && !identity.address) {
    gaps.push({
      severity: 'warning',
      category: 'missing_contact',
      description: 'Dirección mencionada en anotaciones pero faltante en identity.address',
      anotacion_ref: entities.contact.address,
      json_path: 'identity.address',
      suggestion: 'Copiar dirección de anotaciones a identity.address',
      question_for_advisor: null,
    });
  }

  // 5. Check opening hours
  if (entities.hours && !identity.openingHours) {
    gaps.push({
      severity: 'warning',
      category: 'missing_contact',
      description: 'Horario mencionado en anotaciones pero faltante en identity.openingHours',
      anotacion_ref: entities.hours.substring(0, 100),
      json_path: 'identity.openingHours',
      suggestion: 'Copiar horario de anotaciones a identity.openingHours',
      question_for_advisor: null,
    });
  }

  // 6. Check FAQ
  const jsonFaq = json.faq || [];
  if (entities.faq.length > 0 && jsonFaq.length === 0) {
    gaps.push({
      severity: 'warning',
      category: 'incomplete_faq',
      description: `${entities.faq.length} preguntas frecuentes en anotaciones pero faq está vacío en JSON`,
      anotacion_ref: entities.faq[0].substring(0, 100),
      json_path: 'faq',
      suggestion: `Agregar ${entities.faq.length} entradas FAQ desde anotaciones`,
      question_for_advisor: '¿Quieres que incluya todas las preguntas frecuentes de tus anotaciones?',
    });
  }

  // 7. Check mode compliance
  const flows = json.toolOrchestration?.flows || {};
  if (mode === 'tasks-only') {
    const forbiddenTools = ['check_availability', 'schedule_block', 'resolve_availability_query'];
    for (const [flowName, flow] of Object.entries(flows)) {
      for (const step of (flow.steps || [])) {
        for (const tool of (step.tools || [])) {
          if (forbiddenTools.includes(tool)) {
            gaps.push({
              severity: 'error',
              category: 'mode_compliance',
              description: `Flow "${flowName}" usa tool prohibida "${tool}" en modo tasks-only`,
              anotacion_ref: null,
              json_path: `toolOrchestration.flows.${flowName}.steps`,
              suggestion: `Reemplazar "${tool}" con "create_task" en modo tasks-only`,
              question_for_advisor: `¿Confirmas que este bot NO agenda citas directamente?`,
            });
          }
        }
      }
    }
  }

  // 8. Check for professionals without services mapping
  for (const prof of entities.professionals) {
    const profMentionedInJson = JSON.stringify(json).includes(prof.name);
    if (!profMentionedInJson) {
      gaps.push({
        severity: 'info',
        category: 'missing_professional',
        description: `Profesional ${prof.name} mencionado en anotaciones pero no aparece en el JSON`,
        anotacion_ref: prof.raw.substring(0, 100),
        json_path: 'intents',
        suggestion: `Incluir ${prof.name} en descripciones de intents relevantes`,
        question_for_advisor: `¿${prof.name} realiza estos tratamientos: ${prof.treatments.join(', ')}?`,
      });
    }
  }

  return gaps;
}

function readInputFiles(inputDir) {
  if (!fs.existsSync(inputDir)) {
    return { files: [], text: '', jsonText: '' };
  }

  const files = fs.readdirSync(inputDir).filter(f => {
    const lower = f.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.json');
  });

  const mdParts = [];
  const jsonParts = [];

  for (const file of files) {
    const filePath = path.join(inputDir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    if (file.toLowerCase().endsWith('.md')) {
      mdParts.push(`\n\n--- FILE: ${file} ---\n\n${content}`);
    } else if (file.toLowerCase().endsWith('.json')) {
      // Flatten JSON into searchable text for entity extraction
      jsonParts.push(`\n\n--- FILE: ${file} ---\n\n${JSON.stringify(JSON.parse(content), null, 2)}`);
    }
  }

  return {
    files,
    text: mdParts.join('\n'),
    jsonText: jsonParts.join('\n'),
  };
}

function main() {
  const { sede, mode } = parseArgs();
  if (!sede) {
    logger.error('Usage: node scripts/gap-detector.js --sede <SEDE> --mode <full|tasks-only>');
    process.exit(1);
  }

  const paths = getSedePaths(sede);
  const inputFiles = readInputFiles(paths.inputDir);

  if (inputFiles.files.length === 0) {
    logger.error(`No se encontraron archivos en ${paths.inputDir}. Coloca archivos .md o .json en la carpeta input.`);
    process.exit(1);
  }

  if (!fs.existsSync(paths.draft) && !fs.existsSync(paths.final)) {
    logger.error(`JSON no encontrado. Genera el JSON primero.`);
    process.exit(1);
  }

  // Combine markdown text + flattened JSON text for entity extraction
  const combinedText = inputFiles.text + '\n\n--- JSON SOURCES ---\n\n' + inputFiles.jsonText;
  // Audit the active draft when present; fall back to the final otherwise.
  const jsonPath = getActiveJsonPath(paths);
  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const entities = extractEntitiesFromAnotaciones(combinedText);
  const gaps = detectGaps(entities, json, mode);

  // Save gaps
  const gapsPath = paths.analysis.replace('analysis.json', 'gaps.json');
  fs.writeFileSync(gapsPath, JSON.stringify({
    meta: {
      sede,
      mode,
      timestamp: new Date().toISOString(),
      inputFiles: inputFiles.files,
      inputFilesCount: inputFiles.files.length,
      combinedTextLength: combinedText.length,
    },
    summary: {
      total: gaps.length,
      errors: gaps.filter(g => g.severity === 'error').length,
      warnings: gaps.filter(g => g.severity === 'warning').length,
      info: gaps.filter(g => g.severity === 'info').length,
    },
    entities: {
      servicesFound: entities.services.length,
      professionalsFound: entities.professionals.length,
      signalsFound: entities.signals.length,
      faqFound: entities.faq.length,
    },
    gaps,
  }, null, 2));

  logger.info(`Gap analysis complete. ${gaps.length} gaps found.`);
  logger.info(`  Input files read: ${inputFiles.files.length} (${inputFiles.files.join(', ')})`);
  logger.info(`  Errors: ${gaps.filter(g => g.severity === 'error').length}`);
  logger.info(`  Warnings: ${gaps.filter(g => g.severity === 'warning').length}`);
  logger.info(`  Info: ${gaps.filter(g => g.severity === 'info').length}`);
  logger.info(`Saved to ${gapsPath}`);

  // Print to stdout for agent
  console.log(JSON.stringify({
    status: gaps.length === 0 ? 'clean' : 'gaps_found',
    summary: {
      total: gaps.length,
      errors: gaps.filter(g => g.severity === 'error').length,
      warnings: gaps.filter(g => g.severity === 'warning').length,
    },
    input_files: inputFiles.files,
    questions_for_advisor: gaps.filter(g => g.question_for_advisor).map(g => ({
      category: g.category,
      question: g.question_for_advisor,
      severity: g.severity,
    })),
  }, null, 2));
}

main();

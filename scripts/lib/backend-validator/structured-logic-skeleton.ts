/**
 * StructuredLogic Skeleton — Empty JSON scaffold for newly created bots.
 *
 * Every new chat bot is created with all sections present but empty.
 * The builder guides the advisor to fill each section.
 * The runtime validates the minimum functional set before allowing a chat.
 */

import {
  type ClinicCapabilities,
  type StructuredLogic,
} from './structured-logic';

export type StructuredLogicMode = 'full' | 'tasks-only';

function buildEmptyCapabilities(mode: StructuredLogicMode): ClinicCapabilities {
  return {
    sensitiveSituations: false,
    protocols: false,
  };
}

/**
 * Build an empty structured logic scaffold for a new bot.
 *
 * All sections are present but empty/null so the builder has a clear
 * checklist and the validator can detect exactly what is missing.
 */
export function buildEmptyStructuredLogicForMode(mode: StructuredLogicMode): StructuredLogic {
  return {
    version: '1.0',
    capabilities: buildEmptyCapabilities(mode),
    identity: {},
    styleRules: {
      timeGreetingRanges: [
        { label: 'dias', start: '06:00', end: '13:59', greeting: 'buenos días' },
        { label: 'tardes', start: '14:00', end: '21:00', greeting: 'buenas tardes' },
        { label: 'noches', start: '21:01', end: '05:59', greeting: 'buenas noches' },
      ],
    },
    responseTemplates: {},
    faq: [],
    serviceCatalog: {
      treatments: [],
    },
    intents: {},
    toolOrchestration: {
      flows: {},
    },
    rules: [],
    protocols: {},
    errorCategories: [],
    treatmentPolicyHints: [],
    systemPromptInstructions: {
      notesForAdvisor: [],
      knownGaps: [],
      recommendedNextSteps: [],
    },
  };
}



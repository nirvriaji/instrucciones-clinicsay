/**
 * Chat Bot Tool Definitions — OpenAI function calling schemas.
 *
 * Each tool maps to an existing use case in another bounded context.
 * Tool names use snake_case (OpenAI convention for function calling).
 * Descriptions are in English for code clarity; the system prompt
 * controls the language the LLM uses when interacting with patients.
 */

import type { ChatToolDefinition } from './openai-conversation.port';

// ========== Tool: check_availability ========== //

export const TOOL_CHECK_AVAILABILITY: ChatToolDefinition = {
  name: 'check_availability',
  description:
    'Query available time slots for scheduling an appointment. ' +
    'Requires concrete dates from resolve_availability_query. ' +
    'Returns available continuous windows with doctor_id (professionalId) and sala_id (roomId) ' +
    'for each option. Use these IDs when calling schedule_block. ' +
    'Scheduling policies are applied automatically by the system.',
  parameters: {
    type: 'object',
    properties: {
      treatmentId: {
        type: 'string',
        description: 'Treatment ID to check availability for.',
      },
      professionalId: {
        type: 'string',
        description: 'Professional (doctor/dentist) ID. Optional if the patient has no preference.',
      },
      roomId: {
        type: 'string',
        description: 'Room ID. Usually not specified unless patient has a preference.',
      },
      daysOfWeek: {
        type: 'array',
        items: { type: 'number' },
        description: 'Days of the week to consider (1=Monday..7=Sunday). Optional.',
      },
      resolvedDates: {
        type: 'array',
        description: 'Concrete dates with time ranges from resolve_availability_query. REQUIRED — call resolve_availability_query first.',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
            timeRanges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  start: { type: 'string', description: 'Start time in HH:mm.' },
                  end: { type: 'string', description: 'End time in HH:mm.' },
                },
              },
            },
          },
        },
      },
      excludedDates: {
        type: 'array',
        description: 'Dates the user explicitly rejected (e.g., "I can\'t Monday"). ISO 8601 YYYY-MM-DD strings. These dates will be skipped in the search.',
        items: { type: 'string' },
      },
      excludedProfessionalIds: {
        type: 'array',
        description: 'Professional IDs the user explicitly rejected (e.g., "not Dr. Garcia"). These professionals will be excluded from the search.',
        items: { type: 'string' },
      },
      excludedTimeRanges: {
        type: 'array',
        description: 'Specific time ranges the user rejected on specific dates (e.g., "not before 10am on Tuesday"). Windows overlapping these ranges will be truncated or discarded.',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
            start: { type: 'string', description: 'Start time in HH:mm.' },
            end: { type: 'string', description: 'End time in HH:mm.' },
          },
        },
      },
    },
    required: ['treatmentId', 'resolvedDates'],
  },
};

// ========== Tool: resolve_availability_query ========== //

export const TOOL_RESOLVE_AVAILABILITY_QUERY: ChatToolDefinition = {
  name: 'resolve_availability_query',
  strict: true,
  description:
    'Translate a natural language time phrase into concrete dates and hour ranges. ' +
    'Use BEFORE check_availability when the patient expresses dates in natural language. ' +
    'Returns structured dates with specific time ranges ready for availability search.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      availabilityPhrase: {
        type: 'string',
        description:
          'The exact phrase from the patient describing when they want the appointment (e.g., "próxima semana por la mañana", "el jueves a las 10:00", "mañana o pasado mañana").',
      },
    },
    required: ['availabilityPhrase'],
  },
};

// ========== Tool: schedule_block ========== //

export const TOOL_SCHEDULE_BLOCK: ChatToolDefinition = {
  name: 'schedule_block',
  description:
    'Create a real appointment for a patient. Automatically creates a CarePlan, PlannedSessions, and ScheduleBlock. ' +
    'Availability is re-checked before booking. ' +
    'Patient identity MUST be resolved first using resolve_patient.',
  parameters: {
    type: 'object',
    properties: {
      patientId: {
        type: 'string',
        description: 'Patient ID (REQUIRED). Must come from resolve_patient.',
      },
      treatmentId: {
        type: 'string',
        description: 'Treatment ID (REQUIRED).',
      },
      chosenDate: {
        type: 'string',
        description: 'Chosen date for the appointment (YYYY-MM-DD).',
      },
      chosenStartTime: {
        type: 'string',
        description: 'Chosen start time for the appointment (HH:mm).',
      },
      professionalId: {
        type: 'string',
        description: 'ID of the professional (from check_availability doctor_id). Optional.',
      },
      roomId: {
        type: 'string',
        description: 'ID of the room (from check_availability sala_id). Optional.',
      },
      title: {
        type: 'string',
        description: 'Descriptive title for the appointment.',
      },
      notes: {
        type: 'string',
        description: 'Additional notes from the patient.',
      },
    },
    required: ['patientId', 'treatmentId', 'chosenDate', 'chosenStartTime'],
  },
};

// ========== Tool: manage_schedule_block_status ========== //

export const TOOL_MANAGE_SCHEDULE_BLOCK_STATUS: ChatToolDefinition = {
  name: 'manage_schedule_block_status',
  description:
    'Manage the status of an existing schedule block: confirm attendance, ' +
    'cancel, or mark that the patient is on the way.',
  parameters: {
    type: 'object',
    properties: {
      scheduleBlockId: {
        type: 'string',
        description: 'ID of the schedule block to manage.',
      },
      action: {
        type: 'string',
        enum: ['confirm', 'cancel', 'on_the_way'],
        description: 'Action to perform on the schedule block.',
      },
      reason: {
        type: 'string',
        description: 'Reason for cancellation (required when action is "cancel").',
      },
    },
    required: ['scheduleBlockId', 'action'],
  },
};

// ========== Tool: manage_all_schedule_blocks_for_date ========== //

export const TOOL_MANAGE_ALL_SCHEDULE_BLOCKS_FOR_DATE: ChatToolDefinition = {
  name: 'manage_all_schedule_blocks_for_date',
  description:
    'Manage ALL schedule blocks for a patient on a specific date. ' +
    'Used when the patient wants to confirm, cancel, or mark as on-the-way ALL their appointments on a given day. ' +
    'Provide any scheduleBlockId from the target date; the system will find all blocks for that patient on the same day.',
  parameters: {
    type: 'object',
    properties: {
      scheduleBlockId: {
        type: 'string',
        description: 'ID of any schedule block on the target date. Used to determine the date and patient.',
      },
      action: {
        type: 'string',
        enum: ['confirm', 'cancel', 'on_the_way'],
        description: 'Action to perform on all schedule blocks for the patient on that date.',
      },
      reason: {
        type: 'string',
        description: 'Reason for cancellation (required when action is "cancel").',
      },
    },
    required: ['scheduleBlockId', 'action'],
  },
};

// ========== Tool: create_task ========== //

export const TOOL_CREATE_TASK: ChatToolDefinition = {
  name: 'create_task',
  description:
    'Create an administrative task for human follow-up. ' +
    'Use when the patient requests something the bot cannot resolve ' +
    'directly (e.g. update personal data, request an invoice, ask about special pricing).',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Descriptive title for the task.',
      },
      description: {
        type: 'string',
        description: 'Detailed description of what needs to be done.',
      },
      type: {
        type: 'string',
        description: 'Task type (e.g. "follow_up", "billing", "information").',
      },
      priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH'],
        description: 'Task priority level.',
      },
      patientId: {
        type: 'string',
        description: 'ID of the related patient (if known).',
      },
      patientPhone: {
        type: 'string',
        description: 'Phone number of the person to contact for this task (if patientId is not known).',
      },
      patientFirstName: {
        type: 'string',
        description: 'First name of the person to contact (if patientId is not known).',
      },
      patientLastName: {
        type: 'string',
        description: 'Last name of the person to contact (if patientId is not known).',
      },
      dueAt: {
        type: 'string',
        description: 'Task deadline (ISO 8601, optional).',
      },
    },
    required: ['title', 'type'],
  },
};

// ========== Tool: resolve_patient ========== //

export const TOOL_RESOLVE_PATIENT: ChatToolDefinition = {
  name: 'resolve_patient',
  description:
    'Identify or create a patient before booking. ' +
    'Use BEFORE schedule_block when patient identity is not confirmed. ' +
    'Returns the resolved patient ID, name, and phone. ' +
    'If the patient is new, it creates them automatically. ' +
    'If data is missing, returns what fields are needed.',
  parameters: {
    type: 'object',
    properties: {
      firstName: {
        type: 'string',
        description: 'Patient first name. Optional if not yet known — the system will ask.',
      },
      lastName: {
        type: 'string',
        description: 'Patient last name. Optional if not yet known.',
      },
      phone: {
        type: 'string',
        description: 'Patient phone number (with or without country code). Optional if not yet known.',
      },
      isForInterlocutor: {
        type: 'boolean',
        description: 'Set to true if the booking is for the person chatting. The system will use the caller phone.',
      },
    },
  },
};

// ========== Tool: resolve_professional ========== //

export const TOOL_RESOLVE_PROFESSIONAL: ChatToolDefinition = {
  name: 'resolve_professional',
  strict: true,
  description:
    'Match the patient message to an available professional (doctor/dentist). ' +
    'Use when the patient mentions a doctor by name, describes a symptom that requires a specialist, ' +
    'or asks "who does X?". Returns the matched professional ID, name, and confidence. ' +
    'Call this BEFORE check_availability if the professional is not known.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      patientMessage: {
        type: 'string',
        description: 'The exact message from the patient describing the professional they want or asking about specialties.',
      },
    },
    required: ['patientMessage'],
  },
};

// ========== Tool: resolve_treatment ========== //

export const TOOL_RESOLVE_TREATMENT: ChatToolDefinition = {
  name: 'resolve_treatment',
  strict: true,
  description:
    'Match the patient message to an available treatment from the catalog. ' +
    'Use when the patient describes a treatment but does not provide an exact treatmentId. ' +
    'Returns the matched treatment ID, name, and confidence. ' +
    'Call this BEFORE check_availability if the treatment is not known.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      patientMessage: {
        type: 'string',
        description: 'The exact message from the patient describing the treatment they want.',
      },
    },
    required: ['patientMessage'],
  },
};

// ========== Tool: lookup_patient ========== //

export const TOOL_LOOKUP_PATIENT: ChatToolDefinition = {
  name: 'lookup_patient',
  strict: true,
  description:
    'Look up patient information by phone number, first name, or last name. ' +
    'Returns personal data and scheduled appointments. Use to identify the patient or review their history.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      phone: {
        type: 'string',
        description: 'Phone number to search (optional if firstName/lastName provided).',
      },
      firstName: {
        type: 'string',
        description: 'Patient first name (optional if phone provided).',
      },
      lastName: {
        type: 'string',
        description: 'Patient last name (optional if phone provided).',
      },
    },
  },
};

// ========== Tool: query_protocol ========== //

export const TOOL_QUERY_PROTOCOL: ChatToolDefinition = {
  name: 'query_protocol',
  strict: true,
  description:
    'Retrieve the full content of a clinic protocol by its ID. ' +
    'Use when the patient asks about a specific protocol that was not loaded in the initial system prompt. ' +
    'Returns the protocol name, description, response template, and all sections.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      protocolId: {
        type: 'string',
        description: 'The protocol identifier (e.g., "signature_implants", "first_visit").',
      },
    },
    required: ['protocolId'],
  },
};

// ========== Tool: query_knowledge_base ========== //

export const TOOL_QUERY_KNOWLEDGE_BASE: ChatToolDefinition = {
  name: 'query_knowledge_base',
  strict: true,
  description:
    'Search the clinic knowledge base (protocols, FAQs, response templates, and rules) for information relevant to the patient message. ' +
    'Use ONLY when you do not already have the answer in your current context. ' +
    'Returns the most relevant sections with their full content so you can answer naturally. ' +
    'Do NOT use this for patient identification, scheduling, or task creation — use the specific tools for those.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: {
        type: 'string',
        description: 'The patient message or a concise search query derived from it (e.g., "what treatments do you offer", "parking information").',
      },
      scope: {
        type: 'string',
        enum: ['protocols', 'faq', 'templates', 'rules', 'all'],
        description: 'Optional scope to narrow the search. Use "all" (default) unless the patient explicitly asks about a specific category.',
      },
    },
    required: ['query', 'scope'],
  },
};

// ========== All tools grouped ========== //

export const ALL_CHAT_TOOLS: ChatToolDefinition[] = [
  TOOL_RESOLVE_AVAILABILITY_QUERY,
  TOOL_CHECK_AVAILABILITY,
  TOOL_SCHEDULE_BLOCK,
  TOOL_MANAGE_SCHEDULE_BLOCK_STATUS,
  TOOL_MANAGE_ALL_SCHEDULE_BLOCKS_FOR_DATE,
  TOOL_CREATE_TASK,
  TOOL_RESOLVE_PATIENT,
  TOOL_RESOLVE_PROFESSIONAL,
  TOOL_RESOLVE_TREATMENT,
  TOOL_LOOKUP_PATIENT,
  TOOL_QUERY_PROTOCOL,
  TOOL_QUERY_KNOWLEDGE_BASE,
];

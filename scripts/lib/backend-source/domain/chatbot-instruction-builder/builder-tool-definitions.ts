/**
 * Builder Tool Definitions — OpenAI function schemas for the builder agent.
 *
 * These definitions describe the deterministic tools the LLM can invoke
 * during the chat builder flow. The actual execution lives in the application
 * layer (builder-tool-executor.ts), keeping the domain pure.
 */

export type BuilderToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/**
 * All deterministic tools available to the builder agent during chat.
 */
export const builderToolDefinitions: BuilderToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_schema',
      description: 'Returns the wire-format JSON schema for structuredLogic. Uses entry arrays for intents, flows, protocols, and responseTemplates so it is compatible with OpenAI strict:true. Use this when you need to know the exact shape of the JSON object.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_empty_logic',
      description: 'Returns an empty structuredLogic skeleton for the given chat mode.',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['full', 'tasks-only'],
            description: 'Chat mode for the skeleton',
          },
        },
        required: ['mode'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_draft',
      description: 'Returns the current structuredLogic draft. Use this before making changes.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_draft',
      description: 'Validates the current structuredLogic draft against the chat mode and returns errors.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_gaps',
      description: 'Returns quality gaps and missing sections in the current structuredLogic draft.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_next_missing_field',
      description: 'Returns the next missing field the advisor should fill, with priority and label.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_diff_preview',
      description: 'Returns a human-readable diff between the current draft and a proposed draft.',
      parameters: {
        type: 'object',
        properties: {
          proposed: {
            type: 'object',
            description: 'Proposed structuredLogic object to compare against the current draft',
          },
        },
        required: ['proposed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_partial_update',
      description: 'Applies a partial update (deep merge) to the current structuredLogic draft and validates the result. The current draft is updated in place.',
      parameters: {
        type: 'object',
        properties: {
          partial: {
            type: 'object',
            description: 'Partial structuredLogic object to merge into the current draft',
          },
        },
        required: ['partial'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_treatment_policy_hints_guidelines',
      description: 'Returns guidelines about when and how to use treatmentPolicyHints.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
];

import { StructuredLogicWireJsonSchema } from './structured-logic-wire-schema';

/**
 * JSON schema for the final structured output in BUILD mode.
 * The LLM must return this after using any tools.
 *
 * Uses StructuredLogicWireJsonSchema so the LLM receives the complete shape
 * with entry-arrays for all map sections (intents, flows, protocols,
 * responseTemplates). This enables strict:true compliance.
 *
 * The wire schema uses entry objects instead of dynamic keys, which is the
 * official OpenAI workaround for additionalProperties limitations in strict mode.
 */
export const builderChatOutputSchema = {
  type: 'object',
  properties: {
    responseToUser: {
      type: 'string',
      description: 'Human-friendly response explaining what was changed or suggested',
    },
    newStructuredLogic: {
      ...StructuredLogicWireJsonSchema,
      description: 'Complete updated structuredLogic in wire format (entry arrays for intents, flows, protocols, responseTemplates). Must include all required sections.',
    },
  },
  required: ['responseToUser', 'newStructuredLogic'],
  additionalProperties: false,
};

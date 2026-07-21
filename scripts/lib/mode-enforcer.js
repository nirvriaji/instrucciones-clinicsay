/**
 * Mode enforcement utilities.
 * Validates that tools and capabilities match the declared mode.
 *
 * Uses the canonical tool registry (tool-registry.js) as the source of truth.
 */

const { FULL_MODE_TOOLS, TASKS_ONLY_TOOLS: TASKS_ONLY_TOOL_NAMES } = require('./tool-registry');

const FULL_TOOLS = new Set(FULL_MODE_TOOLS);

const TASKS_ONLY_TOOLS = new Set(TASKS_ONLY_TOOL_NAMES);

const SCHEDULING_TOOLS = new Set([
  'check_availability',
  'resolve_availability_query',
  'schedule_block',
  'send_reminder', // not in current schema but kept for safety
]);

function validateMode(data, mode) {
  const errors = [];
  const allowedTools = mode === 'tasks-only' ? TASKS_ONLY_TOOLS : FULL_TOOLS;

  // Check flows
  const flows = data.toolOrchestration?.flows || {};
  for (const [flowName, flow] of Object.entries(flows)) {
    for (const step of (flow.steps || [])) {
      for (const tool of (step.tools || [])) {
        if (!allowedTools.has(tool)) {
          errors.push(`Flow "${flowName}" uses prohibited tool "${tool}" in mode "${mode}"`);
        }
      }
    }
    if (flow.allowedTools) {
      for (const tool of flow.allowedTools) {
        if (!allowedTools.has(tool)) {
          errors.push(`Flow "${flowName}" allowedTools includes prohibited tool "${tool}" in mode "${mode}"`);
        }
      }
    }
  }

  // Check rules for redirectToTask consistency
  if (mode === 'tasks-only') {
    const rules = data.rules || [];
    for (const rule of rules) {
      if (rule.intent === 'scheduling_request' && rule.action === 'allow' && !rule.redirectToTask) {
        // In tasks-only, scheduling_request should ideally redirect to task
        // This is a warning-level check, not a hard error
        // errors.push(`Rule "${rule.id || '(no-id)'}" for scheduling_request in tasks-only should set redirectToTask`);
      }
    }
  }

  // Check that general_inquiry has query_knowledge_base available (both modes)
  // This is a critical rule: general_inquiry must be able to search the knowledge base
  const generalInquiryFlow = flows['general_inquiry'];
  if (generalInquiryFlow) {
    const hasQkbInAllowed = (generalInquiryFlow.allowedTools || []).includes('query_knowledge_base');
    const hasQkbInSteps = (generalInquiryFlow.steps || []).some(step => 
      (step.tools || []).includes('query_knowledge_base')
    );
    if (!hasQkbInAllowed && !hasQkbInSteps) {
      errors.push(`Flow "general_inquiry" must have "query_knowledge_base" available in allowedTools or steps. This is required in both full and tasks-only modes so the bot can search protocols, FAQ, responseTemplates and rules when the answer is not already in context.`);
    }
  }

  return errors;
}

function getToolListForMode(mode) {
  return mode === 'tasks-only'
    ? Array.from(TASKS_ONLY_TOOLS)
    : Array.from(FULL_TOOLS);
}

module.exports = { validateMode, getToolListForMode, FULL_TOOLS, TASKS_ONLY_TOOLS, SCHEDULING_TOOLS };

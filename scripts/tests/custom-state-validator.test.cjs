#!/usr/bin/env node
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const RUN_VALIDATION = path.join(ROOT, 'scripts/lib/backend-validator/run-validation.ts');

function runValidator(logic) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-state-validator-'));
  const file = path.join(dir, 'logic.json');
  fs.writeFileSync(file, JSON.stringify(logic));
  try {
    return JSON.parse(execFileSync('npx', ['tsx', RUN_VALIDATION, file, 'tasks-only'], { cwd: ROOT, encoding: 'utf8' }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout.toString());
    throw error;
  }
}

function base() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, '_templates/base-tasks-only.json'), 'utf8'));
}

describe('customState and when validator contract', () => {
  it('accepts legacy steps without the new fields', () => {
    const result = runValidator(base());
    assert.strictEqual(result.valid, true, result.errors.join(' | '));
  });

  it('rejects malformed custom state, future references, invalid operators and unknown treatment IDs', () => {
    const logic = base();
    logic.serviceCatalog.treatments = [{ id: 'known', name: 'Tratamiento' }];
    const flow = logic.toolOrchestration.flows.any_scheduling_request;
    flow.steps[0].customState = [{ key: 'Bad Key', description: 'x', enum: [] }];
    flow.steps[0].when = [{ key: 'motivo', equals: 'x', in: ['x'] }];
    flow.steps[1].when = [{ key: 'treatmentId', equals: 'missing' }];
    const result = runValidator(logic);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((error) => /snake_case|non-empty/.test(error)));
    assert.ok(result.errors.some((error) => error.includes('exactly one operator')));
    assert.ok(result.errors.some((error) => error.includes('not present in serviceCatalog')));
  });

  it('rejects the internal state tool in clinic steps', () => {
    const logic = base();
    logic.toolOrchestration.flows.any_scheduling_request.steps[0].tools = ['personalized_user_conversation_state'];
    const result = runValidator(logic);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('personalized_user_conversation_state')));
  });
});

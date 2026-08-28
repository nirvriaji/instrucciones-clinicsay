#!/usr/bin/env node
/**
 * Guards the model/literal response policy.
 *
 * Run: node --test scripts/tests/response-template-modes.test.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const RUN_VALIDATION = path.join(ROOT, 'scripts/lib/backend-validator/run-validation.ts');

function runValidator(logic) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-template-modes-'));
  const file = path.join(directory, 'logic.json');
  fs.writeFileSync(file, JSON.stringify(logic));
  try {
    return JSON.parse(
      execFileSync('npx', ['tsx', RUN_VALIDATION, file, 'full'], {
        cwd: ROOT,
        encoding: 'utf8',
      }),
    );
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout.toString());
    throw error;
  }
}

function baseLogic() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, '_templates/base-full.json'), 'utf8'));
}

describe('response template modes', () => {
  it('rejects literal mode for reschedule inquiries', () => {
    const logic = baseLogic();
    logic.responseTemplates.reschedule_inquiry_full.mode = 'literal';

    const result = runValidator(logic);

    assert.strictEqual(result.valid, false, 'conversational literal mode must block validation');
    assert.ok(
      result.errors.some((message) => message.toLowerCase().includes('responsetemplates') && message.toLowerCase().includes('model')),
      `expected a model-mode correction, got: ${result.errors.join(' | ')}`,
    );
  });

  it('allows literal mode only for appointment operations', () => {
    const logic = baseLogic();

    const result = runValidator(logic);

    assert.strictEqual(result.valid, true, result.errors.join(' | '));
  });
});

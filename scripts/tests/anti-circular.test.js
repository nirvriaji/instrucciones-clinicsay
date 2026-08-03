#!/usr/bin/env node
/**
 * anti-circular.test.js
 *
 * Tests for the anti-circular step-requirement invariant (technical rule, blocking):
 * a step may only REQUIRE capabilities established by EARLIER steps — never by a
 * tool in the same step, or the flow deadlocks at runtime (step_requirements_failed).
 *
 * Run: node --test scripts/tests/anti-circular.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const RUN_VALIDATION = path.join(ROOT, 'scripts/lib/backend-validator/run-validation.ts');

const FULLS = [
  'sedes/demo/output/structured-logic.full.json',
  'sedes/vasquez-fisioterapia/output/structured-logic.full.json',
  'sedes/andrea-palazolo/output/structured-logic.full.json',
  'sedes/ecobaby-granada/output/structured-logic.full.json',
];

function runValidator(jsonPath, mode) {
  try {
    const out = execSync(`npx tsx "${RUN_VALIDATION}" "${jsonPath}" "${mode}"`, {
      encoding: 'utf8',
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch (err) {
    // run-validation.ts exits 1 when the JSON is invalid but still emits JSON to stdout
    if (err.stdout) return JSON.parse(err.stdout.toString());
    throw err;
  }
}

function writeTemp(logic) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'anti-circular-')), 'logic.json');
  fs.writeFileSync(file, JSON.stringify(logic));
  return file;
}

// ── Runtime gate simulation (mirrors RunToolCycle.checkStepRequirements) ──
function gateAllows(flow, toolName, capabilities) {
  const flowTools = new Set();
  if (flow.allowedTools?.length) flow.allowedTools.forEach((t) => flowTools.add(t));
  else (flow.steps ?? []).forEach((s) => s.tools.forEach((t) => flowTools.add(t)));
  if (!flowTools.has(toolName)) return false;
  const stepsWithTool = (flow.steps ?? []).filter((s) => s.tools.includes(toolName));
  if (stepsWithTool.length === 0) return true;
  return stepsWithTool.some((s) => (s.required ?? []).every((r) => capabilities[r] === true));
}

describe('anti-circular step requirements', () => {
  it('(a) fixture with circular requirement MUST fail with didactic hint', () => {
    const logic = JSON.parse(fs.readFileSync(path.join(ROOT, FULLS[1]), 'utf8'));
    const step1 = logic.toolOrchestration.flows.new_patient_booking.steps[0];
    step1.required = ['hasResolvedTreatment']; // reintroduce the original bug
    const file = writeTemp(logic);
    const result = runValidator(file, 'full');
    assert.strictEqual(result.valid, false, 'circular requirement must block validation');
    const msg = result.errors.find((e) => e.toLowerCase().includes('circular'));
    assert.ok(msg, 'must include circular-requirement error');
    assert.ok(msg.includes('FIX'), 'error must include didactic FIX hint');
    assert.ok(msg.includes('ESTABLISHES'), 'error must explain the establisher relationship');
  });

  it('(b) the 4 production full JSONs MUST pass validation', () => {
    for (const rel of FULLS) {
      const result = runValidator(path.join(ROOT, rel), 'full');
      assert.strictEqual(result.valid, true, `${rel} must be valid: ${result.errors.join(' | ')}`);
    }
  });

  it('(c) runtime gate: booking sequence unblocks in the right order', () => {
    const logic = JSON.parse(fs.readFileSync(path.join(ROOT, FULLS[1]), 'utf8'));
    const flow = logic.toolOrchestration.flows.new_patient_booking;
    const caps = {
      hasResolvedTreatment: false,
      hasResolvedPatient: false,
      hasResolvedProfessional: false,
      hasShownSlots: false,
      hasSelectedSlot: false,
      hasCreatedAppointment: false,
      hasCreatedTask: false,
      hasResolvedAvailabilityQuery: false,
    };

    // t0: establishing tools allowed; consumers blocked
    assert.ok(gateAllows(flow, 'resolve_treatment', caps), 'resolve_treatment must pass at t0');
    assert.ok(gateAllows(flow, 'resolve_availability_query', caps), 'resolve_availability_query must pass at t0');
    assert.ok(!gateAllows(flow, 'check_availability', caps), 'check_availability must be blocked before treatment');
    assert.ok(gateAllows(flow, 'resolve_patient', caps), 'resolve_patient must pass at t0');
    assert.ok(!gateAllows(flow, 'schedule_block', caps), 'schedule_block must be blocked before patient');

    // after resolve_treatment
    caps.hasResolvedTreatment = true;
    assert.ok(gateAllows(flow, 'check_availability', caps), 'check_availability must pass after treatment');
    assert.ok(!gateAllows(flow, 'schedule_block', caps), 'schedule_block still blocked before patient');

    // after resolve_patient
    caps.hasResolvedPatient = true;
    assert.ok(gateAllows(flow, 'schedule_block', caps), 'schedule_block must pass after patient');
  });

  it('(d) typo in required capability MUST fail with did-you-mean suggestion', () => {
    const logic = JSON.parse(fs.readFileSync(path.join(ROOT, FULLS[1]), 'utf8'));
    logic.toolOrchestration.flows.new_patient_booking.steps[0].required = ['hasResolveTreatment']; // typo
    const file = writeTemp(logic);
    const result = runValidator(file, 'full');
    assert.strictEqual(result.valid, false, 'typo capability must block validation');
    const msg = result.errors.find((e) => e.includes('unknown required capability'));
    assert.ok(msg, 'must include unknown-capability error');
    assert.ok(msg.includes("Did you mean 'hasResolvedTreatment'?"), `must suggest the right capability, got: ${msg}`);
  });
});

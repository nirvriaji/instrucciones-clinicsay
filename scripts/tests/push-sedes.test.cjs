#!/usr/bin/env node

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readPushFiles,
  buildMetadataPatch,
  describeDatabase,
  getSedeDirName,
} = require('../lib/push-sedes.cjs');

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'push-sedes-'));
}

function writeOutput(root, sede, fileName, value) {
  const output = path.join(root, 'sedes', sede, 'output');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, fileName), JSON.stringify(value));
}

describe('push sede file selection', () => {
  it('selects only the modes that exist', () => {
    const root = makeRoot();
    writeOutput(root, 'org_site', 'structured-logic.full.json', { mode: 'full' });

    const pushes = readPushFiles(root);

    assert.deepEqual(pushes.map((push) => ({ sede: push.sede, modes: push.modes.map((mode) => mode.mode) })), [
      { sede: 'org_site', modes: ['full'] },
    ]);
  });

  it('filters to one sede and ignores empty output directories', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'sedes', 'empty', 'output'), { recursive: true });
    writeOutput(root, 'wanted', 'structured-logic.tasks-only.json', { mode: 'tasks-only' });
    writeOutput(root, 'other', 'structured-logic.full.json', { mode: 'full' });

    const pushes = readPushFiles(root, 'wanted');

    assert.deepEqual(pushes.map((push) => push.sede), ['wanted']);
    assert.equal(pushes[0].modes[0].metadataKey, 'structuredLogic');
  });
});

describe('push metadata safety', () => {
  it('updates only the keys represented by output files', () => {
    const patch = buildMetadataPatch([
      { metadataKey: 'structuredLogicFull', data: { full: true } },
    ]);

    assert.deepEqual(patch, { structuredLogicFull: { full: true } });
    assert.equal(Object.hasOwn(patch, 'structuredLogic'), false);
  });

  it('uses the same composite sede naming as fetch', () => {
    assert.equal(getSedeDirName('Vázquez Fisioterapia', 'Sede Principal Córdoba'), 'vazquez-fisioterapia_sede-principal-cordoba');
  });
});

describe('database display', () => {
  it('returns display-safe connection details without the password', () => {
    const info = describeDatabase('postgres://user:secret@example.test:25013/db?schema=clinic&sslmode=require');

    assert.deepEqual(info, {
      host: 'example.test',
      port: '25013',
      database: 'db',
      schema: 'clinic',
      user: 'user',
    });
    assert.equal(JSON.stringify(info).includes('secret'), false);
  });
});

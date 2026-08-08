/**
 * Path resolver for scripts.
 * All paths are relative to the project root (~/clinicsay-instructions).
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');

const VALID_MODES = ['full', 'tasks-only'];

function getSedePaths(sede, mode) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Expected one of: ${VALID_MODES.join(', ')}`);
  }
  const sedeDir = path.join(ROOT, 'sedes', sede);
  return {
    root: sedeDir,
    inputDir: path.join(sedeDir, 'input'),
    outputDir: path.join(sedeDir, 'output'),
    // Note: the agent reads ALL files in input/ (.md, .json, .txt)
    analysis: path.join(sedeDir, 'output', 'analysis.json'),
    draft: path.join(sedeDir, 'output', `structured-logic.${mode}.draft.json`),
    final: path.join(sedeDir, 'output', `structured-logic.${mode}.json`),
    gaps: path.join(sedeDir, 'output', `gaps.${mode}.json`),
  };
}

function getSchemaPath() {
  return path.join(__dirname, 'schemas', 'structured-logic-schema.json');
}

/**
 * Resolve the active structuredLogic document.
 * The draft is the working source of truth and must win over a stale final.
 */
function getActiveJsonPath(paths, existsSync = fs.existsSync) {
  return existsSync(paths.draft) ? paths.draft : paths.final;
}

module.exports = { ROOT, getSedePaths, getSchemaPath, getActiveJsonPath };

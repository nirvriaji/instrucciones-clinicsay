/**
 * Path resolver for scripts.
 * All paths are relative to the project root (~/clinicsay-instructions).
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');

function getSedePaths(sede) {
  const sedeDir = path.join(ROOT, 'sedes', sede);
  return {
    root: sedeDir,
    inputDir: path.join(sedeDir, 'input'),
    outputDir: path.join(sedeDir, 'output'),
    anotaciones: path.join(sedeDir, 'input', 'anotaciones.md'),
    analysis: path.join(sedeDir, 'output', 'analysis.json'),
    draft: path.join(sedeDir, 'output', 'structured-logic.draft.json'),
    final: path.join(sedeDir, 'output', 'structured-logic.json'),
  };
}

function getTemplatesPath() {
  return path.join(ROOT, '_templates');
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

module.exports = { ROOT, getSedePaths, getTemplatesPath, getSchemaPath, getActiveJsonPath };

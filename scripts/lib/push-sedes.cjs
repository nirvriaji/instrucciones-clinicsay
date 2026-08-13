const fs = require('fs');
const path = require('path');

const MODES = [
  { mode: 'full', fileName: 'structured-logic.full.json', metadataKey: 'structuredLogicFull' },
  { mode: 'tasks-only', fileName: 'structured-logic.tasks-only.json', metadataKey: 'structuredLogic' },
];

function sanitizeDirName(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+/g, '-')
    .replace(/-+$/, '');
}

function getSedeDirName(orgName, siteSlug) {
  return `${sanitizeDirName(orgName)}_${sanitizeDirName(siteSlug)}`;
}

function readPushFiles(root, sedeFilter) {
  const sedesDir = path.join(root, 'sedes');
  if (!fs.existsSync(sedesDir)) return [];

  const sedeNames = fs.readdirSync(sedesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !sedeFilter || name === sedeFilter);

  return sedeNames.map((sede) => {
    const outputDir = path.join(sedesDir, sede, 'output');
    const modes = MODES.reduce((result, definition) => {
      const filePath = path.join(outputDir, definition.fileName);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        result.push({ ...definition, filePath, data: JSON.parse(raw) });
      }
      return result;
    }, []);

    return { sede, modes };
  }).filter(({ modes }) => modes.length > 0);
}

function buildMetadataPatch(modes) {
  return modes.reduce((patch, { metadataKey, data }) => {
    patch[metadataKey] = data;
    return patch;
  }, {});
}

function describeDatabase(databaseUrl) {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '') || '(default)';
  return {
    host: url.hostname,
    port: url.port || '5432',
    database,
    schema: url.searchParams.get('schema') || 'public',
    user: decodeURIComponent(url.username || '(default)'),
  };
}

module.exports = {
  MODES,
  sanitizeDirName,
  getSedeDirName,
  readPushFiles,
  buildMetadataPatch,
  describeDatabase,
};

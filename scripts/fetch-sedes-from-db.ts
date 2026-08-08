/**
 * Fetch all sede structured-logic JSONs from the backend Postgres database.
 *
 * Reads `DATABASE_URL` from a `.env` file in the repo root.
 *
 * For each active `CHAT_BOT` in `kommo_bot`, it extracts:
 *   - `metadata->>'structuredLogicFull'`  → `sedes/<site-slug>/input/structured-logic.full.json`
 *   - `metadata->>'structuredLogic'`     → `sedes/<site-slug>/input/structured-logic.tasks-only.json`
 *
 * It also creates the matching `output/` directory for each sede.
 *
 * Usage:
 *   npx tsx scripts/fetch-sedes-from-db.ts
 *   # or
 *   make fetch-sedes
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    'ERROR: DATABASE_URL is not set.\n' +
      'Copy .env.example to .env and configure the connection string, or export it:\n' +
      '  DATABASE_URL=postgresql://user:pass@localhost:5432/dbname npx tsx scripts/fetch-sedes-from-db.ts'
  );
  process.exit(1);
}

const SEDES_DIR = path.join(ROOT, 'sedes');

/**
 * Convert a site slug/name into a safe directory name.
 * Lowercase, URL-ish, no spaces or filesystem-tricky characters.
 */
function sanitizeDirName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+/g, '-')
    .replace(/-+$/, '');
}

function writeJsonPretty(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Remove all contents of a directory and recreate it empty.
 * The directory itself is preserved so relative paths stay valid.
 */
function cleanDirectory(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function warnMissing(metadata: Record<string, unknown>, botId: string, siteSlug: string, key: string): void {
  if (metadata[key] === undefined || metadata[key] === null) {
    console.warn(`  ⚠️  Bot ${botId} (site ${siteSlug}) has no '${key}' in metadata. Skipped.`);
  }
}

async function main() {
  // Strip sslmode from the connection string so pg-connection-string
  // does NOT override our manual ssl config (it treats 'require' as
  // 'verify-full' which rejects Aiven's self-signed certs).
  const dbUrl = new URL(DATABASE_URL);
  dbUrl.searchParams.delete('sslmode');
  const connectionString = dbUrl.toString();

  const client = new Client({
    connectionString,
    // Aiven / cloud Postgres uses SSL with a self-signed cert chain.
    // In development/integration this is acceptable; production should
    // mount the real CA file instead.
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected to database. Fetching active CHAT_BOT bots...\n');

    const result = await client.query(
      `
      SELECT
        kb.id            AS bot_id,
        kb.bot_type      AS bot_type,
        kb.metadata      AS metadata,
        s.id             AS site_id,
        s.slug           AS site_slug,
        s.name           AS site_name,
        c.id             AS clinic_id,
        c.slug           AS clinic_slug,
        c.name           AS clinic_name,
        o.id             AS org_id,
        o.name           AS org_name
      FROM kommo_bot kb
      JOIN site s ON s.id = kb.site_id
      JOIN clinic c ON c.id = kb.clinic_id
      JOIN organization o ON o.id = c.organization_id
      WHERE kb.bot_type = 'CHAT_BOT'
        AND kb.record_status = 'ACTIVE'
        AND s.record_status = 'ACTIVE'
        AND c.record_status = 'ACTIVE'
        AND o.record_status = 'ACTIVE'
      ORDER BY o.name, c.slug, s.slug, kb.id
      `
    );

    if (result.rows.length === 0) {
      console.warn('No active CHAT_BOT bots found in the database.');
      return;
    }

    console.log(`Found ${result.rows.length} active CHAT_BOT bot(s).\n`);

    let written = 0;
    let skipped = 0;

    for (const row of result.rows) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const siteSlugRaw = row.site_slug as string;
      const siteSlug = sanitizeDirName(siteSlugRaw);
      const siteName = row.site_name as string;
      const clinicName = row.clinic_name as string;
      const orgName = row.org_name as string;
      const botId = row.bot_id as string;

      if (!siteSlug) {
        console.warn(`  ⚠️  Cannot build a directory name for site '${siteSlugRaw}'. Skipped bot ${botId}.`);
        skipped++;
        continue;
      }

      // Build a composite folder name: orgSlug_siteSlug
      // Organization has no DB slug, so we derive it from org.name.
      const orgSlug = sanitizeDirName(orgName);
      const sedeDirName = `${orgSlug}_${siteSlug}`;
      const sedeDir = path.join(SEDES_DIR, sedeDirName);
      const inputDir = path.join(sedeDir, 'input');
      const outputDir = path.join(sedeDir, 'output');

      // Clean both folders so input/ only contains the downloaded JSONs
      // and output/ is empty for the next generation step.
      cleanDirectory(inputDir);
      cleanDirectory(outputDir);

      console.log(`[${sedeDirName}] ${orgName} → ${clinicName} → ${siteName} (bot ${botId})`);

      const fullLogic = metadata['structuredLogicFull'];
      const tasksOnlyLogic = metadata['structuredLogic'];

      if (fullLogic && typeof fullLogic === 'object') {
        const fullPath = path.join(inputDir, 'structured-logic.full.json');
        writeJsonPretty(fullPath, fullLogic);
        console.log(`  ✓ written ${fullPath.replace(ROOT + '/', '')}`);
        written++;
      } else {
        warnMissing(metadata, botId, siteSlug, 'structuredLogicFull');
      }

      if (tasksOnlyLogic && typeof tasksOnlyLogic === 'object') {
        const tasksOnlyPath = path.join(inputDir, 'structured-logic.tasks-only.json');
        writeJsonPretty(tasksOnlyPath, tasksOnlyLogic);
        console.log(`  ✓ written ${tasksOnlyPath.replace(ROOT + '/', '')}`);
        written++;
      } else {
        warnMissing(metadata, botId, siteSlug, 'structuredLogic');
      }
    }

    console.log(`\nDone. Wrote ${written} file(s). Skipped ${skipped} bot(s).`);
  } catch (err) {
    console.error('ERROR fetching sedes:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

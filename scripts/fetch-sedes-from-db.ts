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
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

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

async function confirmFetch(): Promise<boolean> {
  if (process.env.CONFIRM === '1') return true;

  if (!input.isTTY || !output.isTTY) {
    throw new Error('No hay terminal interactiva. Usa CONFIRM=1 solo después de revisar el destino.');
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(
      'Esto borrará todas las sedes locales excepto sedes/demo y reemplazará sus input/output. ¿Confirmas? [y/N] '
    );
    return /^(y|yes|s|si|sí)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function warnMissing(botId: string, siteSlug: string, key: string): void {
  console.warn(`  ⚠️  Bot ${botId} (site ${siteSlug}) has no '${key}' in metadata. Skipped.`);
}

async function main() {
  try {
    if (!(await confirmFetch())) {
      console.log('Operación cancelada.');
      return;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Strip sslmode from the connection string so pg-connection-string
  // does NOT override our manual ssl config (it treats 'require' as
  // 'verify-full' which rejects Aiven's self-signed certs).
  const dbUrl = new URL(DATABASE_URL);
  dbUrl.searchParams.delete('sslmode');
  const connectionString = dbUrl.toString();

  // Use a small connection pool so we can fetch metadata for multiple bots
  // concurrently without saturating the Aiven connection limits.
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 30000,
    // Very long statement timeout for metadata reads (TOAST can be slow on
    // Aiven under load). We rely on the Node-side promise timeout for
    // responsiveness, not on Postgres aborting legitimate work.
    options: '-c statement_timeout=600000',
  });

  try {
    const listClient = await pool.connect();
    try {
      console.log('Connected to database. Fetching active CHAT_BOT bots...\n');

      // Remove every generated sede, but preserve the canonical demo assets.
      if (fs.existsSync(SEDES_DIR)) {
        for (const entry of fs.readdirSync(SEDES_DIR)) {
          if (entry !== 'demo') {
            fs.rmSync(path.join(SEDES_DIR, entry), { recursive: true, force: true });
          }
        }
      } else {
        fs.mkdirSync(SEDES_DIR, { recursive: true });
      }

      const botListResult = await listClient.query(
        `
        SELECT
          kb.id            AS bot_id,
          kb.bot_type      AS bot_type,
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

      if (botListResult.rows.length === 0) {
        console.warn('No active CHAT_BOT bots found in the database.');
        return;
      }

      const bots = botListResult.rows;
      console.log(`Found ${bots.length} active CHAT_BOT bot(s).\n`);

      let written = 0;
      let skipped = 0;
      const BATCH_SIZE = 3;

      for (let i = 0; i < bots.length; i += BATCH_SIZE) {
        const batch = bots.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async (row, idx) => {
            const globalIndex = i + idx + 1;
            const siteSlugRaw = row.site_slug as string;
            const siteSlug = sanitizeDirName(siteSlugRaw);
            const siteName = row.site_name as string;
            const clinicName = row.clinic_name as string;
            const orgName = row.org_name as string;
            const botId = row.bot_id as string;
            const orgSlug = sanitizeDirName(orgName);
            const sedeDirName = `${orgSlug}_${siteSlug}`;
            const sedeDir = path.join(SEDES_DIR, sedeDirName);
            const inputDir = path.join(sedeDir, 'input');
            const outputDir = path.join(sedeDir, 'output');

            if (!siteSlug) {
              console.warn(`  ⚠️  [${globalIndex}/${bots.length}] Cannot build a directory name for site '${siteSlugRaw}'. Skipped bot ${botId}.`);
              return { skipped: true };
            }

            process.stdout.write(`[${globalIndex}/${bots.length}] ${sedeDirName} — fetching metadata... `);
            const start = Date.now();

            let fullLogic: unknown = null;
            let tasksOnlyLogic: unknown = null;
            let error: string | null = null;

            try {
              const metaResult = await pool.query(
                `
                SELECT
                  metadata->>'structuredLogicFull'  AS full_logic,
                  metadata->>'structuredLogic'     AS tasks_only_logic
                FROM kommo_bot
                WHERE id = $1
                `,
                [botId]
              );
              const metaRow = metaResult.rows[0] ?? {};

              try {
                if (metaRow.full_logic) {
                  fullLogic = JSON.parse(metaRow.full_logic as string);
                }
              } catch {
                error = `invalid JSON in 'structuredLogicFull'`;
              }

              try {
                if (metaRow.tasks_only_logic) {
                  tasksOnlyLogic = JSON.parse(metaRow.tasks_only_logic as string);
                }
              } catch {
                error = `invalid JSON in 'structuredLogic'`;
              }
            } catch (e) {
              error = e instanceof Error ? e.message : String(e);
            }

            const duration = Date.now() - start;
            if (error) {
              process.stdout.write(`ERROR in ${duration}ms: ${error}\n`);
              return { skipped: true };
            }
            process.stdout.write(`done in ${duration}ms\n`);

            cleanDirectory(inputDir);
            cleanDirectory(outputDir);

            let botWritten = 0;
            if (fullLogic !== null && typeof fullLogic === 'object') {
              const fullPath = path.join(inputDir, 'structured-logic.full.json');
              writeJsonPretty(fullPath, fullLogic);
              console.log(`  ✓ written ${fullPath.replace(ROOT + '/', '')}`);
              botWritten++;
            } else {
              warnMissing(botId, siteSlug, 'structuredLogicFull');
            }

            if (tasksOnlyLogic !== null && typeof tasksOnlyLogic === 'object') {
              const tasksOnlyPath = path.join(inputDir, 'structured-logic.tasks-only.json');
              writeJsonPretty(tasksOnlyPath, tasksOnlyLogic);
              console.log(`  ✓ written ${tasksOnlyPath.replace(ROOT + '/', '')}`);
              botWritten++;
            } else {
              warnMissing(botId, siteSlug, 'structuredLogic');
            }

            return { written: botWritten, skipped: false };
          })
        );

        for (const r of batchResults) {
          if (r?.skipped) {
            skipped++;
          } else if (r) {
            written += r.written;
          }
        }
      }

      console.log(`\nDone. Wrote ${written} file(s). Skipped ${skipped} bot(s).`);
    } finally {
      listClient.release();
    }
  } catch (err) {
    console.error('ERROR fetching sedes:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

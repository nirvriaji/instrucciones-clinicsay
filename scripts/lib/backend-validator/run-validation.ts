/**
 * run-backend-validation.ts
 *
 * Wrapper para ejecutar el validador replicado del backend.
 * Lee JSON desde stdin o archivo y emite resultado JSON a stdout.
 *
 * Uso:
 *   npx tsx scripts/lib/backend-validator/run-validation.ts <json-path> <mode>
 */

import { validateStructuredLogic, ValidationResult } from './validator';
import fs from 'fs';

const jsonPath = process.argv[2];
const mode = (process.argv[3] as any) || 'tasks-only';

if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error('Usage: npx tsx run-validation.ts <json-path> <mode>');
  process.exit(1);
}

const logic = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
const result: ValidationResult = validateStructuredLogic(logic, mode);

console.log(JSON.stringify(result));
process.exit(result.valid ? 0 : 1);

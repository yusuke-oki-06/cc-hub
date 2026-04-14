import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sql } from './client.js';

async function main() {
  const migrationsDir = resolve(process.cwd(), '../../migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await sql.unsafe<{ version: string }[]>('SELECT version FROM schema_migrations')).map(
      (r) => r.version,
    ),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= already applied: ${file}`);
      continue;
    }
    const sqlText = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`+ applying ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx.unsafe('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });
  }

  await sql.end();
  console.log('migrations done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

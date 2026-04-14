import postgres from 'postgres';

const url = process.env.RUNNER_DATABASE_URL;
if (!url) {
  throw new Error('RUNNER_DATABASE_URL is not set');
}

export const sql = postgres(url, {
  max: 10,
  idle_timeout: 20,
  prepare: false,
});

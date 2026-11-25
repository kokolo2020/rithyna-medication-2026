import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
const modulesDirectory = process.env.CARE_SMOKE_NPM_PREFIX;
if (!modulesDirectory || !isAbsolute(modulesDirectory)) {
  throw Error('Set CARE_SMOKE_NPM_PREFIX to the absolute disposable npm install directory.');
}
const require = createRequire(join(modulesDirectory,'care-db-smoke.cjs'));
const { PGlite } = require('@electric-sql/pglite');
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist');
const repo = new URL('../', import.meta.url);
const db = new PGlite({extensions:{btree_gist}});
try {
  const who = await db.query('select current_user as name, version() as version');
  assert.equal(who.rows[0].name, 'postgres');
  console.log(who.rows[0].version);
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, aud text, role text, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb,'{}'::jsonb)
    $$;
    grant usage on schema auth to anon, authenticated;
  `);
  await db.exec(await readFile(new URL('schema.sql',repo),'utf8'));
  await db.exec(await readFile(new URL('schedule-admin.sql',repo),'utf8'));
  await db.exec(await readFile(new URL('test/schedule-admin-smoke.sql',repo),'utf8'));
  const raw = await readFile(new URL('test/db-smoke.sql',repo),'utf8');
  const smoke = raw.split('\n').filter(x=>!x.trimStart().startsWith('\\')).join('\n')
    .replace(":'care_disposable_staging'", "'I_VERIFIED_DISPOSABLE_STAGING'");
  await db.exec(smoke);
  const result = await db.query('select (select count(*)::int from auth.users) users, (select count(*)::int from public.care_entries) entries, (select count(*)::int from public.care_teams) teams');
  assert.deepEqual(result.rows[0],{users:0,entries:0,teams:0});
  console.log('PASS: real embedded PostgreSQL schema, RLS, role attribution, schedule snapshots, duplicates; fixtures rolled back. Auth gateway/claims ingestion simulated.');
} finally { await db.close(); }

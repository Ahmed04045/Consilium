import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`,
  );
  await db.exec(
    readFileSync(
      new URL(
        "../../../supabase/migrations/20261018_consilium_calendar_sync.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`,
  );
  const save = async (rev, payload = { calendars: [] }) =>
    db.query(
      "select public.consilium_save_calendar($1,$2::jsonb) as revision",
      [rev, JSON.stringify(payload)],
    );
  assert.equal((await save(0)).rows[0].revision, 1);
  await assert.rejects(() => save(0), /Sync conflict/);
  await assert.rejects(
    () => db.exec(`update public.consilium_calendar_snapshots set revision=99`),
    /permission denied/,
  );
  await db.exec(
    `select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)`,
  );
  assert.equal(
    (await db.query("select * from public.consilium_calendar_snapshots")).rows
      .length,
    0,
  );
  assert.equal((await save(0, { owner: "second" })).rows[0].revision, 1);
  assert.equal(
    (await db.query("select * from public.consilium_calendar_snapshots")).rows
      .length,
    1,
  );
  await db.exec(
    `select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`,
  );
  assert.equal((await save(1, { owner: "first" })).rows[0].revision, 2);
  await assert.rejects(() => save(1), /Sync conflict/);
  await db.exec("reset role;set role anon;");
  await assert.rejects(
    () => db.query("select * from public.consilium_calendar_snapshots"),
    /permission denied/,
  );
  await assert.rejects(() => save(0), /permission denied/);
  console.log(
    "Supabase migration passed: two-account isolation, anonymous denial, direct-write denial, atomic revision conflicts.",
  );
} finally {
  await db.close();
}

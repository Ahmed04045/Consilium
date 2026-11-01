import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`,
  );
  await db.exec(
    readFileSync(
      new URL(
        "../../../supabase/migrations/20261029_consilium_phone_sync.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`,
  );
  const payload={schema_version:1,calendars:[],labels:[],tasks:[],occurrences:[]};
  const save = (rev,value=payload)=>db.query('select public.consilium_phone_save($1,$2::jsonb) as revision',[rev,JSON.stringify(value)]);
  const read=async()=> (await db.query('select public.consilium_phone_read() as result')).rows[0].result;
  assert.equal((await save(0)).rows[0].revision,1);
  await assert.rejects(()=>save(0),/Sync conflict/);
  await assert.rejects(()=>save(1,{...payload,profiles:[]}),/Unsupported/);
  await assert.rejects(()=>save(1,{...payload,tasks:'invalid'}),/record array/);
  await assert.rejects(()=>save(1,{...payload,tasks:Array(5001).fill({})}),/Too many/);
  await assert.rejects(()=>save(1,{...payload,tasks:[{title:'x'.repeat(2000000)}]}),/Invalid sync/);
  await assert.rejects(()=>db.query('select * from public.consilium_phone_snapshots'),/permission denied/);
  await assert.rejects(()=>db.exec('update public.consilium_phone_snapshots set revision=99'),/permission denied/);
  await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)");
  assert.equal((await read()).revision,0);
  assert.equal((await save(0)).rows[0].revision,1);
  await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
  assert.equal((await read()).revision,1);
  for(let i=1;i<10;i++)await save(i);
  await assert.rejects(()=>save(10),/rate limit/);
  for(let i=1;i<60;i++)await read();
  await assert.rejects(()=>read(),/rate limit/);
  await db.exec("reset role;update consilium_private.sync_limits set window_start=now()-interval '2 minutes';set role authenticated;");
  assert.equal((await read()).revision,10);
  await db.exec("reset role;update auth.users set email_confirmed_at=null where id='00000000-0000-0000-0000-000000000001';set role authenticated;");
  await assert.rejects(()=>read(),/Confirmed account/);
  await db.exec('reset role;set role anon;');
  await assert.rejects(()=>read(),/permission denied/);await assert.rejects(()=>save(0),/permission denied/);
  console.log('Phone sync SQL passed: account isolation, confirmed-email enforcement, direct/anonymous denial, size/count limits, revision conflicts, read/write quotas and window reset.');
} finally {
  await db.close();
}

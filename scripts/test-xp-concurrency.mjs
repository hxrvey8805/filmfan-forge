// Local PostgreSQL only. Docker has no network, ports, volumes or production credentials.
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const container=`cinegeek-xp-check-${process.pid}`;
const migration=name=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const sql=text=>new Promise((resolve,reject)=>{
 const p=spawn('docker',['exec','-i',container,'psql','-U','postgres','-XqAt','-v','ON_ERROR_STOP=1']);let out='',err='';
 p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(text);
});
let started=false;
try {
 execFileSync('docker',['run','--rm','-d','--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','pgvector/pgvector:pg16'],{stdio:'pipe'});started=true;
 assert.equal(execFileSync('docker',['inspect','--format','{{.HostConfig.NetworkMode}}',container],{encoding:'utf8'}).trim(),'none');
 for(let i=0;;i++){try{if(await sql("SELECT current_setting('listen_addresses')")==='')throw new Error('Waiting for final PostgreSQL server');break;}catch(e){if(i===100)throw e;await new Promise(r=>setTimeout(r,100));}}
 await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated;`);
 for(const name of ['20251212124452_183e3a1b-1ce7-4ad2-8dbb-70a84d83a492','20251213142548_7e9c4478-2109-4f16-87b1-4f6a23b79ec3','20251220225804_a0e95db5-205f-42ba-afb7-2dd5f16412a4','20251212113943_64b727ba-fc83-47eb-9a6c-12ef18c454a4','20251115180934_afff8406-1d21-440e-ba6b-35c0cc4852f5'])await sql(migration(name));
 await sql(migration('20251122155759_92f1d8ce-3bf2-4992-ba51-366d73fa76f8').split('-- Migration 2:')[0]);
 await sql(readFileSync(new URL('../docs/operations/private-monthly-beta.sql',import.meta.url),'utf8'));
 for(const name of ['20261013120000_companion_evidence_and_memory','20261015153000_caption_context_revision','20261015195500_companion_answer_revision','20261106093000_quarantine_subtitle_editions','20261106163000_shared_cut_revision','20261105170000_companion_sol_budget','20261113190000_companion_monthly_allowance','20251114214139_cac7e901-0afa-4a2d-9233-df3d7be49a29','20251114215942_67f42c53-f7a7-40eb-9c4c-76f082338a1b','20251126204536_add_pack_tier','20261112160000_smart_list_interpreter','20261113200000_pro_xp_collections','20261114120000_companion_spending_safeguards','20261116100000_private_grant_tier_rollout','20261121150000_game_connection_recheck','20261121170000_daily_skin_rewards','20261122220000_six_card_pack_catalogue','20261124180000_pack_catalogue_v2','20261124190000_random_skin_redemption','20261127120000_xp_collection_strategy'])await sql(migration(name));
 const checks=[];
 const fixture=async xp=>{
  const u=randomUUID();await sql(`INSERT INTO auth.users VALUES(${q(u)}); INSERT INTO cinegeek_xp(user_id,available,lifetime) VALUES(${q(u)},${xp},${xp}); INSERT INTO user_collection(user_id,person_id,person_name,person_type,profile_path) SELECT ${q(u)},i,'Person '||i,'actor','' FROM generate_series(1,6) i;`);
  const cards=JSON.parse(await sql(`SELECT json_agg(id ORDER BY person_id) FROM user_collection WHERE user_id=${q(u)}`));
  const pack=async person=>await sql(`INSERT INTO user_packs(user_id,pack_type,revealed_person) VALUES(${q(u)},'actor',${q(JSON.stringify({id:person,name:`New ${person}`,profile_path:""}))}) RETURNING id;`);
  const decide=(pack,card)=>sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${q(u)}; SELECT decide_cinegeek_pack_v2(${q(pack)},true,${q(card)},450); COMMIT;`);
  const state=async()=>JSON.parse(await sql(`SELECT json_build_object('xp',(SELECT available FROM cinegeek_xp WHERE user_id=${q(u)}),'cards',(SELECT count(*) FROM user_collection WHERE user_id=${q(u)}),'charges',(SELECT count(*) FROM cinegeek_xp_events WHERE user_id=${q(u)}),'opened',(SELECT count(*) FROM user_packs WHERE user_id=${q(u)} AND is_opened));`));
  return {u,cards,pack,decide,state};
 };
 const a=await fixture(450),pack=await a.pack(99);
 const repeats=await Promise.all(Array.from({length:12},()=>a.decide(pack,a.cards[0])));
 assert(repeats.every(r=>r===repeats[0]));assert.deepEqual(await a.state(),{xp:0,cards:6,charges:1,opened:1});checks.push('12 simultaneous retries debit 450 XP once');
 const b=await fixture(450),p1=await b.pack(98),p2=await b.pack(99);
 const races=await Promise.allSettled([b.decide(p1,b.cards[0]),b.decide(p2,b.cards[1])]);
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await b.state(),{xp:0,cards:6,charges:1,opened:1});checks.push('Two replacements cannot overspend the final 450 XP');
 const c=await fixture(900),p3=await c.pack(98),p4=await c.pack(99);
 const stale=await Promise.allSettled([c.decide(p3,c.cards[0]),c.decide(p4,c.cards[0])]);
 assert.equal(stale.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await c.state(),{xp:450,cards:6,charges:1,opened:1});checks.push('Two packs cannot replace the same old card twice');
 const d=await fixture(750);await sql(`INSERT INTO companion_pro_entitlements(user_id,plan,anchor,valid_until,verified_transaction_id) VALUES(${q(d.u)},'monthly',now()-interval '1 day',now()+interval '1 day',${q(randomUUID())});`);
 const skins=await Promise.allSettled(Array.from({length:2},()=>sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${q(d.u)}; SELECT redeem_cinegeek_xp(${q(randomUUID())},'skin:random'); COMMIT;`)));
 assert.equal(skins.filter(r=>r.status==='fulfilled').length,1);assert.equal((await d.state()).xp,0);assert.equal((await d.state()).charges,1);checks.push('Two random-skin requests cannot overspend the final 750 XP');
 console.log(JSON.stringify({passed:true,database:await sql('SHOW server_version'),network:'none',checks},null,2));
} finally {if(started)execFileSync('docker',['stop',container],{stdio:'pipe'});}

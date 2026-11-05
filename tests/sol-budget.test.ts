import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSolBudget } from '../supabase/functions/_shared/sol-budget';

const pg = new PGlite();
beforeAll(async () => {
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await pg.exec(readFileSync(new URL('../supabase/migrations/20261105170000_companion_sol_budget.sql', import.meta.url), 'utf8'));
});
afterAll(() => pg.close());
beforeEach(async () => {
  await pg.exec("DELETE FROM companion_sol_calls; UPDATE companion_sol_budget SET enabled=false,limit_micro_usd=0,committed_micro_usd=0,halted_reason=null;");
});
async function enable(amount = 5000000) {
  await pg.query('UPDATE companion_sol_budget SET enabled=true,limit_micro_usd=$1', [amount]);
}
const state = async () => (await pg.query<{ enabled: boolean; committed: number; halted_reason: string | null }>(
  'SELECT enabled,committed_micro_usd::int AS committed,halted_reason FROM companion_sol_budget')).rows[0];
const budget = () => databaseSolBudget(async (name, args) => {
  // Exercise the real service-role privileges and deployed RPC argument names.
  return pg.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE service_role');
    const keys = Object.keys(args);
    const result = await tx.query<{ value: boolean }>(
      `SELECT ${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) AS value`, Object.values(args));
    return { data: result.rows[0].value, error: null };
  });
}, randomUUID(), randomUUID());

describe('shared paid companion allowance', () => {
  it('starts disabled and unfunded, and cannot be bypassed by funding alone', async () => {
    expect(await budget().reserve(randomUUID(), 100)).toBe(false);
    await pg.exec('UPDATE companion_sol_budget SET limit_micro_usd=5000000');
    expect(await budget().reserve(randomUUID(), 100)).toBe(false);
    expect((await state()).committed).toBe(0);
  });
  it('allocates one allowance across competing users without overspending', async () => {
    await enable(1000);
    const attempts = await Promise.all(Array.from({ length: 10 }, () => budget().reserve(randomUUID(), 300)));
    expect(attempts.filter(Boolean)).toHaveLength(3);
    expect((await state()).committed).toBe(900);
  });
  it('refuses a reused reservation and settles a receipt only once', async () => {
    await enable(1000);
    const store = budget(), id = randomUUID();
    expect(await store.reserve(id, 1000)).toBe(true);
    expect(await store.reserve(id, 1000)).toBe(false);
    await store.settle(id, 150, 'gen-1', null);
    await store.settle(id, 150, 'gen-1', null);
    expect((await state()).committed).toBe(150);
    await expect(store.settle(id, 0, 'gen-1', null)).rejects.toThrow();
    expect(await store.reserve(randomUUID(), 850)).toBe(true);
    expect(await store.reserve(randomUUID(), 1)).toBe(false);
  });
  it('retains unknown costs, halts new requests and has no clock-based reset', async () => {
    await enable(1000);
    const store = budget(), id = randomUUID();
    await store.reserve(id, 500);
    await store.settle(id, null, null, 'transport_error');
    await pg.exec("UPDATE companion_sol_budget SET updated_at=now()-interval '30 days'");
    expect(await state()).toMatchObject({ committed: 500, halted_reason: 'transport_error' });
    expect(await store.reserve(randomUUID(), 1)).toBe(false);
    await expect(store.settle(id, 0, null, null)).rejects.toThrow();
  });
  it('retains a crashed worker reservation and rejects new work when full', async () => {
    await enable(1000);
    await budget().reserve(randomUUID(), 1000);
    expect(await budget().reserve(randomUUID(), 1)).toBe(false);
    expect((await state()).committed).toBe(1000);
  });
  it('records unexpected billing truthfully and halts even if the caller forgot to', async () => {
    await enable(1000);
    const store = budget(), id = randomUUID();
    await store.reserve(id, 500);
    await store.settle(id, 1001, 'gen-2', null);
    expect(await state()).toMatchObject({ committed: 1001, halted_reason: 'cost_exceeded_reservation' });
    expect(await store.reserve(randomUUID(), 1)).toBe(false);
  });
  it('rejects invalid reservations, absent receipts and funding beyond the beta maximum', async () => {
    await enable();
    for (const amount of [-1, 0, 5000001]) await expect(budget().reserve(randomUUID(), amount)).rejects.toThrow();
    await expect(budget().settle(randomUUID(), 0, null, null)).rejects.toThrow();
    await expect(enable(5000001)).rejects.toThrow();
    expect((await state()).committed).toBe(0);
  });
  it('denies client roles both tables and both RPCs; service role cannot fund itself', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const sql of ['SELECT * FROM companion_sol_budget', 'SELECT * FROM companion_sol_calls',
        'UPDATE companion_sol_budget SET enabled=true,limit_micro_usd=5000000',
        `SELECT reserve_companion_sol_call('${randomUUID()}','${randomUUID()}','${randomUUID()}',1)`,
        `SELECT settle_companion_sol_call('${randomUUID()}',0,null,null)`]) {
        await expect(pg.transaction(async tx => { await tx.exec(`SET LOCAL ROLE ${role}`); await tx.exec(sql); })).rejects.toThrow(/permission denied/);
      }
    }
    await expect(pg.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE service_role');
      await tx.exec('UPDATE companion_sol_budget SET enabled=true,limit_micro_usd=5000000');
    })).rejects.toThrow(/permission denied/);
  });
});

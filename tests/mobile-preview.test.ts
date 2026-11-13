import { expect, it, vi } from 'vitest';
import { supabase } from '../src/preview/client';

it('blocks AI and purchase calls without using the network', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    for (const name of ['spoiler-free-companion', 'create-payment-intent', 'actor-connect', 'sort-by-custom-filter']) {
      const result = await supabase.functions.invoke(name);
      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    }
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

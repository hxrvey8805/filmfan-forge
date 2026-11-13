import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { interpretWithFreeModel, listInterpreterHandler } from "../_shared/list-interpreter-service.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(listInterpreterHandler({
  authenticate: async token => {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  reserve: async (userId, hash, callId) => {
    const { data, error } = await admin.rpc("reserve_smart_list_interpretation", { p_user: userId, p_hash: hash, p_call: callId });
    if (error || !data) throw Error("Reservation unavailable");
    return data;
  },
  complete: async (userId, callId, result) => {
    const { error, data } = await admin.from("smart_list_interpretations").update({ result }).eq("id", callId).eq("user_id", userId).is("result", null).select("id").single();
    if (error || !data) throw Error("Cache unavailable");
  },
  interpret: request => interpretWithFreeModel(request, Deno.env.get("OPENROUTER_API_KEY") ?? ""),
}));

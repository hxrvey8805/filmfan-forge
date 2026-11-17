import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import {deleteAccountHandler,recentPasswordAuthentication} from '../_shared/delete-account.ts';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
 {auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(deleteAccountHandler({
 authenticate:async token=>{
  const {data,error}=await admin.auth.getUser(token);
  return error || !data.user ? null : {id:data.user.id,recentlyAuthenticated:recentPasswordAuthentication(token,data.user.id)};
 },
 remove:async id=>{const ready=await admin.rpc('cinegeek_account_privacy_ready');
  if(ready.error||ready.data!=='2026-11-17')return false;
  const {error}=await admin.auth.admin.deleteUser(id,false);return !error;},
}));

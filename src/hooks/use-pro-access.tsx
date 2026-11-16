import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { readProAccess, type ProAccess } from '@/lib/pro-access';
export const ProAccessContext=createContext<ProAccess|null>(null);
export const useProAccess=()=>useContext(ProAccessContext);
export function ProAccessProvider({children}:{children:ReactNode}){
  const [access,setAccess]=useState<ProAccess|null>(null);
  useEffect(()=>{
    let active=true,revision=0;
    async function refresh(){const n=++revision;try {
      const {data:{user}}=await supabase.auth.getUser();
      if(!active||n!==revision)return;
      if(!user){setAccess(null);return;}
      const {data,error}=await supabase.rpc('get_cinegeek_access');
      const next=error?null:readProAccess(data);
      if(active&&n===revision)setAccess(next?.userId===user.id?next:null);
    }catch{if(active&&n===revision)setAccess(null);}}
    void refresh();
    const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{++revision;setAccess(null);queueMicrotask(()=>{if(active)void refresh();});});
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    const timer=window.setInterval(visible,60000);
    window.addEventListener('cinegeek:account-changed',refresh);document.addEventListener('visibilitychange',visible);
    return()=>{active=false;++revision;subscription.unsubscribe();clearInterval(timer);window.removeEventListener('cinegeek:account-changed',refresh);document.removeEventListener('visibilitychange',visible);};
  },[]);
  return <ProAccessContext.Provider value={access}>{children}</ProAccessContext.Provider>;
}

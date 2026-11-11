// Supabase may enforce a 1,000-row response maximum even for a larger limit.
// Page explicitly and fetch one extra row to distinguish truncation from a
// complete corpus. Callers must supply a stable order and title/episode gates.
export async function readPaged<T>(query:{range:(start:number,end:number)=>PromiseLike<{data:T[]|null;error:unknown}>},cap:number) {
  const rows:T[]=[];
  while(rows.length<=cap) {
    const end=Math.min(rows.length+999,cap);
    const result=await query.range(rows.length,end);
    if(result.error)throw result.error;
    const batch=result.data??[];
    if(batch.length>end-rows.length+1)throw Error('Invalid source page');
    const count=end-rows.length+1;
    rows.push(...batch);
    if(batch.length<count)break;
  }
  return {rows:rows.slice(0,cap),incomplete:rows.length>cap};
}

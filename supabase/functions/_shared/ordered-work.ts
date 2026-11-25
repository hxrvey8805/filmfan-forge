// Independent work may finish in any order, but consumers receive the original
// order. On failure, stop admitting work and drain every in-flight operation
// before releasing the request lease (including paid-call settlements).
export async function orderedWork<T,R>(items:readonly T[],limit:number,work:(item:T,index:number)=>Promise<R>):Promise<R[]> {
  const output:R[]=new Array(items.length);
  let next=0,failed=false,firstError:unknown;
  await Promise.all(Array.from({length:Math.min(items.length,Math.max(1,Math.floor(limit)))},async()=>{
    while(!failed && next<items.length) {
      const index=next++;
      try { output[index]=await work(items[index],index); }
      catch(error) { if(!failed){failed=true;firstError=error;} }
    }
  }));
  if(failed)throw firstError;
  return output;
}

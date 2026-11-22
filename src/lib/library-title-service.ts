import { supabase } from '@/integrations/supabase/client';
import { conflictingShelf, shelfConflictMessage, type LibraryShelfId } from './library-shelves';

type LibraryTitle = {id:number;type:'movie'|'tv';title:string;posterPath:string;year?:number};
export class LibraryConflictError extends Error {}

export async function addLibraryTitle(owner:string, title:LibraryTitle, destination:LibraryShelfId) {
  const check = async () => {
    const {data,error} = await supabase.from('user_titles').select('list_type')
      .eq('user_id',owner).eq('title_id',title.id).eq('type',title.type);
    if (error) throw error;
    const conflict = conflictingShelf(destination,(data ?? []).map(row => row.list_type));
    if (conflict) throw new LibraryConflictError(shelfConflictMessage(title.title,conflict,destination));
  };
  // Read current membership, not a potentially stale Home snapshot.
  await check();
  const {error} = await supabase.from('user_titles').insert({user_id:owner,title_id:title.id,
    type:title.type,title:title.title,poster_path:title.posterPath,year:title.year,list_type:destination});
  if (error) {
    if (error.code === '23505') await check(); // Another device added it after the first read.
    throw error;
  }
}

type MoveRpc = (name:'move_cinegeek_library_title',args:{p_title:LibraryTitle;p_destination:LibraryShelfId;p_source:LibraryShelfId|null}) => Promise<{data:unknown;error:unknown}>;
export async function moveLibraryTitle(title:LibraryTitle, destination:LibraryShelfId, source:LibraryShelfId|null) {
  const {data,error} = await (supabase.rpc as unknown as MoveRpc)('move_cinegeek_library_title',{
    p_title:title,p_destination:destination,p_source:source,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') throw Error('The move could not be confirmed.');
  return {id:data.id};
}

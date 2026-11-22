// In-memory design fixtures. Vite aliases this file only when serving the
// explicit mobile-preview mode. It never imports a real client or uses fetch.
import { previewActorConnect } from "./actor-connect";
import {gamePath,verifyGamePath} from "../../supabase/functions/_shared/game-verification";
let samplePlan="free", sampleReward="xp", previewSpinEarned=false, previewSpinUsed=false;
const previewSkins=new Set(['jedi']);
let previewSpinPrize:Record<string,unknown>|null=null;
const previewGames=new Map<string,{start:number;target:number;expires:number;won:boolean}>();
type Row = Record<string, unknown>;
const user = { id: "design-preview-user", email: "filmgeek@example.com", user_metadata: {} as Record<string, unknown> };
try { user.user_metadata = JSON.parse(localStorage.getItem('cinegeek.preview.metadata') ?? '{}'); } catch { /* no saved preview */ }
const session = { user, access_token: "local-preview-only" };
const sessionKey = "cinegeek.preview.signed-in";
type PreviewAuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED";
type AuthListener = (event: PreviewAuthEvent, value: typeof session | null) => void;
const listeners = new Set<AuthListener>();
let memorySignedIn: boolean | undefined;

function currentSession() {
  if (memorySignedIn !== undefined) return memorySignedIn ? session : null;
  try { return localStorage.getItem(sessionKey) === "yes" ? session : null; }
  catch { return null; }
}

function setSignedIn(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(sessionKey, "yes");
    else localStorage.removeItem(sessionKey);
    memorySignedIn = undefined;
  } catch { memorySignedIn = signedIn; }
  for (const listener of listeners) listener(signedIn ? "SIGNED_IN" : "SIGNED_OUT", signedIn ? session : null);
}

// Preview actions only select the sample viewer. No credentials are stored or sent.
async function enterPreview() {
  setSignedIn(true);
  return { data: { session, user }, error: null };
}
const poster = (name: string) => `https://image.tmdb.org/t/p/w500/${name}.jpg`;
const titles = [
  { id: 60574, title: "Peaky Blinders", type: "tv", year: 2013, posterPath: poster("vUUqzWa2LnHIVqkaKVlVGkVcZIW"), list: "watching" },
  { id: 1399, title: "Game of Thrones", type: "tv", year: 2011, posterPath: poster("37sTgAG9QardbdzCq51FoUw1Ijb"), list: "watching" },
  { id: 98, title: "Gladiator", type: "movie", year: 2000, posterPath: poster("ty8TGRuvJLPUmAR1H1nRIsgwvim"), list: "watching" },
  { id: 335984, title: "Blade Runner 2049", type: "movie", year: 2017, posterPath: poster("gajva2L0rPYkEWjzgFlBXCAVBE5"), list: "watchlist" },
  { id: 414906, title: "The Batman", type: "movie", year: 2022, posterPath: poster("74xTEgt7R36Fpooo50r9T25onhq"), list: "watchlist" },
  { id: 37799, title: "The Social Network", type: "movie", year: 2010, posterPath: poster("n0ybibhJtQ5icDqTp8eRytcIHJx"), list: "favourite" },
  { id: 1398, title: "The Sopranos", type: "tv", year: 1999, posterPath: poster("rTc7ZXdroqjkKivFPvCPX0Ru7uw"), list: "watched" },
];
const searchableTitles = [...titles,
  { id: 985, title: "Eraserhead", year: 1977, type: "movie", posterPath: "" },
  { id: 1018, title: "Mulholland Drive", year: 2001, type: "movie", posterPath: "" },
];
const privacyChoices: Record<string,boolean>={};
const tables: Record<string, Row[]> = {
  user_titles: titles.map((t, i) => ({ id: `preview-${i}`, user_id: user.id, title_id: t.id, title: t.title,
    type: t.type, year: t.year, poster_path: t.posterPath, list_type: t.list, progress: null })),
  user_stats: [{ user_id: user.id, coins: 250 }],
  user_ai_usage: [{ user_id: user.id, questions_today: 0, last_reset_date: new Date().toISOString().slice(0, 10) }],
};

function from(table: string) {
  const predicates: ((row: Row) => boolean)[] = [];
  let operation = "select";
  let payload: Row[] = [];
  const execute = () => {
    const all = tables[table] ?? [];
    const matches = (row: Row) => predicates.every(p => p(row));
    let rows = all.filter(matches);
    if (operation === "insert" || operation === "update") {
      rows = operation === "insert" ? payload.map(row => ({ id: crypto.randomUUID(), ...row }))
        : rows.map(row => ({ ...row, ...payload[0] }));
      let next = [...all];
      for (const row of rows) {
        const previous = operation === "update" ? all.find(item => item.id === row.id) : undefined;
        if (table === "user_titles") {
          const sameTitle = (item: Row) => item.user_id === row.user_id && item.type === row.type && item.title_id === row.title_id;
          const conflicts: Record<string,string[]> = {watchlist:['watching','watched','favourite'],
            watching:['watchlist','watched'],watched:['watchlist','watching'],favourite:['watchlist']};
          const conflicting = (item: Row) => sameTitle(item) && item.id !== row.id
            && (conflicts[String(row.list_type)] ?? []).includes(String(item.list_type));
          const priority = ['watching','watched','watchlist','favourite'];
          const other = next.filter(conflicting).sort((a,b) => priority.indexOf(String(a.list_type)) - priority.indexOf(String(b.list_type)))[0];
          if (!previous || !['watchlist','watching'].includes(String(previous.list_type))) row.progress = other?.progress ?? row.progress;
          next = next.filter(item => !conflicting(item));
          if (next.some(item => item.id !== row.id && sameTitle(item) && item.list_type === row.list_type)) {
            return { data: [] as Row[], error: { code: "23505", message: "This title is already in that list." } };
          }
        }
        next = previous ? next.map(item => item.id === row.id ? row : item) : [...next, row];
      }
      tables[table] = next;
    } else if (operation === "delete") tables[table] = all.filter(row => !matches(row));
    return { data: rows, error: null };
  };
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query; },
    lte: (key: string, value: number) => { predicates.push(row => Number(row[key]) <= value); return query; },
    order: () => query,
    limit: () => query,
    insert: (value: Row | Row[]) => { operation = "insert"; payload = Array.isArray(value) ? value : [value]; return query; },
    update: (value: Row) => { operation = "update"; payload = [value]; return query; },
    delete: () => { operation = "delete"; return query; },
    single: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
    maybeSingle: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
    then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
  };
  return query;
}

const unavailable = () => ({ data: null, error: { message: "This design preview does not call live services.",
  context: { json: async () => ({ error: "This is a design preview. Live AI and purchases are turned off; no questions or XP were used." }) } } });

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: currentSession() } }),
    getUser: async () => ({ data: { user: currentSession()?.user ?? null } }),
    onAuthStateChange: (listener: AuthListener) => {
      listeners.add(listener);
      queueMicrotask(() => { if (listeners.has(listener)) listener("INITIAL_SESSION", currentSession()); });
      const sync = (event: StorageEvent) => {
        if (event.key !== sessionKey && event.key !== null) return;
        const value = currentSession();
        listener(value ? "SIGNED_IN" : "SIGNED_OUT", value);
      };
      window.addEventListener("storage", sync);
      return { data: { subscription: { unsubscribe() {
        listeners.delete(listener);
        window.removeEventListener("storage", sync);
      } } } };
    },
    signInWithPassword: enterPreview,
    signUp: async (options: { options?: { data?: Record<string, unknown> } }) => {
      user.user_metadata = { ...options.options?.data };
      tables.user_titles = [];
      try { localStorage.setItem('cinegeek.preview.metadata', JSON.stringify(user.user_metadata)); } catch { /* optional */ }
      return enterPreview();
    },
    updateUser: async ({ data }: { data: Record<string, unknown> }) => {
      user.user_metadata = { ...user.user_metadata, ...data };
      try { localStorage.setItem('cinegeek.preview.metadata', JSON.stringify(user.user_metadata)); } catch { /* optional */ }
      for (const listener of listeners) listener('USER_UPDATED', { ...session, user: { ...user } });
      return { data: { user }, error: null };
    },
    resetPasswordForEmail: async () => ({error:{message:"Preview only"}}),
    signOut: async () => { setSignedIn(false); return { error: null }; },
  },
  from,
  rpc: async (name: string,args:Record<string,unknown>={}) => {
    // Local design samples only. Never sets a live entitlement or calls a provider.
    const selected=new URLSearchParams(window.location.search).get('samplePlan');
    if(selected==='free'||selected==='monthly'||selected==='annual')samplePlan=selected;
    if(new URLSearchParams(window.location.search).get('sampleReward')==='skin')sampleReward='skin';
    const plan=samplePlan;
    if(name==='get_cinegeek_access')return {data:{userId:user.id,plan,purchasesEnabled:false,smartLists:plan!=='free',focusGeek:true,
      allSkins:plan==='annual',unlockedSkins:plan==='monthly'?[...previewSkins]:[],badges:[],gamesRemaining:plan==='free'?1:null,
      xp:750,lifetimeXp:1250,xpToday:75,xpDailyCap:225,spinAvailable:plan!=='free'&&previewSpinEarned&&!previewSpinUsed,expiresAt:plan==='free'?null:'2027-01-01T00:00:00Z'},error:null};
    if(name==='get_ai_privacy_choices')return {data:{...privacyChoices},error:null};
    if(name==='set_ai_privacy_choice'){privacyChoices[String(args.p_feature)]=args.p_allowed===true;return {data:{...privacyChoices},error:null};}
    if(name==='get_companion_allowance')return {data:{mode:'monthly',plan,included:plan==='free'?0:15,limit:plan==='free'?0:15,purchased:0,renewsAt:plan==='free'?null:'2026-12-13T00:00:00Z'},error:null};
    if(name==='start_cinegeek_game'){
      const game={start:Number(args.p_start),target:Number(args.p_target),expires:Date.now()+120000,won:false};previewGames.set(String(args.p_game),game);
      return {data:{id:args.p_game,status:'playing',expires_at:new Date(game.expires).toISOString()},error:null};
    }
    if(name==='spin_cinegeek_reward'||name==='spin_cinegeek_reward_v2'){
      if(plan==='free'||!previewSpinEarned)return unavailable();
      if(!previewSpinPrize){
        previewSpinPrize=sampleReward==='skin'
          ? plan==='monthly'?{kind:'skin',skin:'spider'}:{kind:'badge',badge:'film_buff'}
          :{kind:'xp',xp:25};
        if(previewSpinPrize.kind==='skin')previewSkins.add(String(previewSpinPrize.skin));
      }
      previewSpinUsed=true;return {data:previewSpinPrize,error:null};
    }
    if(name==='end_cinegeek_game')return {data:null,error:null};
    return unavailable();
  },
  functions: {
    invoke: async (name: string, options: { body?: Record<string, unknown> } = {}) => {
      const body = options.body ?? {};
      if (name === 'game-result') {
        const game=previewGames.get(String(body.gameId));if(!game)return unavailable();
        if(game.won)return {data:{won:true,xp:75},error:null};
        if(Date.now()>game.expires)return {data:{code:'game_expired',error:'Game has ended'},error:null};
        const path=gamePath(body.path,game.start,game.target);
        const won=!!path&&await verifyGamePath(path,async(type,id)=>{
          const result=previewActorConnect(type==='movie'?{action:'getMovieCast',movieId:id}:{action:'getTVCast',tvId:id});
          return ('cast' in (result??{})?result?.cast:[])?.map(person=>person.id)??[];
        });
        if(won){game.won=true;previewSpinEarned=true;}
        return {data:{won,xp:won?75:0},error:null};
      }
      if (name === "actor-connect") {
        const data = previewActorConnect(body);
        return data ? { data, error: null } : unavailable();
      }
      if (name === "search-content") {
        if (typeof body.query === "string") return { data: { results: searchableTitles.filter(t => t.title.toLowerCase().includes(String(body.query).toLowerCase())) }, error: null };
        if (body.movieId) return { data: { runtime: 155 }, error: null };
        if (body.episodeNumber) return { data: { runtime: 60 }, error: null };
        if (body.season) return { data: { episodes: Array.from({ length: 6 }, (_, i) => ({ episodeNumber: i + 1, name: `Episode ${i + 1}` })) }, error: null };
        return { data: { seasons: [1, 2, 3].map(n => ({ seasonNumber: n, name: `Season ${n}` })) }, error: null };
      }
      return unavailable();
    },
  },
};

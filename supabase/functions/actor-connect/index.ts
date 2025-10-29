import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, actorId, movieId, tvId } = await req.json();
    
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY is not configured');
    }

    // Get 2 random popular actors
    if (action === 'getRandomActors') {
      const randomPage = Math.floor(Math.random() * 20) + 1;
      const response = await fetch(
        `https://api.themoviedb.org/3/person/popular?api_key=${TMDB_API_KEY}&page=${randomPage}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch actors');
      }

      const data = await response.json();
      // Filter for Hollywood actors (English-language productions)
      const actors = data.results
        .filter((actor: any) => {
          const isActor = actor.known_for_department === 'Acting' && actor.profile_path;
          // Check if they have English-language films in their known_for
          const hasEnglishContent = actor.known_for?.some((item: any) => 
            item.original_language === 'en'
          );
          return isActor && hasEnglishContent;
        })
        .slice(0, 20);
      
      // Pick 2 random actors from the results
      const shuffled = actors.sort(() => 0.5 - Math.random());
      const selectedActors = shuffled.slice(0, 2).map((actor: any) => ({
        id: actor.id,
        name: actor.name,
        profilePath: actor.profile_path
      }));

      return new Response(
        JSON.stringify({ actors: selectedActors }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get actor's filmography
    if (action === 'getActorFilmography' && actorId) {
      const response = await fetch(
        `https://api.themoviedb.org/3/person/${actorId}/combined_credits?api_key=${TMDB_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch actor filmography');
      }

      const data = await response.json();
      
      // Combine movies and TV shows
      const rawCredits = [...data.cast, ...data.crew].filter((item: any) => item.poster_path);

      // Filter out talk/news/reality/game-show style TV entries and dedupe
      const TALK_GENRES = new Set([10767, 10763, 10764, 10766]);
      const TALK_TITLE_RE = /(Tonight|Talk|Late|Kimmel|Norton|Clarkson|Ellen|View|Awards|Wetten|Parkinson|Skavlan|Golden\s?Globes?|Oscars?)/i;

      const dedup = new Map<string, any>();
      for (const item of rawCredits) {
        const isTalkLike = item.media_type === 'tv' && (
          (Array.isArray(item.genre_ids) && item.genre_ids.some((id: number) => TALK_GENRES.has(id))) ||
          TALK_TITLE_RE.test(item.name || item.title || '')
        );
        if (isTalkLike) continue;
        const key = `${item.media_type}-${item.id}`;
        if (!dedup.has(key)) dedup.set(key, item);
      }

      const filteredSorted = Array.from(dedup.values()).sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));

      const credits = filteredSorted.map((item: any) => ({
        id: item.id,
        title: item.title || item.name,
        type: item.media_type,
        year: (item.release_date || item.first_air_date)?.split('-')[0],
        posterPath: item.poster_path,
        character: item.character,
        popularity: item.popularity || 0,
        voteCount: item.vote_count || 0,
      }));

      return new Response(
        JSON.stringify({ credits }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get movie cast
    if (action === 'getMovieCast' && movieId) {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${TMDB_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch movie cast');
      }

      const data = await response.json();
      const cast = data.cast
        .filter((actor: any) => actor.profile_path)
        .map((actor: any) => ({
          id: actor.id,
          name: actor.name,
          character: actor.character,
          profilePath: actor.profile_path
        }));

      return new Response(
        JSON.stringify({ cast }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get TV show cast
    if (action === 'getTVCast' && tvId) {
      const response = await fetch(
        `https://api.themoviedb.org/3/tv/${tvId}/credits?api_key=${TMDB_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch TV show cast');
      }

      const data = await response.json();
      const cast = data.cast
        .filter((actor: any) => actor.profile_path)
        .map((actor: any) => ({
          id: actor.id,
          name: actor.name,
          character: actor.character,
          profilePath: actor.profile_path
        }));

      return new Response(
        JSON.stringify({ cast }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in actor-connect:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
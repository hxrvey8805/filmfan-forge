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
      
      // Use ACTING (cast) credits only, keep only movie/TV with posters
      const rawCredits = (data.cast || []).filter((item: any) => item.poster_path && (item.media_type === 'movie' || item.media_type === 'tv'));

      // Exclusions: talk/news/reality/etc., documentaries, behind-the-scenes, featurettes, promos, interviews, and 'Self' appearances
      const EXCLUDED_TV_GENRES = new Set([99, 10762, 10763, 10764, 10766, 10767]); // Documentary, Kids, News, Reality, Soap, Talk
      const EXCLUDED_MOVIE_GENRES = new Set([99]); // Documentary
      const EXCLUDED_TITLE_RE = /(Behind the Scenes|Making[- ]?of|Featurette|Interview|Press|Promo|Teaser|Clip|Bloopers|Outtakes|Awards?|Red Carpet|Special|Variety|Studio: Actors on Actors)/i;
      const EXCLUDED_TALK_TITLE_RE = /(Tonight|Talk|Late|Kimmel|Norton|Clarkson|Ellen|View|Wetten|Parkinson|Skavlan|Golden\s?Globes?|Oscars?|Graham Norton|Kelly Clarkson|Jimmy Kimmel|The Tonight Show|The View|Live!)/i;

      const dedup = new Map<string, any>();
      for (const item of rawCredits) {
        // Exclude 'video' only items
        if (item.media_type === 'movie' && item.video === true) continue;

        // Exclude documentaries and talk/news/etc.
        if (Array.isArray(item.genre_ids)) {
          if (item.media_type === 'tv' && item.genre_ids.some((id: number) => EXCLUDED_TV_GENRES.has(id))) continue;
          if (item.media_type === 'movie' && item.genre_ids.some((id: number) => EXCLUDED_MOVIE_GENRES.has(id))) continue;
        }

        const title = (item.title || item.name || '') as string;
        const character = (item.character || '') as string;
        if (EXCLUDED_TITLE_RE.test(title) || EXCLUDED_TALK_TITLE_RE.test(title)) continue;
        if (/\bself\b|himself|herself/i.test(character)) continue;

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
      // Filter for actors with photos and sort by order (main cast first)
      // TMDB returns cast in order of importance - lower order = main cast
      const cast = data.cast
        .filter((actor: any) => actor.profile_path) // Only actors with photos
        .map((actor: any) => ({
          id: actor.id,
          name: actor.name,
          character: actor.character,
          profilePath: actor.profile_path,
          order: actor.order || 999 // Lower order = main cast, default to 999 if missing
        }))
        .sort((a: any, b: any) => a.order - b.order); // Sort by order ascending

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
      // Filter for actors with photos and sort by order (main cast first)
      // TMDB returns cast in order of importance - lower order = main cast
      const cast = data.cast
        .filter((actor: any) => actor.profile_path) // Only actors with photos
        .map((actor: any) => ({
          id: actor.id,
          name: actor.name,
          character: actor.character,
          profilePath: actor.profile_path,
          order: actor.order || 999 // Lower order = main cast, default to 999 if missing
        }))
        .sort((a: any, b: any) => a.order - b.order); // Sort by order ascending

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
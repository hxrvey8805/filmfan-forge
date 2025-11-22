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
      
      // Ensure cast array exists
      if (!data.cast || !Array.isArray(data.cast)) {
        console.error(`Movie ${movieId}: Invalid cast data`, data);
        return new Response(
          JSON.stringify({ cast: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Log detailed info about what TMDB returned
      const totalCast = data.cast.length;
      const withPhotos = data.cast.filter((a: any) => a.profile_path).length;
      const withoutPhotos = totalCast - withPhotos;
      
      console.log(`Movie ${movieId}: TMDB returned ${totalCast} total cast members`);
      console.log(`Movie ${movieId}: ${withPhotos} have photos, ${withoutPhotos} missing photos`);
      
      // Log first 10 cast member IDs and names for debugging
      if (data.cast.length > 0) {
        console.log(`Movie ${movieId}: Sample cast (first 10):`, 
          data.cast.slice(0, 10).map((a: any) => ({
            id: a.id,
            name: a.name,
            hasPhoto: !!a.profile_path,
            order: a.order
          }))
        );
      }
      
      // Filter for actors with photos and sort by order (main cast first)
      // TMDB returns cast in order of importance - lower order = main cast
      // IMPORTANT: We filter by profile_path to ensure only actors with photos are shown
      const cast = data.cast
        .filter((actor: any) => {
          if (!actor.profile_path) {
            console.log(`Movie ${movieId}: Filtering out ${actor.name} (ID: ${actor.id}) - no photo`);
            return false;
          }
          return true;
        })
        .map((actor: any) => ({
          id: actor.id,
          name: actor.name,
          character: actor.character,
          profilePath: actor.profile_path,
          order: actor.order || 999 // Lower order = main cast, default to 999 if missing
        }))
        .sort((a: any, b: any) => a.order - b.order); // Sort by order ascending

      console.log(`Movie ${movieId}: Returning ${cast.length} cast members with photos`);
      console.log(`Movie ${movieId}: Cast IDs:`, cast.map((c: any) => c.id).slice(0, 20));
      
      return new Response(
        JSON.stringify({ cast }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get TV show cast
    if (action === 'getTVCast' && tvId) {
      // Try both aggregate_credits (all seasons) and regular credits (main cast) to ensure we get everyone
      // aggregate_credits includes all cast across all seasons/episodes
      // regular credits might have different cast members
      const [aggregateResponse, creditsResponse] = await Promise.allSettled([
        fetch(`https://api.themoviedb.org/3/tv/${tvId}/aggregate_credits?api_key=${TMDB_API_KEY}`),
        fetch(`https://api.themoviedb.org/3/tv/${tvId}/credits?api_key=${TMDB_API_KEY}`)
      ]);

      let aggregateData: any = null;
      let creditsData: any = null;

      if (aggregateResponse.status === 'fulfilled' && aggregateResponse.value.ok) {
        aggregateData = await aggregateResponse.value.json();
      } else {
        console.warn(`TV ${tvId}: Failed to fetch aggregate_credits`);
      }

      if (creditsResponse.status === 'fulfilled' && creditsResponse.value.ok) {
        creditsData = await creditsResponse.value.json();
      } else {
        console.warn(`TV ${tvId}: Failed to fetch credits`);
      }

      // Merge cast from both endpoints, prioritizing aggregate_credits
      const castMap = new Map<number, any>();

      // First, add all from aggregate_credits (most comprehensive)
      if (aggregateData?.cast && Array.isArray(aggregateData.cast)) {
        console.log(`TV ${tvId}: aggregate_credits returned ${aggregateData.cast.length} cast members`);
        aggregateData.cast.forEach((actor: any) => {
          if (actor.profile_path) {
            const primaryRole = actor.roles && actor.roles.length > 0
              ? actor.roles.sort((a: any, b: any) => (b.episode_count || 0) - (a.episode_count || 0))[0]
              : null;
            
            castMap.set(actor.id, {
              id: actor.id,
              name: actor.name,
              character: primaryRole?.character || actor.character || 'Unknown',
              profilePath: actor.profile_path,
              order: primaryRole?.order ?? actor.order ?? 999,
              episodeCount: primaryRole?.episode_count || actor.episode_count || 0,
              source: 'aggregate'
            });
          }
        });
      }

      // Then, add any from regular credits that aren't already in the map
      if (creditsData?.cast && Array.isArray(creditsData.cast)) {
        console.log(`TV ${tvId}: credits returned ${creditsData.cast.length} cast members`);
        creditsData.cast.forEach((actor: any) => {
          if (actor.profile_path && !castMap.has(actor.id)) {
            castMap.set(actor.id, {
              id: actor.id,
              name: actor.name,
              character: actor.character || 'Unknown',
              profilePath: actor.profile_path,
              order: actor.order ?? 999,
              episodeCount: 0,
              source: 'credits'
            });
          }
        });
      }

      // Convert map to array and sort
      const cast = Array.from(castMap.values()).sort((a: any, b: any) => {
        if (a.order !== b.order) return a.order - b.order;
        return (b.episodeCount || 0) - (a.episodeCount || 0);
      });

      console.log(`TV ${tvId}: Merged ${cast.length} unique cast members with photos`);
      console.log(`TV ${tvId}: From aggregate_credits: ${cast.filter((c: any) => c.source === 'aggregate').length}`);
      console.log(`TV ${tvId}: From credits: ${cast.filter((c: any) => c.source === 'credits').length}`);
      console.log(`TV ${tvId}: Cast IDs:`, cast.map((c: any) => c.id).slice(0, 20));

      // Remove source field before returning
      const finalCast = cast.map(({ source, ...rest }) => rest);
      
      return new Response(
        JSON.stringify({ cast: finalCast }),
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
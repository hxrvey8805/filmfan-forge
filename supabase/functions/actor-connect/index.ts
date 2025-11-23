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

      // More inclusive filtering - only exclude documentaries, talk shows, and behind-the-scenes content
      const EXCLUDED_TV_GENRES = new Set([99, 10763, 10764, 10767]); // Documentary, News, Reality, Talk
      const EXCLUDED_MOVIE_GENRES = new Set([99]); // Documentary
      const EXCLUDED_TITLE_RE = /(Behind the Scenes|Making[- ]?of|Featurette|Interview|Press|Promo|Teaser|Clip|Bloopers|Outtakes|Red Carpet)/i;
      const EXCLUDED_TALK_TITLE_RE = /(Tonight Show|Talk Show|Late Show|Kimmel|Norton|Ellen|Graham Norton|Kelly Clarkson|Jimmy Kimmel|The View|Live with)/i;

      const dedup = new Map<string, any>();
      for (const item of rawCredits) {
        // Exclude 'video' only items (direct-to-video releases)
        if (item.media_type === 'movie' && item.video === true) continue;

        // Exclude documentaries and talk/news/reality shows
        if (Array.isArray(item.genre_ids)) {
          if (item.media_type === 'tv' && item.genre_ids.some((id: number) => EXCLUDED_TV_GENRES.has(id))) continue;
          if (item.media_type === 'movie' && item.genre_ids.some((id: number) => EXCLUDED_MOVIE_GENRES.has(id))) continue;
        }

        const title = (item.title || item.name || '') as string;
        const character = (item.character || '') as string;
        
        // Only exclude if it's clearly BTS/promotional content
        if (EXCLUDED_TITLE_RE.test(title)) continue;
        
        // Only exclude talk shows where they appear as "Self"
        if (EXCLUDED_TALK_TITLE_RE.test(title) && /\bself\b|himself|herself/i.test(character)) continue;

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
      // Try aggregate_credits first (includes all seasons)
      let aggregateResponse = await fetch(
        `https://api.themoviedb.org/3/tv/${tvId}/aggregate_credits?api_key=${TMDB_API_KEY}`
      );
      
      // If aggregate fails, fall back to regular credits
      let regularResponse = await fetch(
        `https://api.themoviedb.org/3/tv/${tvId}/credits?api_key=${TMDB_API_KEY}`
      );
      
      if (!aggregateResponse.ok && !regularResponse.ok) {
        throw new Error(`Failed to fetch TV show cast: ${aggregateResponse.status}`);
      }

      // Use whichever endpoint returned more cast members with photos
      const aggregateData = aggregateResponse.ok ? await aggregateResponse.json() : { cast: [] };
      const regularData = regularResponse.ok ? await regularResponse.json() : { cast: [] };
      
      console.log(`TV ${tvId}: Aggregate credits returned ${aggregateData.cast?.length || 0} cast members`);
      console.log(`TV ${tvId}: Regular credits returned ${regularData.cast?.length || 0} cast members`);
      
      // Choose the data source with more cast members
      const useAggregate = (aggregateData.cast?.length || 0) >= (regularData.cast?.length || 0);
      const data = useAggregate ? aggregateData : regularData;
      console.log(`TV ${tvId}: Using ${useAggregate ? 'aggregate' : 'regular'} credits`);
      
      // Ensure cast array exists
      if (!data.cast || !Array.isArray(data.cast)) {
        console.error(`TV ${tvId}: Invalid cast data structure:`, data);
        return new Response(
          JSON.stringify({ cast: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Log detailed info about what TMDB returned
      const totalCast = data.cast.length;
      const withPhotos = data.cast.filter((a: any) => a.profile_path).length;
      const withoutPhotos = totalCast - withPhotos;
      
      console.log(`TV ${tvId}: TMDB returned ${totalCast} total cast members`);
      console.log(`TV ${tvId}: ${withPhotos} have photos, ${withoutPhotos} missing photos`);
      
      // Log sample of first 30 cast members to see structure
      if (data.cast.length > 0) {
        console.log(`TV ${tvId}: First 30 cast members:`, 
          data.cast.slice(0, 30).map((a: any) => ({
            id: a.id,
            name: a.name,
            hasPhoto: !!a.profile_path,
            hasRoles: !!a.roles,
            rolesCount: a.roles?.length || 0,
            order: a.order,
            episodeCount: a.episode_count,
            character: a.character
          }))
        );
      }
      
      // Process all cast members with photos
      // Handle both aggregate format (with roles array) and regular format
      const cast = data.cast
        .filter((actor: any) => {
          const hasPhoto = !!actor.profile_path;
          if (!hasPhoto) {
            console.log(`TV ${tvId}: Filtering out ${actor.name} (ID: ${actor.id}) - no photo`);
          }
          return hasPhoto;
        })
        .map((actor: any) => {
          // Handle aggregate_credits format (with roles array)
          if (actor.roles && Array.isArray(actor.roles) && actor.roles.length > 0) {
            // Get the most prominent role (role with most episodes, then by order)
            const primaryRole = [...actor.roles].sort((a: any, b: any) => {
              const epDiff = (b.episode_count || 0) - (a.episode_count || 0);
              if (epDiff !== 0) return epDiff;
              return (a.order ?? 999) - (b.order ?? 999);
            })[0];
            
            return {
              id: actor.id,
              name: actor.name,
              character: primaryRole?.character || actor.character || 'Unknown',
              profilePath: actor.profile_path,
              order: primaryRole?.order ?? actor.order ?? 999,
              episodeCount: primaryRole?.episode_count || actor.episode_count || 0
            };
          }
          
          // Handle regular credits format
          return {
            id: actor.id,
            name: actor.name,
            character: actor.character || 'Unknown',
            profilePath: actor.profile_path,
            order: actor.order ?? 999,
            episodeCount: actor.episode_count || 0
          };
        })
        .sort((a: any, b: any) => {
          // Sort by order first (main cast), then by episode count (more episodes = more prominent)
          if (a.order !== b.order) return a.order - b.order;
          return (b.episodeCount || 0) - (a.episodeCount || 0);
        });

      console.log(`TV ${tvId}: Processed ${cast.length} cast members with photos`);
      console.log(`TV ${tvId}: Final cast IDs (first 30):`, cast.map((c: any) => `${c.id}:${c.name}`).slice(0, 30));
      
      // If we got very few cast members, log a warning
      if (cast.length < 5 && totalCast > 10) {
        console.warn(`TV ${tvId}: WARNING - Only ${cast.length} cast members with photos out of ${totalCast} total. This seems low.`);
      }
      
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
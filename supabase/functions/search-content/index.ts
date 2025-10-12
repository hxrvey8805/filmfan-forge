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
    const { query, tvId, season } = await req.json();
    
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY is not configured');
    }

    // Fetch TV show seasons
    if (tvId && !season) {
      console.log('Fetching seasons for TV show:', tvId);
      const response = await fetch(`https://api.themoviedb.org/3/tv/${tvId}?api_key=${TMDB_API_KEY}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch TV show details');
      }
      
      const data = await response.json();
      const seasons = data.seasons
        .filter((s: any) => s.season_number > 0) // Exclude specials
        .map((s: any) => ({
          seasonNumber: s.season_number,
          name: s.name,
          episodeCount: s.episode_count
        }));

      return new Response(
        JSON.stringify({ seasons }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch episodes for a season
    if (tvId && season) {
      console.log('Fetching episodes for TV show:', tvId, 'season:', season);
      const response = await fetch(`https://api.themoviedb.org/3/tv/${tvId}/season/${season}?api_key=${TMDB_API_KEY}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch season episodes');
      }
      
      const data = await response.json();
      const episodes = data.episodes.map((ep: any) => ({
        episodeNumber: ep.episode_number,
        name: ep.name,
        runtime: ep.runtime || 0
      }));

      return new Response(
        JSON.stringify({ episodes }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search content
    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching TMDB for:', query);

    // Search both movies and TV shows
    const [moviesResponse, tvResponse] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`),
      fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`)
    ]);

    if (!moviesResponse.ok || !tvResponse.ok) {
      throw new Error('TMDB API request failed');
    }

    const moviesData = await moviesResponse.json();
    const tvData = await tvResponse.json();

    // Format results
    const movies = moviesData.results.slice(0, 10).map((movie: any) => ({
      title: movie.title,
      type: 'movie',
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
      id: movie.id
    }));

    const tvShows = tvData.results.slice(0, 10).map((show: any) => ({
      title: show.name,
      type: 'tv',
      year: show.first_air_date ? new Date(show.first_air_date).getFullYear() : null,
      id: show.id,
      seasons: show.number_of_seasons
    }));

    // Combine and sort by relevance (TMDB provides them sorted)
    const results = [...movies, ...tvShows].slice(0, 15);

    console.log(`Found ${results.length} results`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-content:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Search failed',
        results: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

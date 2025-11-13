import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");

interface Title {
  id: number;
  title: string;
  type: "movie" | "tv";
  posterPath: string;
  year?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { titles, criteria, inspirationType } = await req.json();

    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No titles provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch metadata for all titles from TMDb
    const titlesWithMetadata = await Promise.all(
      titles.map(async (title: Title) => {
        try {
          const endpoint = title.type === "movie" ? "movie" : "tv";
          const response = await fetch(
            `https://api.themoviedb.org/3/${endpoint}/${title.id}?api_key=${TMDB_API_KEY}&append_to_response=credits`
          );
          
          if (!response.ok) {
            return { ...title, metadata: null };
          }

          const data = await response.json();
          
          return {
            ...title,
            metadata: {
              genres: data.genres?.map((g: any) => g.name) || [],
              directors: data.credits?.crew?.filter((c: any) => c.job === "Director").map((d: any) => d.name) || [],
              cast: data.credits?.cast?.slice(0, 5).map((a: any) => a.name) || [],
              overview: data.overview || "",
              vote_average: data.vote_average || 0,
              release_date: data.release_date || data.first_air_date || "",
            }
          };
        } catch (error) {
          console.error(`Error fetching metadata for ${title.title}:`, error);
          return { ...title, metadata: null };
        }
      })
    );

    // Use AI to sort titles based on custom criteria
    const prompt = `You are a movie/TV show sorting assistant. Given a list of titles with their metadata and a user's custom filter criteria, rank the titles from most relevant to least relevant based on that criteria.

Filter Type: ${inspirationType}
Filter Criteria: ${criteria}

Titles to sort:
${titlesWithMetadata.map((t, idx) => `
${idx + 1}. "${t.title}" (${t.year || 'N/A'})
   Type: ${t.type}
   ${t.metadata ? `
   Genres: ${t.metadata.genres.join(", ") || "Unknown"}
   Directors: ${t.metadata.directors.join(", ") || "Unknown"}
   Cast: ${t.metadata.cast.join(", ") || "Unknown"}
   Rating: ${t.metadata.vote_average}/10
   Overview: ${t.metadata.overview.substring(0, 200)}...
   ` : "Metadata unavailable"}
`).join("\n")}

Return ONLY a JSON array of title IDs in order from most to least relevant to the criteria "${criteria}". 
Example format: [3, 1, 5, 2, 4]

Consider:
- How well each title matches the ${inspirationType} criteria
- Relevance and quality
- If metadata is missing, place those titles at the end

Respond with ONLY the JSON array, no other text.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error("Failed to sort titles using AI");
    }

    const aiData = await aiResponse.json();
    const sortedIdsText = aiData.choices[0].message.content.trim();
    
    // Parse the AI response to extract the sorted IDs
    let sortedIds: number[];
    try {
      sortedIds = JSON.parse(sortedIdsText);
    } catch (error) {
      console.error("Failed to parse AI response:", sortedIdsText);
      // Fallback: return original order
      sortedIds = titles.map((t: Title) => t.id);
    }

    // Sort titles based on AI's ranking
    const sortedTitles = sortedIds
      .map(id => titles.find((t: Title) => t.id === id))
      .filter(Boolean);

    // Add any titles that weren't in the AI response
    const missingTitles = titles.filter((t: Title) => !sortedIds.includes(t.id));
    const finalSortedTitles = [...sortedTitles, ...missingTitles];

    return new Response(
      JSON.stringify({ sortedTitles: finalSortedTitles }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in sort-by-custom-filter:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

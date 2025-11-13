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
  console.log("=== Edge function invoked ===");
  
  if (req.method === "OPTIONS") {
    console.log("OPTIONS request, returning CORS headers");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Parsing request body...");
    const { titles, criteria, inspirationType } = await req.json();
    console.log(`Received: ${titles?.length || 0} titles, criteria: "${criteria}", type: "${inspirationType}"`);

    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      console.error("Invalid titles array");
      return new Response(
        JSON.stringify({ error: "No titles provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log("Titles to sort:", titles.map(t => t.title).join(", "));

    // Fetch metadata for all titles from TMDb
    console.log("Fetching metadata from TMDb...");
    const titlesWithMetadata = await Promise.all(
      titles.map(async (title: Title) => {
        try {
          const endpoint = title.type === "movie" ? "movie" : "tv";
          console.log(`Fetching metadata for: ${title.title} (${endpoint}/${title.id})`);
          
          const response = await fetch(
            `https://api.themoviedb.org/3/${endpoint}/${title.id}?api_key=${TMDB_API_KEY}&append_to_response=credits`
          );
          
          if (!response.ok) {
            console.warn(`Failed to fetch metadata for ${title.title}: ${response.status}`);
            return { ...title, metadata: null };
          }

          const data = await response.json();
          console.log(`Got metadata for ${title.title}: ${data.genres?.length || 0} genres, ${data.credits?.crew?.length || 0} crew`);
          
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
    
    console.log("Metadata fetched for all titles");

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

    console.log("Calling Lovable AI for sorting...");
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
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`Failed to sort titles using AI: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");
    const sortedIdsText = aiData.choices[0].message.content.trim();
    console.log("AI returned:", sortedIdsText);
    
    // Parse the AI response to extract the sorted IDs
    let sortedIds: number[];
    try {
      // Try to extract JSON array from the response
      const jsonMatch = sortedIdsText.match(/\[[\d,\s]+\]/);
      if (jsonMatch) {
        sortedIds = JSON.parse(jsonMatch[0]);
        console.log("Parsed sorted IDs:", sortedIds);
      } else {
        throw new Error("No JSON array found in AI response");
      }
    } catch (error) {
      console.error("Failed to parse AI response:", sortedIdsText, error);
      // Fallback: return original order
      sortedIds = titles.map((t: Title) => t.id);
      console.log("Using fallback: original order");
    }

    // Sort titles based on AI's ranking
    console.log("Mapping IDs to titles...");
    const sortedTitles = sortedIds
      .map(id => titles.find((t: Title) => t.id === id))
      .filter(Boolean);

    // Add any titles that weren't in the AI response
    const missingTitles = titles.filter((t: Title) => !sortedIds.includes(t.id));
    if (missingTitles.length > 0) {
      console.log(`Adding ${missingTitles.length} missing titles to the end`);
    }
    const finalSortedTitles = [...sortedTitles, ...missingTitles];
    
    console.log(`Returning ${finalSortedTitles.length} sorted titles`);
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

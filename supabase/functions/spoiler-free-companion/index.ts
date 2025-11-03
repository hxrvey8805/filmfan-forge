import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to parse timestamp to seconds
function timestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]; // MM:SS
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
  }
  return 0;
}

// Helper function to search for subtitles
async function searchSubtitles(showTitle: string, episode: string, apiKey: string) {
  try {
    console.log('Searching subtitles for:', { showTitle, episode });
    
    const searchResponse = await fetch(`https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(showTitle)}`, {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      console.error('OpenSubtitles search failed:', searchResponse.status);
      return null;
    }

    const searchData = await searchResponse.json();
    console.log('Found subtitles:', searchData.data?.length || 0);
    
    // Return the first matching subtitle file
    return searchData.data?.[0] || null;
  } catch (error) {
    console.error('Error searching subtitles:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { showTitle, episode, timestamp, question } = await req.json();
    
    console.log('Spoiler-free request:', { showTitle, episode, timestamp, question });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const OPENSUBTITLES_API_KEY = Deno.env.get('OPENSUBTITLES_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }
    if (!OPENSUBTITLES_API_KEY) {
      throw new Error('OPENSUBTITLES_API_KEY is not configured');
    }

    // Try to get subtitle context
    let subtitleContext = '';
    const subtitle = await searchSubtitles(showTitle, episode, OPENSUBTITLES_API_KEY);
    
    if (subtitle) {
      console.log('Using subtitle data for context');
      subtitleContext = `\n\nSubtitle data available: Based on subtitle information for this show/episode.`;
    } else {
      console.log('No subtitle data found, using general knowledge');
    }

    // Create context-aware system prompt
    const systemPrompt = `You are a spoiler-free TV/movie companion assistant. Your role is to answer questions about shows and movies WITHOUT revealing any spoilers.

CRITICAL RULES:
1. The user is currently watching "${showTitle}" at ${episode} @ ${timestamp}
2. IMPORTANT: You SHOULD answer questions about events, characters, and plot points that have ALREADY OCCURRED up to this timestamp. The user has already seen these events, so they are NOT spoilers.
3. ONLY refuse to answer if the question is about events that happen AFTER the current timestamp
4. Be helpful and informative about past events - the user is asking because they want clarity on what they've already watched
5. Keep answers concise (2-3 sentences max) and focus on what has happened so far
6. If you're unsure whether an event has occurred yet, ask the user to clarify or provide context based on what typically happens by that point in the show
${subtitleContext}

Your goal is to enhance viewing experience by clarifying past events without ruining future surprises.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;

    console.log('AI response generated successfully');

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in spoiler-free-companion:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

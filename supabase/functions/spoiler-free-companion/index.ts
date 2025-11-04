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

// Helper function to parse episode string (e.g., "S1E3" or "Season 1 Episode 3")
function parseEpisode(episode: string): { season: number; episode: number } | null {
  // Try "S1E3" format
  let match = episode.match(/S(\d+)E(\d+)/i);
  if (match) {
    return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  }
  
  // Try "Season 1 Episode 3" format
  match = episode.match(/Season\s+(\d+)\s+Episode\s+(\d+)/i);
  if (match) {
    return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  }
  
  return null;
}

// Helper function to search and download subtitles
async function getSubtitleContext(showTitle: string, episode: string, timestamp: string, apiKey: string) {
  try {
    const episodeInfo = parseEpisode(episode);
    const currentSeconds = timestampToSeconds(timestamp);
    
    console.log('Searching subtitles for:', { showTitle, episode, episodeInfo, currentSeconds });
    
    // Search for subtitles
    let searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(showTitle)}&languages=en&order_by=download_count&order_direction=desc`;
    if (episodeInfo) {
      searchUrl += `&season_number=${episodeInfo.season}&episode_number=${episodeInfo.episode}&type=episode`;
    }
    
    const searchResponse = await fetch(searchUrl, {
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
    
    const results: any[] = searchData.data || [];
    if (results.length === 0) {
      return null;
    }

    // Stronger matching: exact title match > partial includes > season/episode only.
    const norm = (s: string | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const target = norm(showTitle);

    const items = results.map((r) => ({
      r,
      a: r.attributes || {},
      f: (r.attributes?.feature_details) || {},
    }));

    const matchesSeasonEpisode = (it: any) => (
      episodeInfo ? (it.f.season_number === episodeInfo.season && it.f.episode_number === episodeInfo.episode) : true
    );

    const normParent = (it: any) => norm(it.f.parent_title || it.f.title || it.a.feature || it.a.title || '');

    const exactTitleMatches = items.filter((it) => matchesSeasonEpisode(it) && normParent(it) === target);
    const includeTitleMatches = items.filter((it) => matchesSeasonEpisode(it) && (normParent(it).includes(target) || target.includes(normParent(it))));

    let candidates = exactTitleMatches.length
      ? exactTitleMatches
      : includeTitleMatches.length
        ? includeTitleMatches
        : items.filter(matchesSeasonEpisode);

    // Sort primarily by download_count; boost exact and include matches
    candidates.sort((x, y) => {
      const score = (it: any) => {
        const exact = normParent(it) === target ? 1000 : 0;
        const partial = (normParent(it).includes(target) || target.includes(normParent(it))) ? 200 : 0;
        const seasonEp = matchesSeasonEpisode(it) ? 500 : 0;
        const fileName = it.a?.files?.[0]?.file_name || '';
        const fnBoost = norm(fileName).includes(target) ? 50 : 0;
        const popularity = (it.a.download_count || 0) / 10; // cap impact
        return exact + partial + seasonEp + fnBoost + popularity;
      };
      return score(y) - score(x);
    });

    const best = candidates[0]?.r;

    // Guard against mismatched titles to avoid wrong-show spoilers
    const bestNormTitle = candidates[0] ? normParent(candidates[0]) : '';
    const trustMatch = !!best && (bestNormTitle === target || bestNormTitle.includes(target) || target.includes(bestNormTitle));

    if (!best?.attributes?.files?.[0]?.file_id || !trustMatch) {
      console.log('No reliable subtitle match found', { bestNormTitle, target });
      return null;
    }

    const chosenF = best.attributes?.feature_details || {};
    const chosenFileName = best.attributes?.files?.[0]?.file_name;
    console.log('Selected subtitle candidate:', {
      parentTitle: chosenF.parent_title || chosenF.title || best.attributes?.feature || best.attributes?.title,
      season: chosenF.season_number,
      episode: chosenF.episode_number,
      downloads: best.attributes?.download_count,
      fileName: chosenFileName,
    });

    // Download the subtitle file
    const downloadResponse = await fetch(`https://api.opensubtitles.com/api/v1/download`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: best.attributes.files[0].file_id }),
    });

    if (!downloadResponse.ok) {
      console.error('Subtitle download failed:', downloadResponse.status);
      return null;
    }

    const downloadData = await downloadResponse.json();
    
    if (!downloadData.link) {
      console.log('No download link provided');
      return null;
    }

    // Fetch the actual subtitle content
    const subtitleResponse = await fetch(downloadData.link);
    const subtitleText = await subtitleResponse.text();
    
    // Parse SRT format and extract relevant dialogue up to current timestamp
    const dialogueLines: string[] = [];
    const srtBlocks = subtitleText.split('\n\n');
    
    for (const block of srtBlocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;
      
      // Parse timestamp (format: 00:00:20,000 --> 00:00:22,000)
      const timeLine = lines[1];
      const startTime = timeLine.split(' --> ')[0];
      const timeMatch = startTime.match(/(\d+):(\d+):(\d+)/);
      
      if (timeMatch) {
        const subtitleSeconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
        
        // Only include dialogue up to current timestamp
        if (subtitleSeconds <= currentSeconds) {
          const raw = lines.slice(2).join(' ');
          const dialogue = raw
            .replace(/<[^>]*>/g, '') // HTML tags
            .replace(/\[[^\]]*\]/g, '') // [SOUND]
            .replace(/\([^)]*\)/g, '') // (music)
            .replace(/\s+/g, ' ')
            .trim();
          if (dialogue) {
            dialogueLines.push(dialogue);
          }
        }
      }
    }
    
    // Deduplicate consecutive lines and return recent context
    const uniqueLines: string[] = [];
    for (const d of dialogueLines) {
      if (uniqueLines[uniqueLines.length - 1] !== d) uniqueLines.push(d);
    }
    const recentDialogue = uniqueLines.slice(-50).join('\n');
    console.log(`Extracted ${uniqueLines.length} lines of dialogue up to timestamp`);
    
    return recentDialogue;

  } catch (error) {
    console.error('Error fetching subtitles:', error);
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

    // Try to get subtitle context with actual dialogue
    const subtitleDialogue = await getSubtitleContext(showTitle, episode, timestamp, OPENSUBTITLES_API_KEY);
    
    let subtitleContext = '';
    if (subtitleDialogue) {
      console.log('Using actual subtitle dialogue for context');
      subtitleContext = `\n\nACTUAL DIALOGUE FROM THE SHOW (up to timestamp ${timestamp}):\n${subtitleDialogue}\n\nUse this dialogue to provide accurate, detailed answers about what has happened so far.`;
    } else {
      console.log('No subtitle data found, using general knowledge');
    }

    // Create context-aware system prompt
    const systemPrompt = `You are a spoiler-free TV/movie companion assistant. Your role is to answer questions about shows and movies WITHOUT revealing any spoilers.

CRITICAL RULES:
1. The user is currently watching "${showTitle}" at ${episode} @ ${timestamp}
2. IMPORTANT: Answer questions about events, characters, and plot points that have ALREADY OCCURRED up to this timestamp. These are NOT spoilers.
3. Assume questions refer to past events unless explicitly about the future.
4. ONLY refuse if the question explicitly asks about events AFTER the current timestamp.
5. Provide DETAILED, specific answers grounded in what has happened so far.
6. Prefer quoting or paraphrasing ACTUAL DIALOGUE when helpful.
7. Never say "that hasn't happened" or "that didn't happen." If something isn't present in the provided dialogue, say: "I can't confirm that from the subtitles up to this time, but here's what's confirmed so far..." and answer using confirmed context.
8. If the question refers to an earlier scene, answer it directly using prior context; do not gate responses on an exact minute.
${subtitleContext}

Your goal is to enhance viewing experience by providing detailed explanations of past events without ruining future surprises.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: subtitleDialogue ? [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User question: ${question}\n\nContext - Dialogue up to ${timestamp}:\n${subtitleDialogue}\n\nAnswer strictly based on the dialogue above and general knowledge up to this point.` }
        ] : [
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

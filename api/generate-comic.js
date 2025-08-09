import { kv } from '../lib/redis.js';
import OpenAI from 'openai';

const log = (...args) => console.log('[GENERATE-COMIC]', ...args);

// Generate URL-safe comic ID from title and date
function generateURLSafeComicId(title, date = new Date()) {
  if (!title) {
    // Fallback to timestamp-based ID if no title
    return `comic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Create URL-safe slug from title
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .slice(0, 50); // Limit length
  
  // Format date as YYYY-MM-DD
  const dateStr = date.toISOString().split('T')[0];
  
  // Combine title slug and date
  const comicId = `${titleSlug}-${dateStr}`;
  
  // Ensure we have a valid ID
  if (comicId.length < 3 || comicId === `-${dateStr}`) {
    // Fallback if title processing resulted in empty slug
    return `comic-${dateStr}-${Math.random().toString(36).substr(2, 6)}`;
  }
  
  return comicId;
}

// Generate unique URL-safe comic ID, checking for conflicts
async function generateUniqueComicId(title, date = new Date()) {
  const baseId = generateURLSafeComicId(title, date);
  
  // Check if the ID already exists
  const existingComic = await kv.get(`comic:${baseId}`);
  if (!existingComic) {
    return baseId;
  }
  
  // ID exists, add a suffix
  let counter = 1;
  let uniqueId;
  do {
    uniqueId = `${baseId}-${counter}`;
    const exists = await kv.get(`comic:${uniqueId}`);
    if (!exists) {
      return uniqueId;
    }
    counter++;
  } while (counter <= 10); // Limit attempts to prevent infinite loop
  
  // If we still have conflicts after 10 attempts, use timestamp fallback
  return `${baseId}-${Date.now()}`;
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Comic themes and styles
const COMIC_THEMES = [
  'technology', 'work-life', 'relationships', 'food', 'pets', 
  'gaming', 'social-media', 'fitness', 'shopping', 'travel'
];

const PANEL_BACKGROUNDS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)",
  "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
  "linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)",
  "linear-gradient(135deg, #9890e3 0%, #b1f4cf 100%)",
  "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)"
];

export default async function handler(req, res) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const requestStartTime = Date.now();
  
  log('🌐 NEW REQUEST RECEIVED:', requestId);
  

  if (req.method !== 'POST') {
    log('❌ Method not allowed:', req.method, 'for request:', requestId);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract variables at top level for error handler access
  let userId, preferences = {}, tokenGuidance = {}, timestamp;

  try {
    ({ userId, preferences = {}, tokenGuidance = {}, timestamp } = req.body);
    log('📥 Request payload:', { 
      requestId,
      userId, 
      preferences: Object.keys(preferences),
      tokenGuidanceKeys: Object.keys(tokenGuidance),
      generationTemperature: tokenGuidance.generationTemperature,
      timestamp,
      hasPreferences: Object.keys(preferences).length > 0,
      hasTokenGuidance: Object.keys(tokenGuidance).length > 0
    });

    // Generate temporary comic ID for processing
    const tempComicId = `comic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    log('🆔 Generated temporary comic ID:', tempComicId, 'for request:', requestId);

    let globalTokenGuidance, combinedGuidance, comic;

    try {
      log('🔄 Getting global token guidance...');
      // Get aggregated token guidance from global feedback
      globalTokenGuidance = await getGlobalTokenGuidance();
      log('📈 Global guidance retrieved:', {
        avoidTokens: globalTokenGuidance.avoidTokens?.length || 0,
        encourageTokens: globalTokenGuidance.encourageTokens?.length || 0,
        avoidConcepts: globalTokenGuidance.avoidConcepts?.length || 0,
        encourageConcepts: globalTokenGuidance.encourageConcepts?.length || 0
      });
    } catch (guidanceError) {
      guidanceError.step = 'global_token_guidance';
      throw guidanceError;
    }
    
    try {
      log('🔀 Combining user and global guidance...');
      // Merge with user's personal token preferences (including temperature)
      combinedGuidance = await combineTokenGuidance(tokenGuidance, globalTokenGuidance, userId);
      log('✅ Combined guidance ready:', {
        totalAvoidTokens: combinedGuidance.avoidTokens?.length || 0,
        totalEncourageTokens: combinedGuidance.encourageTokens?.length || 0,
        totalAvoidConcepts: combinedGuidance.avoidConcepts?.length || 0,
        totalEncourageConcepts: combinedGuidance.encourageConcepts?.length || 0
      });
    } catch (combineError) {
      combineError.step = 'combine_guidance';
      throw combineError;
    }

    try {
      log('🎨 Starting AI comic generation...');
      // Generate comic using AI with token guidance
      comic = await generateComicWithAI(tempComicId, combinedGuidance);
    } catch (generationError) {
      generationError.step = 'ai_generation';
      throw generationError;
    }

    try {
      log('💾 Saving comic to Redis...');
      // Save comic to Redis
      await saveComicToRedis(comic, userId);
    } catch (saveError) {
      saveError.step = 'redis_save';
      throw saveError;
    }

    const totalDuration = Date.now() - requestStartTime;
    log('🎉 REQUEST COMPLETED SUCCESSFULLY!', {
      requestId,
      comicId: comic.id,
      totalDuration: `${totalDuration}ms`,
      title: comic.title,
      panelCount: comic.panels?.length || 0
    });

    // Return the comic
    return res.status(200).json({
      success: true,
      comic,
      meta: {
        requestId,
        duration: totalDuration,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const totalDuration = Date.now() - requestStartTime;
    log('❌ REQUEST FAILED:', {
      requestId,
      error: error.message,
      errorName: error.name,
      errorCode: error.code,
      duration: `${totalDuration}ms`,
      stack: error.stack?.slice(0, 500),
      userId: userId || 'unknown',
      preferences: Object.keys(preferences || {}),
      tokenGuidance: Object.keys(tokenGuidance || {})
    });
    
    // More detailed error response for debugging
    const detailedError = {
      success: false,
      error: 'Failed to generate comic',
      details: {
        message: error.message,
        name: error.name,
        code: error.code,
        step: error.step || 'unknown'
      },
      meta: {
        requestId,
        duration: totalDuration,
        timestamp: new Date().toISOString()
      }
    };
    
    // In development, include more details
    if (process.env.NODE_ENV === 'development') {
      detailedError.debug = {
        stack: error.stack,
        userId: userId || 'unknown',
        preferences,
        tokenGuidance
      };
    }
    
    return res.status(500).json(detailedError);
  }
}

// Get global token guidance from aggregated feedback
async function getGlobalTokenGuidance() {
  try {
    // Get cached guidance (5-minute cache)
    const cacheKey = 'token_guidance_cache';
    let guidance = await kv.get(cacheKey);
    
    if (guidance) {
      return guidance;
    }
    
    // Calculate fresh guidance from aggregated token stats
    guidance = await calculateGlobalTokenGuidance();
    
    // Cache for 5 minutes
    await kv.setex(cacheKey, 300, guidance);
    
    return guidance;
  } catch (error) {
    log('Error getting global token guidance:', error);
    return { avoidTokens: [], encourageTokens: [], avoidConcepts: [], encourageConcepts: [] };
  }
}

// Calculate global token guidance from feedback data
async function calculateGlobalTokenGuidance() {
  try {
    const guidance = {
      avoidTokens: [],
      encourageTokens: [],
      avoidConcepts: [],
      encourageConcepts: []
    };
    
    // Get token stats from last 30 days
    const tokenStats = await getRecentTokenStats();
    
    Object.entries(tokenStats).forEach(([token, stats]) => {
      if (stats.total >= 5) { // Minimum sample size
        const sentiment = (stats.positive - stats.negative) / stats.total;
        const confidence = Math.min(stats.total / 30, 1); // Cap confidence at 30 samples
        const adjustedSentiment = sentiment * confidence;
        
        if (adjustedSentiment > 0.3) {
          guidance.encourageTokens.push({ token, weight: adjustedSentiment });
        } else if (adjustedSentiment < -0.3) {
          guidance.avoidTokens.push({ token, weight: Math.abs(adjustedSentiment) });
        }
      }
    });
    
    return guidance;
  } catch (error) {
    log('Error calculating global token guidance:', error);
    return { avoidTokens: [], encourageTokens: [], avoidConcepts: [], encourageConcepts: [] };
  }
}

// Get recent token statistics (Upstash-compatible)
async function getRecentTokenStats() {
  try {
    // Since Upstash doesn't support KEYS, we'll maintain a token registry
    let tokenRegistry = await kv.get('token_registry');
    
    if (!tokenRegistry) {
      // Initialize empty registry if it doesn't exist
      tokenRegistry = '[]';
      await kv.set('token_registry', tokenRegistry);
    }
    
    const tokens = tokenRegistry;
    const tokenStats = {};
    
    if (tokens.length > 0) {
      // Get stats for each registered token
      const tokenKeys = tokens.map(token => `token_stats:${token}`);
      const results = await kv.mget(tokenKeys);
      
      tokens.forEach((token, index) => {
        const stats = results[index] || {};
        
        if (stats.total) {
          tokenStats[token] = stats;
        }
      });
    }
    
    return tokenStats;
  } catch (error) {
    log('Error getting recent token stats:', error);
    return {};
  }
}

// Get overused themes from recent comics
async function getOverusedThemes() {
  try {
    // Get recent comics to analyze theme frequency
    const recentComics = await kv.lrange('comics:recent', 0, 49); // Last 50 comics
    
    if (!recentComics || recentComics.length === 0) {
      return [];
    }
    
    const themeCount = {};
    
    // Count occurrences of each theme
    for (const comicId of recentComics.slice(0, 30)) { // Check last 30 comics
      try {
        const comic = await kv.get(`comic:${comicId}`);
        if (comic && comic.concepts) {
          comic.concepts.forEach(concept => {
            themeCount[concept] = (themeCount[concept] || 0) + 1;
          });
        }
      } catch (error) {
        // Skip if comic can't be loaded
        continue;
      }
    }
    
    // Identify overused themes (appearing in >40% of recent comics)
    const totalComics = Math.min(recentComics.length, 30);
    const threshold = Math.ceil(totalComics * 0.4);
    
    const overusedThemes = Object.entries(themeCount)
      .filter(([theme, count]) => count >= threshold)
      .map(([theme, count]) => theme);
    
    // Always include coffee and sleep if they appear frequently
    const frequentThemes = Object.entries(themeCount)
      .filter(([theme, count]) => ['coffee', 'sleep'].includes(theme) && count >= Math.ceil(totalComics * 0.25))
      .map(([theme, count]) => theme);
    
    const result = [...new Set([...overusedThemes, ...frequentThemes])];
    
    log('🔍 Overused theme analysis:', {
      totalComicsAnalyzed: totalComics,
      threshold,
      themeCount,
      overusedThemes: result
    });
    
    return result;
  } catch (error) {
    log('Error getting overused themes:', error);
    return ['coffee', 'sleep']; // Default to avoiding coffee and sleep if analysis fails
  }
}

// Combine personal and global token guidance
async function combineTokenGuidance(personalGuidance, globalGuidance, userId) {
  try {
    const temperature = personalGuidance.generationTemperature || 0.3;
    const temperatureDampening = 1.0 - temperature;
    
    log('🌡️ [BACKEND] Processing with temperature:', temperature, 'dampening:', temperatureDampening);
    
    // Personal preferences take precedence, global fills in gaps
    // Temperature already applied in frontend, but we preserve it for metadata
    const combined = {
      avoidTokens: [...(personalGuidance.avoidTokens || [])],
      encourageTokens: [...(personalGuidance.encourageTokens || [])],
      avoidConcepts: [...(personalGuidance.avoidConcepts || [])],
      encourageConcepts: [...(personalGuidance.encourageConcepts || [])],
      tokenWeights: { ...(personalGuidance.tokenWeights || {}) },
      conceptWeights: { ...(personalGuidance.conceptWeights || {}) },
      generationTemperature: temperature
    };
    
    // Add global guidance for tokens not in personal preferences
    // Apply temperature dampening to global guidance as well
    globalGuidance.encourageTokens?.forEach(({ token, weight }) => {
      if (!combined.tokenWeights[token] && !combined.avoidTokens.includes(token)) {
        const adjustedWeight = weight * 0.5 * temperatureDampening; // Reduce global influence and apply temperature
        if (Math.abs(adjustedWeight) > 0.1) { // Only include if weight is still significant
          combined.encourageTokens.push(token);
          combined.tokenWeights[token] = adjustedWeight;
        }
      }
    });
    
    globalGuidance.avoidTokens?.forEach(({ token, weight }) => {
      if (!combined.tokenWeights[token] && !combined.encourageTokens.includes(token)) {
        const adjustedWeight = -weight * 0.5 * temperatureDampening; // Reduce global influence and apply temperature
        if (Math.abs(adjustedWeight) > 0.1) { // Only include if weight is still significant
          combined.avoidTokens.push(token);
          combined.tokenWeights[token] = adjustedWeight;
        }
      }
    });
    
    return combined;
  } catch (error) {
    log('Error combining token guidance:', error);
    return personalGuidance;
  }
}

// Helper function to validate GPT responses
function validateGPTResponse(response, stepName) {
  if (!response) {
    throw new Error(`${stepName}: No response received from GPT`);
  }
  
  // Handle Responses API (GPT-5)
  if (response.status !== undefined) {
    if (response.status === 'incomplete') {
      throw new Error(`${stepName}: GPT-5 response incomplete. Reason: ${response.incomplete_details?.reason || 'unknown'}`);
    }
    if (response.status !== 'completed') {
      throw new Error(`${stepName}: GPT-5 response status: ${response.status}`);
    }
    if (!response.output_text || response.output_text.length === 0) {
      throw new Error(`${stepName}: GPT-5 returned empty output_text`);
    }
    return response.output_text;
  }
  
  // Handle Chat Completions API (GPT-4o, GPT-4o-mini)
  if (response.choices && response.choices.length > 0) {
    const message = response.choices[0].message;
    if (!message || !message.content || message.content.length === 0) {
      throw new Error(`${stepName}: GPT returned empty content`);
    }
    return message.content;
  }
  
  throw new Error(`${stepName}: Invalid response structure`);
}

// Step 1: Generate comic script with enhanced structure and humor dial
async function generateComicScript(guidance) {
  const cfg = normalizeGuidance(guidance);
  
  log('🎬 STEP 1 (Enhanced): Starting creative comic script generation...', {
    humorLevel: cfg.humorLevel,
    panelCount: cfg.panelCount,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens
  });
  
  // Check for overused themes and add them to avoid list
  const overusedThemes = await safeGetOverusedThemes();
  const combinedAvoidConcepts = [...(cfg.avoidConcepts || []), ...(overusedThemes || [])];
  
  // Build enhanced guidance prompt with sections
  const guidancePrompt = buildGuidancePrompt({
    avoidTokens: cfg.avoidTokens,
    encourageTokens: cfg.encourageTokens,
    avoidConcepts: combinedAvoidConcepts,
    encourageConcepts: cfg.encourageConcepts,
    styleRefs: cfg.styleRefs,
    humorLevel: cfg.humorLevel,
    panelCount: cfg.panelCount
  });

  log('📋 Enhanced guidance applied:', {
    avoidTokens: cfg.avoidTokens?.length || 0,
    encourageTokens: cfg.encourageTokens?.length || 0,
    avoidConcepts: combinedAvoidConcepts?.length || 0,
    encourageConcepts: cfg.encourageConcepts?.length || 0,
    humorLevel: cfg.humorLevel,
    styleRefs: cfg.styleRefs,
    guidancePrompt: guidancePrompt.slice(0, 200) + (guidancePrompt.length > 200 ? '...' : '')
  });

  // Enhanced main prompt with explicit comedic guidance
  const prompt = [
    `You are a top-tier comic writer and visual gag architect.`,
    `Write a funny, original comic strip script for ${cfg.panelCount} panel${cfg.panelCount === 1 ? '' : 's'}.`,
    `Use strong comedic timing, clear speaker attribution, and a complete story arc (setup → escalation → punchline).`,
    '',
    guidancePrompt,
    '',
    `CRITICAL OUTPUT RULES:`,
    `- For EACH panel:`,
    `  * Provide time/location context (e.g., "Saturday afternoon, at the bookstore").`,
    `  * List each character who appears: Name + an identifying emoji (keep separate).`,
    `  * Clearly label who says/thinks each line using the character name only.`,
    `  * Progress the story toward the punchline.`,
    `- Keep it SFW, inclusive, and non-mean-spirited.`,
    `- Do NOT use JSON; write natural descriptive text with explicit character tags.`,
    '',
    `CLARITY EXAMPLE (formatting only):`,
    `Saturday morning, neighborhood yard sale`,
    `Characters: Alex (😊), Sam (🤔)`,
    `Alex: "I brought exact change and zero self-control."`,
    `Sam: "What could go wrong?"`,
    `Alex thinks: "Everything. Ideally in a hilarious way."`
  ].join('\n');

  log('🤖 Sending request to GPT-5 (thinking) for enhanced script generation...');
  log('📝 Prompt length:', prompt.length, 'characters');
  
  const startTime = Date.now();
  
  let response;
  try {
    response = await openai.responses.create({
      model: "gpt-5",
      reasoning: { effort: "high" }, // Use high reasoning effort for maximum creativity
      input: [
        {
          role: "system",
          content: "You are an INNOVATIVE, WILDLY CREATIVE comic writer and visual comedy architect! UNLEASH YOUR IMAGINATION! Break conventional patterns, surprise readers, craft unexpected twists, and build hilarious escalations. Be BOLD with visual gags, character reactions, and comedic timing. Push boundaries of humor while staying SFW. Think like a comedy genius - subvert expectations, create memorable moments, and make readers laugh out loud with your inventive storytelling!"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_output_tokens: Math.max(cfg.maxTokens, 25000) // Reserve sufficient tokens for high reasoning effort
    });
  } catch (apiError) {
    apiError.step = 'openai_script_generation';
    log('❌ OpenAI API error in script generation:', {
      message: apiError.message,
      status: apiError.status,
      code: apiError.code,
      model: 'gpt-5'
    });
    throw apiError;
  }

  const duration = Date.now() - startTime;
  
  // Debug the response structure for GPT-5 Responses API
  log('🔍 GPT-5 response structure debug:', {
    status: response.status,
    outputText: response.output_text?.length || 'no output_text',
    usage: response.usage ? 'present' : 'no usage',
    incompleteReason: response.incomplete_details?.reason || 'none'
  });
  
  // Check if response is incomplete due to token limits
  if (response.status === 'incomplete') {
    if (response.incomplete_details?.reason === 'max_output_tokens') {
      log('⚠️ GPT-5 response incomplete due to max_output_tokens. Retrying with higher limit...');
      // Retry with doubled token limit
      const retryResponse = await openai.responses.create({
        model: "gpt-5",
        reasoning: { effort: "medium" }, // Use medium effort for retry to balance tokens
        input: [
          {
            role: "system",
            content: "You are an INNOVATIVE, WILDLY CREATIVE comic writer and visual comedy architect! UNLEASH YOUR IMAGINATION! Break conventional patterns, surprise readers, craft unexpected twists, and build hilarious escalations. Be BOLD with visual gags, character reactions, and comedic timing. Push boundaries of humor while staying SFW. Think like a comedy genius - subvert expectations, create memorable moments, and make readers laugh out loud with your inventive storytelling!"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_output_tokens: Math.max(cfg.maxTokens, 25000) * 2
      });
      
      if (retryResponse.status === 'completed' && retryResponse.output_text) {
        log('✅ Retry successful with medium reasoning effort');
        response = retryResponse;
      } else {
        throw new Error(`GPT-5 retry failed. Status: ${retryResponse.status}, Reason: ${retryResponse.incomplete_details?.reason || 'unknown'}`);
      }
    } else {
      throw new Error(`GPT-5 response incomplete. Reason: ${response.incomplete_details?.reason || 'unknown'}`);
    }
  }
  
  // Validate and extract script content using helper function
  const script = validateGPTResponse(response, 'Script Generation');
  
  log('✅ GPT-5 enhanced script generation completed!', {
    duration: `${duration}ms`,
    scriptLength: script.length,
    tokensUsed: response.usage?.total_tokens || 'unknown',
    inputTokens: response.usage?.input_tokens || 'unknown',
    outputTokens: response.usage?.output_tokens || 'unknown',
    reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens || 'unknown'
  });
  
  log('📜 Generated script preview:', script.slice(0, 300) + (script.length > 300 ? '...' : ''));

  return script;
}

// Step 2: Analyze characters and dialogue using GPT-4o-mini
async function analyzeCharacters(script) {
  log('🔍 STEP 2: Analyzing characters and dialogue with GPT-4o-mini...');
  
  const analysisPrompt = `Analyze this comic script and identify all characters, their dialogue, and thoughts. Be very precise about who says what in each panel.

COMIC SCRIPT:
${script}

For each panel, identify:
1. All characters who appear or speak
2. Each character's name and emoji
3. Which lines belong to which character
4. Whether each line is speech, thought, or narration

Respond with a detailed analysis in this format:
First scene:
- Characters: [list with names and emojis]
- Dialogue assignments: [who says what]
- Types: [speech/thought for each line]

Next scene:
- Characters: [list with names and emojis]
- Dialogue assignments: [who says what]
- Types: [speech/thought for each line]

Be extremely careful about character consistency and dialogue attribution.`;

  log('🤖 Sending character analysis request to GPT-5 (non-thinking)...');
  
  const startTime = Date.now();
  
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-5-chat-latest",
      messages: [
        {
          role: "system",
          content: "You are a METHODICAL script analyst. Analyze with systematic precision. Identify characters and dialogue attribution with forensic accuracy. Be thorough, systematic, and detailed in your analysis. Leave no character unnamed, no dialogue unattributed."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ],
      max_completion_tokens: 800
    });
  } catch (apiError) {
    apiError.step = 'openai_character_analysis';
    log('❌ OpenAI API error in character analysis:', {
      message: apiError.message,
      status: apiError.status,
      code: apiError.code,
      model: 'gpt-5-chat-latest'
    });
    throw apiError;
  }

  const duration = Date.now() - startTime;
  
  // Validate response before extracting content
  const analysis = validateGPTResponse(completion, 'Character Analysis');
  
  log('✅ Character analysis completed!', {
    duration: `${duration}ms`,
    analysisLength: analysis.length,
    tokensUsed: completion.usage?.total_tokens || 'unknown'
  });
  
  log('📋 Character analysis preview:', analysis.slice(0, 300) + (analysis.length > 300 ? '...' : ''));

  return analysis;
}

// Generate character styles for a comic (per-comic assignment)
function assignCharacterStyles(parsedComic) {
  // Collect all unique character names from all panels
  const allCharacterNames = new Set();
  
  parsedComic.panels.forEach(panel => {
    if (panel.characters && Array.isArray(panel.characters)) {
      panel.characters.forEach(character => {
        if (character.name) {
          allCharacterNames.add(character.name);
        }
      });
    }
  });

  // Convert to array and sort for consistent ordering
  const characterNames = Array.from(allCharacterNames).sort();
  
  // Assign styles 1-5, cycling through if more than 5 characters
  const characterStyleMap = new Map();
  characterNames.forEach((name, index) => {
    const styleNumber = (index % 5) + 1;
    characterStyleMap.set(name, styleNumber);
  });
  
  return characterStyleMap;
}

// Step 3: Format comic script into proper JSON structure
async function formatComicScript(script, characterAnalysis) {
  log('🔧 STEP 3: Starting JSON formatting with character analysis...');
  log('📝 Script to format (length):', script.length, 'characters');
  
  const formatPrompt = `Take this comic script and character analysis to format into the exact JSON structure below.

COMIC SCRIPT:
${script}

CHARACTER ANALYSIS:
${characterAnalysis}

Convert this to the following JSON structure (respond with only valid JSON, no other text):

{
  "title": "[Extract or create appropriate title]",
  "panels": [
    {
      "header": "[Time/location from script]",
      "characters": [
        {
          "name": "[Character name like 'Sarah' or 'Mike' - do NOT include emoji in name]",
          "emoji": "[Character's emoji from script - separate from name]",
          "style": "[IMPORTANT: Use consistent number 1-5 for same character across all panels]",
          "effect": [null, "shake", or "bounce" based on emotion]
        }
      ],
      "dialogue": [
        {
          "text": "[What the character says]",
          "speaker": "[Character name who says this]",
          "type": "speech|thought",
          "style": "normal|angry|excited|sad"
        }
      ]
    }
  ]
}

CRITICAL RULES:
- If only ONE character speaks in a panel, include only that character in "characters" array
- If MULTIPLE characters speak, include ALL speaking characters in "characters" array
- Every dialogue entry MUST have a "speaker" field matching a character name
- Character names must NOT include emojis - separate name from emoji (e.g. "Lina" not "Lina (🧢)")
- Use exact character names and emojis from the analysis but keep them separate
- Only include dialogue/thoughts that were in the original script
- Respond with ONLY the JSON object, no other text`;

  log('🤖 Sending STRICT formatting request to GPT-5-nano...');
  log('📏 Format prompt length:', formatPrompt.length, 'characters');
  
  const startTime = Date.now();
  
  let completion;
  try {
    completion = await openai.responses.create({
      model: "gpt-5-nano",
      reasoning: { effort: "minimal" }, // Minimal reasoning for fast, deterministic formatting
      input: [
        {
          role: "system",
          content: "You are a STRICT, PRECISE formatter. Your ONLY job is to convert text to EXACT JSON format. Do not be creative. Do not add content. Do not interpret. Simply format the provided content into the requested JSON structure with perfect accuracy. Output ONLY valid JSON, nothing else."
        },
        {
          role: "user",
          content: formatPrompt
        }
      ],
      max_output_tokens: 1800 // Increased to handle complex multi-character comics
    });
  } catch (apiError) {
    apiError.step = 'openai_format_script';
    log('❌ OpenAI API error in script formatting:', {
      message: apiError.message,
      status: apiError.status,
      code: apiError.code,
      model: 'gpt-5-nano'
    });
    throw apiError;
  }

  const duration = Date.now() - startTime;
  
  // Debug the response object structure (now using Responses API)
  log('🔍 Main formatting response debug:', {
    status: completion.status,
    outputText: completion.output_text?.length || 'no output_text',
    usage: completion.usage ? 'present' : 'no usage',
    incompleteReason: completion.incomplete_details?.reason || 'none'
  });
  
  // Validate response before extracting content
  const jsonResponse = validateGPTResponse(completion, 'Script Formatting');
  
  log('✅ GPT-5-nano STRICT formatting completed!', {
    duration: `${duration}ms`,
    responseLength: jsonResponse.length,
    tokensUsed: completion.usage?.total_tokens || 'unknown',
    inputTokens: completion.usage?.input_tokens || 'unknown',
    outputTokens: completion.usage?.output_tokens || 'unknown',
    reasoningTokens: completion.usage?.output_tokens_details?.reasoning_tokens || 'unknown'
  });
  
  log('🧪 Attempting JSON parsing...');
  log('🔍 Raw GPT response preview:', jsonResponse.slice(0, 100) + '...');
  
  // Clean the response - remove markdown code blocks and extra whitespace
  let cleanedResponse = jsonResponse.trim();
  
  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  if (cleanedResponse.startsWith('```')) {
    log('🧹 Detected markdown code block, cleaning...');
    const lines = cleanedResponse.split('\n');
    // Remove first line if it's ```json or ```
    if (lines[0].match(/^```(json)?$/)) {
      lines.shift();
    }
    // Remove last line if it's ```
    if (lines[lines.length - 1] === '```') {
      lines.pop();
    }
    cleanedResponse = lines.join('\n').trim();
    log('✨ Cleaned response preview:', cleanedResponse.slice(0, 100) + '...');
  }
  
  // Remove any leading/trailing backticks or other markdown artifacts
  cleanedResponse = cleanedResponse.replace(/^`+|`+$/g, '').trim();
  
  try {
    const parsedComic = JSON.parse(cleanedResponse);
    log('✅ JSON parsing successful!', {
      title: parsedComic.title,
      emoji: parsedComic.emoji,
      panelCount: parsedComic.panels?.length || 0
    });
    
    // Validate structure
    if (!parsedComic.title || !parsedComic.panels || !Array.isArray(parsedComic.panels)) {
      throw new Error('Invalid comic structure: missing title or panels');
    }
    
    // Validate each panel has proper character and dialogue structure
    parsedComic.panels.forEach((panel, index) => {
      if (!panel.characters || !Array.isArray(panel.characters)) {
        throw new Error(`Panel ${index + 1}: missing characters array`);
      }
      if (!panel.dialogue || !Array.isArray(panel.dialogue)) {
        throw new Error(`Panel ${index + 1}: missing dialogue array`);
      }
      
      // Validate dialogue speakers match characters
      const characterNames = panel.characters.map(c => c.name);
      panel.dialogue.forEach((line, lineIndex) => {
        if (line.speaker && !characterNames.includes(line.speaker)) {
          log(`⚠️ Panel ${index + 1}, line ${lineIndex + 1}: speaker "${line.speaker}" not found in characters:`, characterNames);
        }
      });
    });
    
    log('🎯 Comic structure validation passed');
    
    // Ensure consistent character styles across panels (per-comic assignment)
    log('🎨 Applying consistent character styles...');
    const characterStyleMap = assignCharacterStyles(parsedComic);
    
    // Log the character assignments for this comic
    characterStyleMap.forEach((style, name) => {
      log(`🎭 Character "${name}" assigned style ${style}`);
    });
    
    parsedComic.panels.forEach((panel, panelIndex) => {
      panel.characters.forEach((character, charIndex) => {
        if (character.name && characterStyleMap.has(character.name)) {
          character.style = characterStyleMap.get(character.name);
        }
      });
    });
    
    log('✅ Character style consistency applied');
    return parsedComic;
    
  } catch (parseError) {
    log('❌ JSON parsing failed:', parseError.message);
    log('🔍 Original response length:', jsonResponse.length);
    log('🔍 Cleaned response length:', cleanedResponse.length);
    log('🔍 First 300 chars of original:', jsonResponse.slice(0, 300));
    log('🔍 First 300 chars of cleaned:', cleanedResponse.slice(0, 300));
    log('🔍 Last 100 chars of cleaned:', cleanedResponse.slice(-100));
    
    // Try to identify the issue
    if (cleanedResponse.includes('```')) {
      log('⚠️ Still contains markdown after cleaning');
    }
    if (cleanedResponse.startsWith('{') && cleanedResponse.endsWith('}')) {
      log('✅ Looks like valid JSON structure');
    } else {
      log('❌ Does not look like valid JSON structure');
    }
    
    throw new Error(`Failed to parse comic JSON: ${parseError.message}`);
  }
}

// Fallback formatting function with stricter prompt
async function formatComicScriptFallback(script, characterAnalysis) {
  log('🔧 FALLBACK: Attempting stricter JSON formatting...');
  
  const strictFormatPrompt = `You MUST convert this comic script to JSON format using the character analysis. Respond with ONLY valid JSON, no markdown, no code blocks, no explanations.

SCRIPT: ${script}

ANALYSIS: ${characterAnalysis}

OUTPUT ONLY THIS JSON STRUCTURE:
{"title":"[title]","panels":[{"header":"[time/location]","characters":[{"name":"[character name without emoji]","emoji":"[emoji]","style":1,"effect":null}],"dialogue":[{"text":"[dialogue text]","speaker":"[character name without emoji]","type":"speech","style":"normal"}]}]}

CRITICAL RULES:
- Output ONLY JSON, nothing else
- Do not use markdown code blocks
- Do not add explanations
- Use double quotes for all strings
- Character names must NOT include emojis - separate name from emoji
- Every dialogue must have a speaker that matches a character name (without emoji)
- Include all characters who speak in each panel
- Ensure valid JSON syntax`;

  log('🤖 Sending fallback formatting request to GPT-5-nano...');
  
  let completion;
  try {
    completion = await openai.responses.create({
      model: "gpt-5-nano",
      reasoning: { effort: "minimal" }, // Minimal reasoning for deterministic fallback formatting
      input: [
        {
          role: "system",
          content: "You are a MECHANICAL JSON formatter. Execute EXACTLY as instructed. No creativity, no interpretation, no additions. Convert input to JSON format with robotic precision. Output ONLY valid JSON, never markdown or explanations."
        },
        {
          role: "user",
          content: strictFormatPrompt
        }
      ],
      max_output_tokens: 1800 // Match main formatting capacity for consistency
    });
  } catch (apiError) {
    apiError.step = 'openai_fallback_format';
    log('❌ OpenAI API error in fallback formatting:', {
      message: apiError.message,
      status: apiError.status,
      code: apiError.code,
      model: 'gpt-5-nano'
    });
    throw apiError;
  }

  // Debug the response object structure (now using Responses API)
  log('🔍 Fallback response debug:', {
    status: completion.status,
    outputText: completion.output_text?.length || 'no output_text',
    usage: completion.usage ? 'present' : 'no usage',
    incompleteReason: completion.incomplete_details?.reason || 'none'
  });

  // Validate response before extracting content
  const jsonResponse = validateGPTResponse(completion, 'Fallback Formatting');
  log('🔍 Fallback response preview:', jsonResponse.slice(0, 100));
  
  // More aggressive cleaning
  let cleanedResponse = jsonResponse.trim();
  
  // Remove any text before the first { and after the last }
  const firstBrace = cleanedResponse.indexOf('{');
  const lastBrace = cleanedResponse.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
    log('🧹 Extracted JSON between braces');
  }
  
  try {
    const parsedComic = JSON.parse(cleanedResponse);
    log('✅ Fallback JSON parsing successful!');
    
    // Basic validation
    if (!parsedComic.title || !parsedComic.panels) {
      throw new Error('Invalid comic structure in fallback');
    }
    
    // Validate character structure
    parsedComic.panels.forEach((panel, index) => {
      if (!panel.characters || !Array.isArray(panel.characters)) {
        log(`⚠️ Fallback panel ${index + 1}: missing characters, adding default`);
        panel.characters = [{ name: "Character", emoji: "😊", style: 1, effect: null }];
      }
      if (!panel.dialogue || !Array.isArray(panel.dialogue)) {
        log(`⚠️ Fallback panel ${index + 1}: missing dialogue, adding default`);
        panel.dialogue = [{ text: "...", speaker: panel.characters[0]?.name || "Character", type: "speech", style: "normal" }];
      }
    });
    
    // Apply consistent character styles in fallback too (per-comic assignment)
    log('🎨 Applying consistent character styles (fallback)...');
    const characterStyleMap = assignCharacterStyles(parsedComic);
    
    // Log the character assignments for this comic
    characterStyleMap.forEach((style, name) => {
      log(`🎭 Fallback: Character "${name}" assigned style ${style}`);
    });
    
    parsedComic.panels.forEach((panel, panelIndex) => {
      panel.characters.forEach((character, charIndex) => {
        if (character.name && characterStyleMap.has(character.name)) {
          character.style = characterStyleMap.get(character.name);
        }
      });
    });
    
    return parsedComic;
  } catch (parseError) {
    log('❌ Fallback parsing also failed:', parseError.message);
    log('🔍 Fallback cleaned response:', cleanedResponse);
    throw new Error(`Both formatting attempts failed: ${parseError.message}`);
  }
}

// Helper functions for enhanced comic generation

function normalizeGuidance(input = {}) {
  return {
    avoidTokens: toArray(input.avoidTokens),
    encourageTokens: toArray(input.encourageTokens),
    avoidConcepts: toArray(input.avoidConcepts),
    encourageConcepts: toArray(input.encourageConcepts),
    humorLevel: clampNumber(input.humorLevel, 0, 11, 8),
    panelCount: [3, 4].includes(Number(input.panelCount)) ? Number(input.panelCount) : 3,
    styleRefs: toArray(input.styleRefs),
    temperature: typeof input.temperature === 'number' ? input.temperature : 0.9,
    maxTokens: typeof input.maxTokens === 'number' ? input.maxTokens : 1500, // Increased for more detailed scripts
    signal: input.signal
  };
}

function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : [val].filter(Boolean);
}

function clampNumber(val, min, max, fallback) {
  const n = typeof val === 'number' ? val : fallback;
  return Math.max(min, Math.min(max, n));
}

async function safeGetOverusedThemes() {
  try {
    return await getOverusedThemes();
  } catch (e) {
    log('⚠️ getOverusedThemes failed; continuing without it.', { message: e?.message });
    return [];
  }
}

function buildGuidancePrompt({
  avoidTokens = [],
  encourageTokens = [],
  avoidConcepts = [],
  encourageConcepts = [],
  styleRefs = [],
  humorLevel = 8,
  panelCount = 3
}) {
  const sections = [];

  // Funny Dial — calibrates intensity of humor
  const funnyDial = `FUNNY DIAL: ${humorLevel} / 11\n` +
    `- 0–3: Light wit, observational, grounded.\n` +
    `- 4–7: Punchy, playful, occasional absurdity.\n` +
    `- 8–10: Bold exaggeration, unexpected twists, visual gags, meta asides.\n` +
    `- 11: Max chaos (still SFW): surreal misdirection, background gags, rule-of-three escalations, and a sharp, surprising punchline.`;

  sections.push(funnyDial);

  if (styleRefs.length) {
    sections.push(`STYLE REFERENCES (vibes only, do not imitate directly): ${styleRefs.join(', ')}`);
  }

  if (encourageTokens.length) {
    sections.push(`ENCOURAGE these language/comedic patterns users enjoyed: ${encourageTokens.join(', ')}`);
  }

  if (avoidTokens.length) {
    sections.push(`AVOID these language patterns users found uninteresting: ${avoidTokens.join(', ')}`);
  }

  if (encourageConcepts.length) {
    sections.push(`CONSIDER these themes: ${encourageConcepts.join(', ')}`);
  }

  if (avoidConcepts.length) {
    sections.push(`AVOID these overused themes: ${avoidConcepts.join(', ')}`);
  }

  sections.push([
    'CREATIVE DIRECTION:',
    `- Prefer fresh perspectives across: hobbies, social situations, exercise, food adventures, tech mishaps, relationships, family moments, creative pursuits.`,
    `- Avoid repetitive "tired/coffee/workplace stress" setups unless explicitly encouraged.`,
    `- Think universal experiences beyond exhaustion/caffeine; aim for surprise over cynicism.`,
    `- Include at least one background gag or visual aside that pays off on a second read.`,
    `- Build to a clear punchline in panel ${panelCount}.`
  ].join('\n'));

  sections.push([
    'STRUCTURE REQUIREMENTS:',
    `- ${panelCount} panels; complete story (setup → development → punchline).`,
    `- EACH PANEL MUST INCLUDE:`,
    `  • Time/location context.`,
    `  • Character list with Name + emoji (keep separate).`,
    `  • Explicit speaker/thinker tags using character names only.`,
    `  • A step toward the final gag.`,
    `- Keep it suitable for all audiences; no slurs or cruelty.`
  ].join('\n'));

  return sections.join('\n\n');
}

// Generate comic using OpenAI with two-step validation
async function generateComicWithAI(comicId, guidance) {
  try {
    log('🚀 Starting enhanced two-step comic generation process for:', comicId);
    const overallStartTime = Date.now();
    
    // Enhance guidance with humor level and other parameters
    const enhancedGuidance = {
      ...guidance,
      humorLevel: guidance.humorLevel || 8, // Default to level 8
      panelCount: guidance.panelCount || 3, // Default to 3 panels
      styleRefs: guidance.styleRefs || [], // Optional style references
      temperature: guidance.temperature || 0.9, // Default temperature
      maxTokens: guidance.maxTokens || 1000 // Default token limit
    };
    
    log('🎨 Enhanced guidance parameters:', {
      humorLevel: enhancedGuidance.humorLevel,
      panelCount: enhancedGuidance.panelCount,
      styleRefs: enhancedGuidance.styleRefs,
      temperature: enhancedGuidance.temperature
    });
    
    // Step 1: Generate comic script with enhanced creative freedom
    const comicScript = await generateComicScript(enhancedGuidance);
    
    // Step 2: Analyze characters and dialogue for accurate assignment
    const characterAnalysis = await analyzeCharacters(comicScript);
    
    // Step 3: Format and validate the script into proper JSON structure
    let comicData;
    try {
      comicData = await formatComicScript(comicScript, characterAnalysis);
    } catch (formatError) {
      log('⚠️ First formatting attempt failed, trying with stricter prompt...');
      
      // Fallback: Try again with a more explicit prompt
      comicData = await formatComicScriptFallback(comicScript, characterAnalysis);
    }

    log('🔍 Extracting tokens and concepts for feedback tracking...');
    // Extract tokens from comic content for feedback tracking
    const tokens = extractTokensFromComic(comicData);
    const concepts = extractConceptsFromComic(comicData, guidance);
    
    log('📊 Token extraction results:', {
      tokenCount: tokens.length,
      conceptCount: concepts.length,
      tokens: tokens.slice(0, 10), // Show first 10 tokens
      concepts: concepts
    });
    
    // Generate URL-safe comic ID based on title and date
    const currentDate = new Date();
    const finalComicId = await generateUniqueComicId(comicData.title, currentDate);
    log('🆔 Generated final URL-safe comic ID:', finalComicId, 'from title:', comicData.title);
    
    // Add metadata and styling
    const comic = {
      id: finalComicId,
      ...comicData,
      version: 2,
      tokens: tokens,
      concepts: concepts,
      generationContext: {
        avoidedTokens: guidance.avoidTokens || [],
        encouragedTokens: guidance.encourageTokens || [],
        avoidedConcepts: guidance.avoidConcepts || [],
        encouragedConcepts: guidance.encourageConcepts || []
      },
      timestamp: currentDate.toISOString(),
      createdAt: currentDate.toISOString(),
      generationTemperature: guidance.generationTemperature || 0.3
    };

    // Pre-generate URL navigation data (using comic ID as slug)
    comic.urlNavigation = {
      slug: comic.id, // Simple: just use the comic ID
      generatedAt: new Date().toISOString()
    };

    log('🔗 Generated URL navigation (ID-based):', comic.urlNavigation);

    // Add backgrounds to panels
    comic.panels = comic.panels.map((panel, index) => ({
      ...panel,
      background: PANEL_BACKGROUNDS[index % PANEL_BACKGROUNDS.length]
    }));

    const overallDuration = Date.now() - overallStartTime;
    log('🎉 Comic generation completed successfully!', {
      comicId: comic.id,
      title: comic.title,
      emoji: comic.emoji,
      panelCount: comic.panels.length,
      totalDuration: `${overallDuration}ms`,
      tokensFeedback: comic.tokens.length,
      conceptsFeedback: comic.concepts.length
    });

    return comic;

  } catch (error) {
    log('❌ Comic generation failed:', {
      error: error.message,
      stack: error.stack?.slice(0, 500)
    });
    throw error; // Remove fallback to force proper error handling
  }
}


// Extract tokens from comic dialogue and content
function extractTokensFromComic(comicData) {
  try {
    const allText = [];
    
    // Extract text from title
    if (comicData.title) {
      allText.push(comicData.title.toLowerCase());
    }
    
    // Extract text from panels
    comicData.panels?.forEach(panel => {
      if (panel.header) allText.push(panel.header.toLowerCase());
      
      panel.dialogue?.forEach(line => {
        const text = typeof line === 'string' ? line : line.text;
        if (text) allText.push(text.toLowerCase());
      });
    });
    
    // Simple tokenization - split by spaces and punctuation, remove common words
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these', 'those']);
    
    const tokens = allText
      .join(' ')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2 && !stopWords.has(token))
      .slice(0, 50); // Limit to 50 tokens
    
    // Remove duplicates and return
    return [...new Set(tokens)];
  } catch (error) {
    log('Error extracting tokens:', error);
    return [];
  }
}

// Extract high-level concepts from comic content
function extractConceptsFromComic(comicData, guidance) {
  try {
    const concepts = [];
    const title = comicData.title?.toLowerCase() || '';
    const allText = comicData.panels?.map(p => 
      p.dialogue?.map(d => (typeof d === 'string' ? d : d.text)?.toLowerCase()).join(' ')
    ).join(' ') || '';
    
    // Map patterns to concepts
    const conceptMappings = {
      'tech': ['bug', 'code', 'computer', 'software', 'program', 'debug', 'api', 'server'],
      'work': ['meeting', 'boss', 'office', 'deadline', 'project', 'email', 'corporate'],
      'procrastination': ['later', 'tomorrow', 'procrastinat', 'delay', 'postpone'],
      'coffee': ['coffee', 'caffeine', 'espresso', 'latte', 'brew'],
      'sleep': ['sleep', 'tired', 'fatigue', 'exhausted', 'sleepy', 'nap', 'insomnia'],
      'time-pressure': ['hurry', 'rush', 'deadline', 'late', 'quick', 'urgent'],
      'frustration': ['angry', 'upset', 'annoyed', 'irritated', 'mad'],
      'escalation': ['worse', 'terrible', 'awful', 'horrible', 'disaster'],
      'social': ['friend', 'family', 'relationship', 'dating', 'party', 'social'],
      'hobbies': ['game', 'sport', 'music', 'art', 'book', 'movie', 'hobby'],
      'food': ['food', 'eat', 'hungry', 'restaurant', 'cook', 'recipe', 'meal'],
      'exercise': ['gym', 'workout', 'run', 'exercise', 'fitness', 'health']
    };
    
    Object.entries(conceptMappings).forEach(([concept, keywords]) => {
      if (keywords.some(keyword => title.includes(keyword) || allText.includes(keyword))) {
        concepts.push(concept);
      }
    });
    
    // Add concepts from guidance if they were encouraged
    if (guidance.encourageConcepts) {
      concepts.push(...guidance.encourageConcepts.slice(0, 2)); // Max 2 guided concepts
    }
    
    return [...new Set(concepts)];
  } catch (error) {
    log('Error extracting concepts:', error);
    return [];
  }
}

// Save comic to Redis
async function saveComicToRedis(comic, userId) {
  try {
    // Save comic data
    log(`Saving comic with ID: ${comic.id} to Redis...`);
    
    await kv.set(`comic:${comic.id}`, comic, {
      ex: 86400 * 30 // Expire after 30 days
    });

    // Verify the comic was saved correctly
    const savedComic = await kv.get(`comic:${comic.id}`);
    if (!savedComic) {
      throw new Error(`Failed to verify comic ${comic.id} was saved to Redis`);
    }
    log(`Comic ${comic.id} successfully saved to Redis`);

    // Add to user's history
    await kv.lpush(`user:${userId}:comics`, comic.id);
    await kv.ltrim(`user:${userId}:comics`, 0, 99); // Keep last 100

    // Add to global recent comics
    await kv.lpush('comics:recent', comic.id);
    await kv.ltrim('comics:recent', 0, 999); // Keep last 1000

    // Create URL navigation index for fast lookup (comic ID -> comic ID, for consistency)
    if (comic.urlNavigation?.slug) {
      await kv.set(`url:${comic.urlNavigation.slug}`, comic.id, {
        ex: 86400 * 30 // Same expiration as comic
      });
      log(`📑 Created URL index: url:${comic.id} -> ${comic.id}`);
    }

    // Update stats
    await kv.hincrby('stats:comics', 'total', 1);
    await kv.hincrby('stats:comics', `theme:${comic.title.toLowerCase().split(' ')[0]}`, 1);

  } catch (error) {
    log('Error saving comic to Redis:', error);
    // Don't fail the request if Redis save fails, but log detailed error
    log('Redis save error details:', {
      comicId: comic.id,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    });
  }
}

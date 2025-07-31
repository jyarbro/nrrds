import { kv } from '../lib/redis.js';
import OpenAI from 'openai';

const log = (...args) => console.log('[GENERATE-COMIC]', ...args);

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

  try {
    const { userId, preferences = {}, tokenGuidance = {}, timestamp } = req.body;
    log('📥 Request payload:', { 
      requestId,
      userId, 
      preferences: Object.keys(preferences),
      tokenGuidanceKeys: Object.keys(tokenGuidance),
      timestamp,
      hasPreferences: Object.keys(preferences).length > 0,
      hasTokenGuidance: Object.keys(tokenGuidance).length > 0
    });

    // Generate comic ID
    const comicId = `comic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    log('🆔 Generated comic ID:', comicId, 'for request:', requestId);

    log('🔄 Getting global token guidance...');
    // Get aggregated token guidance from global feedback
    const globalTokenGuidance = await getGlobalTokenGuidance();
    log('📈 Global guidance retrieved:', {
      avoidTokens: globalTokenGuidance.avoidTokens?.length || 0,
      encourageTokens: globalTokenGuidance.encourageTokens?.length || 0,
      avoidConcepts: globalTokenGuidance.avoidConcepts?.length || 0,
      encourageConcepts: globalTokenGuidance.encourageConcepts?.length || 0
    });
    
    log('🔀 Combining user and global guidance...');
    // Merge with user's personal token preferences
    const combinedGuidance = await combineTokenGuidance(tokenGuidance, globalTokenGuidance, userId);
    log('✅ Combined guidance ready:', {
      totalAvoidTokens: combinedGuidance.avoidTokens?.length || 0,
      totalEncourageTokens: combinedGuidance.encourageTokens?.length || 0,
      totalAvoidConcepts: combinedGuidance.avoidConcepts?.length || 0,
      totalEncourageConcepts: combinedGuidance.encourageConcepts?.length || 0
    });

    log('🎨 Starting AI comic generation...');
    // Generate comic using AI with token guidance
    const comic = await generateComicWithAI(comicId, combinedGuidance);

    log('💾 Saving comic to Redis...');
    // Save comic to Redis
    await saveComicToRedis(comic, userId);

    const totalDuration = Date.now() - requestStartTime;
    log('🎉 REQUEST COMPLETED SUCCESSFULLY!', {
      requestId,
      comicId,
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
      duration: `${totalDuration}ms`,
      stack: error.stack?.slice(0, 300)
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to generate comic',
      meta: {
        requestId,
        duration: totalDuration,
        timestamp: new Date().toISOString()
      }
    });
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

// Combine personal and global token guidance
async function combineTokenGuidance(personalGuidance, globalGuidance, userId) {
  try {
    // Personal preferences take precedence, global fills in gaps
    const combined = {
      avoidTokens: [...(personalGuidance.avoidTokens || [])],
      encourageTokens: [...(personalGuidance.encourageTokens || [])],
      avoidConcepts: [...(personalGuidance.avoidConcepts || [])],
      encourageConcepts: [...(personalGuidance.encourageConcepts || [])],
      tokenWeights: { ...(personalGuidance.tokenWeights || {}) },
      conceptWeights: { ...(personalGuidance.conceptWeights || {}) }
    };
    
    // Add global guidance for tokens not in personal preferences
    globalGuidance.encourageTokens?.forEach(({ token, weight }) => {
      if (!combined.tokenWeights[token] && !combined.avoidTokens.includes(token)) {
        combined.encourageTokens.push(token);
        combined.tokenWeights[token] = weight * 0.5; // Reduce global influence
      }
    });
    
    globalGuidance.avoidTokens?.forEach(({ token, weight }) => {
      if (!combined.tokenWeights[token] && !combined.encourageTokens.includes(token)) {
        combined.avoidTokens.push(token);
        combined.tokenWeights[token] = -weight * 0.5; // Reduce global influence
      }
    });
    
    return combined;
  } catch (error) {
    log('Error combining token guidance:', error);
    return personalGuidance;
  }
}

// Step 1: Generate comic script with creative freedom
async function generateComicScript(guidance) {
  log('🎬 STEP 1: Starting creative comic script generation...');
  
  // Build token guidance prompt
  const avoidSection = guidance.avoidTokens?.length > 0 ? 
    `AVOID these patterns that users found uninteresting: ${guidance.avoidTokens.join(', ')}` : '';
  
  const encourageSection = guidance.encourageTokens?.length > 0 ? 
    `ENCOURAGE these patterns users enjoyed: ${guidance.encourageTokens.join(', ')}` : '';
  
  const conceptAvoidSection = guidance.avoidConcepts?.length > 0 ? 
    `AVOID these themes: ${guidance.avoidConcepts.join(', ')}` : '';
  
  const conceptEncourageSection = guidance.encourageConcepts?.length > 0 ? 
    `CONSIDER these themes: ${guidance.encourageConcepts.join(', ')}` : '';

  const guidancePrompt = [avoidSection, encourageSection, conceptAvoidSection, conceptEncourageSection]
    .filter(section => section.length > 0)
    .join('\n');

  log('📋 Guidance applied:', {
    avoidTokens: guidance.avoidTokens?.length || 0,
    encourageTokens: guidance.encourageTokens?.length || 0,
    avoidConcepts: guidance.avoidConcepts?.length || 0,
    encourageConcepts: guidance.encourageConcepts?.length || 0,
    guidancePrompt: guidancePrompt.slice(0, 200) + (guidancePrompt.length > 200 ? '...' : '')
  });

  const prompt = `You are a creative comic writer. Create a humorous comic strip script for 3-4 panels.

${guidancePrompt || 'Create original, relatable humor'}

IMPORTANT: Focus on creativity and storytelling. Don't worry about formatting - just create great content.

Requirements:
- Create 3-4 panels that tell a complete story (setup, development, punchline)
- CLEARLY identify all characters who speak or appear in each panel
- For each character, specify:
  * Their name (like "Alex", "Mom", "Boss", "Friend", etc.)
  * An emoji that represents them (like 😊 for happy person, 😴 for tired person, 👩‍💼 for professional, etc.)
  * What they say or think in that panel
- Each panel should have:
  * A time/location context (like "9:00 AM" or "At the coffee shop")
  * Clear indication of WHO is speaking/thinking each line
  * Clear progression toward the punchline
- Make it relatable, funny, and suitable for all audiences
- Focus on universal experiences like work, technology, relationships, daily struggles, etc.

CRITICAL: If multiple people speak in a panel, make it VERY clear who says what. For example:
"Panel 1: At the office, 9 AM
Sarah (😊): Good morning! Ready for the big presentation?
Mike (😰): I forgot we had a presentation today!
Sarah thinks to herself: This is going to be a long day..."

Write your comic script in a natural, descriptive way. Don't format it as JSON - just tell the story with clear character identification.`;

  log('🤖 Sending request to GPT-4o for script generation...');
  log('📝 Prompt length:', prompt.length, 'characters');
  
  const startTime = Date.now();
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a creative comic writer who understands humor, timing, and relatable situations. Write engaging comic scripts that people will find funny and relatable."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.9,
    max_tokens: 1000
  });

  const duration = Date.now() - startTime;
  const script = completion.choices[0].message.content;
  
  log('✅ GPT-4o script generation completed!', {
    duration: `${duration}ms`,
    scriptLength: script.length,
    tokensUsed: completion.usage?.total_tokens || 'unknown',
    promptTokens: completion.usage?.prompt_tokens || 'unknown',
    completionTokens: completion.usage?.completion_tokens || 'unknown'
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
Panel 1:
- Characters: [list with names and emojis]
- Dialogue assignments: [who says what]
- Types: [speech/thought for each line]

Panel 2:
- Characters: [list with names and emojis]
- Dialogue assignments: [who says what]
- Types: [speech/thought for each line]

Be extremely careful about character consistency and dialogue attribution.`;

  log('🤖 Sending character analysis request to GPT-4o-mini...');
  
  const startTime = Date.now();
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a precise script analyst. Carefully identify characters and dialogue attribution in comic scripts."
      },
      {
        role: "user",
        content: analysisPrompt
      }
    ],
    temperature: 0.2,
    max_tokens: 800
  });

  const duration = Date.now() - startTime;
  const analysis = completion.choices[0].message.content;
  
  log('✅ Character analysis completed!', {
    duration: `${duration}ms`,
    analysisLength: analysis.length,
    tokensUsed: completion.usage?.total_tokens || 'unknown'
  });
  
  log('📋 Character analysis preview:', analysis.slice(0, 300) + (analysis.length > 300 ? '...' : ''));

  return analysis;
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
          "name": "[Character name like 'Sarah' or 'Mike']",
          "emoji": "[Character's emoji from script]",
          "style": [1-5 random number],
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
- Use exact character names and emojis from the analysis
- Only include dialogue/thoughts that were in the original script
- Respond with ONLY the JSON object, no other text`;

  log('🤖 Sending formatting request to GPT-4o...');
  log('📏 Format prompt length:', formatPrompt.length, 'characters');
  
  const startTime = Date.now();
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a precise formatter. Convert comic scripts to JSON format exactly as requested. Respond only with valid JSON."
      },
      {
        role: "user",
        content: formatPrompt
      }
    ],
    temperature: 0.2,
    max_tokens: 1200
  });

  const duration = Date.now() - startTime;
  const jsonResponse = completion.choices[0].message.content;
  
  log('✅ GPT-4o formatting completed!', {
    duration: `${duration}ms`,
    responseLength: jsonResponse.length,
    tokensUsed: completion.usage?.total_tokens || 'unknown',
    promptTokens: completion.usage?.prompt_tokens || 'unknown',
    completionTokens: completion.usage?.completion_tokens || 'unknown'
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
{"title":"[title]","panels":[{"header":"[time/location]","characters":[{"name":"[character name]","emoji":"[emoji]","style":1,"effect":null}],"dialogue":[{"text":"[dialogue text]","speaker":"[character name]","type":"speech","style":"normal"}]}]}

CRITICAL RULES:
- Output ONLY JSON, nothing else
- Do not use markdown code blocks
- Do not add explanations
- Use double quotes for all strings
- Every dialogue must have a speaker that matches a character name
- Include all characters who speak in each panel
- Ensure valid JSON syntax`;

  log('🤖 Sending fallback formatting request...');
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a JSON formatter. Output only valid JSON, never use markdown or explanations."
      },
      {
        role: "user",
        content: strictFormatPrompt
      }
    ],
    temperature: 0.1, // Lower temperature for more consistent formatting
    max_tokens: 1000
  });

  const jsonResponse = completion.choices[0].message.content;
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
    
    return parsedComic;
  } catch (parseError) {
    log('❌ Fallback parsing also failed:', parseError.message);
    log('🔍 Fallback cleaned response:', cleanedResponse);
    throw new Error(`Both formatting attempts failed: ${parseError.message}`);
  }
}

// Generate comic using OpenAI with two-step validation
async function generateComicWithAI(comicId, guidance) {
  try {
    log('🚀 Starting two-step comic generation process for:', comicId);
    const overallStartTime = Date.now();
    
    // Step 1: Generate comic script with creative freedom
    const comicScript = await generateComicScript(guidance);
    
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
    
    // Add metadata and styling
    const comic = {
      id: comicId,
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
      timestamp: new Date().toISOString()
    };

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
      'time-pressure': ['hurry', 'rush', 'deadline', 'late', 'quick', 'urgent'],
      'frustration': ['angry', 'upset', 'annoyed', 'irritated', 'mad'],
      'escalation': ['worse', 'terrible', 'awful', 'horrible', 'disaster']
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

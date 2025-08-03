import { kv } from '../lib/redis.js';

const log = (...args) => console.log('[SUBMIT-REACTIONS]', ...args);

/**
 * Handles submission of comic reactions including likes, reactions, and analytics
 * @param {Object} req - The HTTP request object
 * @param {Object} req.body - Request body containing reaction data
 * @param {string} req.body.comicId - ID of the comic being rated
 * @param {string} [req.body.userId] - ID of the user submitting reaction
 * @param {string} req.body.type - Type of reaction (thumbsup, lol, etc.)
 * @param {number} [req.body.weight] - Numerical weight of the reaction
 * @param {string} [req.body.timestamp] - ISO timestamp of reaction
 * @param {string[]} [req.body.comicTokens] - Tokens associated with the comic
 * @param {string[]} [req.body.semanticConcepts] - Semantic concepts in the comic
 * @param {string} [req.body.action] - Action type (increment/decrement)
 * @param {Object} res - The HTTP response object
 * @returns {Promise<Object>} JSON response with success status
 */
export default async function handler(req, res) {

  if (req.method !== 'POST') {
    log('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { comicId, userId, type, weight, timestamp, comicTokens, semanticConcepts, action } = req.body;
    log('Received reaction:', { comicId, userId, type, weight, timestamp, comicTokens, semanticConcepts, action });

    if (!comicId || !type) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields' 
      });
    }

    const validTypes = [
      'thumbsup', 'lol', 'heartwarming', 'awesome', 'inspired', 'unique',
      'mindblown', 'celebrating', 'deep', 'relatable', 'confused', 'meh',
      'sad', 'spooked', 'gross', 'cringe', 'angry', 'facepalm',
      'eyeroll', 'skeptical', 'offended'
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid reaction type' 
      });
    }

    if (action === 'decrement') {
      const currentCount = parseInt(await kv.hget(`comic:${comicId}:stats`, type) || '0', 10);
      if (currentCount > 0) {
        await kv.hincrby(`comic:${comicId}:stats`, type, -1);
        const totalCount = parseInt(await kv.hget(`comic:${comicId}:stats`, 'total') || '0', 10);
        if (totalCount > 0) {
          await kv.hincrby(`comic:${comicId}:stats`, 'total', -1);
        }
      }
      const weights = {
        love: 2,
        funny: 1.5,
        clever: 1.5,
        inspiring: 1.5,
        meh: 0,
        confused: -1,
        boring: -1.5,
        offensive: -2
      };
      const scoreChange = weights[type] || 0;
      if (scoreChange !== 0) {
        await kv.hincrbyfloat(`comic:${comicId}:stats`, 'score', -scoreChange);
      }
      return res.status(200).json({ success: true });
    } else {
      const reactionId = `reaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await storeReaction({
        id: reactionId,
        comicId,
        userId: userId || 'anonymous',
        type,
        weight: weight || 0,
        timestamp: timestamp || new Date().toISOString(),
        comicTokens: comicTokens || [],
        semanticConcepts: semanticConcepts || []
      });

      log('Reaction stored:', reactionId);

      if (comicTokens && comicTokens.length > 0) {
        log('Updating token stats for tokens:', comicTokens);
        try {
          await updateTokenStats(comicTokens, type, weight);
          log('Token stats updated successfully');
        } catch (error) {
          log('Error updating token stats (non-blocking):', error.message);
        }
      }
      
      if (semanticConcepts && semanticConcepts.length > 0) {
        log('Updating concept stats for concepts:', semanticConcepts);
        try {
          await updateConceptStats(semanticConcepts, type, weight);
          log('Concept stats updated successfully');
        } catch (error) {
          log('Error updating concept stats (non-blocking):', error.message);
        }
      }

      if (userId && weight) {
        await updateUserPreferences(userId, type, weight);
      }

      await updateComicStats(comicId, type, userId);

      await logAnalytics(type, comicId, userId);

      return res.status(200).json({
        success: true
      });
    }

  } catch (error) {
    log('Error submitting reaction:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit reaction'
    });
  }
}

/**
 * Stores reaction data in Redis with appropriate expiration and list management
 * @param {Object} reaction - The reaction object to store
 * @param {string} reaction.id - Unique reaction ID
 * @param {string} reaction.comicId - ID of the comic being rated
 * @param {string} reaction.userId - ID of the user submitting reaction
 * @param {string} reaction.type - Type of reaction
 * @param {number} reaction.weight - Numerical weight of the reaction
 * @param {string} reaction.timestamp - ISO timestamp
 * @param {string[]} reaction.comicTokens - Tokens associated with the comic
 * @param {string[]} reaction.semanticConcepts - Semantic concepts
 * @returns {Promise<void>} Promise that resolves when reaction is stored
 */
async function storeReaction(reaction) {
  try {
    await kv.set(`reaction:${reaction.id}`, reaction, {
      ex: 86400 * 90
    });

    await kv.lpush(`comic:${reaction.comicId}:reactions`, reaction.id);
    await kv.ltrim(`comic:${reaction.comicId}:reactions`, 0, 999);

    if (reaction.userId !== 'anonymous') {
      await kv.lpush(`user:${reaction.userId}:reaction_history`, reaction.id);
      await kv.ltrim(`user:${reaction.userId}:reaction_history`, 0, 499);
    }

  } catch (error) {
    console.error('Error storing reaction:', error);
    throw error;
  }
}

/**
 * Updates user preferences based on reactions to train AI personalization
 * @param {string} userId - ID of the user
 * @param {string} reactionType - Type of reaction given
 * @param {number} weight - Numerical weight of the reaction
 * @returns {Promise<void>} Promise that resolves when preferences are updated
 */
async function updateUserPreferences(userId, reactionType, weight) {
  try {
    const key = `user:${userId}:preferences`;
    
    const currentPrefs = await kv.hgetall(key) || {};
    
    const currentWeight = parseFloat(currentPrefs[reactionType] || 0);
    const newWeight = currentWeight + weight;
    
    await kv.hset(key, reactionType, newWeight);

    await calculatePreferenceSummary(userId);

  } catch (error) {
    console.error('Error updating user preferences:', error);
  }
}

/**
 * Calculates normalized preference summary from user reactions for AI training
 * @param {string} userId - ID of the user
 * @returns {Promise<void>} Promise that resolves when summary is calculated and stored
 */
async function calculatePreferenceSummary(userId) {
  try {
    const prefs = await kv.hgetall(`user:${userId}:preferences`) || {};
    
    const totalWeight = Object.values(prefs).reduce((sum, w) => sum + Math.abs(parseFloat(w)), 0);
    
    if (totalWeight > 0) {
      const summary = {};
      
      for (const [type, weight] of Object.entries(prefs)) {
        const normalizedWeight = parseFloat(weight) / totalWeight;
        
        if (type === 'love' || type === 'inspiring') {
          summary.positive = (summary.positive || 0) + normalizedWeight;
        } else if (type === 'funny') {
          summary.humor = (summary.humor || 0) + normalizedWeight;
        } else if (type === 'clever') {
          summary.intellectual = (summary.intellectual || 0) + normalizedWeight;
        } else if (type === 'confused' || type === 'boring') {
          summary.negative = (summary.negative || 0) + normalizedWeight;
        }
      }
      
      await kv.set(`user:${userId}:preference_summary`, summary, {
        ex: 86400 * 30
      });
    }
  } catch (error) {
    console.error('Error calculating preference summary:', error);
  }
}

/**
 * Updates comic statistics including counters, scores, and popularity rankings
 * @param {string} comicId - ID of the comic
 * @param {string} reactionType - Type of reaction received
 * @param {string} userId - ID of the user giving reaction
 * @returns {Promise<void>} Promise that resolves when stats are updated
 */
async function updateComicStats(comicId, reactionType, userId) {
  try {
    await kv.hincrby(`comic:${comicId}:stats`, reactionType, 1);
    
    if (userId && userId !== 'anonymous') {
      await kv.sadd(`comic:${comicId}:users`, userId);
    }
    
    await kv.hincrby(`comic:${comicId}:stats`, 'total', 1);
    
    const weights = {
      love: 2,
      funny: 1.5,
      clever: 1.5,
      inspiring: 1.5,
      meh: 0,
      confused: -1,
      boring: -1.5,
      offensive: -2
    };
    
    const scoreChange = weights[reactionType] || 0;
    if (scoreChange !== 0) {
      await kv.hincrbyfloat(`comic:${comicId}:stats`, 'score', scoreChange);
    }
    
    const stats = await kv.hgetall(`comic:${comicId}:stats`);
    const score = parseFloat(stats.score || 0);
    
    if (score > 10) {
      await kv.zadd('comics:popular', score, comicId);
      await kv.zremrangebyrank('comics:popular', 0, -101);
    }
    
  } catch (error) {
    console.error('Error updating comic stats:', error);
  }
}

/**
 * Updates token statistics for AI guidance with Upstash compatibility
 * @param {string[]} tokens - Array of tokens to update stats for
 * @param {string} reactionType - Type of reaction received
 * @param {number} weight - Numerical weight of the reaction
 * @returns {Promise<void>} Promise that resolves when token stats are updated
 */
async function updateTokenStats(tokens, reactionType, weight) {
  try {
    const isPositive = weight > 0;
    const isNegative = weight < 0;
    
    await updateTokenRegistry(tokens);
    
    for (const token of tokens) {
      const key = `token_stats:${token}`;
      
      const currentStats = await kv.get(key);
      const stats = currentStats || {
        positive: 0,
        negative: 0,
        total: 0,
        lastUpdated: new Date().toISOString()
      };
      
      if (isPositive) stats.positive += 1;
      if (isNegative) stats.negative += 1;
      stats.total += 1;
      stats.lastUpdated = new Date().toISOString();
      
      await kv.set(key, stats, {
        ex: 86400 * 90
      });
      
      try {
        await kv.lpush('reaction_queue', {
          token,
          reactionType,
          weight,
          timestamp: new Date().toISOString()
        });
      } catch (queueError) {
        log('Warning: Failed to add to reaction queue (non-critical):', queueError.message);
      }
    }
    
    await kv.del('token_guidance_cache');
    
  } catch (error) {
    console.error('Error updating token stats:', error);
  }
}

/**
 * Maintains a registry of all tokens encountered for Upstash compatibility
 * @param {string[]} newTokens - Array of new tokens to add to registry
 * @returns {Promise<void>} Promise that resolves when registry is updated
 */
async function updateTokenRegistry(newTokens) {
  try {
    let tokenRegistry = await kv.get('token_registry');
    const currentTokens = tokenRegistry || [];
    
    const updatedTokens = [...new Set([...currentTokens, ...newTokens])];
    
    if (updatedTokens.length > 1000) {
      updatedTokens.splice(0, updatedTokens.length - 1000);
    }
    
    await kv.set('token_registry', updatedTokens);
  } catch (error) {
    console.error('Error updating token registry:', error);
  }
}

/**
 * Updates semantic concept statistics based on user reactions
 * @param {string[]} concepts - Array of semantic concepts to update
 * @param {string} reactionType - Type of reaction received
 * @param {number} weight - Numerical weight of the reaction
 * @returns {Promise<void>} Promise that resolves when concept stats are updated
 */
async function updateConceptStats(concepts, reactionType, weight) {
  try {
    const isPositive = weight > 0;
    const isNegative = weight < 0;
    
    for (const concept of concepts) {
      const key = `concept_stats:${concept}`;
      
      const currentStats = await kv.get(key);
      const stats = currentStats || {
        positive: 0,
        negative: 0,
        total: 0,
        reactionTypes: {},
        lastUpdated: new Date().toISOString()
      };
      
      if (isPositive) stats.positive += 1;
      if (isNegative) stats.negative += 1;
      stats.total += 1;
      stats.reactionTypes[reactionType] = (stats.reactionTypes[reactionType] || 0) + 1;
      stats.lastUpdated = new Date().toISOString();
      
      await kv.set(key, stats, {
        ex: 86400 * 90
      });
    }
    
  } catch (error) {
    console.error('Error updating concept stats:', error);
  }
}

/**
 * Logs analytics data for reaction tracking and reporting
 * @param {string} reactionType - Type of reaction received
 * @param {string} comicId - ID of the comic that received reaction
 * @param {string} userId - ID of the user who gave reaction
 * @returns {Promise<void>} Promise that resolves when analytics are logged
 */
async function logAnalytics(reactionType, comicId, userId) {
  try {
    const date = new Date().toISOString().split('T')[0];
    
    await kv.hincrby(`analytics:daily:${date}`, 'reaction_total', 1);
    await kv.hincrby(`analytics:daily:${date}`, `reaction_${reactionType}`, 1);
    
    const hour = new Date().getHours();
    await kv.hincrby(`analytics:hourly:${date}`, `hour_${hour}`, 1);
    
    if (userId !== 'anonymous') {
      await kv.sadd(`analytics:active_users:${date}`, userId);
      await kv.expire(`analytics:active_users:${date}`, 86400 * 7);
    }
    
    await kv.hincrby('analytics:reaction_types', reactionType, 1);
    
  } catch (error) {
    console.error('Error logging analytics:', error);
  }
}

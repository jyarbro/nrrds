import { kv } from '../lib/redis.js';

const log = (...args) => console.log('[SUBMIT-FEEDBACK]', ...args);

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    log('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { comicId, userId, type, weight, timestamp, comicTokens, semanticConcepts, action } = req.body;
    log('Received feedback:', { comicId, userId, type, weight, timestamp, comicTokens, semanticConcepts, action });

    // Validate input
    if (!comicId || !type) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields' 
      });
    }

    // No rate limiting - users can submit as much feedback as they want

    // Validate feedback type
    const validTypes = [
      'thumbsup', 'lol', 'heartwarming', 'awesome', 'inspired', 'unique',
      'mindblown', 'celebrating', 'deep', 'relatable', 'confused', 'meh',
      'sad', 'spooked', 'grossedout', 'cringe', 'angry', 'facepalm',
      'eyeroll', 'skeptical', 'offended'
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid feedback type' 
      });
    }

    // Handle increment or decrement
    if (action === 'decrement') {
      // Decrement feedback count, but not below zero
      const currentCount = parseInt(await kv.hget(`comic:${comicId}:stats`, type) || '0', 10);
      if (currentCount > 0) {
        await kv.hincrby(`comic:${comicId}:stats`, type, -1);
        // Also decrement total feedback count if above zero
        const totalCount = parseInt(await kv.hget(`comic:${comicId}:stats`, 'total') || '0', 10);
        if (totalCount > 0) {
          await kv.hincrby(`comic:${comicId}:stats`, 'total', -1);
        }
      }
      // Optionally, decrement score if needed (reverse increment logic)
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
      // Generate feedback ID
      const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store feedback
      await storeFeedback({
        id: feedbackId,
        comicId,
        userId: userId || 'anonymous',
        type,
        weight: weight || 0,
        timestamp: timestamp || new Date().toISOString(),
        comicTokens: comicTokens || [],
        semanticConcepts: semanticConcepts || []
      });

      log('Feedback stored:', feedbackId);

      // Update token statistics for AI guidance
      if (comicTokens && comicTokens.length > 0) {
        log('Updating token stats for tokens:', comicTokens);
        try {
          await updateTokenStats(comicTokens, type, weight);
          log('Token stats updated successfully');
        } catch (error) {
          log('Error updating token stats (non-blocking):', error.message);
          // Don't fail the request if token stats fail
        }
      }
      
      // Update concept statistics
      if (semanticConcepts && semanticConcepts.length > 0) {
        log('Updating concept stats for concepts:', semanticConcepts);
        try {
          await updateConceptStats(semanticConcepts, type, weight);
          log('Concept stats updated successfully');
        } catch (error) {
          log('Error updating concept stats (non-blocking):', error.message);
          // Don't fail the request if concept stats fail
        }
      }

      // Update user preferences for AI training
      if (userId && weight) {
        await updateUserPreferences(userId, type, weight);
      }

      // Update comic statistics
      await updateComicStats(comicId, type, userId);

      // Log analytics
      await logAnalytics(type, comicId, userId);

      return res.status(200).json({
        success: true
      });
    }

  } catch (error) {
    log('Error submitting feedback:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
}

// Store feedback in Redis
async function storeFeedback(feedback) {
  try {
    // Store feedback object
    await kv.set(`feedback:${feedback.id}`, feedback, {
      ex: 86400 * 90 // Expire after 90 days
    });

    // Add to comic's feedback list
    await kv.lpush(`comic:${feedback.comicId}:feedback`, feedback.id);
    await kv.ltrim(`comic:${feedback.comicId}:feedback`, 0, 999); // Keep last 1000

    // Add to user's feedback history
    if (feedback.userId !== 'anonymous') {
      await kv.lpush(`user:${feedback.userId}:feedback_history`, feedback.id);
      await kv.ltrim(`user:${feedback.userId}:feedback_history`, 0, 499); // Keep last 500
    }

  } catch (error) {
    console.error('Error storing feedback:', error);
    throw error;
  }
}

// Update user preferences based on feedback
async function updateUserPreferences(userId, feedbackType, weight) {
  try {
    // Update user's preference weights
    const key = `user:${userId}:preferences`;
    
    // Get current preferences
    const currentPrefs = await kv.hgetall(key) || {};
    
    // Update weight for this feedback type
    const currentWeight = parseFloat(currentPrefs[feedbackType] || 0);
    const newWeight = currentWeight + weight;
    
    await kv.hset(key, feedbackType, newWeight);

    // Calculate and store preference summary
    await calculatePreferenceSummary(userId);

  } catch (error) {
    console.error('Error updating user preferences:', error);
    // Don't fail the request if preference update fails
  }
}

// Calculate preference summary for AI training
async function calculatePreferenceSummary(userId) {
  try {
    const prefs = await kv.hgetall(`user:${userId}:preferences`) || {};
    
    // Calculate normalized weights
    const totalWeight = Object.values(prefs).reduce((sum, w) => sum + Math.abs(parseFloat(w)), 0);
    
    if (totalWeight > 0) {
      const summary = {};
      
      // Normalize and categorize preferences
      for (const [type, weight] of Object.entries(prefs)) {
        const normalizedWeight = parseFloat(weight) / totalWeight;
        
        // Map to content categories
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
      
      // Store summary
      await kv.set(`user:${userId}:preference_summary`, summary, {
        ex: 86400 * 30 // Expire after 30 days
      });
    }
  } catch (error) {
    console.error('Error calculating preference summary:', error);
  }
}

// Update comic statistics
async function updateComicStats(comicId, feedbackType, userId) {
  try {
    // Increment feedback counter for this type
    await kv.hincrby(`comic:${comicId}:stats`, feedbackType, 1);
    
    // Track unique users who gave feedback (for unique user count)
    if (userId && userId !== 'anonymous') {
      await kv.sadd(`comic:${comicId}:users`, userId);
    }
    
    // Increment total feedback count
    await kv.hincrby(`comic:${comicId}:stats`, 'total', 1);
    
    // Update comic score based on feedback weight
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
    
    const scoreChange = weights[feedbackType] || 0;
    if (scoreChange !== 0) {
      await kv.hincrbyfloat(`comic:${comicId}:stats`, 'score', scoreChange);
    }
    
    // Update popular comics list if score is high
    const stats = await kv.hgetall(`comic:${comicId}:stats`);
    const score = parseFloat(stats.score || 0);
    
    if (score > 10) {
      await kv.zadd('comics:popular', score, comicId);
      // Keep only top 100 popular comics
      await kv.zremrangebyrank('comics:popular', 0, -101);
    }
    
  } catch (error) {
    console.error('Error updating comic stats:', error);
    // Don't fail the request if stats update fails
  }
}

// Update token statistics for AI guidance (Upstash-compatible)
async function updateTokenStats(tokens, feedbackType, weight) {
  try {
    const isPositive = weight > 0;
    const isNegative = weight < 0;
    
    // Update token registry for Upstash compatibility
    await updateTokenRegistry(tokens);
    
    // Update each token's stats
    for (const token of tokens) {
      const key = `token_stats:${token}`;
      
      // Get current stats or initialize
      const currentStats = await kv.get(key);
      const stats = currentStats || {
        positive: 0,
        negative: 0,
        total: 0,
        lastUpdated: new Date().toISOString()
      };
      
      // Update stats
      if (isPositive) stats.positive += 1;
      if (isNegative) stats.negative += 1;
      stats.total += 1;
      stats.lastUpdated = new Date().toISOString();
      
      // Save updated stats
      await kv.set(key, stats, {
        ex: 86400 * 90 // Expire after 90 days
      });
      
      // Add to feedback processing queue for batch operations
      try {
        await kv.lpush('feedback_queue', {
          token,
          feedbackType,
          weight,
          timestamp: new Date().toISOString()
        }));
      } catch (queueError) {
        log('Warning: Failed to add to feedback queue (non-critical):', queueError.message);
        // Don't fail if queue addition fails
      }
    }
    
    // Clear token guidance cache to force recalculation
    await kv.del('token_guidance_cache');
    
  } catch (error) {
    console.error('Error updating token stats:', error);
    // Don't fail the request if token stats update fails
  }
}

// Update token registry (maintain list of all tokens for Upstash)
async function updateTokenRegistry(newTokens) {
  try {
    let tokenRegistry = await kv.get('token_registry');
    const currentTokens = tokenRegistry || [];
    
    // Add new tokens to registry
    const updatedTokens = [...new Set([...currentTokens, ...newTokens])];
    
    // Limit registry size to prevent it from growing too large
    if (updatedTokens.length > 1000) {
      updatedTokens.splice(0, updatedTokens.length - 1000);
    }
    
    await kv.set('token_registry', updatedTokens);
  } catch (error) {
    console.error('Error updating token registry:', error);
    // Don't fail if registry update fails
  }
}

// Update concept statistics
async function updateConceptStats(concepts, feedbackType, weight) {
  try {
    const isPositive = weight > 0;
    const isNegative = weight < 0;
    
    // Update each concept's stats
    for (const concept of concepts) {
      const key = `concept_stats:${concept}`;
      
      // Get current stats or initialize
      const currentStats = await kv.get(key);
      const stats = currentStats || {
        positive: 0,
        negative: 0,
        total: 0,
        feedbackTypes: {},
        lastUpdated: new Date().toISOString()
      };
      
      // Update stats
      if (isPositive) stats.positive += 1;
      if (isNegative) stats.negative += 1;
      stats.total += 1;
      stats.feedbackTypes[feedbackType] = (stats.feedbackTypes[feedbackType] || 0) + 1;
      stats.lastUpdated = new Date().toISOString();
      
      // Save updated stats
      await kv.set(key, stats, {
        ex: 86400 * 90 // Expire after 90 days
      });
    }
    
  } catch (error) {
    console.error('Error updating concept stats:', error);
    // Don't fail the request if concept stats update fails
  }
}

// Log analytics
async function logAnalytics(feedbackType, comicId, userId) {
  try {
    const date = new Date().toISOString().split('T')[0];
    
    // Daily feedback counts
    await kv.hincrby(`analytics:daily:${date}`, 'feedback_total', 1);
    await kv.hincrby(`analytics:daily:${date}`, `feedback_${feedbackType}`, 1);
    
    // Hourly feedback counts
    const hour = new Date().getHours();
    await kv.hincrby(`analytics:hourly:${date}`, `hour_${hour}`, 1);
    
    // User engagement tracking
    if (userId !== 'anonymous') {
      await kv.sadd(`analytics:active_users:${date}`, userId);
      await kv.expire(`analytics:active_users:${date}`, 86400 * 7); // Keep for 7 days
    }
    
    // Feedback type distribution
    await kv.hincrby('analytics:feedback_types', feedbackType, 1);
    
  } catch (error) {
    console.error('Error logging analytics:', error);
    // Don't fail the request if analytics logging fails
  }
}

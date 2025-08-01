import { kv } from '../lib/redis.js';

const log = (...args) => console.log('[GET-REACTIONS]', ...args);

/**
 * Retrieves reaction statistics for a specific comic
 * @param {Object} req - HTTP request object with query parameters
 * @param {Object} res - HTTP response object
 * @returns {Promise<void>} JSON response with reaction stats or error
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    log('Options request received, responding with 204');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    log('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { comicId } = req.query;
    log('Fetching reactions for comicId:', comicId);

    if (!comicId) {
      return res.status(400).json({ 
        success: false,
        error: 'Comic ID required' 
      });
    }

    const stats = await getComicStats(comicId);
    log('Reaction stats:', stats);

    const recentReactions = await getRecentReactions(comicId);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    return res.status(200).json({
      success: true,
      comicId,
      stats,
      recentReactions,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    log('Error getting reactions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve reactions'
    });
  }
}

/**
 * Retrieves and processes comic statistics from Redis
 * @param {string} comicId - The comic ID to get stats for
 * @returns {Promise<Object>} Processed comic statistics
 */
async function getComicStats(comicId) {
  try {
    const stats = await kv.hgetall(`comic:${comicId}:stats`) || {};
    
    const processedStats = {};
    for (const [key, value] of Object.entries(stats)) {
      if (key === 'score') {
        processedStats[key] = parseFloat(value) || 0;
      } else {
        processedStats[key] = parseInt(value) || 0;
      }
    }

    const reactionTypes = [
      'thumbsup', 'lol', 'heartwarming', 'awesome', 'inspired', 'unique',
      'mindblown', 'celebrating', 'deep', 'relatable', 'confused', 'meh',
      'sad', 'spooked', 'grossedout', 'cringe', 'angry', 'facepalm',
      'eyeroll', 'skeptical', 'offended'
    ];
    reactionTypes.forEach(type => {
      if (!(type in processedStats)) {
        processedStats[type] = 0;
      }
    });

    const uniqueUsers = await kv.scard(`comic:${comicId}:users`) || 0;
    processedStats.uniqueUsers = uniqueUsers;
    
    const total = processedStats.total || 0;
    if (total > 0) {
      const positiveCount = (processedStats.thumbsup || 0) + 
                           (processedStats.lol || 0) + 
                           (processedStats.heartwarming || 0) + 
                           (processedStats.awesome || 0) + 
                           (processedStats.inspired || 0) + 
                           (processedStats.unique || 0) + 
                           (processedStats.mindblown || 0) + 
                           (processedStats.celebrating || 0);
      processedStats.engagementRate = Math.round((positiveCount / total) * 100);
    } else {
      processedStats.engagementRate = 0;
    }

    return processedStats;
  } catch (error) {
    console.error('Error getting comic stats:', error);
    return {};
  }
}

/**
 * Retrieves recent reaction details for a comic
 * @param {string} comicId - The comic ID to get reactions for
 * @param {number} [limit=10] - Maximum number of reaction entries to return
 * @returns {Promise<Array>} Array of recent reaction entries
 */
async function getRecentReactions(comicId, limit = 10) {
  try {
    const reactionIds = await kv.lrange(`comic:${comicId}:reactions`, 0, limit - 1) || [];
    
    if (reactionIds.length === 0) {
      return [];
    }

    const reactionPromises = reactionIds.map(async (id) => {
      try {
        const reactionData = await kv.get(`reaction:${id}`);
        return reactionData || null;
      } catch (error) {
        console.error(`Error getting reaction ${id}:`, error);
        return null;
      }
    });

    const reactionList = await Promise.all(reactionPromises);
    
    return reactionList
      .filter(reaction => reaction !== null)
      .map(reaction => ({
        type: reaction.type,
        timestamp: reaction.timestamp,
        userId: reaction.userId === 'anonymous' ? null : reaction.userId
      }));

  } catch (error) {
    console.error('Error getting recent reactions:', error);
    return [];
  }
}

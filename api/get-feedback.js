import { kv } from '../lib/redis.js';

const log = (...args) => console.log('[GET-FEEDBACK]', ...args);

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
    log('Fetching feedback for comicId:', comicId);

    if (!comicId) {
      return res.status(400).json({ 
        success: false,
        error: 'Comic ID required' 
      });
    }

    // Get comic statistics
    const stats = await getComicStats(comicId);
    log('Feedback stats:', stats);

    // Get recent feedback details (optional)
    const recentFeedback = await getRecentFeedback(comicId);

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    return res.status(200).json({
      success: true,
      comicId,
      stats,
      recentFeedback,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    log('Error getting feedback:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve feedback'
    });
  }
}

// Get comic statistics
async function getComicStats(comicId) {
  try {
    const stats = await kv.hgetall(`comic:${comicId}:stats`) || {};
    
    // Convert string values to numbers
    const processedStats = {};
    for (const [key, value] of Object.entries(stats)) {
      if (key === 'score') {
        processedStats[key] = parseFloat(value) || 0;
      } else {
        processedStats[key] = parseInt(value) || 0;
      }
    }

    // Ensure all feedback types are represented
    const feedbackTypes = [
      'thumbsup', 'lol', 'heartwarming', 'awesome', 'inspired', 'unique',
      'mindblown', 'celebrating', 'deep', 'relatable', 'confused', 'meh',
      'sad', 'spooked', 'grossedout', 'cringe', 'angry', 'facepalm',
      'eyeroll', 'skeptical', 'offended'
    ];
    feedbackTypes.forEach(type => {
      if (!(type in processedStats)) {
        processedStats[type] = 0;
      }
    });

    // Get unique user count
    const uniqueUsers = await kv.scard(`comic:${comicId}:users`) || 0;
    processedStats.uniqueUsers = uniqueUsers;
    
    // Calculate engagement rate
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

// Get recent feedback details
async function getRecentFeedback(comicId, limit = 10) {
  try {
    // Get recent feedback IDs
    const feedbackIds = await kv.lrange(`comic:${comicId}:feedback`, 0, limit - 1) || [];
    
    if (feedbackIds.length === 0) {
      return [];
    }

    // Get feedback details
    const feedbackPromises = feedbackIds.map(async (id) => {
      try {
        const feedbackData = await kv.get(`feedback:${id}`);
        return feedbackData || null;
      } catch (error) {
        console.error(`Error getting feedback ${id}:`, error);
        return null;
      }
    });

    const feedbackList = await Promise.all(feedbackPromises);
    
    // Filter out null values and return
    return feedbackList
      .filter(feedback => feedback !== null)
      .map(feedback => ({
        type: feedback.type,
        timestamp: feedback.timestamp,
        userId: feedback.userId === 'anonymous' ? null : feedback.userId
      }));

  } catch (error) {
    console.error('Error getting recent feedback:', error);
    return [];
  }
}

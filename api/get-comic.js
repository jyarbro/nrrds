import { kv } from '../lib/redis.js';

const log = (...args) => console.log('[GET-COMIC]', ...args);

/**
 * Retrieves a specific comic by ID from Redis storage
 * @param {Object} req - HTTP request object with query parameters
 * @param {Object} res - HTTP response object
 * @returns {Promise<void>} JSON response with comic data or error
 */
export default async function handler(req, res) {

  try {
    const { id } = req.query;
    log('Attempting to retrieve comic with ID:', id);

    if (!id) {
      log('No comic ID provided');
      return res.status(400).json({ 
        success: false,
        error: 'Comic ID required' 
      });
    }

    log('Querying Redis for key:', `comic:${id}`);
    const comicData = await kv.get(`comic:${id}`);
    
    if (!comicData) {
      log('Comic not found in Redis:', id);
      return res.status(404).json({
        success: false,
        error: 'Comic not found',
        id: id
      });
    }

    log('Comic found in Redis:', id);
    const comic = comicData;

    const stats = await kv.hgetall(`comic:${id}:stats`) || {};

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

    return res.status(200).json({
      success: true,
      comic,
      stats: {
        views: parseInt(stats.views || 0),
        total_feedback: parseInt(stats.total || 0),
        score: parseFloat(stats.score || 0)
      }
    });

  } catch (error) {
    log('Error getting comic:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve comic'
    });
  }
}

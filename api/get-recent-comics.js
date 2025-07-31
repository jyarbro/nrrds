import { kv } from '../lib/redis.js';

const log = (...args) => console.log('[GET-RECENT-COMICS]', ...args);

export default async function handler(req, res) {

  try {
    const { limit = 10 } = req.query;
    const maxLimit = Math.min(parseInt(limit), 50); // Cap at 50 comics
    
    log('Fetching recent comics, limit:', maxLimit);

    // Get recent comic IDs from Redis list
    const comicIds = await kv.lrange('comics:recent', 0, maxLimit - 1);
    
    if (!comicIds || comicIds.length === 0) {
      log('No recent comics found in Redis');
      return res.status(200).json({
        success: true,
        comics: []
      });
    }

    log('Found comic IDs:', comicIds);

    // Fetch full comic data for each ID
    const comicKeys = comicIds.map(id => `comic:${id}`);
    const comicData = await kv.mget(comicKeys);
    
    const comics = [];
    for (let i = 0; i < comicIds.length; i++) {
      if (comicData[i]) {
        comics.push(comicData[i]);
      } else {
        log('No data found for comic ID:', comicIds[i]);
      }
    }

    log(`Successfully fetched ${comics.length} of ${comicIds.length} recent comics`);

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    return res.status(200).json({
      success: true,
      comics
    });

  } catch (error) {
    log('Error getting recent comics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent comics'
    });
  }
}
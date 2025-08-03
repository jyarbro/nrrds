import { kv } from '../lib/redis.js';

const log = (...args) => console.log('[GET-COMIC-BY-URL]', ...args);

export default async function handler(req, res) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  log('🌐 NEW REQUEST RECEIVED:', requestId);

  if (req.method !== 'GET') {
    log('❌ Method not allowed:', req.method, 'for request:', requestId);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { slug } = req.query;
    
    if (!slug) {
      log('❌ Missing slug parameter for request:', requestId);
      return res.status(400).json({ 
        success: false, 
        error: 'URL slug parameter is required' 
      });
    }

    log('🔍 Looking up comic by URL slug:', slug, 'for request:', requestId);

    // Look up comic ID by URL slug from pre-generated index
    const comicId = await kv.get(`url:${slug}`);
    
    if (!comicId) {
      log('❌ No comic found for slug:', slug, 'for request:', requestId);
      return res.status(404).json({ 
        success: false, 
        error: 'Comic not found for URL slug',
        slug: slug
      });
    }

    log('✅ Found comic ID:', comicId, 'for slug:', slug, 'for request:', requestId);

    // Get the comic data
    const comic = await kv.get(`comic:${comicId}`);
    
    if (!comic) {
      log('❌ Comic data not found for ID:', comicId, 'for request:', requestId);
      return res.status(404).json({ 
        success: false, 
        error: 'Comic data not found',
        comicId: comicId
      });
    }

    log('🎉 Successfully retrieved comic:', {
      requestId,
      comicId: comic.id,
      title: comic.title,
      slug: slug,
      hasUrlNavigation: !!comic.urlNavigation
    });

    return res.status(200).json({
      success: true,
      comic,
      meta: {
        requestId,
        lookedUpBySlug: slug,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    log('❌ REQUEST FAILED:', {
      requestId,
      error: error.message,
      stack: error.stack?.slice(0, 300)
    });
    
    return res.status(500).json({
      success: false,
      error: 'Failed to get comic by URL',
      meta: {
        requestId,
        timestamp: new Date().toISOString()
      }
    });
  }
}

const log = (...args) => console.log('[HEALTH]', ...args);

export default async function handler(req, res) {
  log('Health check endpoint hit', req.method, req.url);
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'development'
  });
}

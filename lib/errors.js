const log = (...args) => console.error('[ERRORS]', ...args);

export class APIError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function handleError(res, error) {
  log('API Error:', error);
  
  if (error instanceof APIError) {
    return res.status(error.statusCode).json({
      error: error.message
    });
  }
  
  return res.status(500).json({
    error: 'Internal server error'
  });
}

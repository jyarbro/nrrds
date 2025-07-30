import { CONFIG } from './config.js';

/**
 * API client for communicating with Vercel Functions and backend endpoints for comics.
 */
class ComicAPI {
    constructor() {
        this.baseURL = CONFIG.API_BASE_URL;
        this.userId = this.getOrCreateUserId();
    }

    /**
     * Get or create a unique user ID stored in localStorage.
     * @returns {string} The user ID.
     */
    getOrCreateUserId() {
        let userId = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID);
        if (!userId) {
            userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER_ID, userId);
        }
        return userId;
    }

    /**
     * Generic fetch wrapper with error handling.
     * @param {string} endpoint - API endpoint.
     * @param {object} [options={}] - Fetch options.
     * @returns {Promise<any>} Response data.
     */
    async fetchAPI(endpoint, options = {}) {
        const isDev = window.location.hostname === 'localhost';
        const requestId = `xhr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const startTime = Date.now();
        
        try {
            const url = isDev ? `/api/${endpoint}` : `${this.baseURL}/api/${endpoint}`;
            const fetchOptions = {
                ...options,
                credentials: isDev ? 'omit' : 'include',
                mode: isDev ? 'same-origin' : 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };
            
            if (isDev) {
                console.log('🌐 [FRONTEND] XHR REQUEST:', {
                    requestId,
                    endpoint,
                    url,
                    method: options.method || 'GET',
                    hasBody: !!options.body,
                    bodySize: options.body ? options.body.length : 0,
                    timestamp: new Date().toISOString()
                });
                
                if (options.body && endpoint === 'generate-comic') {
                    try {
                        const bodyData = JSON.parse(options.body);
                        console.log('📦 [FRONTEND] Comic Generation Payload:', {
                            requestId,
                            userId: bodyData.userId,
                            hasPreferences: Object.keys(bodyData.preferences || {}).length > 0,
                            hasTokenGuidance: Object.keys(bodyData.tokenGuidance || {}).length > 0,
                            tokenGuidanceKeys: Object.keys(bodyData.tokenGuidance || {}),
                            timestamp: bodyData.timestamp
                        });
                    } catch (e) {
                        console.log('📦 [FRONTEND] Request body (unparseable):', options.body?.slice(0, 200));
                    }
                }
            }
            
            const response = await fetch(url, fetchOptions);
            const duration = Date.now() - startTime;
            
            if (isDev) {
                console.log('📡 [FRONTEND] XHR RESPONSE:', {
                    requestId,
                    status: response.status,
                    statusText: response.statusText,
                    ok: response.ok,
                    duration: `${duration}ms`,
                    headers: Object.fromEntries(response.headers.entries()),
                    timestamp: new Date().toISOString()
                });
            }
            
            if (!response.ok) {
                let errorDetails = {};
                try {
                    errorDetails = await response.json();
                    if (isDev) {
                        console.error('❌ [FRONTEND] XHR ERROR DETAILS:', {
                            requestId,
                            status: response.status,
                            errorDetails,
                            duration: `${duration}ms`
                        });
                    }
                } catch (e) {
                    if (isDev) {
                        console.error('❌ [FRONTEND] XHR ERROR (no JSON):', {
                            requestId,
                            status: response.status,
                            statusText: response.statusText,
                            duration: `${duration}ms`
                        });
                    }
                }
                const error = new Error(`HTTP error! status: ${response.status}`);
                error.status = response.status;
                error.details = errorDetails;
                throw error;
            }
            
            const data = await response.json();
            
            if (isDev) {
                console.log('✅ [FRONTEND] XHR SUCCESS:', {
                    requestId,
                    duration: `${duration}ms`,
                    responseSize: JSON.stringify(data).length,
                    responseKeys: Object.keys(data),
                    timestamp: new Date().toISOString()
                });
                
                if (endpoint === 'generate-comic' && data.comic) {
                    console.log('🎨 [FRONTEND] Generated Comic Details:', {
                        requestId,
                        comicId: data.comic.id,
                        title: data.comic.title,
                        emoji: data.comic.emoji,
                        panelCount: data.comic.panels?.length || 0,
                        hasTokens: (data.comic.tokens?.length || 0) > 0,
                        hasConcepts: (data.comic.concepts?.length || 0) > 0,
                        version: data.comic.version,
                        backendRequestId: data.meta?.requestId,
                        backendDuration: data.meta?.duration
                    });
                }
            }
            
            return data;
        } catch (error) {
            const duration = Date.now() - startTime;
            if (isDev) {
                console.error('💥 [FRONTEND] XHR EXCEPTION:', {
                    requestId,
                    endpoint,
                    error: error.message,
                    duration: `${duration}ms`,
                    stack: error.stack?.slice(0, 300),
                    timestamp: new Date().toISOString()
                });
            }
            throw error;
        }
    }

    /**
     * Generate a new comic.
     * @param {object} [preferences={}] - User preferences for generation.
     * @returns {Promise<object>} The generated comic.
     */
    async generateComic(preferences = {}) {
        try {
            const data = await this.fetchAPI('generate-comic', {
                method: 'POST',
                body: JSON.stringify({
                    userId: this.userId,
                    preferences: preferences,
                    tokenGuidance: {
                        tokenWeights: preferences.tokenWeights || {},
                        conceptWeights: preferences.conceptWeights || {},
                        avoidTokens: preferences.avoidTokens || [],
                        encourageTokens: preferences.encourageTokens || [],
                        avoidConcepts: preferences.avoidConcepts || [],
                        encourageConcepts: preferences.encourageConcepts || [],
                        feedbackWeights: preferences.feedbackWeights || {}
                    },
                    timestamp: new Date().toISOString()
                })
            });
            if (!data.success || !data.comic) {
                throw new Error(data.error || CONFIG.ERRORS.GENERATION_FAILED);
            }
            return data.comic;
        } catch (error) {
            throw new Error(CONFIG.ERRORS.GENERATION_FAILED);
        }
    }

    /**
     * Get a specific comic by ID.
     * @param {string} comicId - Comic ID.
     * @returns {Promise<object>} The comic data.
     */
    async getComic(comicId) {
        try {
            const data = await this.fetchAPI(`get-comic?id=${comicId}`);
            if (!data.success || !data.comic) {
                throw new Error(data.error || 'Comic not found');
            }
            return data.comic;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Submit feedback for a comic.
     * @param {string} comicId - Comic ID.
     * @param {string} feedbackType - Feedback type key.
     * @param {object} [additionalData={}] - Additional feedback data.
     * @returns {Promise<object>} Feedback response.
     */
    async submitFeedback(comicId, feedbackType, additionalData = {}) {
        try {
            const feedbackData = CONFIG.FEEDBACK_TYPES[feedbackType];
            if (!feedbackData) {
                throw new Error(`Invalid feedback type: ${feedbackType}. Available: ${Object.keys(CONFIG.FEEDBACK_TYPES).join(', ')}`);
            }
            const requestData = {
                comicId,
                userId: this.userId,
                type: feedbackType,
                phrase: feedbackData.phrase,
                weight: feedbackData.weight,
                timestamp: new Date().toISOString(),
                ...additionalData
            };
            
            const data = await this.fetchAPI('submit-feedback', {
                method: 'POST',
                body: JSON.stringify(requestData)
            });
            if (!data.success) {
                throw new Error(data.error || CONFIG.ERRORS.FEEDBACK_FAILED);
            }
            return data;
        } catch (error) {
            console.error('Detailed feedback error:', error);
            throw new Error(error.message || CONFIG.ERRORS.FEEDBACK_FAILED);
        }
    }

    /**
     * Get feedback statistics for a comic.
     * @param {string} comicId - Comic ID.
     * @returns {Promise<object>} Feedback stats.
     */
    async getFeedbackStats(comicId) {
        try {
            const data = await this.fetchAPI(`get-feedback?comicId=${comicId}`);
            if (!data.success) {
                throw new Error(data.error || 'Failed to get feedback');
            }
            return data.stats || {};
        } catch (error) {
            console.error('🔍 Feedback stats error:', error);
            return {};
        }
    }

    /**
     * Get popular comics based on feedback.
     * @param {number} [limit=10] - Number of comics to return.
     * @returns {Promise<object[]>} List of comics.
     */
    async getPopularComics(limit = 10) {
        try {
            const data = await this.fetchAPI(`get-popular?limit=${limit}`);
            if (!data.success) {
                throw new Error(data.error || 'Failed to get popular comics');
            }
            return data.comics || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Get user's feedback preferences (for AI training).
     * @returns {Promise<object>} User preferences.
     */
    async getUserPreferences() {
        try {
            const data = await this.fetchAPI(`get-user-preferences?userId=${this.userId}`);
            if (!data.success) {
                throw new Error(data.error || 'Failed to get preferences');
            }
            return data.preferences || {};
        } catch (error) {
            return {};
        }
    }

    /**
     * Save comic to Redis storage.
     * @param {object} comic - Comic data.
     * @returns {Promise<string>} Comic ID.
     */
    async saveComic(comic) {
        try {
            const data = await this.fetchAPI('save-comic', {
                method: 'POST',
                body: JSON.stringify({
                    comic,
                    userId: this.userId,
                    timestamp: new Date().toISOString()
                })
            });
            if (!data.success) {
                throw new Error(data.error || 'Failed to save comic');
            }
            return data.comicId;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get user's comic history.
     * @param {number} [limit=20] - Number of comics to return.
     * @returns {Promise<object[]>} List of comics.
     */
    async getUserHistory(limit = 20) {
        try {
            const data = await this.fetchAPI(`get-user-history?userId=${this.userId}&limit=${limit}`);
            if (!data.success) {
                throw new Error(data.error || 'Failed to get history');
            }
            return data.comics || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Get recent comics from global pool (for new users).
     * @param {number} [limit=10] - Number of comics to return.
     * @returns {Promise<object[]>} List of recent comics.
     */
    async getRecentComics(limit = 10) {
        try {
            const data = await this.fetchAPI(`get-recent-comics?limit=${limit}`);
            if (!data.success) {
                throw new Error(data.error || 'Failed to get recent comics');
            }
            return data.comics || [];
        } catch (error) {
            console.error('Failed to get recent comics:', error);
            return [];
        }
    }
}

const comicAPI = new ComicAPI();
export default comicAPI;

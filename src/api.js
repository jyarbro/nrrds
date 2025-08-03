import { CONFIG } from './config.js';

/**
 * API client for communicating with Vercel Functions and backend endpoints for comics.
 */
class ComicAPI {
    constructor() {
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
        try {
            const url = `/api/${endpoint}`;
            const fetchOptions = {
                ...options,
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };
            
            const response = await fetch(url, fetchOptions);
            
            if (!response.ok) {
                let errorDetails = {};
                try {
                    errorDetails = await response.json();
                } catch (e) {}
                const error = new Error(`HTTP error! status: ${response.status}`);
                error.status = response.status;
                error.details = errorDetails;
                throw error;
            }
            
            return await response.json();
        } catch (error) {
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
                        feedbackWeights: preferences.reactionWeights || {},
                        generationTemperature: preferences.generationTemperature || 0.3
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
     * Get a specific comic by ID (alias for getComic).
     * @param {string} comicId - Comic ID.
     * @returns {Promise<object>} The comic data.
     */
    async getComicById(comicId) {
        return this.getComic(comicId);
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
            
            console.log('📤 [SUBMIT DEBUG] Submitting feedback:', {
                url: '/api/submit-feedback',
                requestData,
                feedbackType,
                comicId
            });
            
            const data = await this.fetchAPI('submit-feedback', {
                method: 'POST',
                body: JSON.stringify(requestData)
            });
            
            console.log('📤 [SUBMIT DEBUG] Feedback response:', data);
            
            if (!data.success) {
                console.error('📤 [SUBMIT DEBUG] Feedback failed:', data.error);
                throw new Error(data.error || CONFIG.ERRORS.FEEDBACK_FAILED);
            }
            return data;
        } catch (error) {
            console.error('📤 [SUBMIT DEBUG] Feedback submission error:', {
                message: error.message,
                status: error.status,
                details: error.details,
                comicId,
                feedbackType
            });
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
            console.log('🔍 [DEBUG] Fetching feedback stats for comicId:', comicId);
            console.log('🔍 [DEBUG] Request URL will be:', `/api/get-feedback?comicId=${comicId}`);
            
            const data = await this.fetchAPI(`get-feedback?comicId=${comicId}`);
            
            console.log('🔍 [DEBUG] Feedback stats response:', data);
            
            if (!data.success) {
                console.error('🔍 [DEBUG] API returned success=false:', data.error);
                throw new Error(data.error || 'Failed to get feedback');
            }
            return data.stats || {};
        } catch (error) {
            console.error('🔍 [DEBUG] Feedback stats error details:', {
                message: error.message,
                status: error.status,
                details: error.details,
                comicId: comicId
            });
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

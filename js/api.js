// API client for communicating with Vercel Functions
import { CONFIG } from './config.js';

class ComicAPI {
    constructor() {
        this.baseURL = CONFIG.API_BASE_URL;
        this.userId = this.getOrCreateUserId();
    }

    // Get or create a unique user ID
    getOrCreateUserId() {
        let userId = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID);
        if (!userId) {
            userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER_ID, userId);
        }
        return userId;
    }

    // Generic fetch wrapper with error handling
    async fetchAPI(endpoint, options = {}) {
        try {
            console.log(`API Request: ${this.baseURL}/api/${endpoint}`);
            
            // Add credentials for CORS requests
            const fetchOptions = {
                ...options,
                credentials: 'include',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };
            
            const response = await fetch(`${this.baseURL}/api/${endpoint}`, fetchOptions);

            if (!response.ok) {
                // Try to get error details from the response
                let errorDetails = {};
                try {
                    errorDetails = await response.json();
                } catch (e) {
                    // Response is not JSON, ignore
                }
                
                const error = new Error(`HTTP error! status: ${response.status}`);
                error.status = response.status;
                error.details = errorDetails;
                throw error;
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            // Add details about the API endpoint and URL
            console.error(`API URL: ${this.baseURL}/api/${endpoint}`);
            if (error.details) {
                console.error('Error details:', error.details);
            }
            throw error;
        }
    }

    // Generate a new comic
    async generateComic(preferences = {}) {
        try {
            const data = await this.fetchAPI('generate-comic', {
                method: 'POST',
                body: JSON.stringify({
                    userId: this.userId,
                    preferences: preferences,
                    timestamp: new Date().toISOString()
                })
            });

            if (!data.success || !data.comic) {
                throw new Error(data.error || CONFIG.ERRORS.GENERATION_FAILED);
            }

            return data.comic;
        } catch (error) {
            console.error('Generate comic error:', error);
            throw new Error(CONFIG.ERRORS.GENERATION_FAILED);
        }
    }

    // Get a specific comic by ID
    async getComic(comicId) {
        try {
            const data = await this.fetchAPI(`get-comic?id=${comicId}`);
            
            if (!data.success || !data.comic) {
                throw new Error(data.error || 'Comic not found');
            }

            return data.comic;
        } catch (error) {
            console.error('Get comic error:', error);
            throw error;
        }
    }

    // Submit feedback for a comic
    async submitFeedback(comicId, feedbackType, additionalData = {}) {
        try {
            const feedbackData = CONFIG.FEEDBACK_TYPES[feedbackType];
            if (!feedbackData) {
                throw new Error('Invalid feedback type');
            }

            const data = await this.fetchAPI('submit-feedback', {
                method: 'POST',
                body: JSON.stringify({
                    comicId,
                    userId: this.userId,
                    type: feedbackType,
                    phrase: feedbackData.phrase,
                    weight: feedbackData.weight,
                    timestamp: new Date().toISOString(),
                    ...additionalData
                })
            });

            if (!data.success) {
                throw new Error(data.error || CONFIG.ERRORS.FEEDBACK_FAILED);
            }

            return data;
        } catch (error) {
            console.error('Submit feedback error:', error);
            throw new Error(CONFIG.ERRORS.FEEDBACK_FAILED);
        }
    }

    // Get feedback statistics for a comic
    async getFeedbackStats(comicId) {
        try {
            const data = await this.fetchAPI(`get-feedback?comicId=${comicId}`);
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to get feedback');
            }

            return data.stats || {};
        } catch (error) {
            console.error('Get feedback stats error:', error);
            return {};
        }
    }

    // Get popular comics based on feedback
    async getPopularComics(limit = 10) {
        try {
            const data = await this.fetchAPI(`get-popular?limit=${limit}`);
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to get popular comics');
            }

            return data.comics || [];
        } catch (error) {
            console.error('Get popular comics error:', error);
            return [];
        }
    }

    // Get user's feedback preferences (for AI training)
    async getUserPreferences() {
        try {
            const data = await this.fetchAPI(`get-user-preferences?userId=${this.userId}`);
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to get preferences');
            }

            return data.preferences || {};
        } catch (error) {
            console.error('Get user preferences error:', error);
            return {};
        }
    }

    // Save comic to Redis storage
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
            console.error('Save comic error:', error);
            throw error;
        }
    }

    // Get user's comic history
    async getUserHistory(limit = 20) {
        try {
            const data = await this.fetchAPI(`get-user-history?userId=${this.userId}&limit=${limit}`);
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to get history');
            }

            return data.comics || [];
        } catch (error) {
            console.error('Get user history error:', error);
            return [];
        }
    }
    
    // Simple test API call to check CORS
    async testApi() {
        try {
            const data = await this.fetchAPI('test');
            console.log('Test API response:', data);
            return data;
        } catch (error) {
            console.error('Test API error:', error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const comicAPI = new ComicAPI();
export default comicAPI;

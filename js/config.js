// Configuration for the comic app
// Safely access import.meta.env
let apiBaseUrl = '';
try {
  apiBaseUrl = import.meta.env?.VITE_API_BASE_URL || '';
} catch (e) {
  console.warn('Unable to access import.meta.env, using empty API base URL');
}

export const CONFIG = {
    // API endpoints - Use environment variable (no fallback)
    API_BASE_URL: apiBaseUrl,
    
    // Local storage keys
    STORAGE_KEYS: {
        USER_ID: 'comic_user_id',
        COMIC_HISTORY: 'comic_history',
        USER_PREFERENCES: 'user_preferences'
    },
    
    // Comic generation settings
    COMIC_SETTINGS: {
        MIN_PANELS: 3,
        MAX_PANELS: 4,
        DEFAULT_PANEL_COUNT: 3,
        CACHE_DURATION: 300000 // 5 minutes in milliseconds
    },
    
    // Feedback settings
    FEEDBACK_TYPES: {
        love: { emoji: '😍', phrase: 'absolutely loved it', weight: 2 },
        funny: { emoji: '😂', phrase: 'found it hilarious', weight: 1.5 },
        clever: { emoji: '🤓', phrase: 'thought it was clever', weight: 1.5 },
        inspiring: { emoji: '✨', phrase: 'felt inspired', weight: 1.5 },
        confused: { emoji: '😕', phrase: 'didn\'t understand it', weight: -1 },
        boring: { emoji: '😴', phrase: 'found it boring', weight: -1.5 },
        offensive: { emoji: '😠', phrase: 'found it inappropriate', weight: -2 },
        meh: { emoji: '😐', phrase: 'felt neutral about it', weight: 0 }
    },
    
    // UI settings
    UI: {
        LOADING_DELAY: 300, // Minimum loading time for better UX
        ANIMATION_DURATION: 300,
        MAX_HISTORY_SIZE: 50
    },
    
    // Error messages
    ERRORS: {
        NETWORK: 'Unable to connect to the server. Please check your internet connection.',
        GENERATION_FAILED: 'Failed to generate comic. Please try again.',
        FEEDBACK_FAILED: 'Failed to submit feedback. Please try again.',
        INVALID_COMIC: 'Invalid comic data received.',
        STORAGE_FULL: 'Local storage is full. Some features may not work properly.'
    }
};

// Freeze the configuration to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.STORAGE_KEYS);
Object.freeze(CONFIG.COMIC_SETTINGS);
Object.freeze(CONFIG.FEEDBACK_TYPES);
Object.freeze(CONFIG.UI);
Object.freeze(CONFIG.ERRORS);

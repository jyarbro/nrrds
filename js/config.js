let apiBaseUrl = '';
try {
  const isDev = window.location.hostname === 'localhost';
  apiBaseUrl = isDev ? '' : (import.meta.env?.VITE_API_BASE_URL || 'https://api.nrrds.com');
} catch (e) {}

/**
 * Application configuration constants for nrrds frontend.
 * @readonly
 * @type {Object}
 */
export const CONFIG = {
    // API endpoints - Use environment variable (no fallback)
    API_BASE_URL: apiBaseUrl,
    
    // Local storage keys
    STORAGE_KEYS: {
        USER_ID: 'comic_user_id',
        COMIC_HISTORY: 'comic_history',
        USER_PREFERENCES: 'user_preferences',
        TOKEN_PREFERENCES: 'token_preferences',
        SEEN_COMICS: 'seen_comics'
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
        // Most positive (weight 2.0 - 1.5)
        love: { emoji: '💖', phrase: 'felt love or adoration', weight: 2.0 },
        wholesome: { emoji: '🥰', phrase: 'thought it was wholesome', weight: 1.8 },
        uplifted: { emoji: '🕊️', phrase: 'felt uplifted', weight: 1.7 },
        thumbsup: { emoji: '👍', phrase: 'gave it a thumbs up', weight: 1.6 },
        amused: { emoji: '😂', phrase: 'was amused or laughed', weight: 1.5 },
        
        // Positive (weight 1.4 - 1.0)
        inspired: { emoji: '💡', phrase: 'felt inspired', weight: 1.4 },
        clever: { emoji: '🧠', phrase: 'thought it was clever or smart', weight: 1.3 },
        heroic: { emoji: '🦸', phrase: 'felt heroic or empowered', weight: 1.2 },
        unique: { emoji: '🦄', phrase: 'thought it was unique or weird', weight: 1.1 },
        relatable: { emoji: '🫂', phrase: 'found it relatable', weight: 1.0 },
        
        // Mildly positive (weight 0.8 - 0.2)
        mindblown: { emoji: '🤯', phrase: 'mind blown', weight: 0.8 },
        surprised: { emoji: '😱', phrase: 'was surprised or shocked', weight: 0.5 },
        
        // Neutral (weight 0 to -0.2)
        confused: { emoji: '🌀', phrase: 'felt confused', weight: -0.2 },
        meh: { emoji: '😐', phrase: 'felt neutral or meh', weight: 0 },
        
        // Negative (weight -0.5 to -1.0)
        bored: { emoji: '😴', phrase: 'felt bored', weight: -0.8 },
        cringe: { emoji: '😬', phrase: 'felt cringe', weight: -1.0 },
        
        // Very negative (weight -1.2 to -2.0)
        sad: { emoji: '😢', phrase: 'felt sad', weight: -1.2 },
        scared: { emoji: '👻', phrase: 'felt scared', weight: -1.4 },
        disgusted: { emoji: '🤢', phrase: 'felt disgusted', weight: -1.6 },
        angry: { emoji: '😡', phrase: 'felt angry', weight: -1.8 },
        offended: { emoji: '🚫', phrase: 'felt offended', weight: -2.0 }
    },
    
    // Token system for AI feedback (dual-layer approach)
    COMIC_TOKENS: {
        // High-level semantic concepts
        THEMES: ['tech', 'work', 'life', 'relationships', 'food', 'travel', 'gaming', 'social'],
        CONCEPTS: ['debugging', 'meetings', 'coffee', 'monday', 'deadlines', 'procrastination', 'success', 'failure'],
        EMOTIONS: ['frustration', 'joy', 'anxiety', 'relief', 'excitement', 'boredom', 'satisfaction', 'confusion'],
        STYLES: ['absurd', 'relatable', 'dark-humor', 'wholesome', 'sarcastic', 'optimistic', 'cynical', 'philosophical'],
        FORMATS: ['escalation', 'timeline', 'comparison', 'expectation-reality', 'cause-effect', 'internal-monologue']
    },
    
    // LLM token analysis settings
    TOKEN_ANALYSIS: {
        MIN_TOKEN_FREQUENCY: 2, // Minimum occurrences to track
        MAX_TOKENS_PER_COMIC: 50, // Limit token storage
        FEEDBACK_DECAY_RATE: 0.95, // How quickly old feedback loses influence
        EXPLORATION_BOOST: 0.2 // Encourage trying new token combinations
    },
    
    // Statistical confidence weighting system
    FEEDBACK_WEIGHTING: {
        MIN_SAMPLE_SIZE: 5, // Minimum feedback before any influence
        LOW_CONFIDENCE_THRESHOLD: 10, // Below this = very gentle influence  
        HIGH_CONFIDENCE_THRESHOLD: 30, // Above this = strong influence
        MAX_INFLUENCE_STRENGTH: 0.8, // Cap how much tokens can bias generation
        MIN_INFLUENCE_STRENGTH: 0.1, // Minimum influence when sample size is tiny
        EXPLORATION_BASELINE: 0.7, // Default to variety when low samples
        TEMPORAL_DECAY_DAYS: 90 // Longer decay since no user tracking
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
        FEEDBACK_FAILED: 'Failed to submit reaction. Please try again.',
        INVALID_COMIC: 'Invalid comic data received.',
        STORAGE_FULL: 'Local storage is full. Some features may not work properly.'
    }
};

// Freeze the configuration to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.STORAGE_KEYS);
Object.freeze(CONFIG.COMIC_SETTINGS);
Object.freeze(CONFIG.FEEDBACK_TYPES);
Object.freeze(CONFIG.COMIC_TOKENS);
Object.freeze(CONFIG.TOKEN_ANALYSIS);
Object.freeze(CONFIG.FEEDBACK_WEIGHTING);
Object.freeze(CONFIG.UI);
Object.freeze(CONFIG.ERRORS);

/**
 * Application configuration constants for nrrds frontend.
 * @readonly
 * @type {Object}
 */
export const CONFIG = {
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
        thumbsup: { emoji: '👍', weight: 2.0 },
        lol: { emoji: '😂', weight: 1.9 },
        heartwarming: { emoji: '🫶', weight: 1.8 },
        awesome: { emoji: '🤩', weight: 1.7 },
        inspired: { emoji: '💡', weight: 1.6 },
        unique: { emoji: '🦄', weight: 1.5 },
        
        // Positive (weight 1.4 - 1.0)
        mindblown: { emoji: '🤯', weight: 1.4 },
        celebrating: { emoji: '🥳', weight: 1.3 },
        deep: { emoji: '🤔', weight: 1.2 },
        relatable: { emoji: '🙋', weight: 1.1 },
        
        // Neutral (weight 1.0 to -0.5)
        confused: { emoji: '😕', weight: 0.2 },
        meh: { emoji: '😐', weight: 0 },
        sad: { emoji: '😢', weight: -0.3 },
        spooked: { emoji: '😱', weight: -0.5 },
        
        // Negative (weight -0.8 to -1.5)
        grossedout: { emoji: '🤢', weight: -0.8 },
        cringe: { emoji: '😬', weight: -1.0 },
        angry: { emoji: '😠', weight: -1.2 },
        facepalm: { emoji: '🤦', weight: -1.3 },
        eyeroll: { emoji: '🙄', weight: -1.4 },
        skeptical: { emoji: '🧐', weight: -1.5 },
        
        // Most negative (weight -1.8 to -2.0)
        offended: { emoji: '🚫', weight: -2.0 }
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

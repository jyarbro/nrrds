/**
 * Application configuration constants for nrrds frontend.
 * @readonly
 * @type {Object}
 */
export const CONFIG = {
    // Local storage keys
    STORAGE_KEYS: {
        USER_ID: 'comic_user_id',
        USER_PREFERENCES: 'user_preferences'
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
        gross: { emoji: '🤢', weight: -0.8 },
        cringe: { emoji: '😬', weight: -1.0 },
        angry: { emoji: '😠', weight: -1.2 },
        facepalm: { emoji: '🤦', weight: -1.3 },
        eyeroll: { emoji: '🙄', weight: -1.4 },
        skeptical: { emoji: '🧐', weight: -1.5 },
        
        // Most negative (weight -1.8 to -2.0)
        offended: { emoji: '🚫', weight: -2.0 }
    },
    
    // LLM token analysis settings
    TOKEN_ANALYSIS: {
        MIN_TOKEN_FREQUENCY: 2, // Minimum occurrences to track
        MAX_TOKENS_PER_COMIC: 50, // Limit token storage
        FEEDBACK_DECAY_RATE: 0.95, // How quickly old feedback loses influence
        EXPLORATION_BOOST: 0.2 // Encourage trying new token combinations
    },
    
    // Generation temperature settings for exploration vs exploitation
    GENERATION_TEMPERATURE: {
        MIN_TEMP: 0.0, // Full exploitation (follow all feedback)
        MAX_TEMP: 1.0, // Full exploration (ignore all feedback)
        DEFAULT_TEMP: 0.3, // Balanced default
        // Temperature profiles
        EXPLOIT_RANGE: [0.0, 0.3], // Strict adherence to feedback
        BALANCED_RANGE: [0.3, 0.7], // Mixed approach
        EXPLORE_RANGE: [0.7, 1.0], // High creativity/exploration
        // Dynamic calculation parameters
        NEW_USER_THRESHOLD: 5, // Reactions needed to be considered "experienced"
        HIGH_TEMP_FREQUENCY: 0.15, // 15% of comics should be high-temperature
        EXPLORATION_COOLDOWN: 3 // Comics between high-temp generations
    },
    
    // UI settings
    UI: {
        LOADING_DELAY: 300 // Minimum loading time for better UX
    },
    
    // Error messages
    ERRORS: {
        GENERATION_FAILED: 'Failed to generate comic. Please try again.',
        FEEDBACK_FAILED: 'Failed to submit reaction. Please try again.'
    }
};

// Freeze the configuration to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.STORAGE_KEYS);
Object.freeze(CONFIG.FEEDBACK_TYPES);
Object.freeze(CONFIG.TOKEN_ANALYSIS);
Object.freeze(CONFIG.GENERATION_TEMPERATURE);
Object.freeze(CONFIG.UI);
Object.freeze(CONFIG.ERRORS);

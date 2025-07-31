import comicAPI from './api.js';
import { CONFIG } from './config.js';

/**
 * Feedback system for collecting user reactions to comics
 */
export default class FeedbackSystem {
    /**
     * Initialize the feedback system
     */
    constructor() {
        /** @type {HTMLElement} The feedback section element */
        this.feedbackSection = document.getElementById('feedbackSection');
        /** @type {HTMLElement} The feedback statistics display element */
        this.feedbackStats = document.getElementById('feedbackStats');
        /** @type {Map<string, Set<string>>} Track multiple feedback per comic (comic ID -> Set of feedback types) */
        this.selectedFeedback = new Map();
        /** @type {Array} Queue for API submissions */
        this.submissionQueue = [];
        /** @type {boolean} Flag to prevent multiple queue processors */
        this.isProcessingQueue = false;
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners for feedback buttons
     */
    initializeEventListeners() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFeedbackClick(e), { once: false });
        });
    }

    /**
     * Show feedback section for a specific comic
     * @param {string} comicId - The ID of the comic to show feedback for
     */
    show(comicId) {
        this.currentComicId = comicId;
        this.feedbackSection.style.display = 'block';
        this.resetButtonStates();

        const localKey = `comic_feedback_${comicId}`;
        let previousFeedbackSet;
        try {
            const stored = localStorage.getItem(localKey);
            if (stored) {
                previousFeedbackSet = new Set(JSON.parse(stored));
                this.selectedFeedback.set(comicId, previousFeedbackSet);
            } else {
                previousFeedbackSet = this.selectedFeedback.get(comicId);
            }
        } catch (e) {
            previousFeedbackSet = this.selectedFeedback.get(comicId);
        }

        if (previousFeedbackSet && previousFeedbackSet.size > 0) {
            previousFeedbackSet.forEach(feedbackType => {
                const btn = document.querySelector(`[data-feedback="${feedbackType}"]`);
                if (btn) {
                    btn.classList.add('selected');
                }
            });
            if (previousFeedbackSet.size >= 3) {
                this.disableUnselectedButtons();
            }
        }
        this.loadFeedbackStats(comicId);
    }

    /**
     * Hide the feedback section
     */
    hide() {
        this.feedbackSection.style.display = 'none';
        this.currentComicId = null;
    }

    /**
     * Handle feedback button click events
     * @param {Event} event - The click event
     */
    async handleFeedbackClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const btn = event.currentTarget;
        const feedbackType = btn.getAttribute('data-feedback');
        
        if (!this.currentComicId || !feedbackType) {
            return;
        }
        
        let feedbackSet = this.selectedFeedback.get(this.currentComicId) || new Set();
        let wasSelected = feedbackSet.has(feedbackType);
        
        if (wasSelected) {
            feedbackSet.delete(feedbackType);
            btn.classList.remove('selected');
            
            if (feedbackSet.size < 3) {
                this.enableReactionButtons();
            }
            this.submitFeedbackImmediately(feedbackType, btn, true);
        } else {
            if (feedbackSet.size < 3) {
                feedbackSet.add(feedbackType);
                btn.classList.add('selected');
                
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    btn.style.transform = '';
                }, 100);
                
                if (feedbackSet.size >= 3) {
                    this.disableUnselectedButtons();
                }
                this.submitFeedbackImmediately(feedbackType, btn, false);
            } else {
                return;
            }
        }
        
        this.selectedFeedback.set(this.currentComicId, feedbackSet);
        try {
            const localKey = `comic_feedback_${this.currentComicId}`;
            localStorage.setItem(localKey, JSON.stringify(Array.from(feedbackSet)));
        } catch (e) {
            // Ignore localStorage errors
        }
    }

    /**
     * Reset all button states to default
     */
    resetButtonStates() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
    }

    /**
     * Show success animation on a feedback button
     * @param {HTMLElement} button - The button element to animate
     */
    showFeedbackSuccess(button) {
        const success = document.createElement('div');
        success.className = 'feedback-success';
        success.innerHTML = '✓';
        success.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 2rem;
            color: #4CAF50;
            animation: successPop 0.5s ease-out;
            pointer-events: none;
        `;
        
        button.style.position = 'relative';
        button.appendChild(success);
        
        setTimeout(() => success.remove(), 500);
    }

    /**
     * Show error message for failed feedback submission
     */
    showFeedbackError() {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'feedback-error';
        errorMsg.textContent = 'Failed to save reaction. Please try again.';
        errorMsg.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #f44336;
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            animation: slideUp 0.3s ease-out;
        `;
        
        document.body.appendChild(errorMsg);
        setTimeout(() => errorMsg.remove(), 3000);
    }

    /**
     * Show rate limit error message
     * @param {string} message - The error message to display
     */
    showRateLimitError(message) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'feedback-rate-limit-error';
        errorMsg.textContent = message;
        errorMsg.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff9800;
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            animation: slideUp 0.3s ease-out;
            max-width: 350px;
            text-align: center;
            z-index: 10000;
        `;
        
        document.body.appendChild(errorMsg);
        setTimeout(() => errorMsg.remove(), 5000);
    }
    
    /**
     * Queue feedback for immediate submission to avoid rate limits
     * @param {string} feedbackType - The type of feedback
     * @param {HTMLElement} btn - The button element
     * @param {boolean} isDecrement - Whether this is a decrement operation
     */
    submitFeedbackImmediately(feedbackType, btn, isDecrement = false) {
        const submissionKey = `${this.currentComicId}-${feedbackType}-${isDecrement ? 'decrement' : 'increment'}`;
        const isDuplicate = this.submissionQueue.some(item => 
            item.comicId === this.currentComicId && item.feedbackType === feedbackType && item.isDecrement === isDecrement
        );
        
        if (isDuplicate) {
            return;
        }
        
        this.submissionQueue.push({
            comicId: this.currentComicId,
            feedbackType: feedbackType,
            button: btn,
            timestamp: Date.now(),
            isDecrement: isDecrement
        });
        
        const currentComic = this.getCurrentComic();
        this.updateLocalPreferences(feedbackType, currentComic);
        
        this.showFeedbackSuccess(btn);
        
        this.processSubmissionQueue();
    }

    /**
     * Process the submission queue with proper spacing to avoid rate limits
     */
    async processSubmissionQueue() {
        if (this.isProcessingQueue || this.submissionQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        while (this.submissionQueue.length > 0) {
            const submission = this.submissionQueue.shift();
            try {
                const currentComic = this.getCurrentComic();
                await comicAPI.submitFeedback(submission.comicId, submission.feedbackType, {
                    comicTokens: currentComic?.tokens || [],
                    semanticConcepts: currentComic?.concepts || [],
                    action: submission.isDecrement ? 'decrement' : 'increment'
                });
            } catch (error) {
            }
        }
        this.isProcessingQueue = false;
        if (this.currentComicId) {
            this.loadFeedbackStats(this.currentComicId);
        }
    }

    /**
     * Load and display feedback statistics for a comic
     * @param {string} comicId - The ID of the comic to load stats for
     */
    async loadFeedbackStats(comicId) {
        try {
            const stats = await comicAPI.getFeedbackStats(comicId);
            this.displayStats(stats);
        } catch (error) {
            console.error('Failed to load feedback stats:', error);
            this.feedbackStats.innerHTML = '<p>Share your reactions!</p>';
        }
    }
    

    /**
     * Display feedback statistics in the UI
     * @param {Object} stats - The statistics object
     */
    displayStats(stats) {
        if (!stats || Object.keys(stats).length === 0) {
            this.feedbackStats.innerHTML = '<p>Be the first to share a reaction!</p>';
            return;
        }

        const excludeFields = ['total', 'score', 'engagementRate', 'uniqueUsers'];
        const totalFeedback = Object.entries(stats)
            .filter(([key, value]) => !excludeFields.includes(key))
            .reduce((sum, [key, count]) => sum + count, 0);
        
        if (totalFeedback === 0) {
            this.feedbackStats.innerHTML = '<p>Be the first to share a reaction!</p>';
            return;
        }
        
        let statsHTML = ``;
        
        const allReactions = Object.entries(stats)
            .filter(([key, value]) => !excludeFields.includes(key))
            .filter(([,count]) => count > 0)
            .sort(([typeA, countA], [typeB, countB]) => {
                const weightA = CONFIG.FEEDBACK_TYPES[typeA]?.weight || 0;
                const weightB = CONFIG.FEEDBACK_TYPES[typeB]?.weight || 0;
                if (weightA !== weightB) {
                    return weightB - weightA;
                }
                return countB - countA;
            });
        
        if (allReactions.length > 0) {
            statsHTML += '<div class="all-reactions">';
            allReactions.forEach(([type, count]) => {
                const feedbackData = CONFIG.FEEDBACK_TYPES[type];
                if (feedbackData) {
                    const percentage = Math.round((count / totalFeedback) * 100);
                    statsHTML += `
                        <span class="reaction-stat">
                            <span class="reaction-emoji">${feedbackData.emoji}</span>
                            <span class="reaction-percent">${percentage}%</span>
                        </span>
                    `;
                }
            });
            statsHTML += '</div>';
        }
        
        this.feedbackStats.innerHTML = statsHTML;
    }

    /**
     * Update local preferences for AI training based on feedback
     * @param {string} feedbackType - The type of feedback given
     * @param {Object} comic - The comic object with tokens and concepts
     */
    updateLocalPreferences(feedbackType, comic) {
        try {
            const prefs = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES) || '{}');
            
            if (!prefs.feedbackCounts) {
                prefs.feedbackCounts = {};
            }
            
            if (!prefs.tokenPreferences) {
                prefs.tokenPreferences = {};
            }
            
            prefs.feedbackCounts[feedbackType] = (prefs.feedbackCounts[feedbackType] || 0) + 1;
            
            const feedbackWeight = CONFIG.FEEDBACK_TYPES[feedbackType]?.weight || 0;
            
            if (comic?.tokens) {
                this.updateTokenPreferences(prefs, comic.tokens, feedbackWeight);
            }
            
            if (comic?.concepts) {
                this.updateConceptPreferences(prefs, comic.concepts, feedbackWeight);
            }
            
            prefs.lastFeedbackTime = new Date().toISOString();
            
            this.calculatePreferenceWeights(prefs);
            
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(prefs));
            
        } catch (error) {
            console.error('Failed to update local preferences:', error);
        }
    }

    /**
     * Calculate preference weights based on feedback history
     * @param {Object} prefs - The preferences object to update
     */
    calculatePreferenceWeights(prefs) {
        if (!prefs.feedbackCounts) return;
        
        const totalFeedback = Object.values(prefs.feedbackCounts).reduce((sum, count) => sum + count, 0);
        if (totalFeedback === 0) return;
        
        prefs.preferenceWeights = {};
        
        Object.entries(prefs.feedbackCounts).forEach(([type, count]) => {
            const feedbackData = CONFIG.FEEDBACK_TYPES[type];
            if (feedbackData) {
                const frequencyWeight = count / totalFeedback;
                const typeWeight = feedbackData.weight;
                prefs.preferenceWeights[type] = frequencyWeight * typeWeight;
            }
        });
    }

    /**
     * Update token preferences based on feedback
     * @param {Object} prefs - The preferences object
     * @param {Array} tokens - Array of tokens from the comic
     * @param {number} feedbackWeight - The weight of the feedback
     */
    updateTokenPreferences(prefs, tokens, feedbackWeight) {
        if (!prefs.tokenPreferences) prefs.tokenPreferences = {};
        
        tokens.forEach(token => {
            if (!prefs.tokenPreferences[token]) {
                prefs.tokenPreferences[token] = { weight: 0, count: 0 };
            }
            
            const current = prefs.tokenPreferences[token];
            const decayFactor = CONFIG.TOKEN_ANALYSIS.FEEDBACK_DECAY_RATE;
            
            current.weight = (current.weight * decayFactor) + (feedbackWeight * (1 - decayFactor));
            current.count += 1;
            current.lastUpdated = new Date().toISOString();
        });
    }
    
    /**
     * Update concept preferences based on feedback
     * @param {Object} prefs - The preferences object
     * @param {Array} concepts - Array of concepts from the comic
     * @param {number} feedbackWeight - The weight of the feedback
     */
    updateConceptPreferences(prefs, concepts, feedbackWeight) {
        if (!prefs.conceptPreferences) prefs.conceptPreferences = {};
        
        concepts.forEach(concept => {
            if (!prefs.conceptPreferences[concept]) {
                prefs.conceptPreferences[concept] = { weight: 0, count: 0 };
            }
            
            const current = prefs.conceptPreferences[concept];
            const decayFactor = CONFIG.TOKEN_ANALYSIS.FEEDBACK_DECAY_RATE;
            
            current.weight = (current.weight * decayFactor) + (feedbackWeight * (1 - decayFactor));
            current.count += 1;
            current.lastUpdated = new Date().toISOString();
        });
    }
    
    /**
     * Get current comic data (needs to be implemented by app)
     * @returns {Object|null} The current comic object or null
     */
    getCurrentComic() {
        return window.app?.getCurrentComic?.() || null;
    }

    /**
     * Get user preferences for comic generation
     * @returns {Object} User preferences object with feedback weights and token/concept preferences
     */
    getUserPreferences() {
        try {
            const prefs = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES) || '{}');
            
            const preferences = {
                feedbackWeights: prefs.preferenceWeights || {},
                tokenWeights: {},
                conceptWeights: {},
                avoidTokens: [],
                encourageTokens: [],
                avoidConcepts: [],
                encourageConcepts: []
            };
            
            if (prefs.tokenPreferences) {
                Object.entries(prefs.tokenPreferences).forEach(([token, data]) => {
                    if (data.count >= CONFIG.TOKEN_ANALYSIS.MIN_TOKEN_FREQUENCY) {
                        preferences.tokenWeights[token] = data.weight;
                        
                        if (data.weight < -0.5) {
                            preferences.avoidTokens.push(token);
                        } else if (data.weight > 0.5) {
                            preferences.encourageTokens.push(token);
                        }
                    }
                });
            }
            
            if (prefs.conceptPreferences) {
                Object.entries(prefs.conceptPreferences).forEach(([concept, data]) => {
                    if (data.count >= CONFIG.TOKEN_ANALYSIS.MIN_TOKEN_FREQUENCY) {
                        preferences.conceptWeights[concept] = data.weight;
                        
                        if (data.weight < -0.5) {
                            preferences.avoidConcepts.push(concept);
                        } else if (data.weight > 0.5) {
                            preferences.encourageConcepts.push(concept);
                        }
                    }
                });
            }
            
            return preferences;
        } catch (error) {
            console.error('Failed to get user preferences:', error);
            return {};
        }
    }

    /**
     * Disable only unselected reaction buttons when 3 selections are made
     */
    disableUnselectedButtons() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            if (!btn.classList.contains('selected')) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
        });
    }

    /**
     * Enable all reaction buttons
     */
    enableReactionButtons() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }


    /**
     * Reset all button states to handle multiple selections
     */
    resetButtonStates() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }
}

/**
 * Add required CSS for feedback animations
 */
const feedbackStyle = document.createElement('style');
feedbackStyle.textContent = `
    @keyframes successPop {
        0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0;
        }
        50% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 1;
        }
        100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0;
        }
    }

    @keyframes slideUp {
        from {
            transform: translateX(-50%) translateY(100%);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    }

    .all-reactions {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 15px;
        margin-top: 10px;
    }

    .reaction-stat {
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .reaction-emoji {
        font-size: 1.5rem;
    }

    .reaction-percent {
        font-weight: bold;
        color: var(--primary-color);
    }
`;
document.head.appendChild(feedbackStyle);

/**
 * Create and export singleton instance of the feedback system
 * @type {FeedbackSystem}
 */
const feedbackSystem = new FeedbackSystem();
export { feedbackSystem };

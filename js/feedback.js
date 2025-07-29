// Feedback system for collecting user reactions
import comicAPI from './api.js';
import { CONFIG } from './config.js';

export default class FeedbackSystem {
    constructor() {
        this.feedbackSection = document.getElementById('feedbackSection');
        this.feedbackStats = document.getElementById('feedbackStats');
        this.selectedFeedback = new Map(); // Track feedback per comic
        this.isSubmitting = false; // Prevent multiple simultaneous submissions
        this.initializeEventListeners();
    }

    // Initialize event listeners
    initializeEventListeners() {
        // Add click handlers to all emoji buttons
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFeedbackClick(e), { once: false });
        });
    }

    // Show feedback section for a comic
    show(comicId) {
        this.currentComicId = comicId;
        this.feedbackSection.style.display = 'block';
        
        // Reset button states
        this.resetButtonStates();
        
        // Restore previous selection if exists
        const previousFeedback = this.selectedFeedback.get(comicId);
        if (previousFeedback) {
            const btn = document.querySelector(`[data-feedback="${previousFeedback}"]`);
            if (btn) {
                btn.classList.add('selected');
            }
        }

        // Load and display stats
        this.loadFeedbackStats(comicId);
    }

    // Hide feedback section
    hide() {
        this.feedbackSection.style.display = 'none';
        this.currentComicId = null;
    }

    // Handle feedback button click
    async handleFeedbackClick(event) {
        // Prevent event bubbling and multiple submissions
        event.preventDefault();
        event.stopPropagation();
        
        console.log('🔥 handleFeedbackClick called');
        
        // Prevent multiple simultaneous submissions
        if (this.isSubmitting) {
            console.log('❌ Already submitting, ignoring click');
            return;
        }
        
        const btn = event.currentTarget;
        const feedbackType = btn.getAttribute('data-feedback');
        
        console.log('📝 Feedback type:', feedbackType);
        
        if (!this.currentComicId || !feedbackType) {
            console.log('❌ Missing comicId or feedbackType');
            return;
        }
        
        // Set submitting flag
        this.isSubmitting = true;

        // Visual feedback
        this.resetButtonStates();
        btn.classList.add('selected');
        
        // Animate the selection
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            btn.style.transform = '';
        }, 100);

        // Store selection
        this.selectedFeedback.set(this.currentComicId, feedbackType);

        // Submit feedback to backend
        try {
            // Get current comic data for token extraction
            const currentComic = this.getCurrentComic();
            console.log('Submitting feedback:', {
                comicId: this.currentComicId,
                feedbackType,
                currentComic,
                tokens: currentComic?.tokens || [],
                concepts: currentComic?.concepts || []
            });
            
            await comicAPI.submitFeedback(this.currentComicId, feedbackType, {
                comicTokens: currentComic?.tokens || [],
                semanticConcepts: currentComic?.concepts || []
            });
            
            // Show success animation
            this.showFeedbackSuccess(btn);
            
            // Update stats
            this.loadFeedbackStats(this.currentComicId);
            
            // Store in local preferences for AI training
            this.updateLocalPreferences(feedbackType, currentComic);
            
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            
            // Check if it's a rate limiting error
            if (error.message && error.message.includes('can only submit')) {
                this.showRateLimitError(error.message);
            } else {
                this.showFeedbackError();
            }
        } finally {
            // Reset submitting flag
            this.isSubmitting = false;
            console.log('✅ Submission completed, flag reset');
        }
    }

    // Reset all button states
    resetButtonStates() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.classList.remove('selected');
            // Don't interfere with temporarily disabled buttons
        });
    }

    // Show success animation
    showFeedbackSuccess(button) {
        // Create success indicator
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

    // Show error state
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

    // Show rate limit error
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
            max-width: 300px;
            text-align: center;
        `;
        
        document.body.appendChild(errorMsg);
        setTimeout(() => errorMsg.remove(), 5000); // Show longer for rate limit
    }

    // Load and display feedback statistics
    async loadFeedbackStats(comicId) {
        try {
            console.log('📊 Loading feedback stats for comic:', comicId);
            const stats = await comicAPI.getFeedbackStats(comicId);
            console.log('📊 Received stats:', stats);
            this.displayStats(stats);
        } catch (error) {
            console.error('Failed to load feedback stats:', error);
            // Show fallback message
            this.feedbackStats.innerHTML = '<p>Unable to load reaction stats.</p>';
        }
    }

    // Display feedback statistics
    displayStats(stats) {
        if (!stats || Object.keys(stats).length === 0) {
            this.feedbackStats.innerHTML = '<p>Be the first to share a reaction!</p>';
            return;
        }

        // Calculate total feedback (exclude 'total' and other meta fields)
        const excludeFields = ['total', 'score', 'engagementRate', 'uniqueUsers'];
        const totalFeedback = Object.entries(stats)
            .filter(([key, value]) => !excludeFields.includes(key))
            .reduce((sum, [key, count]) => sum + count, 0);
        
        if (totalFeedback === 0) {
            this.feedbackStats.innerHTML = '<p>Be the first to share a reaction!</p>';
            return;
        }
        
        // Create stats display
        let statsHTML = ``;
        
        // Show top reactions (exclude meta fields) sorted by feedback value (best to worst)
        const topReactions = Object.entries(stats)
            .filter(([key, value]) => !excludeFields.includes(key))
            .filter(([,count]) => count > 0)
            .sort(([typeA, countA], [typeB, countB]) => {
                // Sort by feedback weight (best to worst), then by count if weights are equal
                const weightA = CONFIG.FEEDBACK_TYPES[typeA]?.weight || 0;
                const weightB = CONFIG.FEEDBACK_TYPES[typeB]?.weight || 0;
                if (weightA !== weightB) {
                    return weightB - weightA; // Higher weight first
                }
                return countB - countA; // Higher count first if weights are equal
            })
            .slice(0, 3);
        
        if (topReactions.length > 0) {
            statsHTML += '<div class="top-reactions">';
            topReactions.forEach(([type, count]) => {
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

    // Update local preferences for AI training
    updateLocalPreferences(feedbackType, comic) {
        try {
            const prefs = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES) || '{}');
            
            // Initialize feedback counts if not exists
            if (!prefs.feedbackCounts) {
                prefs.feedbackCounts = {};
            }
            
            // Initialize token preferences if not exists
            if (!prefs.tokenPreferences) {
                prefs.tokenPreferences = {};
            }
            
            // Increment feedback count
            prefs.feedbackCounts[feedbackType] = (prefs.feedbackCounts[feedbackType] || 0) + 1;
            
            // Update token preferences based on comic content
            if (comic?.tokens) {
                const feedbackWeight = CONFIG.FEEDBACK_TYPES[feedbackType].weight;
                this.updateTokenPreferences(prefs, comic.tokens, feedbackWeight);
            }
            
            if (comic?.concepts) {
                this.updateConceptPreferences(prefs, comic.concepts, feedbackWeight);
            }
            
            // Update last feedback time
            prefs.lastFeedbackTime = new Date().toISOString();
            
            // Calculate preference weights
            this.calculatePreferenceWeights(prefs);
            
            // Save back to localStorage
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(prefs));
            
        } catch (error) {
            console.error('Failed to update local preferences:', error);
        }
    }

    // Calculate preference weights based on feedback history
    calculatePreferenceWeights(prefs) {
        if (!prefs.feedbackCounts) return;
        
        const totalFeedback = Object.values(prefs.feedbackCounts).reduce((sum, count) => sum + count, 0);
        if (totalFeedback === 0) return;
        
        prefs.preferenceWeights = {};
        
        Object.entries(prefs.feedbackCounts).forEach(([type, count]) => {
            const feedbackData = CONFIG.FEEDBACK_TYPES[type];
            if (feedbackData) {
                // Calculate weighted preference based on feedback type and frequency
                const frequencyWeight = count / totalFeedback;
                const typeWeight = feedbackData.weight;
                prefs.preferenceWeights[type] = frequencyWeight * typeWeight;
            }
        });
    }

    // Update token preferences based on feedback
    updateTokenPreferences(prefs, tokens, feedbackWeight) {
        if (!prefs.tokenPreferences) prefs.tokenPreferences = {};
        
        tokens.forEach(token => {
            if (!prefs.tokenPreferences[token]) {
                prefs.tokenPreferences[token] = { weight: 0, count: 0 };
            }
            
            const current = prefs.tokenPreferences[token];
            const decayFactor = CONFIG.TOKEN_ANALYSIS.FEEDBACK_DECAY_RATE;
            
            // Apply exponential moving average for token weights
            current.weight = (current.weight * decayFactor) + (feedbackWeight * (1 - decayFactor));
            current.count += 1;
            current.lastUpdated = new Date().toISOString();
        });
    }
    
    // Update concept preferences based on feedback
    updateConceptPreferences(prefs, concepts, feedbackWeight) {
        if (!prefs.conceptPreferences) prefs.conceptPreferences = {};
        
        concepts.forEach(concept => {
            if (!prefs.conceptPreferences[concept]) {
                prefs.conceptPreferences[concept] = { weight: 0, count: 0 };
            }
            
            const current = prefs.conceptPreferences[concept];
            const decayFactor = CONFIG.TOKEN_ANALYSIS.FEEDBACK_DECAY_RATE;
            
            // Apply exponential moving average for concept weights
            current.weight = (current.weight * decayFactor) + (feedbackWeight * (1 - decayFactor));
            current.count += 1;
            current.lastUpdated = new Date().toISOString();
        });
    }
    
    // Get current comic data (needs to be implemented by app)
    getCurrentComic() {
        // This will be called from the main app to get current comic data
        return window.app?.getCurrentComic?.() || null;
    }

    // Get user preferences for comic generation
    getUserPreferences() {
        try {
            const prefs = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES) || '{}');
            
            // Build comprehensive preference object
            const preferences = {
                feedbackWeights: prefs.preferenceWeights || {},
                tokenWeights: {},
                conceptWeights: {},
                avoidTokens: [],
                encourageTokens: [],
                avoidConcepts: [],
                encourageConcepts: []
            };
            
            // Process token preferences
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
            
            // Process concept preferences
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
}

// Add required CSS for feedback animations
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

    .top-reactions {
        display: flex;
        justify-content: center;
        gap: 20px;
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

// Create and export singleton instance
const feedbackSystem = new FeedbackSystem();
export { feedbackSystem };

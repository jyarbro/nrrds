// Feedback system for collecting user reactions
import comicAPI from './api.js';
import { CONFIG } from './config.js';

export default class FeedbackSystem {
    constructor() {
        this.feedbackSection = document.getElementById('feedbackSection');
        this.feedbackStats = document.getElementById('feedbackStats');
        this.selectedFeedback = new Map(); // Track multiple feedback per comic (comic ID -> Set of feedback types)
        this.submissionQueue = []; // Queue for API submissions
        this.isProcessingQueue = false; // Flag to prevent multiple queue processors
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
        
        // Restore previous selections if they exist
        const previousFeedbackSet = this.selectedFeedback.get(comicId);
        if (previousFeedbackSet && previousFeedbackSet.size > 0) {
            previousFeedbackSet.forEach(feedbackType => {
                const btn = document.querySelector(`[data-feedback="${feedbackType}"]`);
                if (btn) {
                    btn.classList.add('selected');
                }
            });
            
            // If 3+ reactions selected, disable unselected buttons
            if (previousFeedbackSet.size >= 3) {
                this.disableUnselectedButtons();
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
        // Prevent event bubbling
        event.preventDefault();
        event.stopPropagation();
        
        const btn = event.currentTarget;
        const feedbackType = btn.getAttribute('data-feedback');
        
        if (!this.currentComicId || !feedbackType) {
            return;
        }
        
        // Get current selections for this comic
        let feedbackSet = this.selectedFeedback.get(this.currentComicId) || new Set();
        
        // Toggle selection
        if (feedbackSet.has(feedbackType)) {
            // Remove if already selected
            feedbackSet.delete(feedbackType);
            btn.classList.remove('selected');
            
            // Re-enable other buttons if we're now under 3
            if (feedbackSet.size < 3) {
                this.enableReactionButtons();
            }
            
        } else {
            // Add if not selected and less than 3 total
            if (feedbackSet.size < 3) {
                feedbackSet.add(feedbackType);
                btn.classList.add('selected');
                
                // Animate the selection
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    btn.style.transform = '';
                }, 100);
                
                // If we now have 3 selections, disable other buttons
                if (feedbackSet.size >= 3) {
                    this.disableUnselectedButtons();
                }
            } else {
                // Already have 3 selections, don't allow more
                console.log('Maximum 3 reactions allowed');
                return;
            }
        }
        
        // Store updated selections
        this.selectedFeedback.set(this.currentComicId, feedbackSet);
        
        // Submit feedback immediately (async, no waiting)
        this.submitFeedbackImmediately(feedbackType, btn);
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
            max-width: 350px;
            text-align: center;
            z-index: 10000;
        `;
        
        document.body.appendChild(errorMsg);
        setTimeout(() => errorMsg.remove(), 5000); // Show longer for rate limit
    }
    
    // Queue feedback for submission to avoid rate limits
    submitFeedbackImmediately(feedbackType, btn) {
        // Check if this exact submission is already in the queue
        const submissionKey = `${this.currentComicId}-${feedbackType}`;
        const isDuplicate = this.submissionQueue.some(item => 
            item.comicId === this.currentComicId && item.feedbackType === feedbackType
        );
        
        if (isDuplicate) {
            console.log(`Skipping duplicate submission for ${feedbackType}`);
            return;
        }
        
        // Add to queue
        this.submissionQueue.push({
            comicId: this.currentComicId,
            feedbackType: feedbackType,
            button: btn,
            timestamp: Date.now()
        });
        
        // Update local preferences immediately
        const currentComic = this.getCurrentComic();
        this.updateLocalPreferences(feedbackType, currentComic);
        
        // Show success animation immediately (local state is what matters)
        this.showFeedbackSuccess(btn);
        
        // Process the queue
        this.processSubmissionQueue();
    }
    
    // Process the submission queue with proper spacing
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
                    semanticConcepts: currentComic?.concepts || []
                });
                
                console.log(`Successfully submitted feedback: ${submission.feedbackType}`);
                
            } catch (error) {
                console.log(`Failed to submit feedback: ${submission.feedbackType}`, error);
                // Don't retry, just continue with next item
            }
            
            // No delays needed - submit immediately
        }
        
        this.isProcessingQueue = false;
        
        // Update stats once after all submissions are done
        if (this.currentComicId) {
            this.loadFeedbackStats(this.currentComicId);
        }
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
            // Show friendly fallback message
            this.feedbackStats.innerHTML = '<p>Share your reactions!</p>';
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
        
        // Show all reactions (exclude meta fields) sorted by feedback value (best to worst)
        const allReactions = Object.entries(stats)
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
            
            // Get feedback weight for this reaction type
            const feedbackWeight = CONFIG.FEEDBACK_TYPES[feedbackType]?.weight || 0;
            
            // Update token preferences based on comic content
            if (comic?.tokens) {
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

    // Disable only unselected reaction buttons when 3 selections made
    disableUnselectedButtons() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            if (!btn.classList.contains('selected')) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
        });
    }

    // Enable all reaction buttons
    enableReactionButtons() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }


    // Override resetButtonStates to handle multiple selections
    resetButtonStates() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
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

// Create and export singleton instance
const feedbackSystem = new FeedbackSystem();
export { feedbackSystem };

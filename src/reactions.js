import comicAPI from './api.js';
import { CONFIG } from './config.js';

/**
 * Reactions system for collecting user reactions to comics
 */
export default class ReactionsSystem {
    /**
     * Initialize the reactions system
     */
    constructor() {
        /** @type {HTMLElement} The reactions container element */
        this.reactionsContainer = document.getElementById('reactionsContainer');
        /** @type {HTMLElement} The reactions title element */
        this.reactionsTitle = document.getElementById('reactionsTitle');
        /** @type {HTMLElement} The reactions grid element */
        this.reactionsGrid = document.getElementById('reactionsGrid');
        /** @type {HTMLElement} The reaction statistics display element */
        this.reactionStats = null; // Will be set dynamically when comic is rendered
        /** @type {Map<string, Set<string>>} Track multiple reactions per comic (comic ID -> Set of reaction types) */
        this.selectedReactions = new Map();
        /** @type {Array} Queue for API submissions */
        this.submissionQueue = [];
        /** @type {boolean} Flag to prevent multiple queue processors */
        this.isProcessingQueue = false;
        /** @type {boolean} Flag to prevent stats reload immediately after optimistic update */
        this.justUpdatedOptimistically = false;
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners for reaction buttons
     */
    initializeEventListeners() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleReactionClick(e), { once: false });
        });
    }

    /**
     * Show reactions section for a specific comic
     * @param {string} comicId - The ID of the comic to show reactions for
     */
    show(comicId) {
        this.currentComicId = comicId;
        this.reactionsContainer.style.display = 'block';
        this.reactionsTitle.style.display = 'block';
        this.resetButtonStates();

        const localKey = `comic_reactions_${comicId}`;
        let previousReactionSet;
        try {
            const stored = localStorage.getItem(localKey);
            if (stored) {
                previousReactionSet = new Set(JSON.parse(stored));
                this.selectedReactions.set(comicId, previousReactionSet);
            } else {
                previousReactionSet = this.selectedReactions.get(comicId);
            }
        } catch (e) {
            previousReactionSet = this.selectedReactions.get(comicId);
        }

        if (previousReactionSet && previousReactionSet.size > 0) {
            previousReactionSet.forEach(reactionType => {
                const btn = document.querySelector(`[data-reaction="${reactionType}"]`);
                if (btn) {
                    btn.classList.add('selected');
                }
            });
            if (previousReactionSet.size >= 3) {
                this.disableUnselectedButtons();
            }
        }
        this.loadReactionStats(comicId);
    }

    /**
     * Hide the reactions section
     */
    hide() {
        this.reactionsContainer.style.display = 'none';
        this.reactionsTitle.style.display = 'none';
        this.currentComicId = null;
    }

    /**
     * Handle reaction button click events
     * @param {Event} event - The click event
     */
    async handleReactionClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const btn = event.currentTarget;
        const reactionType = btn.getAttribute('data-reaction');
        
        if (!this.currentComicId || !reactionType) {
            return;
        }
        
        let reactionSet = this.selectedReactions.get(this.currentComicId) || new Set();
        let wasSelected = reactionSet.has(reactionType);
        
        if (wasSelected) {
            reactionSet.delete(reactionType);
            btn.classList.remove('selected');
            
            if (reactionSet.size < 3) {
                this.enableReactionButtons();
            }
            this.submitReactionImmediately(reactionType, btn, true);
        } else {
            if (reactionSet.size < 3) {
                reactionSet.add(reactionType);
                btn.classList.add('selected');
                
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    btn.style.transform = '';
                }, 100);
                
                if (reactionSet.size >= 3) {
                    this.disableUnselectedButtons();
                }
                this.submitReactionImmediately(reactionType, btn, false);
            } else {
                return;
            }
        }
        
        this.selectedReactions.set(this.currentComicId, reactionSet);
        try {
            const localKey = `comic_reactions_${this.currentComicId}`;
            localStorage.setItem(localKey, JSON.stringify(Array.from(reactionSet)));
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
     * Show success animation on a reaction button
     * @param {HTMLElement} button - The button element to animate
     */
    showReactionSuccess(button) {
        const success = document.createElement('div');
        success.className = 'reaction-success';
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
     * Show error message for failed reaction submission
     */
    showReactionError() {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'reaction-error';
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
        errorMsg.className = 'reaction-rate-limit-error';
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
     * Queue reaction for immediate submission to avoid rate limits
     * @param {string} reactionType - The type of reaction
     * @param {HTMLElement} btn - The button element
     * @param {boolean} isDecrement - Whether this is a decrement operation
     */
    submitReactionImmediately(reactionType, btn, isDecrement = false) {
        const submissionKey = `${this.currentComicId}-${reactionType}-${isDecrement ? 'decrement' : 'increment'}`;
        const isDuplicate = this.submissionQueue.some(item => 
            item.comicId === this.currentComicId && item.reactionType === reactionType && item.isDecrement === isDecrement
        );
        
        if (isDuplicate) {
            return;
        }
        
        this.submissionQueue.push({
            comicId: this.currentComicId,
            reactionType: reactionType,
            button: btn,
            timestamp: Date.now(),
            isDecrement: isDecrement
        });
        
        const currentComic = this.getCurrentComic();
        this.updateLocalPreferences(reactionType, currentComic);
        
        this.showReactionSuccess(btn);
        
        // Update stats immediately for better UX
        this.updateStatsImmediately(reactionType, isDecrement);
        this.justUpdatedOptimistically = true;
        
        this.processSubmissionQueue();
    }

    /**
     * Update stats immediately for better UX before server confirmation
     * @param {string} reactionType - The type of reaction
     * @param {boolean} isDecrement - Whether this is a decrement operation
     */
    updateStatsImmediately(reactionType, isDecrement = false) {
        // Get current stats display element dynamically
        const statsElement = document.getElementById('comicReactionStats');
        if (!statsElement) {
            return; // No stats container found
        }
        
        // If this is the first reaction on a comic with no existing reactions
        if (!statsElement.innerHTML.includes('reaction-stat') && !isDecrement) {
            const reactionData = CONFIG.FEEDBACK_TYPES[reactionType];
            if (reactionData) {
                statsElement.innerHTML = `
                    <div class="reactions-title-small">Fan Reactions</div>
                    <div class="all-reactions">
                        <span class="reaction-stat" data-reaction-type="${reactionType}" data-count="1">
                            <span class="reaction-emoji">${reactionData.emoji}</span>
                        </span>
                    </div>
                `;
                console.log('🎭 [OPTIMISTIC] Added first reaction:', reactionType, reactionData.emoji);
            }
            return;
        }
        
        // If no existing reactions and this is a decrement, nothing to do
        if (!statsElement.innerHTML.includes('reaction-stat')) {
            return;
        }

        // Find the specific reaction stat element
        const reactionStats = statsElement.querySelectorAll('.reaction-stat');
        let foundStat = false;

        reactionStats.forEach(statElement => {
            const statReactionType = statElement.getAttribute('data-reaction-type');
            
            if (statReactionType === reactionType) {
                foundStat = true;
                const currentCount = parseInt(statElement.getAttribute('data-count') || '0');
                const newCount = Math.max(0, currentCount + (isDecrement ? -1 : 1));
                
                if (newCount === 0) {
                    // Remove the element if count reaches 0
                    statElement.remove();
                } else {
                    // Update the count attribute
                    statElement.setAttribute('data-count', newCount.toString());
                }
            }
        });

        // If this is a new reaction type, add it to the display
        if (!foundStat && !isDecrement) {
            const reactionData = CONFIG.FEEDBACK_TYPES[reactionType];
            if (reactionData) {
                const allReactionsDiv = statsElement.querySelector('.all-reactions');
                if (allReactionsDiv) {
                    const newStat = document.createElement('span');
                    newStat.className = 'reaction-stat';
                    newStat.setAttribute('data-reaction-type', reactionType);
                    newStat.setAttribute('data-count', '1');
                    newStat.innerHTML = `
                        <span class="reaction-emoji">${reactionData.emoji}</span>
                    `;
                    allReactionsDiv.appendChild(newStat);
                } else {
                    // Create the all-reactions div if it doesn't exist
                    statsElement.innerHTML = `
                        <div class="all-reactions">
                            <span class="reaction-stat" data-reaction-type="${reactionType}" data-count="1">
                                <span class="reaction-emoji">${reactionData.emoji}</span>
                            </span>
                        </div>
                    `;
                }
            }
        }
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
                await comicAPI.submitFeedback(submission.comicId, submission.reactionType, {
                    comicTokens: currentComic?.tokens || [],
                    semanticConcepts: currentComic?.concepts || [],
                    action: submission.isDecrement ? 'decrement' : 'increment'
                });
            } catch (error) {
                console.error('Failed to submit feedback:', error);
                this.showReactionError();
            }
        }
        this.isProcessingQueue = false;
        // Don't immediately reload stats to avoid overwriting optimistic updates
        // Instead, reload after a delay to get the authoritative server data
        if (this.currentComicId) {
            setTimeout(() => {
                this.justUpdatedOptimistically = false;
                this.loadReactionStats(this.currentComicId);
            }, 1500); // 1.5 second delay to ensure server has processed the update
        }
    }

    /**
     * Load and display reaction statistics for a comic
     * @param {string} comicId - The ID of the comic to load stats for
     */
    async loadReactionStats(comicId) {
        try {
            console.log('🎭 [REACTIONS DEBUG] Loading stats for comic:', comicId);
            console.log('🎭 [REACTIONS DEBUG] Environment:', {
                isDev: location.hostname === 'localhost',
                hostname: location.hostname,
                protocol: location.protocol
            });
            
            const stats = await comicAPI.getFeedbackStats(comicId);
            
            console.log('🎭 [REACTIONS DEBUG] Stats received:', stats);
            console.log('🎭 [REACTIONS DEBUG] Stats keys:', Object.keys(stats));
            console.log('🎭 [REACTIONS DEBUG] Stats values:', Object.values(stats));
            
            this.displayStats(stats);
        } catch (error) {
            console.error('🎭 [REACTIONS DEBUG] Failed to load reaction stats:', {
                error: error.message,
                comicId: comicId,
                stack: error.stack
            });
            // Get the current stats element dynamically
            this.reactionStats = document.getElementById('comicReactionStats');
            if (this.reactionStats) {
                this.reactionStats.innerHTML = '<p>Share your reactions!</p>';
            }
        }
    }
    

    /**
     * Display reaction statistics in the UI
     * @param {Object} stats - The statistics object
     */
    displayStats(stats) {
        console.log('🎭 [DISPLAY DEBUG] displayStats called with:', stats);
        
        // Get the current stats element dynamically
        this.reactionStats = document.getElementById('comicReactionStats');
        
        if (!this.reactionStats) {
            console.warn('🎭 [DISPLAY DEBUG] Reaction stats container not found - checking DOM');
            console.log('🎭 [DISPLAY DEBUG] Available elements with "reaction" in id:', 
                Array.from(document.querySelectorAll('[id*="reaction"]')).map(el => el.id));
            return;
        }
        
        console.log('🎭 [DISPLAY DEBUG] Stats container found:', this.reactionStats);
        
        if (!stats || Object.keys(stats).length === 0) {
            console.log('🎭 [DISPLAY DEBUG] No stats provided, showing default message');
            this.reactionStats.innerHTML = '<p>Be the first to share a reaction!</p>';
            return;
        }

        const excludeFields = ['total', 'score', 'engagementRate', 'uniqueUsers'];
        const totalReactions = Object.entries(stats)
            .filter(([key, value]) => !excludeFields.includes(key))
            .reduce((sum, [key, count]) => sum + count, 0);
        
        console.log('🎭 [DISPLAY DEBUG] Total reactions calculated:', totalReactions);
        console.log('🎭 [DISPLAY DEBUG] Excluded fields:', excludeFields);
        console.log('🎭 [DISPLAY DEBUG] Non-excluded entries:', 
            Object.entries(stats).filter(([key, value]) => !excludeFields.includes(key)));
        
        if (totalReactions === 0) {
            console.log('🎭 [DISPLAY DEBUG] Total reactions is 0, showing first reaction message');
            this.reactionStats.innerHTML = '<div class="reactions-title-small">Fan Reactions</div><p>Be the first to share a reaction!</p>';
            return;
        }
        
        let statsHTML = `<div class="reactions-title-small">Fan Reactions</div>`;
        
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
        
        console.log('🎭 [DISPLAY DEBUG] All reactions to display:', allReactions);
        
        if (allReactions.length > 0) {
            statsHTML += '<div class="all-reactions">';
            allReactions.forEach(([type, count]) => {
                const reactionData = CONFIG.FEEDBACK_TYPES[type];
                console.log(`🎭 [DISPLAY DEBUG] Processing reaction ${type}:`, { count, reactionData });
                if (reactionData && count > 0) {
                    statsHTML += `
                        <span class="reaction-stat" data-reaction-type="${type}" data-count="${count}">
                            <span class="reaction-emoji">${reactionData.emoji}</span>
                        </span>
                    `;
                }
            });
            statsHTML += '</div>';
        }
        
        console.log('🎭 [DISPLAY DEBUG] Final HTML being set:', statsHTML);
        this.reactionStats.innerHTML = statsHTML;
        console.log('🎭 [DISPLAY DEBUG] HTML set complete, final element content:', this.reactionStats.innerHTML);
    }

    /**
     * Update local preferences for AI training based on feedback
     * @param {string} reactionType - The type of feedback given
     * @param {Object} comic - The comic object with tokens and concepts
     */
    updateLocalPreferences(reactionType, comic) {
        try {
            const prefs = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES) || '{}');
            
            if (!prefs.reactionCounts) {
                prefs.reactionCounts = {};
            }
            
            if (!prefs.tokenPreferences) {
                prefs.tokenPreferences = {};
            }
            
            prefs.reactionCounts[reactionType] = (prefs.reactionCounts[reactionType] || 0) + 1;
            
            const reactionWeight = CONFIG.FEEDBACK_TYPES[reactionType]?.weight || 0;
            
            if (comic?.tokens) {
                this.updateTokenPreferences(prefs, comic.tokens, reactionWeight);
            }
            
            if (comic?.concepts) {
                this.updateConceptPreferences(prefs, comic.concepts, reactionWeight);
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
        if (!prefs.reactionCounts) return;
        
        const totalReactions = Object.values(prefs.reactionCounts).reduce((sum, count) => sum + count, 0);
        if (totalReactions === 0) return;
        
        prefs.preferenceWeights = {};
        
        Object.entries(prefs.reactionCounts).forEach(([type, count]) => {
            const reactionData = CONFIG.FEEDBACK_TYPES[type];
            if (reactionData) {
                const frequencyWeight = count / totalReactions;
                const typeWeight = reactionData.weight;
                prefs.preferenceWeights[type] = frequencyWeight * typeWeight;
            }
        });
    }

    /**
     * Update token preferences based on feedback
     * @param {Object} prefs - The preferences object
     * @param {Array} tokens - Array of tokens from the comic
     * @param {number} reactionWeight - The weight of the feedback
     */
    updateTokenPreferences(prefs, tokens, reactionWeight) {
        if (!prefs.tokenPreferences) prefs.tokenPreferences = {};
        
        tokens.forEach(token => {
            if (!prefs.tokenPreferences[token]) {
                prefs.tokenPreferences[token] = { weight: 0, count: 0 };
            }
            
            const current = prefs.tokenPreferences[token];
            const decayFactor = CONFIG.TOKEN_ANALYSIS.FEEDBACK_DECAY_RATE;
            
            current.weight = (current.weight * decayFactor) + (reactionWeight * (1 - decayFactor));
            current.count += 1;
            current.lastUpdated = new Date().toISOString();
        });
    }
    
    /**
     * Update concept preferences based on feedback
     * @param {Object} prefs - The preferences object
     * @param {Array} concepts - Array of concepts from the comic
     * @param {number} reactionWeight - The weight of the feedback
     */
    updateConceptPreferences(prefs, concepts, reactionWeight) {
        if (!prefs.conceptPreferences) prefs.conceptPreferences = {};
        
        concepts.forEach(concept => {
            if (!prefs.conceptPreferences[concept]) {
                prefs.conceptPreferences[concept] = { weight: 0, count: 0 };
            }
            
            const current = prefs.conceptPreferences[concept];
            const decayFactor = CONFIG.TOKEN_ANALYSIS.FEEDBACK_DECAY_RATE;
            
            current.weight = (current.weight * decayFactor) + (reactionWeight * (1 - decayFactor));
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
     * Calculate generation temperature based on user's reaction history and system needs
     * @returns {number} Temperature value between 0.0 (exploit) and 1.0 (explore)
     */
    calculateGenerationTemperature() {
        try {
            const prefs = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES) || '{}');
            const tempConfig = CONFIG.GENERATION_TEMPERATURE;
            
            // Calculate total user reactions
            const totalReactions = prefs.reactionCounts ? 
                Object.values(prefs.reactionCounts).reduce((sum, count) => sum + count, 0) : 0;
            
            // New users get higher temperature (more exploration)
            const isNewUser = totalReactions < tempConfig.NEW_USER_THRESHOLD;
            
            // Get user's last temperature and generation count for cooldown
            const lastGenerationTemp = prefs.lastGenerationTemperature || 0;
            const generationsSinceHighTemp = prefs.generationsSinceHighTemp || 0;
            
            // Random exploration factor
            const randomFactor = Math.random();
            
            // Base temperature calculation
            let temperature;
            
            if (isNewUser) {
                // New users: bias toward exploration (0.4-0.8 range)
                temperature = 0.4 + (randomFactor * 0.4);
            } else {
                // Experienced users: check if it's time for high-temperature exploration
                const shouldExplore = (
                    randomFactor < tempConfig.HIGH_TEMP_FREQUENCY || 
                    generationsSinceHighTemp >= tempConfig.EXPLORATION_COOLDOWN
                );
                
                if (shouldExplore) {
                    // High exploration phase
                    temperature = tempConfig.EXPLORE_RANGE[0] + 
                        (randomFactor * (tempConfig.EXPLORE_RANGE[1] - tempConfig.EXPLORE_RANGE[0]));
                } else {
                    // Normal exploitation phase
                    temperature = tempConfig.EXPLOIT_RANGE[0] + 
                        (randomFactor * (tempConfig.BALANCED_RANGE[1] - tempConfig.EXPLOIT_RANGE[0]));
                }
            }
            
            // Ensure temperature is within bounds
            temperature = Math.max(tempConfig.MIN_TEMP, Math.min(tempConfig.MAX_TEMP, temperature));
            
            // Store temperature info for next calculation
            prefs.lastGenerationTemperature = temperature;
            prefs.generationsSinceHighTemp = temperature > tempConfig.BALANCED_RANGE[1] ? 0 : 
                (prefs.generationsSinceHighTemp || 0) + 1;
            
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(prefs));
            
            console.log(`🌡️ [TEMPERATURE] Calculated: ${temperature.toFixed(3)} (new user: ${isNewUser}, total reactions: ${totalReactions})`);
            return temperature;
            
        } catch (error) {
            console.error('Failed to calculate generation temperature:', error);
            return CONFIG.GENERATION_TEMPERATURE.DEFAULT_TEMP;
        }
    }

    /**
     * Get user preferences for comic generation
     * @returns {Object} User preferences object with feedback weights and token/concept preferences
     */
    getUserPreferences() {
        try {
            const prefs = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES) || '{}');
            
            // Calculate current generation temperature
            const temperature = this.calculateGenerationTemperature();
            
            // Temperature dampening factor: higher temp = less weight on preferences
            const temperatureDampening = 1.0 - temperature;
            
            const preferences = {
                reactionWeights: {},
                tokenWeights: {},
                conceptWeights: {},
                avoidTokens: [],
                encourageTokens: [],
                encourageConcepts: [],
                avoidConcepts: [],
                generationTemperature: temperature
            };
            
            // Apply temperature dampening to reaction weights
            if (prefs.preferenceWeights) {
                Object.entries(prefs.preferenceWeights).forEach(([type, weight]) => {
                    preferences.reactionWeights[type] = weight * temperatureDampening;
                });
            }
            
            // Apply temperature dampening to token preferences
            if (prefs.tokenPreferences) {
                Object.entries(prefs.tokenPreferences).forEach(([token, data]) => {
                    if (data.count >= CONFIG.TOKEN_ANALYSIS.MIN_TOKEN_FREQUENCY) {
                        const adjustedWeight = data.weight * temperatureDampening;
                        preferences.tokenWeights[token] = adjustedWeight;
                        
                        // Only add to avoid/encourage lists if weight is still significant after temperature adjustment
                        if (adjustedWeight < -0.5) {
                            preferences.avoidTokens.push(token);
                        } else if (adjustedWeight > 0.5) {
                            preferences.encourageTokens.push(token);
                        }
                    }
                });
            }
            
            // Apply temperature dampening to concept preferences
            if (prefs.conceptPreferences) {
                Object.entries(prefs.conceptPreferences).forEach(([concept, data]) => {
                    if (data.count >= CONFIG.TOKEN_ANALYSIS.MIN_TOKEN_FREQUENCY) {
                        const adjustedWeight = data.weight * temperatureDampening;
                        preferences.conceptWeights[concept] = adjustedWeight;
                        
                        // Only add to avoid/encourage lists if weight is still significant after temperature adjustment
                        if (adjustedWeight < -0.5) {
                            preferences.avoidConcepts.push(concept);
                        } else if (adjustedWeight > 0.5) {
                            preferences.encourageConcepts.push(concept);
                        }
                    }
                });
            }
            
            console.log(`🌡️ [PREFERENCES] Applied temperature ${temperature.toFixed(3)} (dampening: ${temperatureDampening.toFixed(3)}) to preferences`);
            console.log(`🌡️ [PREFERENCES] Adjusted weights - Tokens: ${Object.keys(preferences.tokenWeights).length}, Concepts: ${Object.keys(preferences.conceptWeights).length}`);
            
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
 * Create and export singleton instance of the reactions system
 * @type {ReactionsSystem}
 */
const reactionsSystem = new ReactionsSystem();
export { reactionsSystem };

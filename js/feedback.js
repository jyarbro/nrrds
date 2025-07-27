// Feedback system for collecting user reactions
import comicAPI from './api.js';

export default class FeedbackSystem {
    constructor() {
        this.feedbackSection = document.getElementById('feedbackSection');
        this.feedbackStats = document.getElementById('feedbackStats');
        this.selectedFeedback = new Map(); // Track feedback per comic
        this.initializeEventListeners();
    }

    // Initialize event listeners
    initializeEventListeners() {
        // Add click handlers to all emoji buttons
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFeedbackClick(e));
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
        const btn = event.currentTarget;
        const feedbackType = btn.getAttribute('data-feedback');
        
        if (!this.currentComicId || !feedbackType) {
            return;
        }

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
            await comicAPI.submitFeedback(this.currentComicId, feedbackType);
            
            // Show success animation
            this.showFeedbackSuccess(btn);
            
            // Update stats
            this.loadFeedbackStats(this.currentComicId);
            
            // Store in local preferences for AI training
            this.updateLocalPreferences(feedbackType);
            
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            this.showFeedbackError();
        }
    }

    // Reset all button states
    resetButtonStates() {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.classList.remove('selected');
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
        errorMsg.textContent = 'Failed to save feedback. Please try again.';
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

    // Load and display feedback statistics
    async loadFeedbackStats(comicId) {
        try {
            const stats = await comicAPI.getFeedbackStats(comicId);
            this.displayStats(stats);
        } catch (error) {
            console.error('Failed to load feedback stats:', error);
        }
    }

    // Display feedback statistics
    displayStats(stats) {
        if (!stats || Object.keys(stats).length === 0) {
            this.feedbackStats.innerHTML = '<p>Be the first to share your feedback!</p>';
            return;
        }

        // Calculate total feedback
        const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
        
        if (total === 0) {
            this.feedbackStats.innerHTML = '<p>Be the first to share your feedback!</p>';
            return;
        }

        // Create stats display
        let statsHTML = `<p><strong>${total}</strong> ${total === 1 ? 'person has' : 'people have'} shared feedback</p>`;
        
        // Show top reactions
        const topReactions = Object.entries(stats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .filter(([,count]) => count > 0);
        
        if (topReactions.length > 0) {
            statsHTML += '<div class="top-reactions">';
            topReactions.forEach(([type, count]) => {
                const feedbackData = CONFIG.FEEDBACK_TYPES[type];
                if (feedbackData) {
                    const percentage = Math.round((count / total) * 100);
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
    updateLocalPreferences(feedbackType) {
        try {
            const prefs = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES) || '{}');
            
            // Initialize feedback counts if not exists
            if (!prefs.feedbackCounts) {
                prefs.feedbackCounts = {};
            }
            
            // Increment feedback count
            prefs.feedbackCounts[feedbackType] = (prefs.feedbackCounts[feedbackType] || 0) + 1;
            
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

    // Get user preferences for comic generation
    getUserPreferences() {
        try {
            const prefs = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFERENCES) || '{}');
            return prefs.preferenceWeights || {};
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

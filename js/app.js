// Main application controller
import comicAPI from './api.js';
import { CONFIG } from './config.js';
import { comicRenderer } from './comic-renderer.js';
import { feedbackSystem } from './feedback.js';

class ComicApp {
    constructor() {
        this.comicHistory = [];
        this.currentIndex = -1;
        this.isLoading = false;
        
        // Initialize components
        this.initializeElements();
        this.initializeEventListeners();
        this.loadHistoryFromStorage();
    }

    // Initialize DOM elements
    initializeElements() {
        this.generateBtn = document.getElementById('generateBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.comicCounter = document.getElementById('comicCounter');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorModal = document.getElementById('errorModal');
        this.errorMessage = document.getElementById('errorMessage');
    }

    // Initialize event listeners
    initializeEventListeners() {
        this.generateBtn.addEventListener('click', () => this.generateNewComic());
        this.prevBtn.addEventListener('click', () => this.navigatePrevious());
        this.nextBtn.addEventListener('click', () => this.navigateNext());
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' && !this.prevBtn.disabled) {
                this.navigatePrevious();
            } else if (e.key === 'ArrowRight' && !this.nextBtn.disabled) {
                this.navigateNext();
            }
        });
    }

    // Generate a new comic
    async generateNewComic() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            // Get user preferences for AI steering
            const preferences = feedbackSystem.getUserPreferences();
            
            // Simulate minimum loading time for better UX
            const startTime = Date.now();
            
            // Generate comic via API
            const comic = await comicAPI.generateComic(preferences);
            
            // Ensure minimum loading time
            const elapsed = Date.now() - startTime;
            if (elapsed < CONFIG.UI.LOADING_DELAY) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.UI.LOADING_DELAY - elapsed));
            }
            
            // Add to history
            this.addToHistory(comic);
            
            // Render the comic
            this.displayComic(comic);
            
            // Hide loading
            this.hideLoading();
            
        } catch (error) {
            console.error('Failed to generate comic:', error);
            this.hideLoading();
            this.showError(error.message || CONFIG.ERRORS.GENERATION_FAILED);
        } finally {
            this.isLoading = false;
        }
    }

    // Add comic to history
    addToHistory(comic) {
        // Remove any comics after current index (if navigating back and generating new)
        if (this.currentIndex < this.comicHistory.length - 1) {
            this.comicHistory = this.comicHistory.slice(0, this.currentIndex + 1);
        }
        
        // Add new comic
        this.comicHistory.push(comic);
        this.currentIndex = this.comicHistory.length - 1;
        
        // Limit history size
        if (this.comicHistory.length > CONFIG.UI.MAX_HISTORY_SIZE) {
            this.comicHistory.shift();
            this.currentIndex--;
        }
        
        // Save to storage
        this.saveHistoryToStorage();
        
        // Update navigation
        this.updateNavigation();
    }

    // Display a comic
    displayComic(comic) {
        // Render the comic
        comicRenderer.render(comic);
        
        // Show feedback section
        feedbackSystem.show(comic.id);
        
        // Update counter
        this.updateCounter();
    }

    // Navigate to previous comic
    navigatePrevious() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            const comic = this.comicHistory[this.currentIndex];
            this.displayComic(comic);
            this.updateNavigation();
        }
    }

    // Navigate to next comic
    navigateNext() {
        if (this.currentIndex < this.comicHistory.length - 1) {
            this.currentIndex++;
            const comic = this.comicHistory[this.currentIndex];
            this.displayComic(comic);
            this.updateNavigation();
        }
    }

    // Update navigation buttons
    updateNavigation() {
        this.prevBtn.disabled = this.currentIndex <= 0;
        this.nextBtn.disabled = this.currentIndex >= this.comicHistory.length - 1;
        this.updateCounter();
    }

    // Update comic counter
    updateCounter() {
        if (this.comicHistory.length === 0) {
            this.comicCounter.textContent = '0 / 0';
        } else {
            this.comicCounter.textContent = `${this.currentIndex + 1} / ${this.comicHistory.length}`;
        }
    }

    // Show loading overlay
    showLoading() {
        this.loadingOverlay.classList.add('active');
        comicRenderer.showLoading();
    }

    // Hide loading overlay
    hideLoading() {
        this.loadingOverlay.classList.remove('active');
    }

    // Show error modal
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorModal.classList.add('active');
    }

    // Close error modal
    closeError() {
        this.errorModal.classList.remove('active');
    }

    // Save history to local storage
    saveHistoryToStorage() {
        try {
            // Only save essential data to avoid storage limits
            const historyData = this.comicHistory.map(comic => ({
                id: comic.id,
                title: comic.title,
                timestamp: comic.timestamp || new Date().toISOString()
            }));
            
            localStorage.setItem(CONFIG.STORAGE_KEYS.COMIC_HISTORY, JSON.stringify({
                history: historyData,
                currentIndex: this.currentIndex
            }));
        } catch (error) {
            console.error('Failed to save history:', error);
            // If storage is full, clear old data
            if (error.name === 'QuotaExceededError') {
                this.clearOldHistory();
            }
        }
    }

    // Load history from local storage
    async loadHistoryFromStorage() {
        try {
            console.log('Loading history from local storage...');
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.COMIC_HISTORY);
            if (!stored) {
                console.log('No comic history found in local storage');
                return;
            }
            
            const { history, currentIndex } = JSON.parse(stored);
            console.log(`Found ${history.length} comics in history`);
            
            // Check if we're using the production or local API
            if (CONFIG.API_BASE_URL.includes('api.nrrds.com')) {
                console.log('Using production API');
            } else {
                console.log('Using local development API:', CONFIG.API_BASE_URL);
            }
            
            // Load full comic data for recent items
            const recentCount = 5;
            console.log(`Attempting to load ${Math.min(history.length, recentCount)} recent comics`);
            
            const loadPromises = history.slice(-recentCount).map(async (item) => {
                try {
                    console.log(`Attempting to load comic: ${item.id}`);
                    return await comicAPI.getComic(item.id);
                } catch (error) {
                    console.error(`Failed to load comic ${item.id}:`, error);
                    if (error.status === 404) {
                        console.log(`Comic ${item.id} not found in backend storage - may need to regenerate`);
                    }
                    return null;
                }
            });
            
            const loadedComics = await Promise.all(loadPromises);
            const validComics = loadedComics.filter(comic => comic !== null);
            console.log(`Successfully loaded ${validComics.length} comics`);
            
            if (validComics.length > 0) {
                this.comicHistory = validComics;
                this.currentIndex = Math.min(currentIndex, this.comicHistory.length - 1);
                
                // Display the last viewed comic
                if (this.currentIndex >= 0 && this.currentIndex < this.comicHistory.length) {
                    this.displayComic(this.comicHistory[this.currentIndex]);
                }
                
                this.updateNavigation();
            } else {
                console.log('No valid comics were loaded from history');
                // Clear invalid history to prevent repeated errors
                this.comicHistory = [];
                this.currentIndex = -1;
                this.saveHistoryToStorage();
                console.log('Comic history was reset due to loading failures');
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    }

    // Clear old history data
    clearOldHistory() {
        try {
            // Keep only the last 10 comics
            this.comicHistory = this.comicHistory.slice(-10);
            this.currentIndex = this.comicHistory.length - 1;
            this.saveHistoryToStorage();
        } catch (error) {
            console.error('Failed to clear old history:', error);
        }
    }
}

// Global error handler for the close error button
function closeError() {
    document.getElementById('errorModal').classList.remove('active');
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create app instance
    window.comicApp = new ComicApp();
    
    // Add some sample comics for testing (remove in production)
    if (import.meta.env.DEV) {
        // Override API to return sample data for testing
        const originalGenerateComic = comicAPI.generateComic.bind(comicAPI);
        comicAPI.generateComic = async function(preferences) {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Generate sample comic
            const comicId = `comic_${Date.now()}`;
            const themes = ['tech', 'life', 'work', 'fun'];
            const theme = themes[Math.floor(Math.random() * themes.length)];
            
            const sampleComics = {
                tech: {
                    id: comicId,
                    title: "The Debugging Adventure",
                    panels: [
                        {
                            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                            header: "10:00 AM",
                            character: { emoji: "😊", style: 1 },
                            dialogue: ["This bug should be easy to fix!", "Just a simple typo, probably..."]
                        },
                        {
                            background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                            header: "2:00 PM",
                            character: { emoji: "😰", style: 2, effect: "shake" },
                            dialogue: [
                                { text: "WHY ISN'T THIS WORKING?!", style: "angry" },
                                { text: "I've tried everything...", type: "thought" }
                            ]
                        },
                        {
                            background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                            header: "6:00 PM",
                            character: { emoji: "😭", style: 3 },
                            dialogue: ["It was a semicolon.", "A. Single. Semicolon."]
                        }
                    ],
                    credits: "Every developer's story • Generated with AI"
                },
                life: {
                    id: comicId,
                    title: "Monday Morning Motivation",
                    panels: [
                        {
                            background: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
                            header: "Sunday Night",
                            character: { emoji: "😎", style: 4 },
                            dialogue: ["Tomorrow I'm going to be so productive!", "New week, new me!"]
                        },
                        {
                            background: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
                            header: "Monday 7:00 AM",
                            character: { emoji: "😴", style: 5, effect: "shake" },
                            dialogue: ["Just... five more minutes...", { text: "Or maybe an hour", type: "thought" }]
                        },
                        {
                            background: "linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)",
                            header: "Monday 9:00 AM",
                            character: { emoji: "☕", style: 1 },
                            dialogue: ["Coffee first.", "Productivity... eventually."]
                        }
                    ],
                    credits: "The eternal struggle • AI Generated"
                },
                work: {
                    id: comicId,
                    title: "The Meeting That Could've Been an Email",
                    panels: [
                        {
                            background: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
                            header: "Meeting Invite",
                            character: { emoji: "📧", style: 2 },
                            dialogue: ["Quick sync - 30 minutes", "Should be brief!"]
                        },
                        {
                            background: "linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)",
                            header: "45 Minutes Later",
                            character: { emoji: "😐", style: 3 },
                            dialogue: ["So... what are we discussing?", { text: "This could've been an email", type: "thought" }]
                        },
                        {
                            background: "linear-gradient(135deg, #9890e3 0%, #b1f4cf 100%)",
                            header: "90 Minutes Later",
                            character: { emoji: "💀", style: 4, effect: "shake" },
                            dialogue: ["Let's schedule a follow-up meeting", { text: "NOOOOOOO!", style: "angry" }]
                        }
                    ],
                    credits: "Corporate life in a nutshell • AI Comic"
                },
                fun: {
                    id: comicId,
                    title: "The Snack Dilemma",
                    panels: [
                        {
                            background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
                            header: "The Kitchen",
                            character: { emoji: "🤔", style: 5 },
                            dialogue: ["I'm hungry...", "Let me check what we have"]
                        },
                        {
                            background: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
                            header: "The Fridge",
                            character: { emoji: "😕", style: 1, effect: "bounce" },
                            dialogue: ["Hmm... nothing looks good", { text: "Maybe the pantry?", type: "thought" }]
                        },
                        {
                            background: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
                            header: "5 Minutes Later",
                            character: { emoji: "🍕", style: 2 },
                            dialogue: ["Hello, pizza delivery?", "Yes, the usual please."]
                        }
                    ],
                    credits: "A universal experience • Created by AI"
                }
            };
            
            return sampleComics[theme];
        };
    }
});

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ComicApp();
});

// Export for module usage
export default ComicApp;

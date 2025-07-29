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
        this.nextBtn = document.getElementById('nextBtn');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorModal = document.getElementById('errorModal');
        this.errorMessage = document.getElementById('errorMessage');
    }

    // Initialize event listeners
    initializeEventListeners() {
        this.nextBtn.addEventListener('click', () => this.handleNextAction());
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' && !this.nextBtn.disabled) {
                this.handleNextAction();
            }
        });
    }

    // Handle next button action - generates or navigates based on current state
    async handleNextAction() {
        // If no comics are displayed, generate a new one
        if (this.comicHistory.length === 0 || this.currentIndex === -1) {
            await this.generateNewComic();
            return;
        }

        // If a comic is displayed, check if user has provided feedback
        const currentComic = this.getCurrentComic();
        if (currentComic && !this.hasUserProvidedFeedback(currentComic.id)) {
            this.showFeedbackRequiredMessage();
            return;
        }

        // User has provided feedback, proceed to next comic
        await this.navigateNext();
    }

    // Check if user has provided feedback for a comic (requires 3+ reactions)
    hasUserProvidedFeedback(comicId) {
        // Check with the feedback system if 3+ feedback reactions have been submitted
        const feedbackSet = feedbackSystem.selectedFeedback && feedbackSystem.selectedFeedback.get(comicId);
        return feedbackSet && feedbackSet.size >= 3;
    }

    // Show message that feedback is required
    showFeedbackRequiredMessage() {
        // You could show a toast or highlight the feedback section
        // For now, let's scroll to feedback section and add a visual cue
        const feedbackSection = document.getElementById('feedbackSection');
        if (feedbackSection) {
            feedbackSection.scrollIntoView({ behavior: 'smooth' });
            feedbackSection.classList.add('feedback-required');
            
            // Remove the highlight after 3 seconds
            setTimeout(() => {
                feedbackSection.classList.remove('feedback-required');
            }, 3000);
        }
        
        console.log('Please select at least 3 reactions before proceeding to the next comic');
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
        // Store current comic for feedback system
        this.currentComic = comic;
        
        // Mark comic as seen
        this.markComicAsSeen(comic.id);
        
        // Render the comic
        comicRenderer.render(comic);
        
        // Show feedback section
        feedbackSystem.show(comic.id);
    }
    
    // Get current comic data (for feedback system)
    getCurrentComic() {
        return this.currentComic || null;
    }

    // Navigate to next comic
    async navigateNext() {
        // Remove the current comic since user is navigating away (it's been seen)
        const currentComicId = this.comicHistory[this.currentIndex]?.id;
        if (currentComicId && this.hasSeenComic(currentComicId)) {
            this.removeComicFromHistoryById(currentComicId);
        }
        
        // After removing current comic, check if we have more comics
        if (this.comicHistory.length > 0 && this.currentIndex < this.comicHistory.length) {
            // Display the next comic (which is now at the current index due to removal)
            const comic = this.comicHistory[this.currentIndex];
            this.displayComic(comic);
        } else {
            // No more comics in current batch, try to load more or generate new one
            await this.loadMoreUnseenComics();
        }
        
        this.updateNavigation();
    }

    // Update navigation buttons
    updateNavigation() {
        // Next button is always enabled (it either generates new comic or navigates)
        this.nextBtn.disabled = false;
        
        // Update button text based on state
        if (this.comicHistory.length === 0 || this.currentIndex === -1) {
            this.nextBtn.innerHTML = '✨ Generate Comic <span class="btn-icon">→</span>';
        } else {
            this.nextBtn.innerHTML = 'Next <span class="btn-icon">→</span>';
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
                console.log('No comic history found in local storage - loading recent comics for new user');
                await this.loadRecentComicsForNewUser();
                return;
            }
            
            const { history, currentIndex } = JSON.parse(stored);
            console.log(`Found ${history.length} comics in history`);
            
            if (history.length === 0) {
                console.log('Empty comic history - loading recent comics for new user');
                await this.loadRecentComicsForNewUser();
                return;
            }
            
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
            console.log(`Successfully loaded ${validComics.length} comics from localStorage`);
            
            // Filter out comics that have already been seen
            const unseenValidComics = this.filterUnseenComics(validComics);
            console.log(`Found ${unseenValidComics.length} unseen comics out of ${validComics.length} loaded comics`);
            
            if (unseenValidComics.length > 0) {
                this.comicHistory = unseenValidComics;
                this.currentIndex = 0; // Start with the first unseen comic
                
                // Display the first unseen comic
                this.displayComic(this.comicHistory[this.currentIndex]);
                this.updateNavigation();
                
                // Update localStorage to only contain unseen comics
                this.saveHistoryToStorage();
            } else {
                console.log('All loaded comics have been seen - falling back to recent comics');
                await this.loadRecentComicsForNewUser();
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            // Fallback to recent comics on any error
            await this.loadRecentComicsForNewUser();
        }
    }

    // Load recent comics for new users
    async loadRecentComicsForNewUser() {
        try {
            console.log('Fetching recent comics from server for new user...');
            // Fetch more comics than needed to account for filtering
            const recentComics = await comicAPI.getRecentComics(20);
            
            if (recentComics.length > 0) {
                console.log(`Fetched ${recentComics.length} recent comics from server`);
                
                // Filter out comics the user has already seen
                const unseenComics = this.filterUnseenComics(recentComics);
                console.log(`Found ${unseenComics.length} unseen comics out of ${recentComics.length} total`);
                
                if (unseenComics.length > 0) {
                    // Take up to 5 unseen comics
                    this.comicHistory = unseenComics.slice(0, 5);
                    this.currentIndex = 0; // Start with the most recent unseen comic
                    
                    console.log(`Loaded ${this.comicHistory.length} unseen comics for user`);
                    
                    // Display the first (most recent unseen) comic
                    this.displayComic(this.comicHistory[this.currentIndex]);
                    this.updateNavigation();
                    
                    // Save to localStorage for future sessions
                    this.saveHistoryToStorage();
                } else {
                    console.log('All recent comics have been seen by this user');
                    this.comicHistory = [];
                    this.currentIndex = -1;
                    this.updateNavigation();
                }
            } else {
                console.log('No recent comics available on server');
                this.comicHistory = [];
                this.currentIndex = -1;
                this.updateNavigation();
            }
        } catch (error) {
            console.error('Failed to load recent comics for new user:', error);
            this.comicHistory = [];
            this.currentIndex = -1;
            this.updateNavigation();
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

    // Seen comics tracking functions
    getSeenComics() {
        try {
            const seen = localStorage.getItem(CONFIG.STORAGE_KEYS.SEEN_COMICS);
            return seen ? JSON.parse(seen) : [];
        } catch (error) {
            console.error('Failed to get seen comics:', error);
            return [];
        }
    }

    markComicAsSeen(comicId) {
        try {
            const seenComics = this.getSeenComics();
            if (!seenComics.includes(comicId)) {
                seenComics.push(comicId);
                // Keep only the last 1000 seen comics to prevent localStorage bloat
                if (seenComics.length > 1000) {
                    seenComics.shift();
                }
                localStorage.setItem(CONFIG.STORAGE_KEYS.SEEN_COMICS, JSON.stringify(seenComics));
                console.log(`Marked comic ${comicId} as seen`);
            }
        } catch (error) {
            console.error('Failed to mark comic as seen:', error);
        }
    }

    hasSeenComic(comicId) {
        const seenComics = this.getSeenComics();
        return seenComics.includes(comicId);
    }

    filterUnseenComics(comics) {
        return comics.filter(comic => !this.hasSeenComic(comic.id));
    }

    // Remove a specific comic from history by ID
    removeComicFromHistoryById(comicId) {
        const index = this.comicHistory.findIndex(comic => comic.id === comicId);
        if (index !== -1) {
            console.log(`Removing read comic ${comicId} from history`);
            this.comicHistory.splice(index, 1);
            
            // Adjust currentIndex if necessary
            if (index <= this.currentIndex) {
                this.currentIndex = Math.max(0, this.currentIndex - 1);
            }
            
            // If no more comics, try to load more
            if (this.comicHistory.length === 0) {
                this.currentIndex = -1;
                this.loadMoreUnseenComics();
            }
            
            // Update storage
            this.saveHistoryToStorage();
        }
    }

    // Remove the current comic from history after it's been read
    removeCurrentComicFromHistory() {
        if (this.comicHistory.length > 0 && this.currentIndex >= 0) {
            const removedComic = this.comicHistory[this.currentIndex];
            this.removeComicFromHistoryById(removedComic.id);
            
            // If we still have comics and need to display one
            if (this.comicHistory.length > 0) {
                if (this.currentIndex >= this.comicHistory.length) {
                    this.currentIndex = this.comicHistory.length - 1;
                }
                if (this.currentIndex >= 0) {
                    this.displayComic(this.comicHistory[this.currentIndex]);
                }
            }
            
            this.updateNavigation();
        }
    }

    // Load more unseen comics when current ones are exhausted
    async loadMoreUnseenComics() {
        try {
            console.log('All current comics have been read, loading more unseen comics...');
            const recentComics = await comicAPI.getRecentComics(20);
            const unseenComics = this.filterUnseenComics(recentComics);
            
            if (unseenComics.length > 0) {
                console.log(`Found ${unseenComics.length} more unseen comics`);
                this.comicHistory = unseenComics.slice(0, 5);
                this.currentIndex = 0;
                this.displayComic(this.comicHistory[this.currentIndex]);
                this.updateNavigation();
                this.saveHistoryToStorage();
            } else {
                console.log('No more unseen comics available - user can generate new ones');
                this.showAllComicsReadMessage();
            }
        } catch (error) {
            console.error('Failed to load more unseen comics:', error);
            this.showAllComicsReadMessage();
        }
    }

    // Show message when all comics have been read
    showAllComicsReadMessage() {
        console.log('User has read all available comics - they can now generate new ones');
        this.comicHistory = [];
        this.currentIndex = -1;
        this.updateNavigation(); // This will change button to "Generate Comic"
        
        // Hide any existing comic and show welcome message
        const comicContainer = document.getElementById('comicContainer');
        if (comicContainer) {
            comicContainer.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">🎉</div>
                    <h2>All caught up!</h2>
                    <p>You've read all available comics.</p>
                    <p>Click "Generate Comic" to create a new one!</p>
                </div>
            `;
        }
        
        // Hide feedback section
        const feedbackSection = document.getElementById('feedbackSection');
        if (feedbackSection) {
            feedbackSection.style.display = 'none';
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
    window.app = new ComicApp();
});

// Export for module usage
export default ComicApp;

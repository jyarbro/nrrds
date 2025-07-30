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
        this.generateBtn = document.getElementById('generateBtn');
        this.controlsSection = document.getElementById('controlsSection');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorModal = document.getElementById('errorModal');
        this.errorMessage = document.getElementById('errorMessage');
    }

    // Initialize event listeners
    initializeEventListeners() {
        this.nextBtn.addEventListener('click', () => this.handleNextAction());
        this.generateBtn.addEventListener('click', () => this.handleGenerateAction());
        
        // Navigation tabs
        document.getElementById('homeTab').addEventListener('click', () => this.showHomePage());
        document.getElementById('pastComicsTab').addEventListener('click', () => this.showPastComicsPage());
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') {
                if (this.generateBtn.style.display !== 'none') {
                    this.handleGenerateAction();
                } else if (!this.nextBtn.disabled) {
                    this.handleNextAction();
                }
            }
        });
    }

    // Handle generate button action
    async handleGenerateAction() {
        await this.generateNewComic();
    }

    // Handle next button action - navigates to next comic
    async handleNextAction() {
        // If a comic is displayed, check if user has provided feedback
        const currentComic = this.getCurrentComic();
        if (currentComic && !this.hasUserProvidedFeedback(currentComic.id)) {
            this.showFeedbackRequiredMessage();
            return;
        }

        // User has provided feedback, proceed to next comic
        await this.navigateNext();
    }

    // Check if user has provided feedback for a comic (requires 1+ reactions)
    hasUserProvidedFeedback(comicId) {
        // Check with the feedback system if any feedback reactions have been submitted
        const feedbackSet = feedbackSystem.selectedFeedback && feedbackSystem.selectedFeedback.get(comicId);
        return feedbackSet && feedbackSet.size >= 1;
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
        
        console.log('Please select at least 1 reaction before proceeding to the next comic');
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
        // Check if this comic was already displayed in a previous session
        const lastViewedComic = localStorage.getItem('last_viewed_comic');
        if (lastViewedComic === comic.id) {
            // This comic was shown before, check if user has reacted to it
            if (this.hasUserProvidedFeedback(comic.id)) {
                console.log('Comic was already viewed and user has reacted, advancing to next...');
                this.advanceToNextComic();
                return;
            } else {
                console.log('Comic was already viewed but no reactions yet, showing same comic...');
                // Continue to show the same comic since user hasn't reacted
            }
        }
        
        // Store current comic for feedback system
        this.currentComic = comic;
        
        // Track that this comic is now being displayed
        localStorage.setItem('last_viewed_comic', comic.id);
        
        // Render the comic
        comicRenderer.render(comic);
        
        // Show feedback section
        feedbackSystem.show(comic.id);
    }
    
    // Get current comic data (for feedback system)
    getCurrentComic() {
        return this.currentComic || null;
    }

    // Advance to next comic automatically (for refresh behavior)
    async advanceToNextComic() {
        const currentComicId = this.comicHistory[this.currentIndex]?.id;
        
        // Only remove comic if user has provided reactions to it
        if (currentComicId && this.hasUserProvidedFeedback(currentComicId)) {
            console.log('User has reactions for this comic, marking as seen and removing from queue');
            this.markComicAsSeen(currentComicId);
            this.removeComicFromHistoryById(currentComicId);
        } else {
            console.log('No reactions found, just advancing to next comic in queue');
            // Just move to next comic without removing current one
            this.currentIndex++;
        }
        
        // Check if we have more comics
        if (this.comicHistory.length > 0 && this.currentIndex < this.comicHistory.length) {
            // Display the next comic
            const comic = this.comicHistory[this.currentIndex];
            // Recursive call, but this time it won't be marked as "already viewed"
            this.displayComic(comic);
        } else if (this.currentIndex >= this.comicHistory.length) {
            // We've gone past the end, wrap back to beginning or load more
            this.currentIndex = 0;
            if (this.comicHistory.length > 0) {
                const comic = this.comicHistory[this.currentIndex];
                this.displayComic(comic);
            } else {
                await this.loadMoreUnseenComics();
            }
        } else {
            // No more comics, try to load more
            await this.loadMoreUnseenComics();
        }
        
        this.updateNavigation();
    }

    // Navigate to next comic
    async navigateNext() {
        // Clear the last viewed comic since user is explicitly moving on
        localStorage.removeItem('last_viewed_comic');
        
        // Mark the current comic as seen since user provided feedback and is moving on
        const currentComicId = this.comicHistory[this.currentIndex]?.id;
        if (currentComicId && this.hasUserProvidedFeedback(currentComicId)) {
            this.markComicAsSeen(currentComicId);
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
        // Show/hide buttons based on state
        if (this.comicHistory.length === 0 || this.currentIndex === -1) {
            // No comics - show generate button in center, hide next button
            this.generateBtn.style.display = 'inline-flex';
            this.nextBtn.style.display = 'none';
            this.controlsSection.classList.add('hidden');
        } else {
            // Has comics - show next button in top right, hide generate button
            this.generateBtn.style.display = 'none';
            this.nextBtn.style.display = 'inline-flex';
            this.controlsSection.classList.remove('hidden');
            this.nextBtn.disabled = false;
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
        // Comics are "unseen" if they either:
        // 1. Haven't been marked as seen in storage, OR
        // 2. Were seen but have no user feedback (reactions)
        return comics.filter(comic => {
            const wasMarkedSeen = this.hasSeenComic(comic.id);
            
            // If comic was never marked as seen, always show it
            if (!wasMarkedSeen) {
                return true;
            }
            
            // If comic was marked as seen, only show it if it has no feedback
            const hasFeedback = this.hasUserProvidedFeedback(comic.id);
            return !hasFeedback;
        });
    }

    // Page navigation methods
    showHomePage() {
        document.getElementById('homePage').classList.add('active');
        document.getElementById('pastComicsPage').classList.remove('active');
        document.getElementById('homeTab').classList.add('active');
        document.getElementById('pastComicsTab').classList.remove('active');
    }

    async showPastComicsPage() {
        document.getElementById('homePage').classList.remove('active');
        document.getElementById('pastComicsPage').classList.add('active');
        document.getElementById('homeTab').classList.remove('active');
        document.getElementById('pastComicsTab').classList.add('active');
        
        // Load past comics
        await this.loadPastComics();
    }

    // Get all seen comics with their reactions
    async loadPastComics() {
        try {
            const container = document.getElementById('pastComicsContainer');
            container.innerHTML = '<div class="loading-message">Loading your past comics...</div>';
            
            // Get seen comic IDs
            const seenComicIds = this.getSeenComics();
            
            if (seenComicIds.length === 0) {
                container.innerHTML = `
                    <div class="no-past-comics">
                        <div class="no-comics-icon">📚</div>
                        <h3>No past comics yet</h3>
                        <p>Comics you've read will appear here with your reactions</p>
                        <button class="control-btn" onclick="app.showHomePage()">Go read some comics!</button>
                    </div>
                `;
                return;
            }

            // Load comic data for seen comics that have reactions
            const comicsData = [];
            for (const comicId of seenComicIds.reverse()) { // Show most recent first
                try {
                    const reactions = feedbackSystem.selectedFeedback.get(comicId) || new Set();
                    
                    // Only show comics that have user reactions
                    if (reactions.size > 0) {
                        const comic = await comicAPI.getComic(comicId);
                        comicsData.push({
                            comic,
                            reactions: Array.from(reactions)
                        });
                    }
                } catch (error) {
                    console.log(`Could not load comic ${comicId}:`, error);
                    // Comic might have expired from Redis, skip it
                }
            }

            if (comicsData.length === 0) {
                container.innerHTML = `
                    <div class="no-past-comics">
                        <div class="no-comics-icon">⏰</div>
                        <h3>Past comics have expired</h3>
                        <p>Comics expire after 30 days. Your older comics are no longer available.</p>
                        <button class="control-btn" onclick="app.showHomePage()">Read new comics!</button>
                    </div>
                `;
                return;
            }

            // Render past comics
            this.renderPastComics(comicsData);

        } catch (error) {
            console.error('Failed to load past comics:', error);
            const container = document.getElementById('pastComicsContainer');
            container.innerHTML = `
                <div class="error-message">
                    <h3>Error loading past comics</h3>
                    <p>There was a problem loading your past comics. Please try again.</p>
                    <button class="control-btn" onclick="app.loadPastComics()">Retry</button>
                </div>
            `;
        }
    }

    // Render past comics list
    renderPastComics(comicsData) {
        const container = document.getElementById('pastComicsContainer');
        
        const html = comicsData.map(({ comic, reactions }) => {
            const reactionsHtml = reactions.map(reactionType => {
                const config = CONFIG.FEEDBACK_TYPES[reactionType];
                return `
                    <span class="past-reaction" title="You ${config?.phrase || reactionType}">
                        ${config?.emoji || '❓'}
                    </span>
                `;
            }).join('');

            return `
                <div class="past-comic-item">
                    <div class="past-comic-content">
                        <div class="past-comic-render" data-comic='${JSON.stringify(comic).replace(/'/g, '&apos;')}'></div>
                    </div>
                    <div class="past-comic-meta">
                        <h4 class="past-comic-title">${comic.title}</h4>
                        <p class="past-comic-date">${new Date(comic.timestamp).toLocaleDateString()}</p>
                        <div class="past-comic-reactions">
                            <span class="reactions-label">Your reactions:</span>
                            ${reactionsHtml || '<span class="no-reactions">No reactions recorded</span>'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

        // Render each comic using the comic renderer
        document.querySelectorAll('.past-comic-render').forEach(element => {
            const comicData = JSON.parse(element.getAttribute('data-comic'));
            // Create a mini version of the comic
            this.renderMiniComic(element, comicData);
        });
    }

    // Render a smaller version of the comic for past comics view
    renderMiniComic(container, comic) {
        // Use similar logic to comic-renderer but smaller
        const panelsHtml = comic.panels.map((panel, index) => {
            // Create individual dialogue bubbles like main comic
            const dialogueBubbles = panel.dialogue.map(line => {
                let text, type, style;
                if (typeof line === 'string') {
                    text = line;
                    type = 'speech';
                } else if (typeof line === 'object') {
                    text = line.text || '';
                    type = line.type || 'speech';
                    style = line.style || null;
                }
                
                let bubbleClass = 'mini-dialogue';
                switch (type) {
                    case 'thought':
                        bubbleClass = 'mini-thought-bubble';
                        break;
                    case 'narration':
                        bubbleClass = 'mini-narration-box';
                        break;
                    default:
                        bubbleClass = 'mini-speech-bubble';
                }
                
                if (style) {
                    bubbleClass += ` bubble-${style}`;
                }
                
                return `<div class="${bubbleClass}">${text}</div>`;
            }).join('');
            
            return `
                <div class="mini-panel" style="background: ${panel.background}">
                    <div class="mini-panel-header">${panel.header}</div>
                    <div class="mini-character">
                        <div class="mini-character-emoji">${panel.character.emoji}</div>
                    </div>
                    <div class="mini-dialogue-container">
                        ${dialogueBubbles}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="mini-comic">
                <div class="mini-panels panels-${comic.panels.length}">
                    ${panelsHtml}
                </div>
            </div>
        `;
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
        this.updateNavigation(); // This will show generate button in center
        
        // Hide any existing comic and show welcome message
        const comicContainer = document.getElementById('comicContainer');
        if (comicContainer) {
            comicContainer.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">🎉</div>
                    <h2>All caught up!</h2>
                    <p>You've read all available comics.</p>
                    <p>Click "Generate Comic" to create a new one!</p>
                    <button class="control-btn primary-btn" id="generateBtn">
                        ✨ Generate Comic
                    </button>
                </div>
            `;
            // Re-bind the event listener for the new button
            document.getElementById('generateBtn').addEventListener('click', () => this.handleGenerateAction());
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

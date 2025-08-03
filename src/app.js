import comicAPI from './api.js';
import { comicRenderer } from './comic-renderer.js';
import { reactionsSystem } from './reactions.js';
import { CONFIG } from './config.js';
import { urlRouter } from './url-router.js';

/**
 * Main application controller for nrrds comic app.
 * Handles comic navigation, generation, rendering, and feedback integration.
 * @class ComicApp
 */
class ComicApp {
    /**
     * Initializes the ComicApp instance and loads comics.
     */
    constructor() {
        this.currentIndex = 0;
        this.isLoading = false;
        this.comics = [];
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeFromURL();
    }

    /**
     * Initializes DOM elements for navigation and UI controls.
     */
    initializeElements() {
        this.nextBtn = document.getElementById('nextBtn');
        this.previousBtn = document.getElementById('previousBtn');
        this.generateBtn = document.getElementById('generateBtn');
        this.navGenerateBtn = document.getElementById('navGenerateBtn');
        this.controlsSection = document.getElementById('controlsSection');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorModal = document.getElementById('errorModal');
        this.errorMessage = document.getElementById('errorMessage');
        this.migrationBtn = document.getElementById('migrationBtn');
        
        // Show migration button only if debug=1 in URL
        this.checkDebugMode();
    }

    /**
     * Sets up event listeners for navigation and keyboard shortcuts.
     */
    initializeEventListeners() {
        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', () => this.handleNextAction());
        }
        if (this.previousBtn) {
            this.previousBtn.addEventListener('click', () => this.handlePrevAction());
        }
        if (this.generateBtn) {
            this.generateBtn.addEventListener('click', () => this.handleGenerateAction());
        }
        if (this.navGenerateBtn) {
            this.navGenerateBtn.addEventListener('click', () => this.handleGenerateAction());
        }
        if (this.migrationBtn) {
            this.migrationBtn.addEventListener('click', () => this.handleMigrationAction());
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') {
                if (this.generateBtn && this.generateBtn.style.display !== 'none') {
                    this.handleGenerateAction();
                } else if (this.nextBtn && !this.nextBtn.disabled) {
                    this.handleNextAction();
                }
            } else if (e.key === 'ArrowLeft') {
                if (this.previousBtn && !this.previousBtn.disabled) {
                    this.handlePrevAction();
                }
            }
        });
    }

    /**
     * Handles the generate button action.
     * @returns {Promise<void>}
     */
    async handleGenerateAction() {
        await this.generateNewComic();
    }

    /**
     * Handles the next button action.
     * @returns {Promise<void>}
     */
    async handleNextAction() {
        if (this.currentIndex < this.comics.length - 1) {
            this.currentIndex++;
            this.displayComic(this.comics[this.currentIndex]);
            this.updateNavigation();
        } else {
            await this.loadComics(true);
        }
    }

    /**
     * Handles the previous button action.
     */
    handlePrevAction() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.displayComic(this.comics[this.currentIndex]);
            this.updateNavigation();
        }
    }


    /**
     * Generates a new comic and updates the UI.
     * @returns {Promise<void>}
     */
    async generateNewComic() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            const preferences = reactionsSystem.getUserPreferences();
            const startTime = Date.now();
            const comic = await comicAPI.generateComic(preferences);
            const elapsed = Date.now() - startTime;
            
            // Ensure minimum loading time for better UX
            if (elapsed < CONFIG.UI.LOADING_DELAY) {
                const remainingDelay = CONFIG.UI.LOADING_DELAY - elapsed;
                await new Promise(resolve => setTimeout(resolve, remainingDelay));
            }
            
            this.comics.unshift(comic);
            this.currentIndex = 0;
            this.displayComic(comic);
            this.updateNavigation();
            this.hideLoading();
            
        } catch (error) {
            console.error('Failed to generate comic:', error);
            this.hideLoading();
            this.showError(error.message || CONFIG.ERRORS.GENERATION_FAILED);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Displays a comic and shows feedback section.
     * @param {Object} comic - Comic object to display.
     * @param {boolean} updateURL - Whether to update the URL (default: true).
     */
    displayComic(comic, updateURL = true) {
        this.currentComic = comic;
        comicRenderer.render(comic);
        reactionsSystem.show(comic.id);
        
        if (updateURL) {
            urlRouter.updateURL(comic);
        }
    }

    /**
     * Gets the current comic data for feedback system.
     * @returns {Object|null}
     */
    getCurrentComic() {
        return this.currentComic || null;
    }

    /**
     * Loads comics from API and updates navigation.
     * @param {boolean} displayFirst - Whether to display the first comic (default: true).
     * @returns {Promise<void>}
     */
    async loadComics(displayFirst = true) {
        try {
            const recentComics = await comicAPI.getRecentComics(20);
            this.comics = recentComics;
            this.currentIndex = 0;
            if (displayFirst && this.comics.length > 0) {
                this.displayComic(this.comics[this.currentIndex]);
            }
            this.updateNavigation();
        } catch (error) {
            console.error('Failed to load comics:', error);
            this.comics = [];
            this.currentIndex = -1;
            this.updateNavigation();
        }
    }

    /**
     * Updates navigation buttons based on current state.
     */
    updateNavigation() {
        if (this.comics.length === 0 || this.currentIndex === -1) {
            if (this.generateBtn) {
                this.generateBtn.style.display = 'inline-flex';
            }
            if (this.navGenerateBtn) {
                this.navGenerateBtn.style.display = 'none';
            }
            if (this.nextBtn) {
                this.nextBtn.disabled = true;
            }
            if (this.previousBtn) {
                this.previousBtn.disabled = true;
            }
        } else {
            if (this.generateBtn) {
                this.generateBtn.style.display = 'none';
            }
            if (this.navGenerateBtn) {
                this.navGenerateBtn.style.display = 'inline-flex';
            }
            
            // Update previous button
            if (this.previousBtn) {
                this.previousBtn.disabled = this.currentIndex <= 0;
            }
            
            // Update next button
            if (this.nextBtn) {
                this.nextBtn.disabled = this.currentIndex >= this.comics.length - 1;
            }
        }
    }

    /**
     * Shows the loading overlay.
     */
    showLoading() {
        this.loadingOverlay.classList.add('active');
        comicRenderer.showLoading();
    }

    /**
     * Hides the loading overlay.
     */
    hideLoading() {
        this.loadingOverlay.classList.remove('active');
    }

    /**
     * Shows the error modal with a message.
     * @param {string} message - Error message to display.
     */
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorModal.classList.add('active');
    }

    /**
     * Closes the error modal.
     */
    closeError() {
        this.errorModal.classList.remove('active');
    }

    /**
     * Initialize app based on current URL.
     */
    async initializeFromURL() {
        console.log('🔄 [URL DEBUG] Initializing from URL:', window.location.href);
        console.log('🔄 [URL DEBUG] Raw hash:', window.location.hash);
        const urlInfo = urlRouter.parseCurrentURL();
        console.log('🔄 [URL DEBUG] Parsed URL info:', JSON.stringify(urlInfo, null, 2));
        
        if (urlInfo) {
            // Try to load specific comic from URL
            console.log('🔄 [URL DEBUG] URL has comic info, loading comics without displaying first');
            await this.loadComics(false);  // Don't display first comic automatically
            console.log('🔄 [URL DEBUG] Comics loaded, now searching...');
            this.debugDumpComics();
            await this.navigateToComicByURL(urlInfo);
        } else {
            // No specific comic in URL, load normally
            console.log('🔄 [URL DEBUG] No comic in URL, loading normally');
            await this.loadComics(true);  // Display first comic as normal
        }
    }

    /**
     * Navigate to a comic based on URL information.
     * @param {Object} urlInfo - Parsed URL information.
     */
    async navigateToComicByURL(urlInfo) {
        if (!urlInfo) return;
        
        console.log('🎯 [URL DEBUG] Navigating to comic by URL:', urlInfo);
        console.log('🎯 [URL DEBUG] URL Info Details:', {
            dateStr: urlInfo.dateStr,
            titleSlug: urlInfo.titleSlug,
            date: urlInfo.date
        });
        
        // NEW: Fast lookup using comic ID as slug
        let comic = null;
        
        if (urlInfo.isComicId && urlInfo.comicId) {
            console.log('🎯 [URL DEBUG] Attempting fast lookup with comic ID:', urlInfo.comicId);
            comic = await this.getComicByURLSlug(urlInfo.comicId);
            
            if (comic) {
                console.log('🎯 [URL DEBUG] ✅ Found comic via fast ID lookup!', comic.id);
            } else {
                console.log('🎯 [URL DEBUG] ❌ Fast ID lookup failed, trying API directly');
                // Try API directly
                try {
                    const response = await comicAPI.getComicById(urlInfo.comicId);
                    if (response) {
                        comic = response;
                        // Add to our comics array if not already there
                        if (!this.comics.find(c => c.id === comic.id)) {
                            this.comics.unshift(comic);
                        }
                        console.log('🎯 [URL DEBUG] ✅ Found comic via direct API lookup!', comic.id);
                    }
                } catch (error) {
                    console.log('🎯 [URL DEBUG] ❌ Direct API lookup also failed:', error.message);
                }
            }
        } else {
            console.log('🎯 [URL DEBUG] ❌ URL info is not a comic ID, falling back to search methods');
            
            // Fallback to old method: search in loaded comics
            comic = this.findComicByDate(urlInfo.date);
            console.log('🎯 [URL DEBUG] Found comic in loaded comics by date:', comic ? comic.id : 'none');
            
            // Also try to find by title if we have one
            if (!comic && urlInfo.titleSlug) {
                comic = this.findComicByTitle(urlInfo.titleSlug);
                console.log('🎯 [URL DEBUG] Found comic by title:', comic ? comic.id : 'none');
            }
        }
        
        if (!comic) {
            // Since we don't have getComicByDate endpoint yet, try to load more comics
            // and search through them
            console.log('🎯 [URL DEBUG] Comic not found in current set, trying to load more');
            console.log('🎯 [URL DEBUG] Currently loaded comics:', this.comics.map(c => `"${c.title}" (${c.id})`));
            try {
                // Try to get user history first (more comics)
                const userComics = await comicAPI.getUserHistory(100);
                console.log('🎯 [URL DEBUG] Loaded user history:', userComics.length, 'comics');
                console.log('🎯 [URL DEBUG] User history titles:', userComics.map(c => `"${c.title}" (${c.id})`));
                
                // Add to comics if not already there
                userComics.forEach(userComic => {
                    if (!this.comics.find(c => c.id === userComic.id)) {
                        this.comics.push(userComic);
                    }
                });
                
                // Try to find the comic again
                comic = this.findComicByDate(urlInfo.date);
                console.log('🎯 [URL DEBUG] Found comic after loading history by date:', comic ? comic.id : 'none');
                
                // Try by title if date search failed
                if (!comic && urlInfo.titleSlug) {
                    comic = this.findComicByTitle(urlInfo.titleSlug);
                    console.log('🎯 [URL DEBUG] Found comic after loading history by title:', comic ? comic.id : 'none');
                }
                
                // If still not found, try popular comics
                if (!comic) {
                    const popularComics = await comicAPI.getPopularComics(100);
                    console.log('🎯 [URL DEBUG] Loaded popular comics:', popularComics.length, 'comics');
                    console.log('🎯 [URL DEBUG] Popular comics titles:', popularComics.map(c => `"${c.title}" (${c.id})`));
                    
                    popularComics.forEach(popComic => {
                        if (!this.comics.find(c => c.id === popComic.id)) {
                            this.comics.push(popComic);
                        }
                    });
                    
                    comic = this.findComicByDate(urlInfo.date);
                    console.log('🎯 [URL DEBUG] Found comic after loading popular by date:', comic ? comic.id : 'none');
                    
                    // Try by title again with expanded comic set
                    if (!comic && urlInfo.titleSlug) {
                        comic = this.findComicByTitle(urlInfo.titleSlug);
                        console.log('🎯 [URL DEBUG] Found comic after loading popular by title:', comic ? comic.id : 'none');
                    }
                }
            } catch (error) {
                console.warn('🎯 [URL DEBUG] Error loading additional comics:', error);
            }
        }
        
        if (comic) {
            console.log('🎯 [URL DEBUG] SUCCESS! Displaying comic:', comic.id, `"${comic.title}"`);
            this.currentIndex = this.comics.findIndex(c => c.id === comic.id);
            this.displayComic(comic, false); // Don't update URL since we're responding to URL
            this.updateNavigation();
        } else {
            console.warn('🎯 [URL DEBUG] FAILED to find comic for:', {
                titleSlug: urlInfo.titleSlug,
                dateStr: urlInfo.dateStr,
                searchTitle: urlInfo.titleSlug ? urlInfo.titleSlug.replace(/-/g, ' ') : 'none'
            });
            console.log('🎯 [URL DEBUG] Final comic set before fallback:');
            this.debugDumpComics();
            
            // Fall back to latest comic and update URL to reflect actual comic being shown
            if (this.comics.length > 0) {
                console.log('🎯 [URL DEBUG] Falling back to latest comic:', this.comics[0].title);
                this.currentIndex = 0;
                this.displayComic(this.comics[0], true); // Update URL to match displayed comic
                this.updateNavigation();
            }
        }
    }

    /**
     * Navigate to a comic based on history state.
     * @param {Object} state - History state object.
     */
    async navigateToComicByState(state) {
        if (!state || !state.comicId) return;
        
        // Try to find in loaded comics
        let comic = this.comics.find(c => c.id === state.comicId);
        
        if (!comic) {
            // Try to load from API
            try {
                comic = await comicAPI.getComicById(state.comicId);
                if (comic) {
                    this.comics.unshift(comic);
                }
            } catch (error) {
                console.warn('Could not find comic with ID:', state.comicId);
                return;
            }
        }
        
        if (comic) {
            this.currentIndex = this.comics.findIndex(c => c.id === comic.id);
            this.displayComic(comic, false); // Don't update URL since we're responding to popstate
            this.updateNavigation();
        }
    }

    /**
     * Find a comic by its creation date.
     * @param {Date} targetDate - Date to search for.
     * @returns {Object|null} Found comic or null.
     */
    findComicByDate(targetDate) {
        if (!targetDate) return null;
        
        const targetDateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
        console.log('🔍 [COMIC SEARCH] Looking for comic with date:', targetDateStr);
        console.log('🔍 [COMIC SEARCH] Available comics:', this.comics.length);
        
        // First try exact date match
        let found = this.comics.find(comic => {
            if (!comic.createdAt && !comic.timestamp) {
                console.log('🔍 [COMIC SEARCH] Comic has no date:', comic.id);
                return false;
            }
            
            const comicDate = new Date(comic.createdAt || comic.timestamp);
            const comicDateStr = comicDate.toISOString().split('T')[0];
            console.log(`🔍 [COMIC SEARCH] Comic ${comic.id}: ${comicDateStr} vs ${targetDateStr}`);
            return comicDateStr === targetDateStr;
        });
        
        // If no exact match, try to find closest date (within 24 hours)
        if (!found) {
            console.log('🔍 [COMIC SEARCH] No exact match, trying closest date match');
            const targetTime = targetDate.getTime();
            let closestComic = null;
            let closestDiff = Infinity;
            
            this.comics.forEach(comic => {
                if (comic.createdAt || comic.timestamp) {
                    const comicDate = new Date(comic.createdAt || comic.timestamp);
                    const timeDiff = Math.abs(comicDate.getTime() - targetTime);
                    console.log(`🔍 [COMIC SEARCH] Comic ${comic.id} time diff: ${timeDiff}ms (${timeDiff / (1000 * 60 * 60)} hours)`);
                    
                    // Only consider comics within 24 hours
                    if (timeDiff < 24 * 60 * 60 * 1000 && timeDiff < closestDiff) {
                        closestDiff = timeDiff;
                        closestComic = comic;
                    }
                }
            });
            
            found = closestComic;
            if (found) {
                console.log(`🔍 [COMIC SEARCH] Found closest match: ${found.id} (diff: ${closestDiff}ms)`);
            }
        }
        
        console.log('🔍 [COMIC SEARCH] Final result:', found ? found.id : 'none');
        return found;
    }

    /**
     * Find a comic by its title slug.
     * @param {string} titleSlug - Title slug to search for.
     * @returns {Object|null} Found comic or null.
     */
    findComicByTitle(titleSlug) {
        if (!titleSlug) return null;
        
        console.log('🎯 [TITLE SEARCH] Looking for comic with title slug:', titleSlug);
        console.log('🎯 [TITLE SEARCH] Available comics:', this.comics.length);
        
        // Log all available comic titles for debugging
        this.comics.forEach((comic, index) => {
            const date = comic.createdAt || comic.timestamp;
            const dateStr = date ? new Date(date).toISOString().split('T')[0] : 'no-date';
            console.log(`🎯 [TITLE SEARCH] Comic ${index}: "${comic.title || 'no-title'}" (${comic.id}) - ${dateStr}`);
        });
        
        // Convert title slug to match comic titles
        const searchTitle = titleSlug
            .replace(/-/g, ' ')
            .toLowerCase()
            .trim();
        
        console.log('🎯 [TITLE SEARCH] Converted search title:', searchTitle);
        
        const found = this.comics.find(comic => {
            if (!comic.title) {
                console.log('🎯 [TITLE SEARCH] Comic has no title:', comic.id);
                return false;
            }
            
            const comicTitle = comic.title.toLowerCase().trim();
            console.log(`🎯 [TITLE SEARCH] Comic ${comic.id}: "${comicTitle}" vs "${searchTitle}"`);
            
            // Try exact match first
            if (comicTitle === searchTitle) {
                return true;
            }
            
            // Try partial match (contains)
            if (comicTitle.includes(searchTitle) || searchTitle.includes(comicTitle)) {
                return true;
            }
            
            // Try matching individual words (more flexible)
            const searchWords = searchTitle.split(' ').filter(word => word.length > 2); // Ignore short words
            const comicWords = comicTitle.split(' ').filter(word => word.length > 2);
            
            // Count matches
            let matchCount = 0;
            searchWords.forEach(searchWord => {
                comicWords.forEach(comicWord => {
                    if (searchWord.includes(comicWord) || comicWord.includes(searchWord)) {
                        matchCount++;
                    }
                });
            });
            
            console.log(`🎯 [TITLE SEARCH] Word matching for "${comicTitle}": ${matchCount}/${searchWords.length} (need ${Math.ceil(searchWords.length * 0.6)})`);
            
            return matchCount >= Math.ceil(searchWords.length * 0.6);
        });
        
        console.log('🎯 [TITLE SEARCH] Found comic:', found ? `${found.id} - "${found.title}"` : 'none');
        return found;
    }

    /**
     * Get comic by URL slug using fast API lookup
     * @param {string} slug - URL slug to look up
     * @returns {Object|null} Comic object or null
     */
    async getComicByURLSlug(slug) {
        if (!slug) return null;
        
        try {
            console.log('🚀 [FAST LOOKUP] Querying API for slug:', slug);
            const response = await comicAPI.fetchAPI(`get-comic-by-url?slug=${encodeURIComponent(slug)}`);
            
            if (response.success && response.comic) {
                console.log('🚀 [FAST LOOKUP] ✅ Found comic:', response.comic.id, `"${response.comic.title}"`);
                
                // Add to our comics array if not already there
                if (!this.comics.find(c => c.id === response.comic.id)) {
                    this.comics.unshift(response.comic);
                    console.log('🚀 [FAST LOOKUP] Added comic to local collection');
                }
                
                return response.comic;
            } else {
                console.log('🚀 [FAST LOOKUP] ❌ Comic not found for slug:', slug);
                return null;
            }
        } catch (error) {
            console.log('🚀 [FAST LOOKUP] ❌ API error:', error.message);
            return null;
        }
    }

    /**
     * Check if debug mode is enabled via URL parameter
     * @returns {boolean} True if debug=1 in URL parameters
     */
    isDebugMode() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('debug') === '1';
    }

    /**
     * Debug function to dump all loaded comics
     */
    debugDumpComics() {
        console.log('📋 [COMIC DUMP] Total comics loaded:', this.comics.length);
        this.comics.forEach((comic, index) => {
            const date = comic.createdAt || comic.timestamp;
            const dateStr = date ? new Date(date).toISOString().split('T')[0] : 'no-date';
            const timeStr = date ? new Date(date).toISOString() : 'no-time';
            console.log(`📋 [COMIC DUMP] ${index}: "${comic.title || 'no-title'}" (${comic.id}) - ${dateStr} (${timeStr})`);
        });
        
        // Only show debug panel if debug mode is enabled
        if (this.isDebugMode()) {
            this.showDebugInfo();
        }
    }
    
    /**
     * Show debug info on the page
     */
    showDebugInfo() {
        let debugDiv = document.getElementById('debug-info');
        if (!debugDiv) {
            debugDiv = document.createElement('div');
            debugDiv.id = 'debug-info';
            debugDiv.style.cssText = `
                position: fixed; 
                top: 10px; 
                right: 10px; 
                background: rgba(0,0,0,0.9); 
                color: white; 
                padding: 12px; 
                font-family: monospace;
                font-size: 9px; 
                width: 280px; 
                z-index: 9999;
                border: 2px solid #444;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                overflow: hidden;
            `;
            
            // Add close button
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText = `
                position: absolute;
                top: 5px;
                right: 8px;
                background: none;
                border: none;
                color: white;
                font-size: 16px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
            `;
            closeBtn.onclick = () => debugDiv.remove();
            debugDiv.appendChild(closeBtn);
            
            document.body.appendChild(debugDiv);
        }
        
        const urlInfo = urlRouter.parseCurrentURL();
        const currentComic = this.currentComic;
        
        let html = `<div style="margin-top: 15px;"><strong>🔍 DEBUG</strong><br>`;
        
        html += `<strong>URL:</strong> ${window.location.hash || '(none)'}<br>`;
        
        if (urlInfo) {
            if (urlInfo.isComicId) {
                html += `<strong>Comic ID:</strong> ${urlInfo.comicId}<br>`;
                html += `<strong>Type:</strong> ID-based lookup<br>`;
            } else {
                html += `<strong>Search:</strong> "${urlInfo.titleSlug ? urlInfo.titleSlug.replace(/-/g, ' ') : 'none'}"<br>`;
                html += `<strong>Date:</strong> ${urlInfo.dateStr || 'none'}<br>`;
            }
        }
        
        if (currentComic) {
            const currentDate = currentComic.createdAt || currentComic.timestamp;
            const currentDateStr = currentDate ? new Date(currentDate).toISOString().split('T')[0] : 'no-date';
            html += `<strong>Found:</strong> "${currentComic.title || 'no-title'}"<br>`;
            html += `<strong>Comic Date:</strong> ${currentDateStr}<br>`;
            html += `<strong>Index:</strong> ${this.currentIndex}/${this.comics.length - 1}<br>`;
        }
        
        html += `<strong>Total Comics:</strong> ${this.comics.length}<br>`;
        
        // Show only a few key comics around the current one
        if (this.comics.length > 0) {
            html += `<strong>Recent:</strong><br>`;
            const startIdx = Math.max(0, this.currentIndex - 2);
            const endIdx = Math.min(this.comics.length - 1, this.currentIndex + 2);
            for (let i = startIdx; i <= endIdx; i++) {
                const comic = this.comics[i];
                const date = comic.createdAt || comic.timestamp;
                const dateStr = date ? new Date(date).toISOString().split('T')[0] : 'no-date';
                const isCurrent = this.currentIndex === i ? '→ ' : '  ';
                const title = comic.title || 'no-title';
                const shortTitle = title.length > 20 ? title.substring(0, 17) + '...' : title;
                html += `${isCurrent}"${shortTitle}" ${dateStr}<br>`;
            }
        }
        
        html += `</div>`;
        
        debugDiv.innerHTML = html;
    }

    /**
     * Check if debug mode is enabled and show migration button if so
     */
    checkDebugMode() {
        const urlParams = new URLSearchParams(window.location.search);
        const debug = urlParams.get('debug');
        
        if (debug === '1' && this.migrationBtn) {
            this.migrationBtn.style.display = 'block';
        }
    }

    /**
     * Handle migration button click
     */
    async handleMigrationAction() {
        if (this.isLoading) {
            return;
        }

        // Confirm migration
        if (!confirm('This will migrate all recent comics to ensure consistent character colors. Continue?')) {
            return;
        }

        this.isLoading = true;
        this.migrationBtn.textContent = '🔄 Migrating...';
        this.migrationBtn.disabled = true;

        try {
            const response = await fetch('/api/migrate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();

            if (result.success) {
                alert(`Migration completed!\n\nTotal comics: ${result.totalComics}\nMigrated: ${result.migrated}\nErrors: ${result.errors || 0}`);
                
                // Refresh current comic if we have one loaded
                if (this.comics.length > 0) {
                    await this.loadComicFromURL();
                }
            } else {
                throw new Error(result.error || 'Migration failed');
            }
        } catch (error) {
            console.error('Migration error:', error);
            alert(`Migration failed: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.migrationBtn.textContent = '🔧 Migrate';
            this.migrationBtn.disabled = false;
        }
    }
}

/**
 * Initializes the ComicApp when DOM is ready.
 */
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ComicApp();
});

export default ComicApp;

import comicAPI from './api.js';
import { comicRenderer } from './comic-renderer.js';
import { feedbackSystem } from './feedback.js';
import { CONFIG } from './config.js';
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
        this.loadComics();
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
            await this.loadComics();
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
        
        const isDev = window.location.hostname === 'localhost';
        const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        if (isDev) {
            console.log('🎬 [APP] Starting comic generation process:', {
                generationId,
                timestamp: new Date().toISOString(),
                currentComicsCount: this.comics.length
            });
        }
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            if (isDev) {
                console.log('🔍 [APP] Getting user preferences from feedback system...');
            }
            const preferences = feedbackSystem.getUserPreferences();
            
            if (isDev) {
                console.log('📋 [APP] User preferences retrieved:', {
                    generationId,
                    hasPreferences: Object.keys(preferences).length > 0,
                    preferenceKeys: Object.keys(preferences),
                    tokenWeightsCount: Object.keys(preferences.tokenWeights || {}).length,
                    conceptWeightsCount: Object.keys(preferences.conceptWeights || {}).length
                });
            }
            
            const startTime = Date.now();
            if (isDev) {
                console.log('🚀 [APP] Calling API to generate comic...');
            }
            
            const comic = await comicAPI.generateComic(preferences);
            const elapsed = Date.now() - startTime;
            
            if (isDev) {
                console.log('✅ [APP] Comic generation completed!', {
                    generationId,
                    duration: `${elapsed}ms`,
                    comicId: comic.id,
                    title: comic.title,
                    emoji: comic.emoji,
                    panelCount: comic.panels?.length || 0
                });
            }
            
            // Ensure minimum loading time for better UX
            if (elapsed < CONFIG.UI.LOADING_DELAY) {
                const remainingDelay = CONFIG.UI.LOADING_DELAY - elapsed;
                if (isDev) {
                    console.log('⏱️ [APP] Adding UI delay:', `${remainingDelay}ms`);
                }
                await new Promise(resolve => setTimeout(resolve, remainingDelay));
            }
            
            this.comics.unshift(comic);
            this.currentIndex = 0;
            
            if (isDev) {
                console.log('🎨 [APP] Displaying new comic and updating UI...');
            }
            
            this.displayComic(comic);
            this.updateNavigation();
            this.hideLoading();
            
            if (isDev) {
                console.log('🎉 [APP] Comic generation process completed successfully!', {
                    generationId,
                    totalComicsNow: this.comics.length,
                    displayedComicId: comic.id
                });
            }
            
        } catch (error) {
            const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            if (isDev) {
                console.error('💥 [APP] Comic generation failed:', {
                    generationId,
                    errorId,
                    error: error.message,
                    stack: error.stack?.slice(0, 500),
                    timestamp: new Date().toISOString()
                });
            } else {
                console.error('Failed to generate comic:', error);
            }
            
            this.hideLoading();
            this.showError(error.message || CONFIG.ERRORS.GENERATION_FAILED);
        } finally {
            this.isLoading = false;
            if (isDev) {
                console.log('🏁 [APP] Generation process finished (finally block)');
            }
        }
    }

    /**
     * Displays a comic and shows feedback section.
     * @param {Object} comic - Comic object to display.
     */
    displayComic(comic) {
        this.currentComic = comic;
        comicRenderer.render(comic);
        feedbackSystem.show(comic.id);
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
     * @returns {Promise<void>}
     */
    async loadComics() {
        try {
            const recentComics = await comicAPI.getRecentComics(20);
            this.comics = recentComics;
            this.currentIndex = 0;
            if (this.comics.length > 0) {
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
}

/**
 * Initializes the ComicApp when DOM is ready.
 */
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ComicApp();
});

export default ComicApp;

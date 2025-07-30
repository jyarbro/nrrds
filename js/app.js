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
        this.isLoading = true;
        this.showLoading();
        try {
            const preferences = feedbackSystem.getUserPreferences();
            const startTime = Date.now();
            const comic = await comicAPI.generateComic(preferences);
            const elapsed = Date.now() - startTime;
            if (elapsed < CONFIG.UI.LOADING_DELAY) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.UI.LOADING_DELAY - elapsed));
            }
            this.comics.unshift(comic);
            this.currentIndex = 0;
            this.displayComic(comic);
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

/**
 * URL Router for SEO-friendly comic URLs
 * Handles URL generation, parsing, and navigation state
 */
export default class URLRouter {
    constructor() {
        this.baseUrl = window.location.origin + window.location.pathname;
        this.setupPopstateListener();
    }

    /**
     * Generate URL slug from comic ID (simplified)
     * @param {Object} comic - Comic object with ID
     * @returns {string} URL slug (just the comic ID)
     */
    generateSlug(comic) {
        if (!comic || !comic.id) return '';
        return comic.id;
    }

    /**
     * Parse URL slug to extract comic information (simplified for comic ID)
     * @param {string} slug - URL slug (comic ID)
     * @returns {Object} Parsed information
     */
    parseSlug(slug) {
        console.log('🔗 [URL ROUTER] Parsing slug (comic ID):', slug);
        if (!slug) return null;
        
        // Since slug is just the comic ID, return it directly
        const result = {
            comicId: slug,
            isComicId: true
        };
        console.log('🔗 [URL ROUTER] Parsed result (ID-based):', result);
        return result;
    }

    /**
     * Update the URL without triggering navigation
     * @param {Object} comic - Comic object
     * @param {boolean} replace - Whether to replace current state
     */
    updateURL(comic, replace = false) {
        if (!comic) return;
        
        const slug = this.generateSlug(comic);
        const url = `${this.baseUrl}#${slug}`;
        
        const state = {
            comicId: comic.id,
            slug: slug,
            title: comic.title || 'Comic',
            timestamp: comic.createdAt || comic.timestamp
        };
        
        if (replace) {
            history.replaceState(state, `${state.title} | Comics`, url);
        } else {
            history.pushState(state, `${state.title} | Comics`, url);
        }
        
        // Update page title
        document.title = comic.title ? 
            `${comic.title} | Comics` : 
            `Comic ${slug} | Comics`;
    }

    /**
     * Get current URL slug
     * @returns {string|null} Current slug or null
     */
    getCurrentSlug() {
        const hash = window.location.hash;
        console.log('🔗 [URL ROUTER] Current hash:', hash);
        return hash ? hash.substring(1) : null;
    }

    /**
     * Parse current URL to get comic information
     * @returns {Object|null} Parsed comic info or null
     */
    parseCurrentURL() {
        const slug = this.getCurrentSlug();
        return this.parseSlug(slug);
    }

    /**
     * Set up popstate listener for back/forward navigation
     */
    setupPopstateListener() {
        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.comicId && window.app) {
                // Let the app handle navigation to the specific comic
                window.app.navigateToComicByState(event.state);
            } else {
                // No state or no app, try to parse URL
                const urlInfo = this.parseCurrentURL();
                if (urlInfo && window.app) {
                    window.app.navigateToComicByURL(urlInfo);
                }
            }
        });
    }

    /**
     * Navigate to home/latest comic
     */
    navigateToHome() {
        const url = this.baseUrl;
        history.pushState(null, 'Comics', url);
        document.title = 'Comics';
    }

    /**
     * Check if current URL has a comic slug
     * @returns {boolean} True if URL has comic slug
     */
    hasComicInURL() {
        return !!this.getCurrentSlug();
    }

    /**
     * Get a shareable URL for a comic
     * @param {Object} comic - Comic object
     * @returns {string} Full shareable URL
     */
    getShareableURL(comic) {
        const slug = this.generateSlug(comic);
        return `${this.baseUrl}#${slug}`;
    }
}

// Create and export singleton instance
const urlRouter = new URLRouter();
export { urlRouter };
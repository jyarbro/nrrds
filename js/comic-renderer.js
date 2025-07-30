export default class ComicRenderer {
    constructor() {
        this.container = document.getElementById('comicContainer');
    }

    /**
     * Render a comic object into the DOM.
     * @param {object} comic - Comic data to render.
     */
    render(comic) {
        if (!comic || !comic.panels || comic.panels.length === 0) {
            this.showError('Invalid comic data');
            return;
        }
        this.container.innerHTML = '';
        const comicWrapper = document.createElement('div');
        comicWrapper.className = 'comic-wrapper';
        comicWrapper.setAttribute('data-comic-id', comic.id);
        if (comic.title) {
            const title = document.createElement('h2');
            title.className = 'comic-title';
            title.textContent = comic.title;
            comicWrapper.appendChild(title);
        }
        const strip = document.createElement('div');
        strip.className = `comic-strip panels-${comic.panels.length}`;
        comic.panels.forEach((panel, index) => {
            const panelElement = this.createPanel(panel, index);
            strip.appendChild(panelElement);
        });
        comicWrapper.appendChild(strip);
        this.container.appendChild(comicWrapper);
        this.animatePanels();
    }

    /**
     * Create a single comic panel element.
     * @param {object} panel - Panel data.
     * @param {number} index - Panel index.
     * @returns {HTMLElement} Panel element.
     */
    createPanel(panel, index) {
        const panelDiv = document.createElement('div');
        panelDiv.className = 'panel';
        panelDiv.style.animationDelay = `${index * 0.1}s`;
        if (panel.background) {
            const bg = document.createElement('div');
            bg.className = 'panel-background';
            bg.style.background = panel.background;
            panelDiv.appendChild(bg);
        }
        const content = document.createElement('div');
        content.className = 'panel-content';
        if (panel.header) {
            const header = document.createElement('div');
            header.className = 'panel-header';
            header.textContent = panel.header;
            content.appendChild(header);
        }
        if (panel.character) {
            const character = this.createCharacter(panel.character);
            content.appendChild(character);
        }
        if (panel.dialogue && panel.dialogue.length > 0) {
            const dialogueContainer = document.createElement('div');
            dialogueContainer.className = 'dialogue-container';
            panel.dialogue.forEach((line, lineIndex) => {
                const bubble = this.createDialogueBubble(line, lineIndex);
                dialogueContainer.appendChild(bubble);
            });
            content.appendChild(dialogueContainer);
        }
        panelDiv.appendChild(content);
        return panelDiv;
    }

    /**
     * Create a character element for a panel.
     * @param {object} characterData - Character data.
     * @returns {HTMLElement} Character element.
     */
    createCharacter(characterData) {
        const character = document.createElement('div');
        character.className = 'character';
        if (characterData.style) {
            character.classList.add(`character-style-${characterData.style}`);
        }
        if (characterData.effect) {
            character.classList.add(`effect-${characterData.effect}`);
        }
        if (characterData.emoji) {
            character.textContent = characterData.emoji;
        } else if (characterData.text) {
            character.textContent = characterData.text;
        } else {
            character.textContent = '😊';
        }
        if (characterData.alt) {
            character.setAttribute('aria-label', characterData.alt);
        }
        return character;
    }

    /**
     * Create a dialogue bubble element.
     * @param {string|object} line - Dialogue line or object.
     * @param {number} index - Line index.
     * @returns {HTMLElement} Bubble element.
     */
    createDialogueBubble(line, index) {
        const bubble = document.createElement('div');
        let text, type, style;
        if (typeof line === 'string') {
            text = line;
            type = 'speech';
        } else if (typeof line === 'object') {
            text = line.text || '';
            type = line.type || 'speech';
            style = line.style || null;
        }
        switch (type) {
            case 'thought':
                bubble.className = 'thought-bubble';
                break;
            case 'narration':
                bubble.className = 'narration-box';
                break;
            default:
                bubble.className = 'speech-bubble';
        }
        if (style) {
            bubble.classList.add(`bubble-${style}`);
        }
        bubble.textContent = text;
        bubble.style.animationDelay = `${0.3 + (index * 0.1)}s`;
        bubble.style.animation = 'fadeInUp 0.5s ease-out forwards';
        bubble.style.opacity = '0';
        return bubble;
    }

    /**
     * Animate panels appearing in sequence.
     */
    animatePanels() {
        const panels = this.container.querySelectorAll('.panel');
        panels.forEach((panel, index) => {
            panel.style.animation = 'slideIn 0.5s ease-out forwards';
            panel.style.opacity = '0';
            setTimeout(() => {
                panel.style.opacity = '1';
            }, index * 100);
        });
    }

    /**
     * Show loading state in the container.
     */
    showLoading() {
        this.container.innerHTML = `\n            <div class="loading-state">\n                <div class="loading-icon">⏳</div>\n                <p>Generating your comic...</p>\n            </div>\n        `;
    }

    /**
     * Show error state in the container.
     * @param {string} message - Error message to display.
     */
    showError(message) {
        this.container.innerHTML = `\n            <div class="error-state">\n                <div class="error-icon">😵</div>\n                <h3>Oops!</h3>\n                <p>${message}</p>\n            </div>\n        `;
    }

    /**
     * Clear the comic container.
     */
    clear() {
        this.container.innerHTML = '';
    }
}

const style = document.createElement('style');
style.textContent = `\n    @keyframes slideIn {\n        from {\n            transform: translateY(20px);\n            opacity: 0;\n        }\n        to {\n            transform: translateY(0);\n            opacity: 1;\n        }\n    }\n\n    @keyframes fadeInUp {\n        from {\n            transform: translateY(10px);\n            opacity: 0;\n        }\n        to {\n            transform: translateY(0);\n            opacity: 1;\n        }\n    }\n\n    .loading-state, .error-state {\n        text-align: center;\n        padding: 60px 20px;\n    }\n\n    .loading-icon, .error-icon {\n        font-size: 4rem;\n        margin-bottom: 20px;\n    }\n\n    .loading-state p {\n        font-size: 1.2rem;\n        color: #666;\n    }\n\n    .error-state h3 {\n        font-size: 1.8rem;\n        color: var(--primary-color);\n        margin-bottom: 10px;\n    }\n\n    .error-state p {\n        font-size: 1.1rem;\n        color: #666;\n    }\n\n    .dialogue-container {\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n        margin-top: auto;\n    }\n\n    .narration-box {\n        background: #f5f5f5;\n        border: 1px solid #999;\n        padding: 10px;\n        font-style: italic;\n        text-align: center;\n        margin: 10px 0;\n        border-radius: 5px;\n    }\n`;
document.head.appendChild(style);

const comicRenderer = new ComicRenderer();
export { comicRenderer };

// Comic rendering module
class ComicRenderer {
    constructor() {
        this.container = document.getElementById('comicContainer');
    }

    // Main render function
    render(comic) {
        if (!comic || !comic.panels || comic.panels.length === 0) {
            this.showError('Invalid comic data');
            return;
        }

        // Clear container
        this.container.innerHTML = '';

        // Create comic wrapper
        const comicWrapper = document.createElement('div');
        comicWrapper.className = 'comic-wrapper';
        comicWrapper.setAttribute('data-comic-id', comic.id);

        // Add title
        if (comic.title) {
            const title = document.createElement('h2');
            title.className = 'comic-title';
            title.textContent = comic.title;
            comicWrapper.appendChild(title);
        }

        // Create strip container
        const strip = document.createElement('div');
        strip.className = 'comic-strip';

        // Render each panel
        comic.panels.forEach((panel, index) => {
            const panelElement = this.createPanel(panel, index);
            strip.appendChild(panelElement);
        });

        comicWrapper.appendChild(strip);

        // Add credits if available
        if (comic.credits) {
            const credits = document.createElement('div');
            credits.className = 'comic-credits';
            credits.textContent = comic.credits;
            comicWrapper.appendChild(credits);
        }

        // Add to container
        this.container.appendChild(comicWrapper);

        // Animate panels in
        this.animatePanels();
    }

    // Create a single panel
    createPanel(panel, index) {
        const panelDiv = document.createElement('div');
        panelDiv.className = 'panel';
        panelDiv.style.animationDelay = `${index * 0.1}s`;

        // Add background if specified
        if (panel.background) {
            const bg = document.createElement('div');
            bg.className = 'panel-background';
            bg.style.background = panel.background;
            panelDiv.appendChild(bg);
        }

        // Create content wrapper
        const content = document.createElement('div');
        content.className = 'panel-content';

        // Add header/UI element if present
        if (panel.header) {
            const header = document.createElement('div');
            header.className = 'panel-header';
            header.textContent = panel.header;
            content.appendChild(header);
        }

        // Add character if present
        if (panel.character) {
            const character = this.createCharacter(panel.character);
            content.appendChild(character);
        }

        // Add dialogue
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

    // Create character element
    createCharacter(characterData) {
        const character = document.createElement('div');
        character.className = 'character';

        // Apply style
        if (characterData.style) {
            character.classList.add(`character-style-${characterData.style}`);
        }

        // Apply effects
        if (characterData.effect) {
            character.classList.add(`effect-${characterData.effect}`);
        }

        // Set emoji or text
        if (characterData.emoji) {
            character.textContent = characterData.emoji;
        } else if (characterData.text) {
            character.textContent = characterData.text;
        } else {
            // Default emoji
            character.textContent = '😊';
        }

        // Add accessibility
        if (characterData.alt) {
            character.setAttribute('aria-label', characterData.alt);
        }

        return character;
    }

    // Create dialogue bubble
    createDialogueBubble(line, index) {
        const bubble = document.createElement('div');
        
        // Handle different line formats
        let text, type, style;
        
        if (typeof line === 'string') {
            text = line;
            type = 'speech';
        } else if (typeof line === 'object') {
            text = line.text || '';
            type = line.type || 'speech';
            style = line.style || null;
        }

        // Set bubble class based on type
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

        // Apply style modifiers
        if (style) {
            bubble.classList.add(`bubble-${style}`);
        }

        // Set text content
        bubble.textContent = text;

        // Add animation delay
        bubble.style.animationDelay = `${0.3 + (index * 0.1)}s`;
        bubble.style.animation = 'fadeInUp 0.5s ease-out forwards';
        bubble.style.opacity = '0';

        return bubble;
    }

    // Animate panels appearing
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

    // Show loading state
    showLoading() {
        this.container.innerHTML = `
            <div class="loading-state">
                <div class="loading-icon">⏳</div>
                <p>Generating your comic...</p>
            </div>
        `;
    }

    // Show error state
    showError(message) {
        this.container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">😵</div>
                <h3>Oops!</h3>
                <p>${message}</p>
            </div>
        `;
    }

    // Clear the container
    clear() {
        this.container.innerHTML = '';
    }
}

// Add required animations to the page
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    @keyframes fadeInUp {
        from {
            transform: translateY(10px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    .loading-state, .error-state {
        text-align: center;
        padding: 60px 20px;
    }

    .loading-icon, .error-icon {
        font-size: 4rem;
        margin-bottom: 20px;
    }

    .loading-state p {
        font-size: 1.2rem;
        color: #666;
    }

    .error-state h3 {
        font-size: 1.8rem;
        color: var(--primary-color);
        margin-bottom: 10px;
    }

    .error-state p {
        font-size: 1.1rem;
        color: #666;
    }

    .dialogue-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: auto;
    }

    .narration-box {
        background: #f5f5f5;
        border: 1px solid #999;
        padding: 10px;
        font-style: italic;
        text-align: center;
        margin: 10px 0;
        border-radius: 5px;
    }
`;
document.head.appendChild(style);

// Create and export singleton instance
const comicRenderer = new ComicRenderer();

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
        
        // Add generated date below the comic
        if (comic.createdAt || comic.timestamp) {
            const dateElement = document.createElement('div');
            dateElement.className = 'comic-date';
            const date = new Date(comic.createdAt || comic.timestamp);
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const formattedTime = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            dateElement.textContent = `Generated on ${formattedDate}`;
            dateElement.title = `Generated at ${formattedTime}`;
            
            // Create container for date and reactions
            const metaContainer = document.createElement('div');
            metaContainer.className = 'comic-meta-container';
            metaContainer.appendChild(dateElement);
            
            // Create reaction stats container
            const reactionStats = document.createElement('div');
            reactionStats.className = 'comic-reaction-stats';
            reactionStats.id = 'comicReactionStats';
            metaContainer.appendChild(reactionStats);
            
            comicWrapper.appendChild(metaContainer);
        }
        
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
        if (panel.characters && panel.characters.length > 0) {
            const charactersContainer = this.createCharactersContainer(panel.characters);
            content.appendChild(charactersContainer);
        } else if (panel.character) {
            // Fallback for old format
            const character = this.createCharacter(panel.character);
            content.appendChild(character);
        }
        if (panel.dialogue && panel.dialogue.length > 0) {
            const dialogueContainer = document.createElement('div');
            dialogueContainer.className = 'dialogue-container';
            const hasMultipleCharacters = panel.characters && panel.characters.length > 1;
            
            panel.dialogue.forEach((line, lineIndex) => {
                const bubble = this.createDialogueBubble(line, lineIndex, hasMultipleCharacters, panel.characters);
                dialogueContainer.appendChild(bubble);
            });
            content.appendChild(dialogueContainer);
        }
        panelDiv.appendChild(content);
        return panelDiv;
    }

    /**
     * Create a characters container for multiple characters in a panel.
     * @param {Array} charactersData - Array of character data.
     * @returns {HTMLElement} Characters container element.
     */
    createCharactersContainer(charactersData) {
        const container = document.createElement('div');
        container.className = 'characters-container';
        
        charactersData.forEach((characterData, index) => {
            const characterWrapper = this.createCharacterWithNameplate(characterData, index);
            container.appendChild(characterWrapper);
        });
        
        return container;
    }

    /**
     * Create a character element with nameplate for multi-character panels.
     * @param {object} characterData - Character data.
     * @param {number} index - Character index for positioning.
     * @returns {HTMLElement} Character wrapper element.
     */
    createCharacterWithNameplate(characterData, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'character-wrapper';
        wrapper.setAttribute('data-character', characterData.name || `character-${index}`);
        
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
        } else {
            character.textContent = '😊';
        }
        
        // Add nameplate if character has a name
        if (characterData.name) {
            const nameplate = document.createElement('div');
            nameplate.className = 'character-nameplate';
            nameplate.textContent = characterData.name;
            wrapper.appendChild(nameplate);
        }
        
        wrapper.appendChild(character);
        return wrapper;
    }

    /**
     * Create a character element for a panel (legacy single character support).
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
     * @param {boolean} hasMultipleCharacters - Whether panel has multiple characters.
     * @param {Array} characters - Array of character data for positioning.
     * @returns {HTMLElement} Bubble element.
     */
    createDialogueBubble(line, index, hasMultipleCharacters = false, characters = []) {
        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.className = 'bubble-wrapper';
        
        let text, type, style, speaker;
        if (typeof line === 'string') {
            text = line;
            type = 'speech';
        } else if (typeof line === 'object') {
            text = line.text || '';
            type = line.type || 'speech';
            style = line.style || null;
            speaker = line.speaker;
        }
        
        // Add speaker nameplate if multiple characters and speaker is specified
        if (hasMultipleCharacters && speaker) {
            const speakerLabel = document.createElement('div');
            speakerLabel.className = 'speaker-label';
            speakerLabel.textContent = speaker;
            bubbleWrapper.appendChild(speakerLabel);
        }
        
        const bubble = document.createElement('div');
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
        if (speaker) {
            bubble.setAttribute('data-speaker', speaker);
        }
        
        // Add arrow positioning for speech bubbles based on speaker position
        if (type === 'speech' && hasMultipleCharacters && speaker && characters) {
            const speakerIndex = characters.findIndex(char => char.name === speaker);
            const totalCharacters = characters.length;
            
            if (speakerIndex !== -1) {
                if (totalCharacters === 2) {
                    bubble.classList.add(speakerIndex === 0 ? 'arrow-left' : 'arrow-right');
                } else if (totalCharacters === 3) {
                    if (speakerIndex === 0) {
                        bubble.classList.add('arrow-left');
                    } else if (speakerIndex === 1) {
                        bubble.classList.add('arrow-center');
                    } else {
                        bubble.classList.add('arrow-right');
                    }
                } else if (totalCharacters > 3) {
                    // For more than 3 characters, distribute evenly
                    const position = speakerIndex / (totalCharacters - 1);
                    if (position < 0.33) {
                        bubble.classList.add('arrow-left');
                    } else if (position > 0.67) {
                        bubble.classList.add('arrow-right');
                    } else {
                        bubble.classList.add('arrow-center');
                    }
                }
            }
        }
        
        bubble.textContent = text;
        bubble.style.animationDelay = `${0.3 + (index * 0.1)}s`;
        bubble.style.animation = 'fadeInUp 0.5s ease-out forwards';
        bubble.style.opacity = '0';
        
        bubbleWrapper.appendChild(bubble);
        bubbleWrapper.style.animationDelay = `${0.3 + (index * 0.1)}s`;
        
        return bubbleWrapper;
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

const comicRenderer = new ComicRenderer();
export { comicRenderer };

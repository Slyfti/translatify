// True while the extension's runtime bridge is still attached to this content script.
// Becomes false after the extension is reloaded/updated, leaving this script orphaned.
function isExtensionAlive() {
    try {
        return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
        return false;
    }
}

// Translation cache
const translationCache = new Map();

// Active mutation observers
const mutationObservers = new Map();

// To modify if spotify decides to change variable names
const lyricLine = "div[data-testid='lyrics-line']";

function getMainView() {
    return document.querySelector("#main-view") || document.querySelector('#main') || document.body;
}

// Hopefully a reliable way to get the current focused lyrics w/out relying on class names (that changes w/ spotify UI updates).
function getFocusedLyric() {
    const lines = document.querySelectorAll(lyricLine);

    // Group classes by frequency
    const classCounts = {};
    lines.forEach(line => {
        line.classList.forEach(cls => {
            classCounts[cls] = (classCounts[cls] || 0) + 1;
        });
    });

    // The focused line will have a class that appears only once.
    return Array.from(lines).find(line =>
        Array.from(line.classList).some(cls => classCounts[cls] === 1)
    );
}
// Focuses active lyric to make up for the layout shift due to new subtitles being added.
function focusActiveLyric() {
    let focusedLyrics = getFocusedLyric()
    if (focusedLyrics) {
        focusedLyrics.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center"
        });
    }
}

// Lines that are pure punctuation / musical symbols don't need translation.
function isUntranslatable(text) {
    return !text || !/\p{L}|\p{N}/u.test(text);
}

async function translateText(text, sourceLanguage, destinationLanguage) {
    if (isUntranslatable(text)) return text;

    const cacheKey = `${text}|${sourceLanguage}|${destinationLanguage}`;
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    if (!isExtensionAlive()) return null;

    let response;
    try {
        response = await chrome.runtime.sendMessage({
            type: 'TRANSLATE',
            text,
            sourceLanguage,
            destinationLanguage
        });
    } catch {
        return null;
    }

    if (!response || response.error) {
        if (response?.error) console.error('Error:', response.error);
        return null;
    }

    translationCache.set(cacheKey, response.result);
    return response.result;
}

function disconnectAllObservers() {
    mutationObservers.forEach((observer, key) => {
        observer.disconnect();
        console.log('Disconnected observer for:', key);
    });
    mutationObservers.clear();
}

function restoreLyrics() {
    // Disconnect all observers first
    disconnectAllObservers();

    const lyricsWrapperList = document.querySelectorAll(lyricLine);
    if (lyricsWrapperList) {
        lyricsWrapperList.forEach((lyricsWrapper, index) => {
            lyricsWrapper.classList.remove("modifedLyricsWrapper");
            
            const lyrics = lyricsWrapper.querySelector(".newLyrics");

            if (lyrics) {
                const originalLyrics = lyricsWrapper.querySelector(".originalLyrics").innerText;
                lyrics.innerText = originalLyrics;
                lyrics.classList.remove("newLyrics");

                lyricsWrapper.querySelector(".originalLyrics").remove();
            }
        });
    }


}


// This mess is due to Spotify's dynamic lyric highlighting behavior
async function setupMutationObserver() {
    // Use a single observer that watches the main view for any changes
    const observerKey = `mainView`;

    // Only set up once - don't recreate if already exists
    if (mutationObservers.has(observerKey)) {
        console.log('Translatify: Observer already set up for main view');
        return;
    }

    // Get language settings once when setting up observer
    const sourceLanguage = "auto";
    let destinationLanguage = "en";
    if (isExtensionAlive()) {
        try {
            const stored = await chrome.storage.local.get(["language"]);
            destinationLanguage = stored.language || "en";
        } catch {}
    }

    const observer = new MutationObserver((mutations) => {
        const translateButton = document.querySelector("button[data-testid='translate-button']");
        if (!translateButton || translateButton.getAttribute("aria-pressed") !== "true") return;

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (!node.matches?.(lyricLine)) continue;
                if (node.classList.contains("modifedLyricsWrapper")) continue;

                const lyricsText = node.firstChild?.textContent;
                if (!lyricsText) continue;

                const cacheKey = `${lyricsText}|${sourceLanguage}|${destinationLanguage}`;
                if (translationCache.has(cacheKey)) {
                    replaceLyric(translationCache.get(cacheKey), node);
                } else {
                    translateAndUpdateAsync(node, lyricsText, sourceLanguage, destinationLanguage);
                }
                focusActiveLyric();
            }
        }
    });

    const target = getMainView();
    if (target) {
        observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true
        });

        mutationObservers.set(observerKey, observer);
        console.log('Observer setup for main view on:', target);
    } else {
        console.warn('No target found to observe for mutations');
    }
}

// Replace a lyric line in-place with its translation, preserving the original
// element so we can restore it later.
function replaceLyric(translatedLine, lyricsWrapper) {
    if (!lyricsWrapper || translatedLine == null) return;
    if (lyricsWrapper.classList.contains("modifedLyricsWrapper")) return;

    lyricsWrapper.classList.add("modifedLyricsWrapper");
    const lyrics = lyricsWrapper.firstChild;
    const originalText = lyrics.innerText;
    const newLyrics = lyrics.cloneNode(true);

    lyrics.setAttribute("original", originalText);
    lyrics.classList.add("originalLyrics");

    newLyrics.innerText = translatedLine;
    lyricsWrapper.appendChild(newLyrics);
    newLyrics.classList.add("newLyrics");
}

async function translateAndUpdateAsync(lyricsWrapper, lyricsText, sourceLanguage, destinationLanguage) {
    try {
        const translatedLine = await translateText(lyricsText, sourceLanguage, destinationLanguage);
        if (translatedLine != null) {
            replaceLyric(translatedLine, lyricsWrapper);
        }
    } catch (error) {
        console.error('Error translating line:', error);
    }
}

// Translate every visible lyric line, then attach the mutation observer to
// translate any new lines Spotify renders later.
async function translateLineByLineWithGoogle(sourceLanguage, destinationLanguage) {
    const lyricsWrapperList = document.querySelectorAll(lyricLine);

    if (lyricsWrapperList.length === 0) {
        console.log("Translatify: lyrics not found, retrying..");
        return setTimeout(translate, 100);
    }

    const promises = Array.from(lyricsWrapperList).map(async (wrapper) => {
        const lyrics = wrapper.firstChild?.textContent;
        if (!lyrics) return;
        const translatedLine = await translateText(lyrics, sourceLanguage, destinationLanguage);
        if (translatedLine != null) replaceLyric(translatedLine, wrapper);
    });
    await Promise.all(promises);

    focusActiveLyric();
    setupMutationObserver();
}

// MAIN TRANSLATION FUNCTION
async function translate() {
    if (!isExtensionAlive()) return;

    const sourceLanguage = "auto";
    let destinationLanguage = "en";
    try {
        const stored = await chrome.storage.local.get(["language"]);
        destinationLanguage = stored.language || "en";
    } catch {
        return;
    }

    const translateButton = document.querySelector("button[data-testid='translate-button']");
    const lyricsButton = document.querySelector("button[data-testid='lyrics-button']");
    if (!translateButton || !lyricsButton) return;


    if (translateButton.getAttribute("aria-pressed") == "true" && lyricsButton.getAttribute("data-active") == "true") {
        await translateLineByLineWithGoogle(sourceLanguage,destinationLanguage);
    } else if (translateButton.getAttribute("aria-pressed") == "false") {
        restoreLyrics();
        
        focusActiveLyric();
    }
    
}


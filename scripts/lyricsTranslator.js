// Translation cache
const translationCache = new Map();

// Active mutation observers
const mutationObservers = new Map();

// Flag to prevent observer infinite loops
let isTranslating = false;

function getMainView() {
    return document.querySelector("#main-view") || document.querySelector('#main') || document.body;
}

async function translateText(text,sourceLanguage,destinationLanguage) {

    // Check cache first
    const cacheKey = `${text}|${sourceLanguage}|${destinationLanguage}`;
    if (translationCache.has(cacheKey)) {
        console.log('Using cached translation for:', text.substring(0, 30));
        return translationCache.get(cacheKey);
    }

    const params = `&sl=${sourceLanguage}&tl=${destinationLanguage}&q=${text}`;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t${params}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const translatedArrays = data[0];
        let translatedLyrics = "";
        translatedArrays.forEach((translatedArray) => {
            translatedLyrics += translatedArray[0];
        });

        // Store in cache
        translationCache.set(cacheKey, translatedLyrics);

        return translatedLyrics;
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
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

    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");
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

function getLyrics() {
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");
    const lyricsList = [];
    if (lyricsWrapperList) {
        lyricsWrapperList.forEach((lyricsWrapper) => {
            const lyrics = lyricsWrapper.firstChild.textContent;
            lyricsList.push(lyrics);
        });
    }
    return lyricsList;
}

// This mess is due to Spotify's dynamic lyric highlighting behavior
async function setupMutationObserver() {
    // Use a single observer that watches the main view for any changes
    const observerKey = `mainView`;

    // Only set up once - don't recreate if already exists
    if (mutationObservers.has(observerKey)) {
        console.log('Observer already set up for main view');
        return;
    }

    // Get language settings once when setting up observer
    const sourceLanguage = "auto";
    let destinationLanguage = await chrome.storage.local.get(["language"]);
    destinationLanguage = destinationLanguage.language || "en";

    const observer = new MutationObserver((mutations) => {
        // Prevent infinite loop - don't re-translate while already translating
        if (isTranslating) {
            console.log('Translation in progress, skipping observer trigger');
            return;
        }
        
        // Check if translation is enabled
        const translateButton = document.querySelector("button[data-testid='translate-button']");
        if (!translateButton || translateButton.getAttribute("aria-pressed") !== "true") {
            console.log('Translation not enabled, skipping');
            return;
        }
        
        // Process each mutation SYNCHRONOUSLY
        for (const mutation of mutations) {
            // Check added nodes
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if the node itself is a lyrics-line
                        if (node.matches && node.matches("div[data-testid='lyrics-line']")) {
                            if (!node.classList.contains("modifedLyricsWrapper")) {
                                const lyricsText = node.firstChild?.textContent;
                                if (lyricsText) {
                                    // Try to get from cache SYNCHRONOUSLY
                                    const cacheKey = `${lyricsText}|${sourceLanguage}|${destinationLanguage}`;
                                    if (translationCache.has(cacheKey)) {
                                        // IMMEDIATE modification from cache
                                        const translatedLine = translationCache.get(cacheKey);
                                        replaceLyricSync(translatedLine, node);
                                        console.log('Applied cached translation immediately:', lyricsText.substring(0, 30));
                                    } else {
                                        // If not cached, translate async and update later
                                        console.log('Translation not cached, fetching:', lyricsText.substring(0, 30));
                                        translateAndUpdateAsync(node, lyricsText, sourceLanguage, destinationLanguage);
                                    }

                                    // Focus active lyrics
                                    let focusedLyrics = document.querySelector("._gZrl2ExJwyxPy1pEUG2");
                                    focusedLyrics.scrollIntoView({
                                        behavior: "smooth",
                                        block: "center",
                                        inline: "center"
                                    });
                                }
                            }
                        }
                        
                    }
                }
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

// Synchronous version for immediate modification from cache
function replaceLyricSync(translatedLine, lyricsWrapper) {
    if (lyricsWrapper != null && translatedLine != null && lyricsWrapper.classList.contains("modifedLyricsWrapper") == false) {
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
}

// Async version for fallback when translation not cached
async function translateAndUpdateAsync(lyricsWrapper, lyricsText, sourceLanguage, destinationLanguage) {
    isTranslating = true;
    try {
        const translatedLine = await translateText(lyricsText, sourceLanguage, destinationLanguage);
        if (translatedLine && !lyricsWrapper.classList.contains("modifedLyricsWrapper")) {
            replaceLyricSync(translatedLine, lyricsWrapper);
        }
    } catch (error) {
        console.error('Error translating line:', error);
    } finally {
        isTranslating = false;
    }
}

// Lyric replacement function
async function replaceLyricAsync(translatedLine, lyricsWrapper, sourceLanguage, destinationLanguage) {
    if (lyricsWrapper != null && translatedLine != null && lyricsWrapper.classList.contains("modifedLyricsWrapper") == false) {
        

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

    let focusedLyrics = document.querySelector("._gZrl2ExJwyxPy1pEUG2");
    if (focusedLyrics) {
        focusedLyrics.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center"
        });
    }
}

// Translate lyrics line by line using GTranslate
async function translateLineByLineWithGoogle(sourceLanguage,destinationLanguage) {
    const translationMap = new Map();
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");

    if (lyricsWrapperList[0] == null) {
        console.log("Lyrics not found: waiting..");
        return setTimeout(translate, 100);
    }

    // No need to translate these characters
    translationMap.set('♪', '♪');
    translationMap.set(' ', ' ');
    translationMap.set('', '');

    const lyricsList = getLyrics();
    let translatedLyricsList = new Array();
    if (lyricsList) {
        const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");
        const promises = lyricsList.map(async (lyrics, index) => {
            let translatedLine = await translateText(lyrics, sourceLanguage, destinationLanguage);
            await replaceLyricAsync(translatedLine, lyricsWrapperList[index], sourceLanguage, destinationLanguage);
        });
        await Promise.all(promises);

        // Focus active lyrics
        let focusedLyrics = document.querySelector("._gZrl2ExJwyxPy1pEUG2");
        focusedLyrics.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center"
        });
    }

    // Set up observer once after translation is complete
    setupMutationObserver();
}

// MAIN TRANSLATION FUNCTION
async function translate() {
    
    const sourceLanguage = "auto";
    let destinationLanguage = "en";

    destinationLanguage = await chrome.storage.local.get(["language"]);
    destinationLanguage = destinationLanguage.language;


    const translateButton = document.querySelector("button[data-testid='translate-button']");
    const lyricsButton = document.querySelector("button[data-testid='lyrics-button']");


    if (translateButton.getAttribute("aria-pressed") == "true" && lyricsButton.getAttribute("aria-pressed") == "true") {
        await translateLineByLineWithGoogle(sourceLanguage,destinationLanguage);
    } else if (translateButton.getAttribute("aria-pressed") == "false") {
        restoreLyrics();
        
        // Focus active lyrics
        let focusedLyrics = document.querySelector("._gZrl2ExJwyxPy1pEUG2");
        focusedLyrics.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center"
        });
    }
    
}

// Clear translation cache
function clearTranslationCache() {
    translationCache.clear();
    console.log('Translation cache cleared');
}
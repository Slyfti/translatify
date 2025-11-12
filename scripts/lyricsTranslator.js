// Translation cache
const translationCache = new Map();

// Active mutation observers
const mutationObservers = new Map();

// Flag to prevent observer infinite loops
let isTranslating = false;

function getMainView() {
    return document.querySelector("#main-view") || document.querySelector('main') || document.body;
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


    const tag = document.getElementById("translated");
    if (tag) {
        tag.remove();
    }
}


// 1ST METHOD



function getFullLyrics(lyricsList) {
    let fullLyrics = "";
    if (lyricsList) {
        fullLyrics = lyricsList.join(";");
    }
    return fullLyrics;
}


function getTranslatedLyricsToList(translatedLyrics) {
    if (translatedLyrics == null) {
        return null;
    }
    
    const translatedLyricsList = translatedLyrics.split(';');
    return translatedLyricsList;
}

function replaceLyrics(translatedLyricsList) {
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");
    if (lyricsWrapperList[0] != null && translatedLyricsList != null) {
            const tag= document.createElement("div");
            tag.id="translated";
            lyricsWrapperList[0].appendChild(tag);

            lyricsWrapperList.forEach((lyricsWrapper, index) => {
                lyricsWrapper.classList.add("modifedLyricsWrapper");
                const lyrics = lyricsWrapper.firstChild;
                const newLyrics = lyrics.cloneNode(true);
    
                lyrics.setAttribute("original",lyrics.innerText);
                lyrics.classList.add("originalLyrics");
    
                newLyrics.innerText = translatedLyricsList[index];
                lyricsWrapper.appendChild(newLyrics);
                newLyrics.classList.add("newLyrics");
    
            });
        
    }

}


async function translateAllWithGoogle(sourceLanguage,destinationLanguage) {
    const lyricsList = getLyrics();
    const fullLyrics = getFullLyrics(lyricsList);
    const translatedLyrics = await translateText(fullLyrics,sourceLanguage,destinationLanguage);
    const translatedLyricsList = getTranslatedLyricsToList(translatedLyrics);
    console.log(translatedLyricsList);
    replaceLyrics(translatedLyricsList);
}


// 2ND METHOD

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

function setupMutationObserver() {
    // Use a single observer that watches the main view for any changes
    const observerKey = `mainView`;

    // Only set up once - don't recreate if already exists
    if (mutationObservers.has(observerKey)) {
        console.log('Observer already set up for main view');
        return;
    }

    const observer = new MutationObserver(async (mutations) => {
        // Prevent infinite loop - don't re-translate while already translating
        if (isTranslating) {
            console.log('Translation in progress, skipping observer trigger');
            return;
        }
        
        // Get language settings
        const sourceLanguage = "auto";
        let destinationLanguage = await chrome.storage.local.get(["language"]);
        destinationLanguage = destinationLanguage.language || "en";
        
        // Check if translation is enabled
        const translateButton = document.querySelector("button[data-testid='translate-button']");
        if (!translateButton || translateButton.getAttribute("aria-pressed") !== "true") {
            console.log('Translation not enabled, skipping');
            return;
        }
        
        isTranslating = true;
        
        // Process each mutation
        for (const mutation of mutations) {
            // Check added nodes
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if the node itself is a lyrics-line
                        if (node.matches && node.matches("div[data-testid='lyrics-line']")) {
                            if (!node.classList.contains("modifedLyricsWrapper")) {
                                const lyricsText = node.firstChild.textContent;
                                const translatedLine = await translateText(lyricsText, sourceLanguage, destinationLanguage);
                                await replaceLyricAsync(translatedLine, node, sourceLanguage, destinationLanguage);
                            }
                        }
                        
                    }
                }
            }
        }
        
        isTranslating = false;
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


async function translateLineByLineWithGoogle(sourceLanguage,destinationLanguage) {
    const translationMap = new Map();

    // Tag to let know that the lyrics are translated

    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");

    if (lyricsWrapperList[0] == null) {
        console.log("Lyrics not found: waiting..");
        return setTimeout(translate, 100);
    }

    const tag= document.createElement("div");
    tag.id="translated";
    lyricsWrapperList[0].appendChild(tag);

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


// MAIN TRANSLATE FUNCTION
async function translate() {
    // Set flag to prevent observer triggering during translation
    isTranslating = true;
    
    const sourceLanguage = "auto";
    let destinationLanguage = "en";

    destinationLanguage = await chrome.storage.local.get(["language"]);
    destinationLanguage = destinationLanguage.language;


    const translateButton = document.querySelector("button[data-testid='translate-button']");
    const lyricsButton = document.querySelector("button[data-testid='lyrics-button']");


    if (translateButton.getAttribute("aria-pressed") == "true" && lyricsButton.getAttribute("aria-pressed") == "true") {
        await translateLineByLineWithGoogle(sourceLanguage,destinationLanguage);
    } else if (translateButton.getAttribute("aria-pressed") == "false" && document.getElementById("translated") != null) {
        restoreLyrics();
        
        // Focus active lyrics
        let focusedLyrics = document.querySelector("._gZrl2ExJwyxPy1pEUG2");
        focusedLyrics.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center"
        });
    }
    
    // Clear flag after translation is complete
    isTranslating = false;
}

function refreshTranslation() {
    const tag = document.getElementById("translated");
    if (tag) {
        tag.remove();
        restoreLyrics();
    }
    translate();
}

function clearTranslationCache() {
    translationCache.clear();
    console.log('Translation cache cleared');
}
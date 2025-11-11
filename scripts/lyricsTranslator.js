// Translation cache
const translationCache = new Map();

// Active mutation observers
const mutationObservers = new Map();

async function translateText(text, sourceLanguage, destinationLanguage) {
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
<<<<<<< Updated upstream
=======
    // Disconnect all observers first
    disconnectAllObservers();
    
>>>>>>> Stashed changes
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
        const tag = document.createElement("div");
        tag.id = "translated";
        lyricsWrapperList[0].appendChild(tag);

        lyricsWrapperList.forEach((lyricsWrapper, index) => {
            lyricsWrapper.classList.add("modifedLyricsWrapper");
            const lyrics = lyricsWrapper.firstChild;
            const newLyrics = lyrics.cloneNode(true);

            lyrics.setAttribute("original", lyrics.innerText);
            lyrics.classList.add("originalLyrics");

            newLyrics.innerText = translatedLyricsList[index];
            lyricsWrapper.appendChild(newLyrics);
            newLyrics.classList.add("newLyrics");
        });
    }
}

async function translateAllWithGoogle(sourceLanguage, destinationLanguage) {
    const lyricsList = getLyrics();
    const fullLyrics = getFullLyrics(lyricsList);
    const translatedLyrics = await translateText(fullLyrics, sourceLanguage, destinationLanguage);
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

<<<<<<< Updated upstream
async function replaceLyricAsync(translatedLine, index) {
=======
function setupMutationObserver(lyricsWrapper, index, originalText, translatedText, sourceLanguage, destinationLanguage) {
    const observerKey = `lyric-${index}`;
    
    // Disconnect existing observer if any
    if (mutationObservers.has(observerKey)) {
        mutationObservers.get(observerKey).disconnect();
    }

    const observer = new MutationObserver(async (mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'characterData') {
                const newLyrics = lyricsWrapper.querySelector(".newLyrics");
                const originalLyrics = lyricsWrapper.querySelector(".originalLyrics");
                
                // Check if translation was overwritten
                if (!newLyrics || !originalLyrics) {
                    console.log(`Lyric ${index} was overwritten, preventing...`);
                    
                    // PREVENT THE OVERRIDE: Restore the translation immediately
                    observer.disconnect();
                    
                    const lyrics = lyricsWrapper.firstChild;
                    if (lyrics && !lyrics.classList.contains("originalLyrics")) {
                        // Spotify overwrote it, restore our structure
                        const restoredOriginal = lyrics.cloneNode(true);
                        restoredOriginal.setAttribute("original", originalText);
                        restoredOriginal.classList.add("originalLyrics");
                        restoredOriginal.innerText = originalText;
                        
                        const restoredTranslation = lyrics.cloneNode(true);
                        restoredTranslation.classList.add("newLyrics");
                        restoredTranslation.innerText = translatedText;
                        
                        lyricsWrapper.appendChild(restoredOriginal);
                        lyricsWrapper.appendChild(restoredTranslation);
                        lyricsWrapper.classList.add("modifedLyricsWrapper");
                    }
                    
                    // Reconnect observer
                    setupMutationObserver(lyricsWrapper, index, originalText, translatedText, sourceLanguage, destinationLanguage);
                    break;
                }
            }
        }
    });

    // Observe the lyrics wrapper for changes
    observer.observe(lyricsWrapper, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true
    });

    mutationObservers.set(observerKey, observer);
    console.log(`Observer setup for lyric ${index}`);
}

async function replaceLyricAsync(translatedLine, index, sourceLanguage, destinationLanguage) {
>>>>>>> Stashed changes
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");
    if (lyricsWrapperList[0] != null && translatedLine != null) {
        const lyricsWrapper = lyricsWrapperList[index];

        lyricsWrapper.classList.add("modifedLyricsWrapper");
        const lyrics = lyricsWrapper.firstChild;
        const originalText = lyrics.innerText;
        const newLyrics = lyrics.cloneNode(true);

        lyrics.setAttribute("original", originalText);
        lyrics.classList.add("originalLyrics");

        newLyrics.innerText = translatedLine;
        lyricsWrapper.appendChild(newLyrics);
        newLyrics.classList.add("newLyrics");

        // Setup mutation observer for this lyric
        setupMutationObserver(lyricsWrapper, index, originalText, translatedLine, sourceLanguage, destinationLanguage);
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

async function translateLineByLineWithGoogle(sourceLanguage, destinationLanguage) {
    const translationMap = new Map();

    // Tag to let know that the lyrics are translated
<<<<<<< Updated upstream

=======
>>>>>>> Stashed changes
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");

    if (lyricsWrapperList[0] == null) {
        console.log("Lyrics not found: waiting..");
        return setTimeout(translate, 100);
    }

    const tag = document.createElement("div");
    tag.id = "translated";
    lyricsWrapperList[0].appendChild(tag);

    // No need to translate these characters
    translationMap.set('♪', '♪');
    translationMap.set(' ', ' ');
    translationMap.set('', '');

    const lyricsList = getLyrics();
    if (lyricsList) {
        const promises = lyricsList.map(async (lyrics, index) => {
            // Use cached translation if available
            let translatedLine = await translateText(lyrics, sourceLanguage, destinationLanguage);
            await replaceLyricAsync(translatedLine, index, sourceLanguage, destinationLanguage);
        });
        await Promise.all(promises);

        // Focus active lyrics
        let focusedLyrics = document.querySelector("._gZrl2ExJwyxPy1pEUG2");
        if (focusedLyrics) {
            focusedLyrics.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "center"
            });
        }
    }
}

// MAIN TRANSLATE FUNCTION
async function translate() {
    const sourceLanguage = "auto";
    let destinationLanguage = "eng";

    destinationLanguage = await chrome.storage.local.get(["language"]);
    destinationLanguage = destinationLanguage.language;

    const translateButton = document.querySelector("button[data-testid='translate-button']");
    const lyricsButton = document.querySelector("button[data-testid='lyrics-button']");

    if (translateButton.getAttribute("aria-pressed") == "true" && document.getElementById("translated") == null && lyricsButton.getAttribute("aria-pressed") == "true") {
        translateLineByLineWithGoogle(sourceLanguage, destinationLanguage);
    } else if (translateButton.getAttribute("aria-pressed") == "false" && document.getElementById("translated") != null) {
        restoreLyrics();
        
        // Focus active lyrics
        let focusedLyrics = document.querySelector("._gZrl2ExJwyxPy1pEUG2");
        if (focusedLyrics) {
            focusedLyrics.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "center"
            });
        }
    }
}

function refreshTranslation() {
    const tag = document.getElementById("translated");
    if (tag) {
        tag.remove();
        restoreLyrics();
    }
    translate();
}

// Optional: Clear cache function
function clearTranslationCache() {
    translationCache.clear();
    console.log('Translation cache cleared');
}
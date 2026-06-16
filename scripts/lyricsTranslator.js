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

// AI batch translation cache
const aiBatchCache = new Map();

// Active mutation observers
const mutationObservers = new Map();

// To modify if spotify decides to change variable names
const lyricLine = "div[data-testid='lyrics-line']";

// True while an AI batch translation is in flight — prevents the MutationObserver
// from falling back to Google Translate for lines that appear during the wait.
let aiBatchPending = false;

// Re-entrancy guard for translate(), set before any await.
let translateInFlight = false;

// Tracks the last song for which an AI batch completed successfully.
// Prevents re-triggering AI translation for the same song.
let lastAiSong = null;

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

function getSongInfo() {
    const titleEl = document.querySelector('[data-testid="context-item-link"]') ||
        document.querySelector('[data-testid="context-item-info-title"]') ||
        document.querySelector('a[data-testid="now-playing-track-link"]');
    const artistEl = document.querySelector('[data-testid="context-item-info-artist"]') ||
        document.querySelector('[data-testid="context-item-info-subtitle"]');
    return {
        songTitle: titleEl?.textContent?.trim() || '',
        artistName: artistEl?.textContent?.trim() || ''
    };
}

async function translateLineByLine(lines, sourceLanguage, destinationLanguage) {
    const results = [];
    for (const text of lines) {
        const translated = await translateText(text, sourceLanguage, destinationLanguage);
        results.push(translated != null ? translated : text);
    }
    return results;
}

async function translateBatchWithAI(lines, sourceLanguage, destinationLanguage) {
    const { songTitle, artistName } = getSongInfo();
    const cacheKey = `${lines.join('|')}|${destinationLanguage}|${songTitle}`;
    if (aiBatchCache.has(cacheKey)) {
        return aiBatchCache.get(cacheKey);
    }

    if (!isExtensionAlive()) return null;

    let response;
    try {
        response = await chrome.runtime.sendMessage({
            type: 'TRANSLATE_BATCH',
            lines,
            songTitle,
            artistName,
            sourceLanguage,
            destinationLanguage
        });
    } catch {
        return null;
    }

    if (!response || response.error) {
        if (response?.error) console.error('AI batch translation error:', response.error);
        return null;
    }

    const translations = response.translations || [];
    aiBatchCache.set(cacheKey, translations);
    return translations;
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

    // Reset AI state so a fresh batch can run for the next song
    lastAiSong = null;

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
        } catch { }
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

// Batch translate all lyrics with AI, then render them
async function translateBatchWithAIAndRender(sourceLanguage, destinationLanguage) {
    const lyricsWrapperList = document.querySelectorAll(lyricLine);

    if (lyricsWrapperList.length === 0) {
        console.log("Translatify: lyrics not found, retrying..");
        return setTimeout(translate, 100);
    }

    const { songTitle, artistName } = getSongInfo();
    const songId = `${songTitle}|${artistName}|${destinationLanguage}`;
    // Only trust songId when a title resolved; otherwise different songs
    // collapse to "||<lang>" and reuse each other's cache.
    const hasSongId = songTitle !== '';

    // If AI already translated this song, just render visible wrappers from
    // the line-level cache — no API call needed.
    if (hasSongId && lastAiSong === songId) {
        const currentWrappers = Array.from(document.querySelectorAll(lyricLine));
        currentWrappers.forEach(wrapper => {
            if (wrapper.classList.contains("modifedLyricsWrapper")) return;
            const text = wrapper.firstChild?.textContent || '';
            const cacheKey = `${text}|${sourceLanguage}|${destinationLanguage}`;
            const cached = translationCache.get(cacheKey);
            if (cached != null) {
                replaceLyric(cached, wrapper);
            }
        });
        focusActiveLyric();
        return;
    }

    const wrappers = Array.from(lyricsWrapperList);
    const lines = wrappers.map(w => w.firstChild?.textContent || '');

    // Start the MutationObserver now so that lyrics appearing during the AI
    // call get Google-translated immediately.  Once the AI batch completes,
    // all visible translations are replaced with the AI results.
    setupMutationObserver();

    aiBatchPending = true;

    const translations = await translateBatchWithAI(lines, sourceLanguage, destinationLanguage);

    aiBatchPending = false;

    if (!translations || !Array.isArray(translations)) {
        console.warn('Translatify: AI batch returned non-array, falling back to Google');
        await translateLineByLineWithGoogle(sourceLanguage, destinationLanguage);
        return;
    }

    if (hasSongId) lastAiSong = songId;

    // Populate line-level cache from the AI batch so the MutationObserver picks
    // up AI translations instead of falling back to Google.
    for (let i = 0; i < lines.length; i++) {
        if (translations[i] != null && lines[i]) {
            translationCache.set(`${lines[i]}|${sourceLanguage}|${destinationLanguage}`, translations[i]);
        }
    }

    // Render all currently-visible wrappers.  The DOM may have changed during
    // the AI call (Spotify virtual scrolling), so re-query and match by text.
    // Wrappers already translated by Google (aiBatchPending was off, so the
    // MutationObserver ran Google fallback) get their text updated in-place
    // with the AI result.  Unmodified wrappers get the full replaceLyric treatment.
    const currentWrappers = Array.from(document.querySelectorAll(lyricLine));
    currentWrappers.forEach(wrapper => {
        const text = wrapper.firstChild?.textContent || '';
        const cacheKey = `${text}|${sourceLanguage}|${destinationLanguage}`;
        const aiTranslation = translationCache.get(cacheKey);
        if (aiTranslation == null) return;

        if (wrapper.classList.contains("modifedLyricsWrapper")) {
            const newLyrics = wrapper.querySelector(".newLyrics");
            if (newLyrics) {
                newLyrics.innerText = aiTranslation;
            }
        } else {
            replaceLyric(aiTranslation, wrapper);
        }
    });

    focusActiveLyric();
    setupMutationObserver();
}

// MAIN TRANSLATION FUNCTION
async function translate() {
    if (!isExtensionAlive()) return;

    // Prevent overlapping calls — translate() fires on many UI events, and the
    // guard must be set before runTranslate's awaits to be effective.
    if (aiBatchPending || translateInFlight) return;
    translateInFlight = true;
    try {
        await runTranslate();
    } finally {
        translateInFlight = false;
    }
}

async function runTranslate() {
    // Skip if all visible lyrics are already translated — prevents
    // unnecessary re-translation when clicking unrelated UI elements.
    const visibleWrappers = document.querySelectorAll(lyricLine);
    if (visibleWrappers.length > 0) {
        const allTranslated = Array.from(visibleWrappers).every(w =>
            w.classList.contains("modifedLyricsWrapper")
        );
        if (allTranslated) return;
    }

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
        // Gate on provider + endpoint; the background reads the rest and falls
        // back to Google if it isn't configured.
        const settings = await chrome.storage.local.get(['translationProvider', 'aiEndpoint']);
        // Show the loading indicator only while lyrics are actually being fetched/rendered.
        setTranslatingIndicator(true);
        try {
            if (settings.translationProvider === 'customAI' && settings.aiEndpoint) {
                await translateBatchWithAIAndRender(sourceLanguage, destinationLanguage);
            } else {
                await translateLineByLineWithGoogle(sourceLanguage, destinationLanguage);
            }
        } finally {
            setTranslatingIndicator(false);
        }
    } else if (translateButton.getAttribute("aria-pressed") == "false") {
        restoreLyrics();
        focusActiveLyric();
    }
}

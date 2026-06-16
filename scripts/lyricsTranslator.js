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

// In-flight TRANSLATE requests, keyed by cacheKey, so concurrent identical
// requests (e.g. repeated chorus lines) collapse into a single network call
// instead of each missing the not-yet-populated cache and firing their own.
const inFlightTranslations = new Map();

// Active mutation observers
const mutationObservers = new Map();

// To modify if spotify decides to change variable names
const lyricLine = "div[data-testid='lyrics-line']";

// True while an AI batch translation is in flight. Used as a re-entrancy guard in
// translate() so overlapping UI events don't kick off a second pass during the wait.
// Lines that appear mid-wait are intentionally Google-translated for responsiveness
// and replaced with the AI result once the batch resolves.
let aiBatchPending = false;

// When true (default), AI mode shows Google translations immediately while the AI
// batch loads. When false, lyrics stay untranslated until the AI result arrives and
// the MutationObserver does not Google-translate lines that appear during the wait.
let aiFailoverEnabled = true;

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

    // Collapse concurrent identical requests (repeated lines) into one network call.
    if (inFlightTranslations.has(cacheKey)) {
        return inFlightTranslations.get(cacheKey);
    }

    if (!isExtensionAlive()) return null;

    const requestPromise = (async () => {
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
    })();

    inFlightTranslations.set(cacheKey, requestPromise);
    try {
        return await requestPromise;
    } finally {
        inFlightTranslations.delete(cacheKey);
    }
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

// Clear cached translations, then restore and re-translate so fresh results are
// fetched. scope 'all' wipes every cache; scope 'song' clears only the entries for
// the currently-playing song.
function clearTranslationCache(scope) {
    if (scope === 'all') {
        translationCache.clear();
        aiBatchCache.clear();
    } else {
        // Drop line-level entries for the visible lyrics. A translated wrapper keeps
        // its original text in .originalLyrics; an untranslated one in firstChild.
        document.querySelectorAll(lyricLine).forEach(wrapper => {
            const original = wrapper.querySelector('.originalLyrics');
            const text = original ? original.innerText : (wrapper.firstChild?.textContent || '');
            if (!text) return;
            for (const key of translationCache.keys()) {
                if (key.startsWith(`${text}|`)) translationCache.delete(key);
            }
        });
        // Drop AI batch entries for the current song (key ends with |<songTitle>).
        const { songTitle } = getSongInfo();
        if (songTitle) {
            for (const key of aiBatchCache.keys()) {
                if (key.endsWith(`|${songTitle}`)) aiBatchCache.delete(key);
            }
        }
    }
    // restoreLyrics() also resets lastAiSong so AI re-runs for this song.
    restoreLyrics();
    translate();
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
                } else if (!(aiBatchPending && !aiFailoverEnabled)) {
                    // Skip Google fallback for new lines while an AI batch is in flight
                    // and failover is disabled — the AI result will translate them.
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

    // Failover (on by default): Google-translate ALL current lyrics concurrently while
    // the (slower) AI batch runs, so the user sees results immediately instead of
    // staring at a blank wait. This renders progressively; the AI result overwrites it
    // once it lands. When disabled, lyrics stay untranslated until the AI result arrives.
    try {
        const stored = await chrome.storage.local.get(['aiFailover']);
        aiFailoverEnabled = stored.aiFailover !== undefined ? stored.aiFailover : true;
    } catch {
        aiFailoverEnabled = true;
    }

    const googlePass = aiFailoverEnabled
        ? translateLineByLineWithGoogle(sourceLanguage, destinationLanguage)
            .catch(err => console.error('Translatify: Google pre-pass error:', err))
        : Promise.resolve();

    const translations = await translateBatchWithAI(lines, sourceLanguage, destinationLanguage);

    aiBatchPending = false;

    if (!translations || !Array.isArray(translations)) {
        console.warn('Translatify: AI batch returned non-array, falling back to Google');
        // With failover on, the Google pass already translated every line — just let it
        // finish. With failover off, nothing was translated, so run Google now.
        if (aiFailoverEnabled) {
            await googlePass;
        } else {
            await translateLineByLineWithGoogle(sourceLanguage, destinationLanguage);
        }
        // Signal that the AI endpoint failed so the button can show an error marker.
        return false;
    }

    if (hasSongId) lastAiSong = songId;

    // Let every Google response land before making the AI result authoritative, so a
    // late Google write can't clobber the AI translation in translationCache.
    await googlePass;

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
        let aiErrored = false;
        try {
            if (settings.translationProvider === 'customAI' && settings.aiEndpoint) {
                aiErrored = (await translateBatchWithAIAndRender(sourceLanguage, destinationLanguage)) === false;
            } else {
                await translateLineByLineWithGoogle(sourceLanguage, destinationLanguage);
            }
        } finally {
            setTranslatingIndicator(false);
        }
        // Swap the loading dots for an error marker when the AI endpoint failed.
        if (aiErrored) setTranslateError(true);
    } else if (translateButton.getAttribute("aria-pressed") == "false") {
        setTranslateError(false);
        restoreLyrics();
        focusActiveLyric();
    }
}

// False after the extension is reloaded/updated and this content script is orphaned.
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

// In-flight TRANSLATE requests keyed by cacheKey, so concurrent identical
// requests (e.g. repeated chorus lines) share one network call.
const inFlightTranslations = new Map();

// Observer state used to process mutations synchronously
let observerState = { provider: null, mode: null, readProviders: [], sourceLanguage: 'auto', destinationLanguage: 'en' };

function updateObserverState(provider, mode, readProviders, sourceLanguage, destinationLanguage) {
    observerState = { 
        provider, 
        mode, 
        readProviders: readProviders || [provider], 
        sourceLanguage, 
        destinationLanguage 
    };
}

// DLX batch fallback: observer cache-misses queued here, batch-translated
// after a short debounce.
const dlxPendingMisses = [];
let dlxDebounceTimer = null;
// True while a DLX request is in flight; keeps the observer from firing another
// batch (or per-line requests) until it finishes.
let dlxBatchInFlight = false;

// To modify if spotify decides to change variable names
const lyricLine = "div[data-testid='lyrics-line']";

// True while an AI batch translation is in flight; re-entrancy guard for translate().
let aiBatchPending = false;

// When true (default), AI mode shows Google translations while the AI batch loads.
let aiFailoverEnabled = true;

// Provider-namespaced cache key (google, dlx, customAI) so each provider's
// cached results stay separate.
function lineCacheKey(provider, text, sourceLanguage, destinationLanguage) {
    return `${provider}|${text}|${sourceLanguage}|${destinationLanguage}`;
}

// Re-entrancy guard for translate(), set before any await.
let translateInFlight = false;
// A translate() request that arrived while a pass was running; re-runs after
// it finishes so popup changes (e.g. target language) are always applied.
let translateQueued = false;
// True while a queued re-run is active; the translate-button observer skips
// its catch-up translate so a settings-change re-run doesn't re-trigger itself.
let retranslateGuard = false;

// Last song an AI batch completed for; prevents re-translating it.
let lastAiSong = null;

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

async function translateText(provider, text, sourceLanguage, destinationLanguage) {
    if (isUntranslatable(text)) return text;

    const cacheKey = lineCacheKey(provider, text, sourceLanguage, destinationLanguage);
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
                provider,
                lines: [text],
                sourceLanguage,
                destinationLanguage
            });
        } catch {
            return null;
        }

        if (!response || response.error || !Array.isArray(response.translations)) {
            if (response?.error) console.error('Error:', response.error);
            return null;
        }

        const result = response.translations[0];
        if (result == null) return null;
        translationCache.set(cacheKey, result);
        return result;
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
            type: 'TRANSLATE',
            provider: 'customAI',
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

// Clear cached translations, then restore and re-translate. scope 'all' wipes
// every cache; scope 'song' clears only the current song's entries.
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
            // Keys are provider-prefixed (see lineCacheKey) — clear the line for
            // every registered provider.
            for (const key of translationCache.keys()) {
                if (Object.keys(TRANSLATION_PROVIDERS).some(id => key.startsWith(`${id}|${text}|`))) {
                    translationCache.delete(key);
                }
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
    // Clear pending DLX batch state.
    if (dlxDebounceTimer) { clearTimeout(dlxDebounceTimer); dlxDebounceTimer = null; }
    dlxPendingMisses.length = 0;
    dlxBatchInFlight = false;
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


// Batch-translate queued DLX cache-miss lines after a short debounce (one
// request, not one per line). On failure, show the error marker and stop.
function scheduleDlxBatch() {
    if (dlxDebounceTimer) clearTimeout(dlxDebounceTimer);
    dlxDebounceTimer = setTimeout(runDlxObserverBatch, 200);
}

async function runDlxObserverBatch() {
    // One DLX request at a time: while a batch is in flight, leave the misses
    // queued — the running batch flushes them when it finishes.
    if (dlxBatchInFlight) return;

    const pending = dlxPendingMisses.splice(0);
    console.log('Translatify: DLX observer batch executing for', pending.length, 'lines');
    if (pending.length === 0 || !isExtensionAlive()) return;

    const sourceLanguage = pending[0].sourceLanguage;
    const destinationLanguage = pending[0].destinationLanguage;
    const uniqueLines = [...new Set(pending.map(p => p.lyricsText))];

    let response;
    dlxBatchInFlight = true;
    try {
        response = await chrome.runtime.sendMessage({
            type: 'TRANSLATE',
            provider: 'dlx',
            lines: uniqueLines,
            sourceLanguage,
            destinationLanguage
        });
    } catch {
        return; // extension context gone
    } finally {
        dlxBatchInFlight = false;
    }

    // On failure, show the error marker and leave the lines untranslated
    // (no per-line fan-out).
    if (!response || response.error || !Array.isArray(response.translations)) {
        if (response?.error) console.error('Translatify: DLX observer batch failed:', response.error);
        setTranslateError(true);
        return;
    }

    uniqueLines.forEach((text, i) => {
        if (response.translations[i] != null) {
            translationCache.set(lineCacheKey('dlx', text, sourceLanguage, destinationLanguage), response.translations[i]);
        }
    });

    pending.forEach(({ wrapper, lyricsText }) => {
        if (wrapper.classList.contains("modifedLyricsWrapper")) return;
        const translated = translationCache.get(lineCacheKey('dlx', lyricsText, sourceLanguage, destinationLanguage));
        if (translated != null) replaceLyric(translated, wrapper);
    });

    // Flush misses that queued while this batch was in flight.
    if (dlxPendingMisses.length > 0) scheduleDlxBatch();
}

function processLyricsMutations(mutations) {
    if (!observerState.provider) return false;
    const translateButton = document.querySelector("button[data-testid='translate-button']");
    if (!translateButton || translateButton.getAttribute("aria-pressed") !== "true") return false;

    let hasNewUntranslated = false;

    const processWrapper = (wrapper) => {
        if (wrapper.classList.contains("modifedLyricsWrapper")) return;
        const lyricsText = wrapper.firstChild?.textContent;
        if (!lyricsText) return;

        // Render from cache, checking read namespaces in priority order.
        for (const ns of observerState.readProviders) {
            const key = lineCacheKey(ns, lyricsText, observerState.sourceLanguage, observerState.destinationLanguage);
            if (translationCache.has(key)) {
                replaceLyric(translationCache.get(key), wrapper);
                focusActiveLyric();
                return;
            }
        }

        if (observerState.provider === 'dlx') {
            // Untranslatable lines (♪, pure punctuation) are marked as
            // themselves; only real text needs a DLX request.
            if (isUntranslatable(lyricsText)) {
                replaceLyric(lyricsText, wrapper);
            } else if (observerState.mode === 'batch') {
                // Queue for one debounced batch request per burst of new lines.
                dlxPendingMisses.push({ wrapper, lyricsText, sourceLanguage: observerState.sourceLanguage, destinationLanguage: observerState.destinationLanguage });
                scheduleDlxBatch();
            } else {
                // Per-line mode: honor the user's choice for late lines too.
                translateAndUpdateAsync('dlx', wrapper, lyricsText, observerState.sourceLanguage, observerState.destinationLanguage);
            }
        } else if (!(aiBatchPending && !aiFailoverEnabled)) {
            translateAndUpdateAsync(observerState.provider, wrapper, lyricsText, observerState.sourceLanguage, observerState.destinationLanguage);
        }
        focusActiveLyric();
        hasNewUntranslated = true;
    };

    for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.matches?.(lyricLine)) {
                processWrapper(node);
            } else {
                // A full lyrics-page mount adds one container node with the
                // lyric lines as descendants — translate those too.
                node.querySelectorAll?.(lyricLine).forEach(processWrapper);
            }
        }
    }
    
    return hasNewUntranslated;
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

async function translateAndUpdateAsync(provider, lyricsWrapper, lyricsText, sourceLanguage, destinationLanguage) {
    try {
        const translatedLine = await translateText(provider, lyricsText, sourceLanguage, destinationLanguage);
        if (translatedLine != null) {
            replaceLyric(translatedLine, lyricsWrapper);
        }
    } catch (error) {
        console.error('Error translating line:', error);
    }
}

// Translate every visible lyric line with the given provider, then attach the
// mutation observer to translate any new lines Spotify renders later.
async function translatePerLine(provider, sourceLanguage, destinationLanguage) {
    const lyricsWrapperList = document.querySelectorAll(lyricLine);

    if (lyricsWrapperList.length === 0) {
        console.log("Translatify: lyrics not found, retrying..");
        return setTimeout(translate, 100);
    }

    const promises = Array.from(lyricsWrapperList).map(async (wrapper) => {
        const lyrics = wrapper.firstChild?.textContent;
        if (!lyrics) return;
        const translatedLine = await translateText(provider, lyrics, sourceLanguage, destinationLanguage);
        if (translatedLine != null) replaceLyric(translatedLine, wrapper);
    });
    await Promise.all(promises);

    focusActiveLyric();
    // Keep the observer in per-line mode for late lines.
    updateObserverState(provider, 'perline', null, sourceLanguage, destinationLanguage);
}

// Translate the whole lyric sheet in one DLX request (DLX preserves newlines),
// then render every wrapper from the cache. On batch failure, signal
// runTranslate — no per-line fan-out.
async function translateBatchWithDlx(sourceLanguage, destinationLanguage) {
    const lyricsWrapperList = document.querySelectorAll(lyricLine);

    if (lyricsWrapperList.length === 0) {
        console.log("Translatify: lyrics not found, retrying..");
        return setTimeout(translate, 100);
    }

    // Unique lines that actually need a request: translatable and not cached.
    const uncached = [...new Set(
        Array.from(lyricsWrapperList)
            .map(w => w.firstChild?.textContent)
            .filter(text => text && !isUntranslatable(text) &&
                !translationCache.has(lineCacheKey('dlx', text, sourceLanguage, destinationLanguage)))
    )];

    if (uncached.length > 0) {
        if (!isExtensionAlive()) return;
        let response;
        dlxBatchInFlight = true;
        try {
            response = await chrome.runtime.sendMessage({
                type: 'TRANSLATE',
                provider: 'dlx',
                lines: uncached,
                sourceLanguage,
                destinationLanguage
            });
        } catch {
            response = null;
        } finally {
            dlxBatchInFlight = false;
        }

        if (!response || response.error || !Array.isArray(response.translations)) {
            if (response?.error) console.error('Translatify: DLX batch failed:', response.error);
            return false;   // signal failure to runTranslate; no per-line fan-out, no retry
        }

        uncached.forEach((text, i) => {
            if (response.translations[i] != null) {
                translationCache.set(lineCacheKey('dlx', text, sourceLanguage, destinationLanguage), response.translations[i]);
            }
        });
    }

    // Render every visible wrapper from the cache (re-query — the DOM may have
    // changed). Untranslatable lines are marked as themselves.
    document.querySelectorAll(lyricLine).forEach(wrapper => {
        if (wrapper.classList.contains("modifedLyricsWrapper")) return;
        const text = wrapper.firstChild?.textContent;
        if (!text) return;
        const translated = isUntranslatable(text)
            ? text
            : translationCache.get(lineCacheKey('dlx', text, sourceLanguage, destinationLanguage));
        if (translated != null) replaceLyric(translated, wrapper);
    });

    focusActiveLyric();
    updateObserverState('dlx', 'batch', null, sourceLanguage, destinationLanguage);
    // Flush observer misses that queued while the batch was in flight.
    if (dlxPendingMisses.length > 0) scheduleDlxBatch();
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
    // Only trust songId when a title resolved (otherwise different songs
    // collapse to "||<lang>").
    const hasSongId = songTitle !== '';

    // If AI already translated this song, just render visible wrappers from
    // the line-level cache — no API call needed.
    if (hasSongId && lastAiSong === songId) {
        const currentWrappers = Array.from(document.querySelectorAll(lyricLine));
        currentWrappers.forEach(wrapper => {
            if (wrapper.classList.contains("modifedLyricsWrapper")) return;
            const text = wrapper.firstChild?.textContent || '';
            const cacheKey = lineCacheKey('customAI', text, sourceLanguage, destinationLanguage);
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

    // Start the observer now so lyrics appearing during the AI call get
    // Google-translated; it reads 'customAI' first, then 'google'.
    updateObserverState('google', undefined, ['customAI', 'google'], sourceLanguage, destinationLanguage);

    aiBatchPending = true;

    // Failover (on by default): Google-translate all lyrics while the AI batch
    // runs; the AI result overwrites them once it lands.
    try {
        const stored = await chrome.storage.local.get(['aiFailover']);
        aiFailoverEnabled = stored.aiFailover !== undefined ? stored.aiFailover : true;
    } catch {
        aiFailoverEnabled = true;
    }

    const googlePass = aiFailoverEnabled
        ? translatePerLine('google', sourceLanguage, destinationLanguage)
            .catch(err => console.error('Translatify: Google pre-pass error:', err))
        : Promise.resolve();

    const translations = await translateBatchWithAI(lines, sourceLanguage, destinationLanguage);

    aiBatchPending = false;

    if (!translations || !Array.isArray(translations)) {
        console.warn('Translatify: AI batch returned non-array, falling back to Google');
        // Failover on: let the Google pass finish. Off: run Google now.
        if (aiFailoverEnabled) {
            await googlePass;
        } else {
            await translatePerLine('google', sourceLanguage, destinationLanguage);
        }
        // Signal that the AI endpoint failed so the button can show an error marker.
        return false;
    }

    if (hasSongId) lastAiSong = songId;

    // Let the Google pass finish before caching the AI results.
    await googlePass;

    // Cache the AI batch results under Custom AI's 'customAI' namespace; the
    // fast path above and the render loop below read them back.
    for (let i = 0; i < lines.length; i++) {
        if (translations[i] != null && lines[i]) {
            translationCache.set(lineCacheKey('customAI', lines[i], sourceLanguage, destinationLanguage), translations[i]);
        }
    }

    // Render all visible wrappers (re-query — the DOM may have changed).
    // Already-translated wrappers get their text updated in place; others
    // get replaceLyric.
    const currentWrappers = Array.from(document.querySelectorAll(lyricLine));
    currentWrappers.forEach(wrapper => {
        const text = wrapper.firstChild?.textContent || '';
        const cacheKey = lineCacheKey('customAI', text, sourceLanguage, destinationLanguage);
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
    updateObserverState('google', undefined, ['customAI', 'google'], sourceLanguage, destinationLanguage);
}

// MAIN TRANSLATION FUNCTION
async function translate() {
    if (!isExtensionAlive()) return;

    // Prevent overlapping calls; the guard must be set before runTranslate's awaits.
    // A request during a running pass (e.g. target-language change from the
    // popup) is queued instead of dropped, so it still applies afterwards.
    if (aiBatchPending || translateInFlight) {
        translateQueued = true;
        return;
    }
    translateInFlight = true;
    try {
        await runTranslate();
    } finally {
        translateInFlight = false;
        const queued = translateQueued;
        translateQueued = false;
        if (queued) {
            // The finished pass may have re-translated the lyrics with the old
            // settings — restore, then re-run with the current ones. The guard
            // keeps the observer's catch-up translate from re-triggering this.
            retranslateGuard = true;
            restoreLyrics();
            translate();
        } else {
            retranslateGuard = false;
        }
    }
}

async function runTranslate() {
    // Skip if all visible lyrics are already translated.
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
        // Resolve the provider from the registry: the configured one when its
        // required settings are present, Google otherwise.
        const settings = await chrome.storage.local.get(PROVIDER_SETTING_KEYS);
        const resolved = resolveTranslationProvider(settings);
        const mode = resolveTranslationMode(resolved, settings);
        // Show the loading indicator while lyrics are fetched/rendered.
        setTranslatingIndicator(true);
        let providerErrored = false;
        try {
            if (resolved.id === 'customAI') {
                providerErrored = (await translateBatchWithAIAndRender(sourceLanguage, destinationLanguage)) === false;
            } else if (resolved.id === 'dlx' && mode === 'batch') {
                providerErrored = (await translateBatchWithDlx(sourceLanguage, destinationLanguage)) === false;
            } else {
                await translatePerLine(resolved.id, sourceLanguage, destinationLanguage);
            }
        } finally {
            setTranslatingIndicator(false);
        }
        // Show the error marker when the provider's batch failed, or when a
        // misconfigured provider fell back to Google.
        if (resolved.fallback) {
            console.warn(`Translatify: provider "${settings.translationProvider}" is missing required settings, used ${resolved.id} instead`);
        }
        if (providerErrored || resolved.fallback) setTranslateError(true);
    } else if (translateButton.getAttribute("aria-pressed") == "false") {
        setTranslateError(false);
        restoreLyrics();
        focusActiveLyric();
    }
}

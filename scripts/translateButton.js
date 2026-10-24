// Erases previous translation button
function eraseButton() {
    const translationButton = document.querySelector("button[data-testid='translate-button']");
    if (translationButton) {
        translationButton.remove();
    }
    const loadingIndicator = document.querySelector("span[data-testid='translate-loading']");
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

// Shows/hides the 3-dot loading indicator while lyrics are being translated.
// Starting a new translation also clears any previous error marker.
function setTranslatingIndicator(active) {
    const loader = document.querySelector("span[data-testid='translate-loading']");
    if (!loader) return;
    loader.classList.toggle("is-loading", !!active);
    if (active) loader.classList.remove("has-error");
}

// Shows/hides the "!" error marker on the translate button (e.g. AI endpoint failed).
function setTranslateError(active) {
    const loader = document.querySelector("span[data-testid='translate-loading']");
    if (loader) loader.classList.toggle("has-error", !!active);
}

// Applies each provider's indicator class from the registry to the translate
// button (e.g. the rainbow-hue class while Custom AI is selected).
function updateTranslateButtonProviderState() {
    const translateButton = document.querySelector("button[data-testid='translate-button']");
    if (!translateButton || !isExtensionAlive()) return;
    chrome.storage.local.get(['translationProvider']).then(result => {
        for (const [id, spec] of Object.entries(TRANSLATION_PROVIDERS)) {
            if (!spec.buttonClass) continue;
            translateButton.classList.toggle(spec.buttonClass, result.translationProvider === id);
        }
    }).catch(() => {});
}

// Button the translate button is cloned from and placed next to. Falls back to
// the last player control if Spotify renames the repeat button.
function getAnchorButton() {
    return findLastSpotify('anchorButton');
}

// Startup time, so loadChecker can report what it is still waiting for.
const loadCheckerStart = Date.now();
let loadCheckerWarned = false;

// Wait for the player bar before adding the translate button. Lyrics that
// mount later are picked up by translate() and the observer.
function loadChecker() {
    var repeatButton = getAnchorButton();

    if (repeatButton) {
        addTranslateButton();
        enableTranslateButton();
        setupListening();
        updateTranslateButtonProviderState();

        // Check if the translate button was enabled on previous session
        chrome.storage.local.get(["translateButton"]).then((result) => {
            if (result.translateButton) {
                toggleTranslateButton();
            }
        });

    } else {
        // Log once what is missing, so a Spotify rename shows up in the console.
        if (!loadCheckerWarned && Date.now() - loadCheckerStart > 10000) {
            loadCheckerWarned = true;
            console.warn("Translatify: still waiting for Spotify elements: anchorButton");
        }
        setTimeout(loadChecker, 100);
    }
}

// Re-injects the translate button if Spotify re-rendered the control bar.
// Idempotent — does nothing when the button is already present, so it's safe
// to call from the observer on every mutation batch.
function ensureTranslateButton() {
    if (!isExtensionAlive()) return;
    const existingButton = document.querySelector("button[data-testid='translate-button']");
    if (existingButton) return; // still present, nothing to do

    const repeatButton = getAnchorButton();
    if (!repeatButton) return; // bar not ready yet

    console.log("Translatify: Translate button missing, re-injecting (control bar re-rendered)");
    eraseButton(); // safety: clear any stale leftover loader
    addTranslateButton();
    enableTranslateButton();
    updateTranslateButtonProviderState();

    // Re-apply the enabled state from the previous session.
    chrome.storage.local.get(["translateButton"]).then((result) => {
        if (result.translateButton) {
            toggleTranslateButton();
        }
    }).catch(() => {});
}

// The single, stable observer, rooted on #main-view (never torn down by
// Spotify), so it never goes stale.
let listeningObserver = null;

// Last now-playing track key; re-translate only when the song actually changes.
let lastNowPlayingKey = '';

// Idempotent if called repeatedly. Holds one observer reference.
function setupListening() {
    if (listeningObserver) return; // already observing — nothing to do

    // Anchor that survives every Spotify re-render, so the observer never needs
    // re-attaching.
    const anchor = document.documentElement;
    if (!anchor) {
        // root not present yet — poll until the app shell mounts.
        return setTimeout(setupListening, 300);
    }

    // Delegated click handler on the stable anchor. Reacts only to clicks that
    // land on a button, so other interactions don't fire translate().
    anchor.addEventListener('click', (event) => {
        if (event.target.closest("button")) {
            enableTranslateButton();
            translate();
            // Literal double check with delay to let lyrics mount (e.g. lyrics toggle)
            setTimeout(() => {
                enableTranslateButton();
                translate();
            }, 300);
        }
    });

    // Detect a song change via the track title link, so the key only changes
    // when the song does.
    const songChanged = () => {
        const { songTitle, artistName } = getSongInfo();
        // Require a valid track title; getSongInfo() can momentarily return
        // empty strings during a track transition.
        if (!songTitle) return false;
        const key = `${songTitle}|${artistName}`;
        if (key === lastNowPlayingKey) return false;
        lastNowPlayingKey = key;
        return true;
    };

    // One observer over the whole subtree, childList only (attributes would
    // flood the callback with highlight/progress churn).
    const observer = new MutationObserver((mutations) => {
        const isChildList = mutations.some(m => m.type === 'childList');
        
        if (isChildList) {
            ensureTranslateButton();            // re-inject only if missing (idempotent)
            
            if (typeof processLyricsMutations === 'function') {
                processLyricsMutations(mutations);
            }
        }

        if (songChanged()) {
            setTimeout(translate, 100);     // new song → re-translate lyrics
        }
        
        setTimeout(enableTranslateButton, 0);
    });
    observer.observe(anchor, { subtree: true, childList: true });
    listeningObserver = observer;
    console.log('Translatify: listening on stable anchor', anchor);
}

// Translates the lyrics
function toggleTranslateButton() {
    if (!isExtensionAlive()) return;
    const translateButton = document.querySelector("button[data-testid='translate-button']");
    if (!translateButton) return;

    if (translateButton.getAttribute("aria-pressed") == "false") {
        translateButton.setAttribute("aria-pressed", "true");
        translateButton.classList.remove("encore-internal-color-text-subdued");
        translateButton.classList.add("encore-internal-color-text-brightAccent");

        try { chrome.storage.local.set({translateButton:true}).catch(() => {}); } catch {}
    } else {
        translateButton.setAttribute("aria-pressed", "false");
        translateButton.classList.remove("encore-internal-color-text-brightAccent");
        translateButton.classList.add("encore-internal-color-text-subdued");

        try { chrome.storage.local.set({translateButton:false}).catch(() => {}); } catch {}
    }

    translate();

}

function enableTranslateButton() {
    const translateButton = document.querySelector("button[data-testid='translate-button']");
    if (!translateButton) return;

    // Only disable when Spotify's lyrics button exists and says lyrics are
    // closed; a missing or renamed lyrics button must not block translation.
    translateButton.disabled = !!findSpotify('lyricsButton') && !isLyricsOpen();
}


function addTranslateButton() {
    const repeatButton = getAnchorButton();
    const buttonBar = repeatButton.parentElement;
    const translateButton = repeatButton.cloneNode(true);

    translateButton.setAttribute("data-testid", "translate-button");
    translateButton.setAttribute("aria-pressed", "false");
    translateButton.removeAttribute("aria-checked");
    translateButton.setAttribute("role", "button");
    // Keep the clone's Encore classes so Spotify's CSS styles the button; add
    // our marker class and start it in the subdued state.
    translateButton.classList.add("translateButton");
    translateButton.classList.remove("encore-internal-color-text-brightAccent");
    if (!translateButton.classList.contains("encore-internal-color-text-subdued")) {
        translateButton.classList.add("encore-internal-color-text-subdued");
    }

    const svgButton = translateButton.querySelector("svg");
    svgButton.innerHTML = '<defs><linearGradient id="translatify-ai-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#16c5d6"/><stop offset="50%" stop-color="#5fd391"/><stop offset="100%" stop-color="#a4d93f"/></linearGradient></defs><path d="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z" />';
    svgButton.setAttribute("viewBox", "0 0 24 24");
    buttonBar.appendChild(translateButton);

    // Loading indicator: absolutely positioned inside the button at the top-right corner.
    const loader = document.createElement("span");
    loader.setAttribute("data-testid", "translate-loading");
    loader.className = "translatifyLoader";
    loader.setAttribute("aria-hidden", "true");
    loader.innerHTML = '<span class="translatifyDot"></span>'.repeat(3) + '<span class="translatifyError" aria-hidden="true">!</span>';
    translateButton.appendChild(loader);

    translateButton.addEventListener('click', toggleTranslateButton);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(msgObj => {
    if (msgObj.toggleTranslation !== undefined) {
        const translateButton = document.querySelector("button[data-testid='translate-button']");
        if (translateButton) {
            const currentState = translateButton.getAttribute("aria-pressed") === "true";
            if (currentState !== msgObj.toggleTranslation) {
                toggleTranslateButton();
            }
        }
    }
    if (msgObj.updateTranslationProvider !== undefined || msgObj.updateAiSettings !== undefined) {
        updateTranslateButtonProviderState();
    }
});

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
function setTranslatingIndicator(active) {
    const loader = document.querySelector("span[data-testid='translate-loading']");
    if (loader) loader.classList.toggle("is-loading", !!active);
}

// Toggles the rainbow-hue AI indicator class on the translate button.
function updateTranslateButtonAIState() {
    const translateButton = document.querySelector("button[data-testid='translate-button']");
    if (!translateButton || !isExtensionAlive()) return;
    chrome.storage.local.get(['translationProvider']).then(result => {
        translateButton.classList.toggle('translateButton--ai', result.translationProvider === 'customAI');
    }).catch(() => {});
}

// Wait for all the buttons to load before adding the translate button
function loadChecker() {
    var repeatButton = document.querySelector("button[data-testid='control-button-repeat']");
    var nowPlaying = document.querySelector("div[data-testid='now-playing-widget']");
    var lyricsButton = document.querySelector("button[data-testid='lyrics-button']");
    var lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");

    if (repeatButton && nowPlaying && lyricsButton && (lyricsButton.getAttribute("data-active") == "false" || lyricsWrapperList[0])) {
        addTranslateButton();
        enableTranslateButton();
        setupListening();
        updateTranslateButtonAIState();

        // Check if the translate button was enabled on previous session
        chrome.storage.local.get(["translateButton"]).then((result) => {
            if (result.translateButton) {
                toggleTranslateButton();
            }
        });

    } else {
        setTimeout(loadChecker, 100);
    }
}

// Sets up all the event listeners
function setupListening() {
    const buttonList = document.querySelectorAll("button");
    const translateButton = document.querySelector("button[data-testid='translate-button']");
    const lyricsButton = document.querySelector("button[data-testid='lyrics-button']");
    const nowPlaying = document.querySelector("div[data-testid='now-playing-widget']");

    buttonList.forEach((button) => {
        button.addEventListener("click", translate);
        button.addEventListener("click", enableTranslateButton);
    });
    
    translateButton.removeEventListener("change",translate);
    translateButton.removeEventListener("click",translate);
    
    // Listen for changes in the now playing widget
    var nowPlayingObserver = new MutationObserver(function(mutationsList, nowPlayingObserver) {
        setTimeout(translate, 100);
        console.log('Translatify: Next music');
    });
    nowPlayingObserver.observe(nowPlaying, { attributes: true});

    // Listen for changes in the button bar
    const rightButtonBar = lyricsButton.parentNode;
    // Only works on the button bar
    var rightButtonBarObserver = new MutationObserver(function(mutationsList, rightButtonBarObserver) {
        console.log('Translatify: Button bar changed');
        setTimeout(enableTranslateButton, 0);
        translate();
        
    });
    rightButtonBarObserver.observe(rightButtonBar, { subtree: true, childList: true});


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
    const lyricsButton = document.querySelector("button[data-testid='lyrics-button']");
    if (!translateButton || !lyricsButton) return;

    translateButton.disabled = lyricsButton.getAttribute("data-active") !== "true";
}


function addTranslateButton() {
    const repeatButton = document.querySelector("button[data-testid='control-button-repeat']");
    const buttonBar = repeatButton.parentElement;
    const translateButton = repeatButton.cloneNode(true);

    translateButton.setAttribute("data-testid", "translate-button");
    translateButton.setAttribute("aria-pressed", "false");
    translateButton.removeAttribute("aria-checked");
    translateButton.setAttribute("role", "button");
    // Keep all Encore design-system classes from the clone so Spotify's own CSS
    // handles sizing, padding, and hover states. Only add our marker class and
    // ensure the button starts in the inactive (subdued) colour state.
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
    loader.innerHTML = '<span class="translatifyDot"></span>'.repeat(3);
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
        updateTranslateButtonAIState();
    }
});

//   ______                      __      __  _ ____     
//  /_  __/________ _____  _____/ /___ _/ /_(_) __/_  __
//   / / / ___/ __ `/ __ \/ ___/ / __ `/ __/ / /_/ / / /
//  / / / /  / /_/ / / / (__  ) / /_/ / /_/ / __/ /_/ / 
// /_/ /_/   \__,_/_/ /_/____/_/\__,_/\__/_/_/  \__, /  
//                                             /____/   

eraseButton();
loadChecker();
run();
console.log("Translatify: Lyrics Translator is running..");

// Determine the default target language from the browser's preferred languages.
// navigator.languages / navigator.language are supported on both Chromium and
// Firefox. The result is normalized to a code the language selector recognizes,
// and falls back to English when nothing usable is found.
function getBrowserLanguage() {
    const candidates = [];
    if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
    if (navigator.language) candidates.push(navigator.language);

    for (const raw of candidates) {
        if (!raw) continue;
        const lower = raw.toLowerCase();
        const base = lower.split('-')[0];
        if (!base) continue;
        // Chinese options are split into Simplified / Traditional.
        if (base === 'zh') {
            return /-(tw|hk|mo)\b/.test(lower) || lower.includes('hant') ? 'zh-TW' : 'zh-CN';
        }
        return base;
    }
    return 'en';
}

function run() {
    // First install cases
    chrome.storage.local.get(['translateButton'], (result) => {
        if (result.translateButton == null) {
            chrome.storage.local.set({ translateButton: true }, () => {
                toggleTranslateButton();
                console.log("Translatify: Translate button is enabled by default");
            });
        }
    }
    );
    chrome.storage.local.get(['language'], (result) => {
        let defaultLanguage = getBrowserLanguage();
        if (result.language == null) {
            chrome.storage.local.set({ language: defaultLanguage }, () => {
                console.log("Translatify: Language is set to default");
                restoreLyrics();
                translate();
            });
        }
    }
    );

    // gets the option values from the extension storage
    chrome.storage.local.get(['lyricsMode'], (result) => {

        // Apply the option values to the page
        if (result.lyricsMode) {
            if (result.lyricsMode == "replace") {
                document.documentElement.style.setProperty('--newLyricsSize', '1em');
                document.documentElement.style.setProperty("--lyricsDisplay", "none");
                document.documentElement.style.setProperty('--newLyricsOpacity', '1');
                document.documentElement.style.setProperty("--newLyricsLineHeight", "1.5em");

            } else if (result.lyricsMode == "along") {
                document.documentElement.style.setProperty('--newLyricsOpacity', '0.5');
                document.documentElement.style.setProperty('--newLyricsSize', '0.75em');
                document.documentElement.style.setProperty("--lyricsDisplay", "block");
                document.documentElement.style.setProperty("--newLyricsLineHeight", "1em");

            }
            console.log("Translatify: Lyrics size updated!");

        }
    }
    );


    chrome.storage.local.get(['newLyricsSize'], (result) => {
        if (result.newLyricsSize) {
            document.documentElement.style.setProperty('--newLyricsSize', result.newLyricsSize + 'em');
            console.log("Translatify: Lyrics size updated!");
        }
    });


    chrome.runtime.onMessage.addListener(msgObj => {
        if (msgObj.updateLanguage) {
            console.log("Translatify: Language updated!");
            restoreLyrics();
            translate();
        }

        if (msgObj.toggleTranslation !== undefined) {
            console.log("Translatify: Translation toggle updated via popup");
        }

        if (msgObj.newLyricsSize) {
            document.documentElement.style.setProperty('--newLyricsSize', msgObj.newLyricsSize + 'em');
            console.log("Translatify: Lyrics size updated!");

        }

        if (msgObj.lyricsMode) {

            if (msgObj.lyricsMode == "replace") {
                document.documentElement.style.setProperty('--newLyricsSize', '1em');
                document.documentElement.style.setProperty("--lyricsDisplay", "none");
                document.documentElement.style.setProperty('--newLyricsOpacity', '1');
                document.documentElement.style.setProperty("--newLyricsLineHeight", "1.5em");

            } else if (msgObj.lyricsMode == "along") {
                document.documentElement.style.setProperty('--newLyricsOpacity', '0.5');
                document.documentElement.style.setProperty('--newLyricsSize', '0.75em');
                document.documentElement.style.setProperty("--lyricsDisplay", "block");
                document.documentElement.style.setProperty("--newLyricsLineHeight", "1em");


            }
            console.log("Translatify: Lyrics size updated!");

        }

        if (msgObj.updateTranslationProvider) {
            console.log("Translatify: Translation provider changed to", msgObj.updateTranslationProvider);
            restoreLyrics();
            translate();
        }

        if (msgObj.updateAiSettings) {
            console.log("Translatify: AI settings updated");
            restoreLyrics();
            translate();
        }

        if (msgObj.updateAiThinkMode !== undefined) {
            console.log("Translatify: AI think mode updated to", msgObj.updateAiThinkMode);
            restoreLyrics();
            translate();
        }

        if (msgObj.updateAiFailover !== undefined) {
            console.log("Translatify: AI failover updated to", msgObj.updateAiFailover);
            aiFailoverEnabled = msgObj.updateAiFailover;
            restoreLyrics();
            translate();
        }

        if (msgObj.clearCache) {
            console.log("Translatify: clearing cache:", msgObj.clearCache);
            clearTranslationCache(msgObj.clearCache);
        }
    });
}


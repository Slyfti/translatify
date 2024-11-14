eraseButton();
loadChecker();
console.log("Translatify: Lyrics Translator is running..");

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
        refreshTranslation();
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
});
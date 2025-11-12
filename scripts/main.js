//   ______                      __      __  _ ____     
//  /_  __/________ _____  _____/ /___ _/ /_(_) __/_  __
//   / / / ___/ __ `/ __ \/ ___/ / __ `/ __/ / /_/ / / /
//  / / / /  / /_/ / / / (__  ) / /_/ / /_/ / __/ /_/ / 
// /_/ /_/   \__,_/_/ /_/____/_/\__,_/\__/_/_/  \__, /  
//                                             /____/   

eraseButton();
loadChecker();
console.log("Translatify: Lyrics Translator is running..");

// First install cases
chrome.storage.local.get(['translateButton'], (result) => {
    if (result.translateButton == null) {
        chrome.storage.local.set({translateButton: true}, () => {
            toggleTranslateButton();
            console.log("Translatify: Translate button is enabled by default");
        });
    }
}
);
chrome.storage.local.get(['language'], (result) => {
    let defaultLanguage = navigator.language;
    if (result.language == null) {
        chrome.storage.local.set({language: defaultLanguage}, () => {
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
});
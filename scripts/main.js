eraseButton();
loadChecker();
console.log("Translatify: Lyrics Translator is running..");

chrome.runtime.onMessage.addListener(msgObj => {
    if (msgObj.updateLanguage) {
        console.log("Translatify: Language updated!");
        refreshTranslation();
    }
});
const applyLanguageButton = document.getElementById('applyLanguage');
const languageSelector = document.getElementById('languageSelector');
const newLyricsSize = document.getElementById('newLyricsSize');

chrome.storage.local.get(['language'], (result) => {
    if (result.language) {
        languageSelector.value = result.language;
    }
}
);

chrome.storage.local.get(['newLyricsSize'], (result) => {
    if (result.newLyricsSize) {
        newLyricsSize.value = result.newLyricsSize;
    }
}
);



applyLanguageButton.addEventListener('click', async () => {
    const language = languageSelector.value;
    chrome.storage.local.set({language: language}).then(() => {
        console.log("Translatify: Language is set");
    });
    

    chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { updateLanguage: language });
      });
    });


    
});

newLyricsSize.addEventListener('change', async () => {
    const size = newLyricsSize.value;
    chrome.storage.local.set({newLyricsSize: size}).then(() => {
        console.log("Translatify: Change lyric size");
    });
    

    chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { newLyricsSize: size });
      });
    });


    
});


const applyLanguageButton = document.getElementById('applyLanguage');
const languageSelector = document.getElementById('languageSelector');
const newLyricsSize = document.getElementById('newLyricsSize');
const lyricsMode = document.getElementById('lyricsMode');
const translateToggle = document.getElementById('translateToggle');
const lyricsSizeValue = document.getElementById('lyricsSizeValue');

$(document).ready(function() {
    $('#languageSelector').select2();

    $('body').on('click', 'a', function(){
        chrome.tabs.create({url: $(this).attr('href')});
        return false;
      });
});

$(document).ready(function(){
    
 });

chrome.storage.local.get(['language'], (result) => {
    if (result.language) {
        languageSelector.value = result.language;
        $("#languageSelector").val(result.language).trigger("change"); // Changes the value of the select2
        
    } else {
        $("#languageSelector").val("en").trigger('change'); // Changes the value of the select2
    }
}
);

chrome.storage.local.get(['newLyricsSize'], (result) => {
    if (result.newLyricsSize) {
        newLyricsSize.value = result.newLyricsSize;
        updateLyricsSizeDisplay(result.newLyricsSize);
    } else {
        updateLyricsSizeDisplay(newLyricsSize.value);
    }
}
);

chrome.storage.local.get(['lyricsMode'], (result) => {
    if (result.lyricsMode) {
        lyricsMode.value = result.lyricsMode;
    }
}
);

// Load translate button state
chrome.storage.local.get(['translateButton'], (result) => {
    if (result.translateButton !== undefined) {
        translateToggle.checked = result.translateButton;
    } else {
        // Default to enabled if not set
        translateToggle.checked = true;
    }
});

function sendToSpotifyTabs(message) {
    chrome.tabs.query({ url: "https://open.spotify.com/*" }, tabs => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        });
    });
}

// Handle translate toggle changes
translateToggle.addEventListener('change', async () => {
    const isEnabled = translateToggle.checked;
    await chrome.storage.local.set({translateButton: isEnabled});
    sendToSpotifyTabs({ toggleTranslation: isEnabled });
});

applyLanguageButton.addEventListener('click', async () => {
    const language = languageSelector.value;
    await chrome.storage.local.set({language: language});
    sendToSpotifyTabs({ updateLanguage: language });
});


// Function to update the displayed size value
function updateLyricsSizeDisplay(size) {
    lyricsSizeValue.textContent = size + 'em';
}

// Update display while dragging the slider
newLyricsSize.addEventListener('input', () => {
    updateLyricsSizeDisplay(newLyricsSize.value);
});

newLyricsSize.addEventListener('change', async () => {
    const size = newLyricsSize.value;
    updateLyricsSizeDisplay(size);
    await chrome.storage.local.set({newLyricsSize: size});
    sendToSpotifyTabs({ newLyricsSize: size });
});

lyricsMode.addEventListener('change', async () => {
    const mode = lyricsMode.value;
    await chrome.storage.local.set({lyricsMode: mode});
    const stored = await chrome.storage.local.get(['newLyricsSize']);
    if (stored.newLyricsSize) {
        newLyricsSize.value = stored.newLyricsSize;
        updateLyricsSizeDisplay(stored.newLyricsSize);
    }
    sendToSpotifyTabs({ lyricsMode: mode });
});



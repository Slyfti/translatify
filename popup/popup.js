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

// Handle translate toggle changes
translateToggle.addEventListener('change', async () => {
    const isEnabled = translateToggle.checked;
    chrome.storage.local.set({translateButton: isEnabled}).then(() => {
        console.log("Translatify: Translation toggle updated");
    });
    
    // Update all open tabs
    chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { toggleTranslation: isEnabled });
        });
    });
});

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
    chrome.storage.local.set({newLyricsSize: size}).then(() => {
        console.log("Translatify: Change lyric size");
    });
    

    chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { newLyricsSize: size });
      });
    });


    
});

lyricsMode.addEventListener('change', async () => {
    const mode = lyricsMode.value;
    chrome.storage.local.set({lyricsMode: mode}).then(() => {
        console.log("Translatify: Change lyric mode");
        newLyricsSize.value = chrome.storage.local.get(['newLyricsSize']);

    });
    

    chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { lyricsMode: mode });
      });
    });

});



document.getElementById('appVersion').textContent = 'v' + chrome.runtime.getManifest().version;

const _applyBtn = document.getElementById('applyLanguage');
_applyBtn.dataset.originalText = _applyBtn.textContent;

const applyLanguageButton = document.getElementById('applyLanguage');
const languageSelector = document.getElementById('languageSelector');
const newLyricsSize = document.getElementById('newLyricsSize');
const lyricsMode = document.getElementById('lyricsMode');
const translateToggle = document.getElementById('translateToggle');
const lyricsSizeValue = document.getElementById('lyricsSizeValue');
const translationProvider = document.getElementById('translationProvider');
const aiSettings = document.getElementById('aiSettings');
const aiEndpoint = document.getElementById('aiEndpoint');
const aiApiKey = document.getElementById('aiApiKey');
const aiModel = document.getElementById('aiModel');
const aiTestConnection = document.getElementById('aiTestConnection');
const aiTestStatus = document.getElementById('aiTestStatus');
const aiThinkMode = document.getElementById('aiThinkMode');

$(document).ready(function() {
    // Render the dropdown inside the .optionDiv so the (nested) select2 CSS
    // overrides apply — by default select2 appends it to <body>, out of scope.
    $('#languageSelector').select2({
        dropdownParent: $('#languageSelector').parent()
    });

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
        $("#languageSelector").val(result.language).trigger("change");
    } else {
        $("#languageSelector").val("en").trigger('change');
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

chrome.storage.local.get(['translateButton'], (result) => {
    if (result.translateButton !== undefined) {
        translateToggle.checked = result.translateButton;
    } else {
        translateToggle.checked = true;
    }
});

// Load AI provider settings
chrome.storage.local.get(['translationProvider', 'aiEndpoint', 'aiApiKey', 'aiModel', 'aiThinkMode'], (result) => {
    if (result.translationProvider) {
        translationProvider.value = result.translationProvider;
    }
    if (result.aiEndpoint) {
        aiEndpoint.value = result.aiEndpoint;
    }
    if (result.aiApiKey) {
        aiApiKey.value = result.aiApiKey;
    }
    if (result.aiModel) {
        aiModel.value = result.aiModel;
    }
    if (result.aiThinkMode !== undefined) {
        aiThinkMode.checked = result.aiThinkMode;
    }
    aiSettings.style.display = translationProvider.value === 'customAI' ? 'block' : 'none';
});

function sendToSpotifyTabs(message) {
    chrome.tabs.query({ url: "https://open.spotify.com/*" }, tabs => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        });
    });
}

translateToggle.addEventListener('change', async () => {
    const isEnabled = translateToggle.checked;
    await chrome.storage.local.set({translateButton: isEnabled});
    sendToSpotifyTabs({ toggleTranslation: isEnabled });
});

applyLanguageButton.addEventListener('click', async () => {
    const language = languageSelector.value;
    await chrome.storage.local.set({language: language});
    sendToSpotifyTabs({ updateLanguage: language });

    applyLanguageButton.textContent = '✓';
    applyLanguageButton.disabled = true;
    setTimeout(() => {
        applyLanguageButton.textContent = applyLanguageButton.dataset.originalText;
        applyLanguageButton.disabled = false;
    }, 1500);
});

translationProvider.addEventListener('change', async () => {
    const provider = translationProvider.value;
    aiSettings.style.display = provider === 'customAI' ? 'block' : 'none';
    await chrome.storage.local.set({translationProvider: provider});
    sendToSpotifyTabs({ updateTranslationProvider: provider });
});

function endpointOrigin(endpoint) {
    try {
        return new URL(endpoint).origin + '/*';
    } catch {
        return null;
    }
}

// Request access to the endpoint's origin. It's declared as an optional
// permission, so we ask for it at runtime from a user gesture instead of
// requesting blanket access up front. request() resolves true without a
// prompt if already granted.
async function ensureHostPermission(endpoint) {
    const pattern = endpointOrigin(endpoint);
    if (!pattern) return false;
    try {
        return await chrome.permissions.request({ origins: [pattern] });
    } catch {
        return false;
    }
}

async function saveAndPropagateAiSettings() {
    const endpoint = aiEndpoint.value.trim();
    const apiKey = aiApiKey.value.trim();
    const model = aiModel.value.trim();
    if (endpoint) await ensureHostPermission(endpoint);
    await chrome.storage.local.set({aiEndpoint: endpoint, aiApiKey: apiKey, aiModel: model});
    sendToSpotifyTabs({ updateAiSettings: { endpoint, apiKey, model } });
}

aiEndpoint.addEventListener('change', saveAndPropagateAiSettings);
aiApiKey.addEventListener('change', saveAndPropagateAiSettings);
aiModel.addEventListener('change', saveAndPropagateAiSettings);

aiThinkMode.addEventListener('change', async () => {
    const thinkMode = aiThinkMode.checked;
    await chrome.storage.local.set({aiThinkMode: thinkMode});
    sendToSpotifyTabs({ updateAiThinkMode: thinkMode });
});

aiTestConnection.addEventListener('click', async () => {
    const endpoint = aiEndpoint.value.trim();
    const apiKey = aiApiKey.value.trim();
    const model = aiModel.value.trim();

    if (!endpoint || !apiKey) {
        aiTestStatus.textContent = chrome.i18n.getMessage('aiTestFail') || 'Connection failed. Check your settings.';
        aiTestStatus.className = 'error';
        return;
    }

    const granted = await ensureHostPermission(endpoint);
    if (!granted) {
        aiTestStatus.textContent = (chrome.i18n.getMessage('aiTestFail') || 'Connection failed.') + ' (access to the endpoint was not granted)';
        aiTestStatus.className = 'error';
        return;
    }

    aiTestStatus.textContent = chrome.i18n.getMessage('aiTestInProgress') || 'Testing...';
    aiTestStatus.className = 'loading';

    try {
        const baseUrl = endpoint.replace(/\/+$/, '');
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || 'gpt-4o-mini',
                messages: [
                    { role: 'user', content: 'Hi' }
                ],
                max_tokens: 5
            })
        });

        if (response.ok) {
            try {
                const data = await response.json();
                if (data.choices || data.id || data.object) {
                    aiTestStatus.textContent = chrome.i18n.getMessage('aiTestSuccess') || 'Connection successful!';
                    aiTestStatus.className = 'success';
                } else {
                    aiTestStatus.textContent = (chrome.i18n.getMessage('aiTestFail') || 'Connection failed. Check your settings.') + ' (unexpected response format)';
                    aiTestStatus.className = 'error';
                }
            } catch {
                aiTestStatus.textContent = (chrome.i18n.getMessage('aiTestFail') || 'Connection failed.') + ' (endpoint returned non-JSON — check the URL includes the full API path, e.g. /v1)';
                aiTestStatus.className = 'error';
            }
        } else {
            const errorText = await response.text();
            aiTestStatus.textContent = (chrome.i18n.getMessage('aiTestFail') || 'Connection failed.') + ` (${response.status})`;
            aiTestStatus.className = 'error';
        }
    } catch (e) {
        aiTestStatus.textContent = (chrome.i18n.getMessage('aiTestFail') || 'Connection failed.') + ` (${e.message})`;
        aiTestStatus.className = 'error';
    }
});

function updateLyricsSizeDisplay(size) {
    lyricsSizeValue.textContent = size + 'em';
}

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

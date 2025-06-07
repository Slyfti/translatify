// Check if localization is enabled before applying translations
function applyLocalization() {
    chrome.storage.sync.get(['localizationEnabled'], function(result) {
        const isEnabled = result.localizationEnabled !== undefined ? result.localizationEnabled : true;
        
        // Store original text if not already stored
        if (!window.originalTexts) {
            window.originalTexts = {};
            document.querySelectorAll('[data-locale]').forEach(elem => {
                window.originalTexts[elem.dataset.locale] = elem.innerText;
            });
        }
        
        // Apply or remove localization based on toggle state
        document.querySelectorAll('[data-locale]').forEach(elem => {
            if (isEnabled) {
                elem.innerText = chrome.i18n.getMessage(elem.dataset.locale) || elem.innerText;
            } else {
                // Restore original text when localization is disabled
                elem.innerText = window.originalTexts[elem.dataset.locale] || elem.innerText;
            }
        });

        // Set the toggle to match stored setting
        const toggle = document.getElementById('localizationToggle');
        if (toggle) {
            toggle.checked = isEnabled;
        }
    });
}

// Initialize localization when the page loads
document.addEventListener('DOMContentLoaded', applyLocalization);

// Listen for toggle changes
document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('localizationToggle');
    if (toggle) {
        toggle.addEventListener('change', function() {
            const isEnabled = this.checked;
            chrome.storage.sync.set({ 'localizationEnabled': isEnabled }, function() {
                applyLocalization();
            });
        });
    }
});
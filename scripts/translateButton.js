function eraseButton() {
    const translationButton = document.querySelector("button[data-testid='translate-button']");
    if (translationButton) {
        translationButton.remove();
    }
}

// Wait for all the buttons to load before adding the translate button
function loadChecker() {
    var repeatButton = document.querySelector("button[data-testid='control-button-repeat']");
    var nowPlaying = document.querySelector("div[data-testid='now-playing-widget']");
    var lyricsButton = document.querySelector("button[data-testid='lyrics-button']");

    if (repeatButton && nowPlaying && lyricsButton) {
        addTranslateButton();
        setupListening();

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



    console.log(lyricsButton);
}



function toggleTranslateButton() {
    const translateButton = document.querySelector("button[data-testid='translate-button']");

    if (translateButton.getAttribute("aria-pressed") == "false") {
        translateButton.setAttribute("aria-pressed", "true");
        // Green button
        translateButton.classList.add("hKhTmo");
        translateButton.classList.add("translateButton");
        translateButton.classList.add("RK45o6dbvO1mb0wQtSwq");
        translateButton.classList.add("fZjbVIqD8Xc3auRZOxu5");

        chrome.storage.local.set({translateButton:true});
    } else {
        translateButton.setAttribute("aria-pressed", "false");
        translateButton.classList.remove("hKhTmo");
        translateButton.classList.remove("translateButton"); 
        translateButton.classList.remove("RK45o6dbvO1mb0wQtSwq"); 
        translateButton.classList.remove("fZjbVIqD8Xc3auRZOxu5");
        
        chrome.storage.local.set({translateButton:false});
    }

    translate();

}

function enableTranslateButton() {
    const translateButton = document.querySelector("button[data-testid='translate-button']");
    const lyricsButton = document.querySelector("button[data-testid='lyrics-button']");

    if (lyricsButton.getAttribute("data-active") == "true") {
        translateButton.disabled = false;
    } else if (lyricsButton.getAttribute("data-active") == "false") {
        translateButton.disabled = true;
    }
}


function addTranslateButton() {
    const repeatButton = document.querySelector("button[data-testid='control-button-repeat']");
    const buttonBar = repeatButton.parentElement;
    const translateButton = repeatButton.cloneNode(true);

    translateButton.setAttribute("data-testid", "translate-button");
    translateButton.setAttribute("aria-pressed", "false");
    translateButton.className="Button-sc-1dqy6lx-0 dmdXQN";

      
    
    svgButton = translateButton.querySelector("svg");
    svgButton.innerHTML = '<path d="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z" />';
    svgButton.setAttribute("viewBox", "0 0 24 24");
    buttonBar.appendChild(translateButton);


    translateButton.addEventListener('click', toggleTranslateButton);
}

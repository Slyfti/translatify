

function getLyrics() {
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='fullscreen-lyric']");
    const lyricsList = [];
    if (lyricsWrapperList) {
        lyricsWrapperList.forEach((lyricsWrapper) => {
            const lyrics = lyricsWrapper.firstChild.textContent;
            lyricsList.push(lyrics);
        });
    }
    return lyricsList;
}

function addTranslateButton() {
    const lyricsButton = document.querySelector("button[data-testid='control-button-repeat']");
    const buttonBar = lyricsButton.parentElement;
    const translateButton = lyricsButton.cloneNode(true);

    translateButton.setAttribute("data-testid", "translate-button");
    translateButton.setAttribute("aria-pressed", "false");
    translateButton.className="Button-sc-1dqy6lx-0 dmdXQN";
    translateButton.disabled = false;
    svgButton = translateButton.querySelector("svg");
    svgButton.innerHTML = '<path d="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z" />';
    svgButton.setAttribute("viewBox", "0 0 24 24");
    console.log(translateButton);
    buttonBar.appendChild(translateButton);


    translateButton.addEventListener('click', toggleTranslateButton);
}

function toggleTranslateButton() {
    const translateButton = document.querySelector("button[data-testid='translate-button']");

    if (translateButton.getAttribute("aria-pressed") == "false") {
        translateButton.setAttribute("aria-pressed", "true");
        // Green button
        translateButton.classList.add("hKhTmo");
        translateButton.classList.add("fZjbVIqD8Xc3auRZOxu5");
    } else {
        translateButton.setAttribute("aria-pressed", "false");
        translateButton.classList.remove("hKhTmo");
        translateButton.classList.remove("fZjbVIqD8Xc3auRZOxu5"); 
    }

    main();

}


function getFullLyrics(lyricsList) {
    let fullLyrics = "";
    if (lyricsList) {
        fullLyrics = lyricsList.join(";");
    }
    return fullLyrics;
}


async function translateText(text,sourceLanguage,destinationLanguage) {

    const params = `&sl=${sourceLanguage}&tl=${destinationLanguage}&q=${text}`;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t${params}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const translatedArrays = data[0];
        let translatedLyrics = "";
        translatedArrays.forEach((translatedArray) => {
            translatedLyrics += translatedArray[0];
        });
        return translatedLyrics;
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

function getTranslatedLyricsToList(translatedLyrics) {
    const translatedLyricsList = translatedLyrics.split(';');
    return translatedLyricsList;
}

function replaceLyrics(translatedLyricsList) {
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='fullscreen-lyric']");
    if (lyricsWrapperList != null) {
            const tag= document.createElement("div");
            tag.id="translated";
            lyricsWrapperList[0].appendChild(tag);

            lyricsWrapperList.forEach((lyricsWrapper, index) => {
                lyricsWrapper.classList.add("modifedLyricsWrapper");
                const lyrics = lyricsWrapper.firstChild;
                const newLyrics = lyrics.cloneNode(true);
    
                lyrics.setAttribute("original",lyrics.innerText);
                lyrics.classList.add("originalLyrics");
    
                newLyrics.innerText = translatedLyricsList[index];
                lyricsWrapper.appendChild(newLyrics);
                newLyrics.classList.add("newLyrics");
    
            });
        
    }

}

function restoreLyrics() {
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='fullscreen-lyric']");
    if (lyricsWrapperList) {
        lyricsWrapperList.forEach((lyricsWrapper, index) => {
            lyricsWrapper.classList.remove("modifedLyricsWrapper");
            
            const lyrics = lyricsWrapper.querySelector(".newLyrics");

            if (lyrics) {
                const originalLyrics = lyricsWrapper.querySelector(".originalLyrics").innerText;
                lyrics.innerText = originalLyrics;
                lyrics.classList.remove("newLyrics");

                lyricsWrapper.querySelector(".originalLyrics").remove();
            }
        });
    }


    const tag = document.getElementById("translated");
    if (tag) {
        tag.remove();
    }
}

function setupListening() {
    const buttonList = document.querySelectorAll("button");
    const translateButton = document.querySelector("button[data-testid='translate-button']");
    
    const lyricsDiv = document.querySelector("._Wna90no0o0dta47Heiw");
    


    translateButton.removeEventListener("change",main);
    translateButton.removeEventListener("click",main);


}

async function main() {
    const sourceLanguage = "auto";
    const destinationLanguage = "fr";
    const translateButton = document.querySelector("button[data-testid='translate-button']");


    if (translateButton.getAttribute("aria-pressed") == "true" && document.getElementById("translated") == null ) {
        const lyricsList = getLyrics();
        const fullLyrics = getFullLyrics(lyricsList);
        const translatedLyrics = await translateText(fullLyrics,sourceLanguage,destinationLanguage);
        const translatedLyricsList = getTranslatedLyricsToList(translatedLyrics);
        replaceLyrics(translatedLyricsList);
    } else if (translateButton.getAttribute("aria-pressed") == "false" && document.getElementById("translated") != null) {
        restoreLyrics();
    }
    
}

/*
https://github.com/ssut/py-googletrans/issues/268
// The URL to translate text is:
"https://translate.googleapis.com/translate_a/single?client=gtx&dt=t + params"
// where the params are:
{
  "sl": source language,
  "tl": destination language,
  "q": the text to translate
}

*/ 


/*
// Function to translate lyrics line by line

function translateLyrics() {
    const translationMap = new Map();

    // No need to translate these characters
    translationMap.set('♪', '♪');
    translationMap.set(' ', ' ');
    translationMap.set('', '');



    const lyricsList = getLyrics();
    const translatedLyricsList = [];
    if (lyricsList) {
        lyricsList.forEach((lyrics) => {
            if (translationMap.has(lyrics)) {
                translatedLyricsList.push(translationMap.get(lyrics));
            } else {
                const translatedLyrics = translateText(lyrics);
                translationMap.set(lyrics, translatedLyrics);
                translatedLyricsList.push(translatedLyrics);
            }
        });
    }
    console.log(translatedLyricsList);
}
*/

function injectButtons() {
    var lyricsButton = document.querySelector("button[data-testid='control-button-repeat']");
    if (lyricsButton) {
        addTranslateButton();
        setupListening();

    } else {
        setTimeout(injectButtons, 100);
    }

}


function nowPlayingListener() {
    var nowPlaying = document.querySelector("div[data-testid='now-playing-widget']");
    if (nowPlaying) {
        var observer = new MutationObserver(function(mutationsList, observer) {
            for (var mutation of mutationsList){
                setTimeout(main, 100);
                console.log('Next music');
            }
        });

        observer.observe(nowPlaying, { attributes: true});


        console.log(nowPlaying);
    } else {
        setTimeout(nowPlayingListener, 100);
    }


    
}



console.log("Lyrics Translator is running");


injectButtons();
nowPlayingListener();


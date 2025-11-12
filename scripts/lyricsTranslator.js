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

function restoreLyrics() {
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");
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


// 1ST METHOD



function getFullLyrics(lyricsList) {
    let fullLyrics = "";
    if (lyricsList) {
        fullLyrics = lyricsList.join(";");
    }
    return fullLyrics;
}


function getTranslatedLyricsToList(translatedLyrics) {
    if (translatedLyrics == null) {
        return null;
    }
    
    const translatedLyricsList = translatedLyrics.split(';');
    return translatedLyricsList;
}

function replaceLyrics(translatedLyricsList) {
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");
    if (lyricsWrapperList[0] != null && translatedLyricsList != null) {
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


async function translateAllWithGoogle(sourceLanguage,destinationLanguage) {
    const lyricsList = getLyrics();
    const fullLyrics = getFullLyrics(lyricsList);
    const translatedLyrics = await translateText(fullLyrics,sourceLanguage,destinationLanguage);
    const translatedLyricsList = getTranslatedLyricsToList(translatedLyrics);
    console.log(translatedLyricsList);
    replaceLyrics(translatedLyricsList);
}


// 2ND METHOD

function getLyrics() {
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");
    const lyricsList = [];
    if (lyricsWrapperList) {
        lyricsWrapperList.forEach((lyricsWrapper) => {
            const lyrics = lyricsWrapper.firstChild.textContent;
            lyricsList.push(lyrics);
        });
    }
    return lyricsList;
}

async function replaceLyricAsync(translatedLine, index) {
    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");
    const lyricsWrapper = lyricsWrapperList[index];
    if (lyricsWrapperList[0] != null && translatedLine != null && lyricsWrapper.classList.contains("modifedLyricsWrapper") == false) {
            lyricsWrapper.classList.add("modifedLyricsWrapper");
            const lyrics = lyricsWrapper.firstChild;
            const newLyrics = lyrics.cloneNode(true);

            lyrics.setAttribute("original",lyrics.innerText);
            lyrics.classList.add("originalLyrics");

            newLyrics.innerText = translatedLine;
            lyricsWrapper.appendChild(newLyrics);
            newLyrics.classList.add("newLyrics");
        
    }

}


async function translateLineByLineWithGoogle(sourceLanguage,destinationLanguage) {
    const translationMap = new Map();

    // Tag to let know that the lyrics are translated

    const lyricsWrapperList = document.querySelectorAll("div[data-testid='lyrics-line']");

    if (lyricsWrapperList[0] == null) {
        console.log("Lyrics not found: waiting..");
        return setTimeout(translate, 100);
    }

    const tag= document.createElement("div");
    tag.id="translated";
    lyricsWrapperList[0].appendChild(tag);

    // No need to translate these characters
    translationMap.set('♪', '♪');
    translationMap.set(' ', ' ');
    translationMap.set('', '');

    const lyricsList = getLyrics();
    let translatedLyricsList = new Array();
    if (lyricsList) {
        const promises = lyricsList.map(async (lyrics, index) => {
            let translatedLine = await translateText(lyrics, sourceLanguage, destinationLanguage);
            await replaceLyricAsync(translatedLine, index);
        });
        await Promise.all(promises);

        // Focus active lyrics
        let focusedLyrics = document.querySelector("._gZrl2ExJwyxPy1pEUG2");
        focusedLyrics.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center"
        });
    }

    
}


// MAIN TRANSLATE FUNCTION
async function translate() {
    const sourceLanguage = "auto";
    let destinationLanguage = "eng";

    destinationLanguage = await chrome.storage.local.get(["language"]);
    destinationLanguage = destinationLanguage.language;


    const translateButton = document.querySelector("button[data-testid='translate-button']");
    const lyricsButton = document.querySelector("button[data-testid='lyrics-button']");


    if (translateButton.getAttribute("aria-pressed") == "true" && document.getElementById("translated") == null && lyricsButton.getAttribute("aria-pressed") == "true") {
        translateLineByLineWithGoogle(sourceLanguage,destinationLanguage);
    } else if (translateButton.getAttribute("aria-pressed") == "false" && document.getElementById("translated") != null) {
        restoreLyrics();
        
        // Focus active lyrics
        let focusedLyrics = document.querySelector("._gZrl2ExJwyxPy1pEUG2");
        focusedLyrics.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center"
        });
    }
    
}

function refreshTranslation() {
    const tag = document.getElementById("translated");
    if (tag) {
        tag.remove();
        restoreLyrics();
    }
    translate();
}
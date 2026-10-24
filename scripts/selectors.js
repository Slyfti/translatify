// Spotify DOM hooks, most specific first. When Spotify renames something, fix it here.
// Prefix matches (^=) keep working through renames like "-v2". CSS classes and
// aria-labels are avoided: classes are build hashes, labels are localized.
const SPOTIFY = {
    // Kept exact: a prefix could also match a lyrics container and translate it as a line.
    lyricLine: ["div[data-testid='lyrics-line']"],
    lyricsButton: [
        "button[data-testid='lyrics-button']",
        "button[data-testid^='lyrics-button']"
    ],
    // The translate button is cloned from and placed next to this one.
    anchorButton: [
        "button[data-testid='control-button-repeat']",
        "[data-testid='player-controls'] button:not([data-testid='translate-button'])"
    ],
    songTitle: [
        "[data-testid='context-item-link']",
        "[data-testid='context-item-info-title']",
        "a[data-testid='now-playing-track-link']",
        // now-playing-widget-v2 has no testid on the title link.
        "[data-testid^='now-playing-widget'] a[href^='/album/'], [data-testid^='now-playing-widget'] a[href^='/track/']"
    ],
    songArtist: [
        "[data-testid='context-item-info-artist']",
        "[data-testid='context-item-info-subtitle']",
        "[data-testid^='now-playing-widget'][data-testid$='-byline']"
    ]
};

// All lyric-line selectors combined, for querySelectorAll() and matches().
const lyricLine = SPOTIFY.lyricLine.join(", ");

// First element matching the highest-priority selector that matches anything.
function findSpotify(key) {
    for (const selector of SPOTIFY[key]) {
        const found = document.querySelector(selector);
        if (found) return found;
    }
    return null;
}

// Last element matching the highest-priority selector that matches anything.
function findLastSpotify(key) {
    for (const selector of SPOTIFY[key]) {
        const found = document.querySelectorAll(selector);
        if (found.length) return found[found.length - 1];
    }
    return null;
}

const ENDPOINTS = [
    (text, sl, tl) => ({
        url: `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${sl}&tl=${tl}&q=${encodeURIComponent(text)}`,
        parse: data => data[0].map(a => a[0]).join('')
    }),
    (text, sl, tl) => ({
        url: `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&dt=t&sl=${sl}&tl=${tl}&q=${encodeURIComponent(text)}`,
        parse: data => data[0].map(a => a[0]).join('')
    }),
    (text, sl, tl) => ({
        url: `https://translate.googleapis.com/translate_a/single?client=at&dt=t&sl=${sl}&tl=${tl}&q=${encodeURIComponent(text)}`,
        parse: data => data[0].map(a => a[0]).join('')
    }),
    (text, sl, tl) => ({
        url: `https://translate.googleapis.com/translate_a/single?client=te&dt=t&sl=${sl}&tl=${tl}&q=${encodeURIComponent(text)}`,
        parse: data => data[0].map(a => a[0]).join('')
    }),
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'TRANSLATE') {
        (async () => {
            for (const endpoint of ENDPOINTS) {
                try {
                    const { url, parse } = endpoint(msg.text, msg.sourceLanguage, msg.destinationLanguage);
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    const data = await res.json();
                    const result = parse(data);
                    if (result) return sendResponse({ result });
                } catch {
                    continue;
                }
            }
            sendResponse({ error: 'All endpoints failed' });
        })();
        return true;
    }
});
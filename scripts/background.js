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

const GOOGLE_LANG_MAP = {
    'zh': 'zh-CN',
    'iw': 'he',
    'jw': 'jv',
};

function normalizeLang(lang) {
    if (!lang || lang === 'auto') return lang || 'auto';
    const lower = lang.toLowerCase();
    // Preserve regional variants Google supports
    if (['zh-cn', 'zh-tw', 'pt-br', 'pt-pt'].includes(lower)) {
        return lower === 'zh-cn' ? 'zh-CN'
             : lower === 'zh-tw' ? 'zh-TW'
             : lower === 'pt-br' ? 'pt-BR'
             : 'pt-PT';
    }
    const base = lower.split('-')[0];
    return GOOGLE_LANG_MAP[base] || base;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'TRANSLATE') {
        (async () => {
            const sl = normalizeLang(msg.sourceLanguage);
            const tl = normalizeLang(msg.destinationLanguage);
            const failures = [];
            for (const endpoint of ENDPOINTS) {
                try {
                    const { url, parse } = endpoint(msg.text, sl, tl);
                    const res = await fetch(url);
                    if (!res.ok) {
                        failures.push(`${res.status} ${res.statusText}`);
                        continue;
                    }
                    const data = await res.json();
                    const result = parse(data);
                    if (result) return sendResponse({ result });
                    failures.push('empty result');
                } catch (e) {
                    failures.push(e.message);
                    continue;
                }
            }
            console.error('Translatify: all endpoints failed', { sl, tl, text: msg.text, failures });
            sendResponse({ error: `All endpoints failed (sl=${sl}, tl=${tl}): ${failures.join('; ')}` });
        })();
        return true;
    }
});
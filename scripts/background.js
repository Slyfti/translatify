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

    if (msg.type === 'TRANSLATE_BATCH') {
        (async () => {
            try {
                const { lines, songTitle, artistName, destinationLanguage } = msg;

                // Read settings here instead of passing them from the content script.
                const { aiEndpoint: endpoint, aiApiKey: apiKey, aiModel: model, aiThinkMode: thinkMode } =
                    await chrome.storage.local.get(['aiEndpoint', 'aiApiKey', 'aiModel', 'aiThinkMode']);
                if (!endpoint || !apiKey) {
                    return sendResponse({ error: 'AI endpoint or API key not configured' });
                }

                const baseUrl = endpoint.replace(/\/+$/, '');
                const langName = new Intl.DisplayNames(['en'], { type: 'language' });
                const tlName = langName.of(destinationLanguage) || destinationLanguage;

                const systemPrompt = [
                    'You are a skilled literary and song lyric translator.',
                    'Translate the following song lyrics into ' + tlName + '.',
                    songTitle ? 'Song title: "' + songTitle + '"' : '',
                    artistName ? 'Artist: ' + artistName : '',
                    '',
                    'Guidelines:',
                    '- Preserve the poetic, emotional, and rhythmic qualities of the original lyrics.',
                    '- Maintain the tone, mood, and style appropriate to the song genre.',
                    '- Adapt idioms, metaphors, and cultural references naturally into the target language.',
                    '- Keep line breaks and verse structure — each input line must have exactly one output line.',
                    '- Do NOT add explanations, notes, or commentary.',
                    '- Return a JSON object with exactly one field "translations" that is an array of strings.',
                    '- The array must contain exactly one translated string per input line, in the same order.',
                    '- Example: {"translations": ["translated line 1", "translated line 2", ...]}',
                    '',
                    'Input lyrics (one string per line, translate each independently while maintaining overall coherence):'
                ].filter(Boolean).join('\n');

                const userMessage = JSON.stringify(lines);

                const body = {
                    model: model || 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    temperature: 0.7,
                    response_format: { type: 'json_object' }
                };

                if (thinkMode === false) {
                    body.reasoning_effort = 'none';
                    body.thinking = { type: 'disabled' };
                }

                const response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    return sendResponse({ error: `API error ${response.status}: ${errorText}` });
                }

                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    const preview = await response.text().catch(() => '');
                    return sendResponse({ error: `Endpoint returned ${contentType || 'unknown content'} instead of JSON. Check that the endpoint URL includes the full API path (e.g. https://api.openai.com/v1 for OpenAI). Preview: ${preview.slice(0, 200)}` });
                }

                let data;
                try {
                    data = await response.json();
                } catch (e) {
                    return sendResponse({ error: `Failed to parse API response as JSON. Check your endpoint URL — it should include the full path (e.g. https://api.openai.com/v1 for OpenAI). Error: ${e.message}` });
                }
                const content = data.choices?.[0]?.message?.content;
                if (!content) {
                    return sendResponse({ error: 'Empty response from AI' });
                }

                const parsed = JSON.parse(content);
                const translations = Array.isArray(parsed) ? parsed
                    : parsed.translations || parsed.lines || parsed.results || [];

                if (translations.length !== lines.length) {
                    return sendResponse({ error: `AI returned ${translations.length} translations for ${lines.length} lines (line count mismatch)` });
                }

                sendResponse({ translations });
            } catch (e) {
                sendResponse({ error: e.message });
            }
        })();
        return true;
    }
});
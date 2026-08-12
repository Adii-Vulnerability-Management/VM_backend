// Shared translation service for public runtime scripts (banner, DSAR, child consent).
(function (window, document) {
  if (window.GRCTranslationService) return;

  // 24 Indian languages supported by Google Translate (official + widely used regional).
  const DEFAULT_LANGUAGES = [
    { code: 'en', label: 'English', nativeLabel: 'English' },
    { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
    { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
    { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
    { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
    { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
    { code: 'ur', label: 'Urdu', nativeLabel: 'اردو' },
    { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
    { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
    { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
    { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ' },
    { code: 'or', label: 'Odia', nativeLabel: 'ଓଡ଼ିଆ' },
    { code: 'as', label: 'Assamese', nativeLabel: 'অসমীয়া' },
    { code: 'sa', label: 'Sanskrit', nativeLabel: 'संस्कृत' },
    { code: 'sd', label: 'Sindhi', nativeLabel: 'سنڌي' },
    { code: 'ne', label: 'Nepali', nativeLabel: 'नेपाली' },
    { code: 'doi', label: 'Dogri', nativeLabel: 'डोगरी' },
    { code: 'mai', label: 'Maithili', nativeLabel: 'मैथिली' },
    { code: 'bho', label: 'Bhojpuri', nativeLabel: 'भोजपुरी' },
    { code: 'gom', label: 'Konkani', nativeLabel: 'कोंकणी' },
    { code: 'mni-Mtei', label: 'Manipuri', nativeLabel: 'ꯃꯩꯇꯩꯂꯣꯟ' },
    { code: 'awa', label: 'Awadhi', nativeLabel: 'अवधी' },
    { code: 'ks', label: 'Kashmiri', nativeLabel: 'کٲشُر' },
    { code: 'kok', label: 'Konkani (legacy)', nativeLabel: 'कोंकणी' },
  ];

  const SPLIT_TOKEN = ' __GRC_TRANSLATE_SPLIT_9f4b2__ ';
  const CHUNK_SIZE = 12;
  const SHARED_SCRIPT_NAME = 'translation-service.js';

  function decodeHtmlEntities(text) {
    const txt = document.createElement('textarea');
    txt.innerHTML = text || '';
    return txt.value;
  }

  function extractTranslatedTextFromPublicResponse(payload) {
    const segments = Array.isArray(payload?.[0]) ? payload[0] : [];
    if (!segments.length) return '';
    return segments.map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('');
  }

  function sanitizeTranslatedText(text, fallback) {
    if (typeof text !== 'string') return fallback || '';
    let cleaned = decodeHtmlEntities(text)
      .replace(/\u200B/g, '')
      .replace(/\uFFFD/g, '')
      .replaceAll(SPLIT_TOKEN.trim(), '')
      .replace(/\s+/g, ' ')
      .trim();
    cleaned = cleaned
      .replace(/^(translation:|translated text:)\s*/i, '')
      .replace(/\s*(translated by google|via google translate)\s*$/i, '')
      .replace(/\[\[\[\d+\]\]\]/g, '')
      .trim();
    cleaned = cleaned.replace(/^[\s"'`]+|[\s"'`]+$/g, '').trim();
    if (!cleaned) return fallback || '';
    const isShortLabel = fallback && fallback.length <= 24;
    if (isShortLabel && cleaned.length > Math.max(fallback.length * 5, 48)) {
      return fallback;
    }
    return cleaned;
  }

  function buildMarkedText(texts) {
    return texts.map((text, index) => `[[[${index}]]] ${text || ''}`).join('\n');
  }

  function parseMarkedTranslation(translatedText, originalPayload) {
    if (typeof translatedText !== 'string') return originalPayload.slice();
    const normalized = decodeHtmlEntities(translatedText)
      .replace(/\u200B/g, '')
      .replace(/\uFFFD/g, '')
      .trim();
    const markerRegex = /\[\[\[(\d+)\]\]\]/g;
    const matches = [...normalized.matchAll(markerRegex)];
    if (!matches.length) return null;
    const result = new Array(originalPayload.length).fill('');
    for (let idx = 0; idx < matches.length; idx += 1) {
      const current = matches[idx];
      const next = matches[idx + 1];
      const itemIndex = Number(current[1]);
      if (
        Number.isNaN(itemIndex) ||
        itemIndex < 0 ||
        itemIndex >= originalPayload.length
      ) {
        continue;
      }
      const start = current.index + current[0].length;
      const end = next ? next.index : normalized.length;
      const rawValue = normalized.slice(start, end).trim();
      result[itemIndex] = sanitizeTranslatedText(
        rawValue,
        originalPayload[itemIndex] || '',
      );
    }
    return result.map((value, index) => value || originalPayload[index] || '');
  }

  function chunkArray(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  }

  async function translatePublicSingle(text, target, source) {
    const sourceText = text || '';
    if (!sourceText) return '';
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', source);
    url.searchParams.set('tl', target);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', sourceText);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Translate endpoint failed: ${res.status}`);
    const payload = await res.json();
    const translated = extractTranslatedTextFromPublicResponse(payload);
    return decodeHtmlEntities(translated || sourceText);
  }

  async function translatePublicMarked(texts, target, source) {
    const markedText = buildMarkedText(texts);
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', source);
    url.searchParams.set('tl', target);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', markedText);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Translate endpoint failed: ${res.status}`);
    const payload = await res.json();
    const translated = decodeHtmlEntities(
      extractTranslatedTextFromPublicResponse(payload) || markedText,
    );
    const parsed = parseMarkedTranslation(translated, texts);
    if (parsed) return parsed;
    return null;
  }

  async function translatePublicSplitChunk(chunk, target, source) {
    const combinedText = chunk.map((txt) => txt || '').join(SPLIT_TOKEN);
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', source);
    url.searchParams.set('tl', target);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', combinedText);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Translate endpoint failed: ${res.status}`);
    const payload = await res.json();
    const translatedCombined = decodeHtmlEntities(
      extractTranslatedTextFromPublicResponse(payload) || combinedText,
    );
    const parts = translatedCombined.split(SPLIT_TOKEN);
    if (parts.length === chunk.length) {
      return parts.map((part, i) =>
        sanitizeTranslatedText(part, chunk[i] || ''),
      );
    }
    return Promise.all(
      chunk.map((txt) => translatePublicSingle(txt, target, source)),
    );
  }

  async function translateViaGoogleApi(texts, target, source, apiKey) {
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: texts, target, source, format: 'text' }),
      },
    );
    if (!res.ok) throw new Error(`Google translate failed: ${res.status}`);
    const json = await res.json();
    const arr = json?.data?.translations || [];
    return arr.map((x, i) =>
      sanitizeTranslatedText(
        decodeHtmlEntities(x?.translatedText || ''),
        texts[i] || '',
      ),
    );
  }

  async function translateViaPublicEndpoint(texts, target, source) {
    if (!texts.length) return [];
    const marked = await translatePublicMarked(texts, target, source);
    if (marked) return marked;

    const chunks = chunkArray(texts, CHUNK_SIZE);
    const translatedChunks = await Promise.all(
      chunks.map((c) => translatePublicSplitChunk(c, target, source)),
    );
    return translatedChunks.flat();
  }

  async function translateBatch({
    texts = [],
    target = 'en',
    source = 'en',
    googleApiKey = '',
  } = {}) {
    const cleanTexts = Array.isArray(texts) ? texts.map((x) => x || '') : [];
    if (!target || target === source) return cleanTexts.slice();

    if (googleApiKey) {
      try {
        return await translateViaGoogleApi(
          cleanTexts,
          target,
          source,
          googleApiKey,
        );
      } catch (err) {
        console.warn(
          'GRCTranslationService: paid API failed, using free fallback',
          err,
        );
      }
    }

    return translateViaPublicEndpoint(cleanTexts, target, source);
  }

  function resolveSiblingScriptUrl(fileName, scriptEl) {
    const script =
      scriptEl ||
      document.currentScript ||
      document.querySelector('script[data-grc-translation-service="1"]');
    if (!script?.src) return fileName;
    const u = new URL(script.src, window.location.href);
    const parts = u.pathname.split('/').filter(Boolean);
    parts.pop();
    return `${u.origin}/${parts.join('/')}/${fileName}`;
  }

  function injectLanguagePickerStyles() {
    if (document.getElementById('grc-lang-picker-styles')) return;
    const style = document.createElement('style');
    style.id = 'grc-lang-picker-styles';
    style.textContent = `
.grc-lang-picker{
  width:100%;
  max-width:100%;
}
.grc-lang-picker--row{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
.grc-lang-picker-label{
  font-size:13px;
  font-weight:600;
  color:inherit;
  white-space:nowrap;
}
.grc-lang-picker--stacked .grc-lang-picker-label{
  display:block;
  margin-bottom:6px;
}
.grc-lang-select{
  width:100%;
  max-width:280px;
  min-width:160px;
  padding:8px 12px;
  border-radius:8px;
  border:1px solid #d1d5db;
  background:#fff;
  color:#111827;
  font-size:14px;
  outline:none;
  cursor:pointer;
}
.grc-lang-select:focus{
  border-color:#4f46e5;
  box-shadow:0 0 0 3px rgba(79,70,229,.15);
}
.grc-lang-picker--on-dark .grc-lang-picker-label{
  color:rgba(255,255,255,.92);
}
.grc-lang-picker--on-dark .grc-lang-select{
  border-color:rgba(255,255,255,.45);
  background:rgba(255,255,255,.96);
}
`.trim();
    document.head.appendChild(style);
  }

  function normalizeLanguageEntry(lang) {
    if (typeof lang === 'string') {
      return { code: lang, label: lang.toUpperCase(), nativeLabel: lang.toUpperCase() };
    }
    return {
      code: lang?.code || '',
      label: lang?.label || lang?.code || '',
      nativeLabel: lang?.nativeLabel || lang?.label || lang?.code || '',
    };
  }

  function createLanguageDropdown({
    languages = [],
    value = 'en',
    onChange,
    label = 'Language',
    variant = 'default',
    layout = 'row',
    id = `grc_ui_lang_${Math.random().toString(36).slice(2, 9)}`,
  } = {}) {
    injectLanguagePickerStyles();

    const normalized = languages.map(normalizeLanguageEntry).filter((l) => l.code);
    if (normalized.length < 2) return null;

    const wrap = document.createElement('div');
    const layoutClass =
      layout === 'stacked' ? ' grc-lang-picker--stacked' : ' grc-lang-picker--row';
    wrap.className = `grc-lang-picker${layoutClass}${
      variant === 'on-dark' ? ' grc-lang-picker--on-dark' : ''
    }`;

    const labelEl = document.createElement('label');
    labelEl.className = 'grc-lang-picker-label';
    labelEl.htmlFor = id;
    labelEl.textContent = label;

    const select = document.createElement('select');
    select.className = 'grc-lang-select';
    select.id = id;
    select.setAttribute('aria-label', label);

    normalized.forEach((lang) => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.nativeLabel || lang.label || lang.code;
      select.appendChild(opt);
    });

    select.value = normalized.some((l) => l.code === value)
      ? value
      : normalized[0].code;

    select.addEventListener('change', () => {
      if (typeof onChange === 'function') onChange(select.value);
    });

    wrap.appendChild(labelEl);
    wrap.appendChild(select);

    return {
      wrap,
      select,
      setValue: (code) => {
        if (normalized.some((l) => l.code === code)) select.value = code;
      },
    };
  }

  const createLanguageGrid = createLanguageDropdown;

  function ensureLoaded(resolveUrl) {
    if (window.GRCTranslationService?.createLanguageDropdown) {
      return Promise.resolve(window.GRCTranslationService);
    }

    return new Promise((resolve, reject) => {
      const finish = () => {
        if (window.GRCTranslationService?.createLanguageDropdown) {
          resolve(window.GRCTranslationService);
          return;
        }
        reject(new Error('Translation service API unavailable'));
      };

      const existing = document.querySelector(
        'script[data-grc-translation-service="1"]',
      );
      if (existing) {
        if (window.GRCTranslationService?.createLanguageDropdown) {
          finish();
          return;
        }
        existing.addEventListener('load', finish);
        existing.addEventListener('error', () =>
          reject(new Error('Failed to load translation service script')),
        );
        return;
      }

      const s = document.createElement('script');
      s.async = true;
      s.dataset.grcTranslationService = '1';
      s.src =
        typeof resolveUrl === 'function'
          ? resolveUrl(SHARED_SCRIPT_NAME)
          : resolveSiblingScriptUrl(SHARED_SCRIPT_NAME);
      s.onload = finish;
      s.onerror = () =>
        reject(new Error('Failed to load translation service script'));
      document.head.appendChild(s);
    });
  }

  window.GRCTranslationService = {
    DEFAULT_LANGUAGES,
    SHARED_SCRIPT_NAME,
    translateBatch,
    ensureLoaded,
    createLanguageDropdown,
    createLanguageGrid,
    sanitizeTranslatedText,
    buildMarkedText,
    parseMarkedTranslation,
  };
})(window, document);

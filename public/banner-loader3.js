// cmp-sdk.js
(function (window, document) {
  // ————————————————
  // Helpers
  // ————————————————

  // polyfill randomUUID (browser only) so init() never fails
  if (typeof window !== 'undefined') {
    if (typeof crypto === 'undefined') window.crypto = {};
    if (!crypto.getRandomValues) {
      crypto.getRandomValues = function (arr) {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      };
    }
    if (!crypto.randomUUID) {
      crypto.randomUUID = function () {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        // set RFC4122 version & variant bits
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
        return (
          hex.slice(0, 4).join('') +
          '-' +
          hex.slice(4, 6).join('') +
          '-' +
          hex.slice(6, 8).join('') +
          '-' +
          hex.slice(8, 10).join('') +
          '-' +
          hex.slice(10, 16).join('')
        );
      };
    }
  }
  const STORAGE_KEY = 'cmp_user';
  const SHARED_TRANSLATION_SCRIPT = 'translation-service.js';

  function getLoaderScriptEl() {
    return (
      document.currentScript ||
      document.querySelector('script[src*="banner-loader3.js"]')
    );
  }

  function resolveSiblingScriptUrl(fileName) {
    const script = getLoaderScriptEl();
    if (!script?.src) return fileName;
    const u = new URL(script.src, window.location.href);
    const parts = u.pathname.split('/').filter(Boolean);
    parts.pop();
    return `${u.origin}/${parts.join('/')}/${fileName}`;
  }

  function ensureSharedTranslationService() {
    if (window.GRCTranslationService?.translateBatch) {
      return Promise.resolve(window.GRCTranslationService);
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector(
        `script[data-grc-translation-service="1"]`,
      );
      if (existing) {
        existing.addEventListener('load', () =>
          resolve(window.GRCTranslationService),
        );
        existing.addEventListener('error', () =>
          reject(new Error('Failed to load translation service script')),
        );
        return;
      }

      const s = document.createElement('script');
      s.async = true;
      s.dataset.grcTranslationService = '1';
      s.src = resolveSiblingScriptUrl(SHARED_TRANSLATION_SCRIPT);
      s.onload = () => resolve(window.GRCTranslationService);
      s.onerror = () =>
        reject(new Error('Failed to load translation service script'));
      document.head.appendChild(s);
    });
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function setDeep(obj, path, val) {
    const parts = path.split('.');
    let cur = obj;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) {
        cur[p] = val;
      } else {
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
    });
  }

  // ————————————————
  // CMP Class
  // ————————————————
  class CMP {
    constructor() {
      this.opts = {};
      this.userId = null;
      this.metadata = {};
      this.style = null;
      this.categories = [];
      this.choices = {};
      this._listeners = { ready: [], consentChange: [] };
      this._toggles = {}; // for preference-modal checkboxes
      this._floatingBtnEl = null;
      // ← initialize your “blocked scripts” stash here:
      this._blocked = [];
      this._blockedScripts = [];
      this._loadedScriptKeys = new Set(); // to avoid double-loading via _loadScript
      // patch before anything else runs:
      // this._patchDOMInsertion();
      // cookie‐watch: interceptor & monitor flags
      this._cookieInterceptorInstalled = false;
      this._cookieMonitorId = null;
      this._suppressCookieHook = false;
      this._lastHandledCookie = {};
      this._knownCookies = new Set();
      this._cookieNameToCategory = null;
      this._i18nBase = null;
      this._translatedText = null;
      this._translationCache = {};
      this._activeLanguage = 'en';
      this._bannerRefs = null;
      this._prefRefs = null;

      // SPA / reapply hooks
      this._navHooked = false;
      this._periodicReapplyId = null;
      this._settleObserver = null;
    }

    // Monkey-patch DOM insertion so *any* script ever appended is intercepted
    // _patchDOMInsertion() {
    //   const origCreate = document.createElement;
    //   const origAppend = Node.prototype.appendChild;
    //   const origInsert = Node.prototype.insertBefore;
    //   const self = this;

    //   // Intercept createElement('script')
    //   document.createElement = function (tagName, options) {
    //     const el = origCreate.call(this, tagName, options);
    //     if (tagName.toLowerCase() === 'script') {
    //       // whenever someone sets src or textContent, hold onto it
    //       Object.defineProperty(el, 'src', {
    //         set(src) {
    //           this._cmpSrc = src;
    //         },
    //         get() {
    //           return this._cmpSrc;
    //         },
    //         configurable: true,
    //       });
    //       Object.defineProperty(el, 'textContent', {
    //         set(txt) {
    //           this._cmpInline = txt;
    //         },
    //         get() {
    //           return this._cmpInline;
    //         },
    //         configurable: true,
    //       });
    //       // mark it so our appendHook knows to buffer it
    //       el._isCmpScript = true;
    //     }
    //     return el;
    //   };

    //   // Helper: if node is a CMP-script, buffer instead of injecting
    //   function bufferIfScript(node) {
    //     if (node.tagName?.toLowerCase() === 'script' && node._isCmpScript) {
    //       self._blockedScripts.push(node);
    //       return true;
    //     }
    //     return false;
    //   }

    //   // Patch appendChild
    //   Node.prototype.appendChild = function (node) {
    //     if (bufferIfScript(node)) {
    //       return node; // swallow it: never runs immediately
    //     }
    //     return origAppend.call(this, node);
    //   };

    //   // Patch insertBefore
    //   Node.prototype.insertBefore = function (newNode, refNode) {
    //     if (bufferIfScript(newNode)) {
    //       return newNode;
    //     }
    //     return origInsert.call(this, newNode, refNode);
    //   };
    // }

    // … your existing _blockScripts / _unblockScripts, etc. …

    /** After user consents, inject all buffered scripts */
    _releaseScripts() {
      this._blockedScripts.forEach((clone) => {
        const s = document.createElement('script');
        // restore attributes
        if (clone._cmpSrc) s.src = clone._cmpSrc;
        if (clone._cmpInline) s.textContent = clone._cmpInline;
        document.head.appendChild(s);
      });
      this._blockedScripts = [];
    }

    /** Hide all <script data-cmp-block> tags and stash them away */
    _blockScripts() {
      console.debug('CMP: _blockScripts() start');
      const els = document.querySelectorAll('script[data-cmp-block]');
      this._blocked = Array.from(els).map((el) => {
        const clone = document.createElement('script');
        for (const { name, value } of el.attributes) {
          clone.setAttribute(name, value);
        }
        clone.textContent = el.textContent;
        el.remove();
        return clone;
      });
      console.debug(`CMP: stashed ${this._blocked.length} scripts`);
    }

    // /** Re-insert only those the user accepted */
    _unblockScripts() {
      console.debug('CMP: _unblockScripts() start', this.choices);
      this._blocked.forEach((clone) => {
        const key = clone.getAttribute('data-vkey');
        console.debug(
          'CMP: considering blocked script',
          key,
          'consent:',
          this.choices[key],
        );
        if (this.choices[key]) {
          // make it executable if it was inert
          if (clone.getAttribute('type') === 'text/cmp-block') {
            clone.removeAttribute('type');
          }
          document.head.appendChild(clone);
          console.debug(`CMP: unleashed script with vkey="${key}"`);
        } else {
          console.debug(`CMP: skipping script vkey="${key}"`);
        }
      });
      this._blocked = [];
      console.debug('CMP: _unblockScripts() done');
    }

    _loadScript({ src, inline, attrs = {}, categoryKey, key }) {
      console.debug('CMP: _loadScript called', {
        src,
        categoryKey,
        key,
        choices: this.choices,
      });
      if (categoryKey && this.choices[categoryKey] === false) {
        console.debug(
          `CMP: skipping load of ${src} because no consent for ${categoryKey}`,
        );
        return Promise.resolve(null);
      }
      if (key && this._loadedScriptKeys.has(key)) {
        console.debug(`CMP: script with key "${key}" already loaded; skipping`);
        return Promise.resolve(null);
      }
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        if (src) s.src = src;
        if (inline) s.textContent = inline;
        Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
        s.onload = () => {
          if (key) this._loadedScriptKeys.add(key);
          console.debug(`CMP: loaded script ${src}`);
          resolve(s);
        };
        s.onerror = (e) => {
          console.warn(`CMP: failed to load script ${src}`, e);
          reject(e);
        };
        document.head.appendChild(s);
      });
    }

    /** Delete a specific cookie */
    _deleteCookie(name, domain, path = '/') {
      console.debug(
        `CMP: _deleteCookie called for cookie name="${name}", domain="${domain}", path="${path}"`,
      );

      const expireStr = 'Thu, 01 Jan 1970 00:00:00 GMT';
      const tryDomains = [];

      if (domain) {
        tryDomains.push(domain);
        // sometimes cookies were set with a leading dot
        if (!domain.startsWith('.')) tryDomains.push(`.${domain}`);
      } else {
        // fallback: current hostname and its dotted variant
        const host = window.location.hostname;
        tryDomains.push(host);
        if (!host.startsWith('.')) tryDomains.push(`.${host}`);
      }

      // Attempt deletion with multiple variants to increase chance of success
      tryDomains.forEach((dom) => {
        const cookieStr1 = `${name}=; Max-Age=0; path=${path}; domain=${dom};`;
        const cookieStr2 = `${name}=; expires=${expireStr}; path=${path}; domain=${dom};`;
        document.cookie = cookieStr1;
        console.debug(
          `CMP: attempted deletion (Max-Age) for "${name}" with domain "${dom}": ${cookieStr1}`,
        );
        document.cookie = cookieStr2;
        console.debug(
          `CMP: attempted deletion (expires) for "${name}" with domain "${dom}": ${cookieStr2}`,
        );
      });

      // Also attempt without explicit domain (some cookies may be host-scoped)
      const fallback1 = `${name}=; Max-Age=0; path=${path};`;
      const fallback2 = `${name}=; expires=${expireStr}; path=${path};`;
      document.cookie = fallback1;
      document.debug &&
        console.debug(
          `CMP: attempted deletion fallback (Max-Age) for "${name}": ${fallback1}`,
        );
      document.cookie = fallback2;
      document.debug &&
        console.debug(
          `CMP: attempted deletion fallback (expires) for "${name}": ${fallback2}`,
        );

      // Check if it's still present (best-effort; cannot detect HttpOnly)
      const stillExists = document.cookie
        .split(';')
        .map((c) => c.trim())
        .some((c) => c.startsWith(`${name}=`));

      if (stillExists) {
        console.warn(
          `CMP: cookie "${name}" still present after deletion attempts (could be HttpOnly / wrong path/domain).`,
        );
      } else {
        console.debug(`CMP: cookie "${name}" appears removed.`);
      }
    }

    /** Clear all non-necessary cookies (fallback) */
    _clearAllCookies() {
      const raw = document.cookie;
      console.debug(
        `CMP: _clearAllCookies called. current document.cookie: "${raw}"`,
      );

      if (!raw) {
        console.debug('CMP: no cookies to clear.');
        return;
      }

      const cookies = raw
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean);
      const skipped = [];
      const attempted = [];

      cookies.forEach((cookie) => {
        const eqIdx = cookie.indexOf('=');
        const name = eqIdx > -1 ? cookie.slice(0, eqIdx) : cookie;
        if (name === 'necessary') {
          skipped.push(name);
          return; // skip the known necessary cookie
        }
        attempted.push(name);
        this._deleteCookie(name);
      });

      console.debug(
        `CMP: _clearAllCookies summary: attempted=[${attempted.join(
          ', ',
        )}], skipped=[${skipped.join(', ')}]`,
      );
    }
    // turn something like "https://dev.grc3.io" into "dev.grc3.io"
    _normalizeDomainString(domainStr) {
      if (!domainStr) return window.location.hostname;
      try {
        return new URL(domainStr).hostname;
      } catch {
        return domainStr.replace(/^https?:\/\//, '').replace(/\/$/, '');
      }
    }

    _domainCandidates(hostname) {
      if (!hostname) return [];
      const parts = hostname.split('.');
      const candidates = new Set();
      // Build from most specific to less: e.g., ["dev.grc3.io", "grc3.io"]
      for (let i = 0; i <= parts.length - 2; i++) {
        const d = parts.slice(i).join('.');
        candidates.add(d);
        candidates.add(`.${d}`);
      }
      return Array.from(candidates);
    }
    /** Apply allowed/denied cookie & script state based on current choices */
    _applyAllowedCookies() {
      console.debug(
        'CMP: _applyAllowedCookies called. current choices:',
        this.choices,
      );
      console.debug('CMP: categories from /cmp/config:', this.categories);

      // Always enforce necessary
      this.choices['necessary'] = true;

      if (!Array.isArray(this.categories)) {
        console.warn(
          'CMP: no categories loaded from /cmp/config; cannot clear cookies per category.',
        );
        return;
      }

      this.categories.forEach((cat) => {
        const key = cat.key || (cat.name && cat.name.toLowerCase());
        if (!key) {
          console.debug('CMP: skipping category with no key/name', cat);
          return;
        }

        const consent = this.choices[key];
        const cookieNames = Array.isArray(cat.cookieNames)
          ? cat.cookieNames
          : [];
        console.debug(
          `CMP: evaluating category "${key}" (consent=${consent})`,
          'cookieNames:',
          cookieNames,
        );

        if (consent === false) {
          if (cookieNames.length) {
            console.debug(
              `CMP: user declined category "${key}", will clear cookies:`,
              cookieNames,
            );
            cookieNames.forEach((name) => {
              // derive domain candidates from the configured domain (e.g., "https://dev.grc3.io")
              const rawDomain = this.opts.domain || window.location.hostname;
              const normalized = this._normalizeDomainString(rawDomain); // e.g. "dev.grc3.io"
              const domainsToTry = this._domainCandidates(normalized); // includes "dev.grc3.io","\.dev.grc3.io","grc3.io",".grc3.io"
              console.log(rawDomain, normalized, domainsToTry);
              domainsToTry.forEach((dom) => {
                this._deleteCookie(name, dom);
                console.debug(
                  `CMP: attempted to clear cookie "${name}" for declined category "${key}" with domain variant "${dom}"`,
                );
              });
            });
          } else {
            console.warn(
              `CMP: category "${key}" declined but no cookieNames provided to clear.`,
            );
          }
        } else {
          console.debug(
            `CMP: category "${key}" accepted or defaulted; skipping deletion.`,
          );
        }
      });
    }

    _getTranslationConfig() {
      const translation = this.style?.translation || {};
      const defaultLanguages =
        window.GRCTranslationService?.DEFAULT_LANGUAGES || [
          { code: 'en', label: 'English' },
          { code: 'hi', label: 'हिन्दी' },
          { code: 'bn', label: 'বাংলা' },
          { code: 'gu', label: 'ગુજરાતી' },
          { code: 'mr', label: 'मराठी' },
          { code: 'ta', label: 'தமிழ்' },
          { code: 'te', label: 'తెలుగు' },
        ];
      const languages =
        Array.isArray(translation.languages) && translation.languages.length
          ? translation.languages
          : defaultLanguages;

      return {
        enabled: translation.enabled !== false,
        languages,
        defaultLanguage:
          translation.defaultLanguage || this.opts.defaultLanguage || 'en',
        sourceLanguage: translation.sourceLanguage || 'en',
        googleApiKey:
          translation.googleApiKey || this.opts.googleTranslateApiKey || '',
      };
    }

    _seedI18nBase() {
      const S = this.style || {};
      this._i18nBase = {
        banner: {
          title: S?.texts?.title || 'We value your privacy',
          description:
            S?.texts?.description ||
            'We use cookies to improve your experience.',
          acceptAll: S?.texts?.acceptAll || 'Accept all',
          rejectAll: S?.texts?.rejectAll || 'Reject all',
          managePrefs: S?.texts?.managePrefs || 'Manage preferences',
          policyText: S?.policyText || 'Privacy Policy',
          imprintText: S?.imprintText || 'Imprint',
        },
        pref: {
          title: S?.prefContent?.title || 'Manage Preferences',
          description:
            S?.prefContent?.description || 'Customize your cookie settings.',
          saveAllText: S?.prefContent?.saveAllText || 'Save Preferences',
          rejectAllText: S?.prefContent?.rejectAllText || 'Reject All',
          acceptAllText: S?.prefContent?.acceptAllText || 'Accept all',
        },
        categories: (this.categories || []).map((cat) => ({
          key: cat.key,
          name: cat.name || '',
          description: cat.description || '',
        })),
      };
      this._translatedText = JSON.parse(JSON.stringify(this._i18nBase));
    }

    async _getTranslationsForLanguage(langCode) {
      if (!this._i18nBase) this._seedI18nBase();
      const cfg = this._getTranslationConfig();
      const source = cfg.sourceLanguage || 'en';

      if (!cfg.enabled || !langCode || langCode === source) {
        return JSON.parse(JSON.stringify(this._i18nBase));
      }
      if (this._translationCache[langCode])
        return this._translationCache[langCode];

      const keys = [];
      const values = [];
      const add = (k, v) => {
        keys.push(k);
        values.push(v || '');
      };

      add('banner.title', this._i18nBase.banner.title);
      add('banner.description', this._i18nBase.banner.description);
      add('banner.acceptAll', this._i18nBase.banner.acceptAll);
      add('banner.rejectAll', this._i18nBase.banner.rejectAll);
      add('banner.managePrefs', this._i18nBase.banner.managePrefs);
      add('banner.policyText', this._i18nBase.banner.policyText);
      add('banner.imprintText', this._i18nBase.banner.imprintText);
      add('pref.title', this._i18nBase.pref.title);
      add('pref.description', this._i18nBase.pref.description);
      add('pref.saveAllText', this._i18nBase.pref.saveAllText);
      add('pref.rejectAllText', this._i18nBase.pref.rejectAllText);
      add('pref.acceptAllText', this._i18nBase.pref.acceptAllText);
      (this._i18nBase.categories || []).forEach((cat) => {
        add(`category.${cat.key}.name`, cat.name);
        add(`category.${cat.key}.description`, cat.description);
      });

      let translated = [];
      try {
        translated = await window.GRCTranslationService.translateBatch({
          texts: values,
          target: langCode,
          source,
          googleApiKey: cfg.googleApiKey || '',
        });
      } catch (e) {
        console.warn('CMP: translation failed, keeping base language', e);
        return JSON.parse(JSON.stringify(this._i18nBase));
      }

      const map = {};
      keys.forEach((k, idx) => {
        map[k] = translated[idx] || values[idx];
      });

      const out = {
        banner: {
          title: map['banner.title'],
          description: map['banner.description'],
          acceptAll: map['banner.acceptAll'],
          rejectAll: map['banner.rejectAll'],
          managePrefs: map['banner.managePrefs'],
          policyText: map['banner.policyText'],
          imprintText: map['banner.imprintText'],
        },
        pref: {
          title: map['pref.title'],
          description: map['pref.description'],
          saveAllText: map['pref.saveAllText'],
          rejectAllText: map['pref.rejectAllText'],
          acceptAllText: map['pref.acceptAllText'],
        },
        categories: (this._i18nBase.categories || []).map((cat) => ({
          key: cat.key,
          name: map[`category.${cat.key}.name`] || cat.name,
          description:
            map[`category.${cat.key}.description`] || cat.description,
        })),
      };
      this._translationCache[langCode] = out;
      return out;
    }

    _createLanguageSelect(onChange) {
      const cfg = this._getTranslationConfig();
      if (
        !cfg.enabled ||
        !Array.isArray(cfg.languages) ||
        cfg.languages.length < 2
      )
        return null;

      const wrap = document.createElement('div');
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '0.35rem';

      const select = document.createElement('select');
      Object.assign(select.style, {
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        background: '#fff',
        color: '#111827',
        padding: '0.3rem 0.5rem',
        fontSize: '12px',
      });

      cfg.languages.forEach((lang) => {
        const code = typeof lang === 'string' ? lang : lang.code;
        const label =
          typeof lang === 'string'
            ? lang.toUpperCase()
            : lang.label || lang.code;
        if (!code) return;
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = label;
        select.appendChild(opt);
      });

      select.value = this._activeLanguage || cfg.defaultLanguage;
      select.onchange = () => onChange(select.value);
      wrap.appendChild(select);
      return { wrap, select };
    }

    _applyTranslatedTextToUI() {
      const t = this._translatedText;
      if (!t) return;

      if (this._bannerRefs) {
        if (this._bannerRefs.languageSelect)
          this._bannerRefs.languageSelect.value = this._activeLanguage;
        this._bannerRefs.title &&
          (this._bannerRefs.title.textContent = t.banner.title);
        this._bannerRefs.description &&
          (this._bannerRefs.description.textContent = t.banner.description);
        this._bannerRefs.acceptBtn &&
          (this._bannerRefs.acceptBtn.textContent = t.banner.acceptAll);
        this._bannerRefs.rejectBtn &&
          (this._bannerRefs.rejectBtn.textContent = t.banner.rejectAll);
        this._bannerRefs.manageBtn &&
          (this._bannerRefs.manageBtn.textContent = t.banner.managePrefs);
        this._bannerRefs.policyLink &&
          (this._bannerRefs.policyLink.textContent = t.banner.policyText);
        this._bannerRefs.imprintLink &&
          (this._bannerRefs.imprintLink.textContent = t.banner.imprintText);
      }

      if (this._prefRefs) {
        if (this._prefRefs.languageSelect)
          this._prefRefs.languageSelect.value = this._activeLanguage;
        this._prefRefs.title &&
          (this._prefRefs.title.textContent = t.pref.title);
        this._prefRefs.description &&
          (this._prefRefs.description.textContent = t.pref.description);
        this._prefRefs.acceptBtn &&
          (this._prefRefs.acceptBtn.textContent = t.pref.acceptAllText);
        this._prefRefs.saveBtn &&
          (this._prefRefs.saveBtn.textContent = t.pref.saveAllText);
        this._prefRefs.rejectBtn &&
          (this._prefRefs.rejectBtn.textContent = t.pref.rejectAllText);

        (this._prefRefs.categories || []).forEach((row) => {
          const found = (t.categories || []).find((c) => c.key === row.key);
          if (!found) return;
          row.nameEl && (row.nameEl.textContent = found.name);
          row.descEl && (row.descEl.textContent = found.description);
        });
      }
    }

    async _setLanguage(langCode) {
      this._activeLanguage = langCode;
      this._translatedText = await this._getTranslationsForLanguage(langCode);
      this._applyTranslatedTextToUI();
    }

    /** render the floating cookie button */
    _renderFloatingBtn() {
      if (this._floatingBtnEl) return;
      // ─── inject rotate keyframes once ───
      if (!document.getElementById('floating-btn-animation-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'floating-btn-animation-style';
        styleEl.textContent = `
      @keyframes rotate {
        0%   { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      /* optional: a little pulse on hover */
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.1); }
      }
    `;
        document.head.appendChild(styleEl);
      }
      // ────────────────────────────────────────         // only once
      const btn = document.createElement('button');
      btn.id = 'cmp-floating-btn';
      btn.title = 'Change cookie settings';

      // ─── NEW: put an <img> inside the button instead of innerText ───
      const fallbackToTextButton = () => {
        btn.textContent = this.style.prefStyles?.buttonTextLabel || 'Cookie';
        Object.assign(btn.style, {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: '600',
          lineHeight: '1',
          padding: '0.25rem',
        });
      };

      const img = document.createElement('img');
      const iconUrl =
        this.style.prefStyles?.buttonIconUrl ||
        'https://scanner.grc3.io/CookieImage.png';
      if (!iconUrl) {
        fallbackToTextButton();
      } else {
        img.src = iconUrl;
        img.alt = 'Cookie Settings';
        // size it to fit nicely in the circle:
        Object.assign(img.style, {
          width: '70%', // 60% of button width/height
          height: '70%',
          display: 'block',
          margin: 'auto',
        });
        img.onerror = () => {
          img.remove();
          fallbackToTextButton();
        };
        btn.appendChild(img);
      }
      // ───────────────────────────────────────────────────────────────────

      Object.assign(btn.style, {
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        border: 'none',
        background: '#22c55e' || this.style.prefStyles?.buttonBg || '#22c55e',
        color: this.style.prefStyles?.buttonText || '#fff',
        cursor: 'pointer',
        zIndex: 10002,
        padding: '0',
        animation: 'pulse 4s linear infinite',
        transition: 'transform 0.2s ease-in-out',
      });

      btn.addEventListener('mouseover', () => {
        btn.style.animation = 'pulse 1.5s ease-in-out infinite';
      });

      btn.addEventListener('click', () => {
        this._renderBanner();
        this._removeFloatingBtn();
      });
      document.body.appendChild(btn);
      this._floatingBtnEl = btn;
    }

    /** remove the floating button */
    _removeFloatingBtn() {
      if (this._floatingBtnEl) {
        this._floatingBtnEl.remove();
        this._floatingBtnEl = null;
      }
    }

    /** Subscribe to 'ready' or 'consentChange' */
    on(evt, fn) {
      if (this._listeners[evt]) {
        this._listeners[evt].push(fn);
      }
    }

    /** Get current consent choices */
    getConsent() {
      return { ...this.choices };
    }

    /** Get stored metadata */
    getMetadata() {
      return { ...this.metadata };
    }

    /** Set one metadata key & persist */
    setMetadata(key, value) {
      this.metadata[key] = value;
      saveStore({ userId: this.userId, metadata: this.metadata });
    }

    /** Re-open the Preference Center */
    showPreferences() {
      this._renderPrefs && this._renderPrefs();
    }

    // — init(opts) —
    async init(opts) {
      console.log('CMP.init() called with:', opts);
      // 1) Normalize & validate
      this.opts = {
        apiBaseUrl: '',
        configId: null,
        domain: window.location.hostname,
        ...opts,
      };
      if (!this.opts.apiBaseUrl || !this.opts.configId) {
        throw new Error('CMP.init requires { apiBaseUrl, configId }');
      }

      // 2) Load/create userId + metadata
      let store = loadStore();
      if (!store || typeof store.userId !== 'string') {
        store = { userId: crypto.randomUUID(), metadata: {} };
        saveStore(store);
      }
      this.userId = store.userId;
      this.metadata = store.metadata;

      // 3) Fetch banner config
      const cfgRes = await fetch(
        `${this.opts.apiBaseUrl}/cmp/configs/${this.opts.configId}`,
        { credentials: 'include' },
      );
      if (!cfgRes.ok) {
        throw new Error('CMP.init: failed to load banner config');
      }
      const cfg = await cfgRes.json();

      // 4) Merge styleConfig + overrides
      this.style = cloneDeep(cfg.styleConfig || {});
      if (cfg.overrideEnabled && cfg.modifiedFields) {
        Object.entries(cfg.modifiedFields).forEach(([path, val]) =>
          setDeep(this.style, path, val),
        );
      }

      // 5) Fetch categories
      const catUrl = new URL(`${this.opts.apiBaseUrl}/cmp/config`);
      catUrl.searchParams.set('domain', this.opts.domain);
      const catRes = await fetch(catUrl, { credentials: 'include' });
      if (!catRes.ok) {
        throw new Error('CMP.init: failed to load categories');
      }
      this.categories = await catRes.json();
      await ensureSharedTranslationService();
      this._seedI18nBase();
      this._translationCache = {};
      this._activeLanguage = this._getTranslationConfig().defaultLanguage;

      // 6) Fetch existing consent
      let hasStoredConsent = false;
      const prefUrl = new URL(`${this.opts.apiBaseUrl}/cmp/consent`);
      prefUrl.searchParams.set('domain', this.opts.domain);
      prefUrl.searchParams.set('userId', this.userId);
      const prefRes = await fetch(prefUrl, { credentials: 'include' });
      if (prefRes.ok) {
        const prefJson = await prefRes.json();
        if (Array.isArray(prefJson.categories)) {
          hasStoredConsent = prefJson.categories.length > 0;
          prefJson.categories.forEach((c) => {
            this.choices[c.key] = c.accepted;
          });
        } else if (prefJson.choices && typeof prefJson.choices === 'object') {
          hasStoredConsent = Object.keys(prefJson.choices).length > 0;
          Object.entries(prefJson.choices).forEach(([k, v]) => {
            this.choices[k] = !!v;
          });
        }
      }

      // BLOCK all CMP‐blocked scripts until we know what the user wants
      this._blockScripts();

      // 7) Seed defaults for any unset categories
      (this.style.cookieCategories || []).forEach((cat) => {
        const key = cat.key || cat.name.toLowerCase();
        if (this.choices[key] === undefined) {
          this.choices[key] = Boolean(cat.default);
        }
      });

      // 8) Fire 'ready' event
      this._fireReady();

      // 9) Conditionally render the banner
      // Show banner for first-time visitors (no stored consent),
      // even if defaults are seeded in style config.
      if (!hasStoredConsent) {
        console.log('CMP.init(): showing banner (no stored consent yet)');
        this._renderBanner();
      } else {
        console.log(
          'CMP.init(): stored consent found, rendering floating button',
        );
        // user already has consent stored → apply it, then show floating / release
        this._applyAllowedCookies();
        this._renderFloatingBtn();
        this._unblockScripts();
        this._releaseScripts();
      }

      // ensure SPA navigation re-applies consent
      this._setupNavigationListener();

      // periodic and settled reapplications
      this._setupPeriodicReapply();
      this._setupSettleWatcher();
      // install interception/monitoring before seeding defaults so any writes during page load
      // are caught immediately
      this._setupCookieInterceptor();
      this._setupCookieMonitor();

      // 10) Build the Preferences modal now that choices are fully seeded
      this._preparePreferenceCenter();
      await this._setLanguage(this._activeLanguage);
      console.log('CMP.init() complete');
    }

    /** Emit 'ready' */
    _fireReady() {
      const payload = {
        style: this.style,
        categories: this.categories,
        userId: this.userId,
        metadata: this.getMetadata(),
        choices: this.getConsent(),
      };
      this._listeners.ready.forEach((fn) => fn(payload));
      if (typeof this.opts.onReady === 'function') {
        this.opts.onReady(payload);
      }
    }

    /** Public helper to re-apply current consent decisions */
    applyConsent() {
      this._applyAllowedCookies();
    }

    /** Install listeners / wrappers so SPA navigations re-apply consent */
    _setupNavigationListener() {
      if (this._navHooked) return;
      this._navHooked = true;

      const reapply = () => {
        console.debug(
          'CMP: SPA navigation detected, reapplying consent. current URL:',
          location.href,
        );
        this.applyConsent();

        // restart settle watcher so it observes new page content
        if (this._settleObserver) {
          this._settleObserver.disconnect();
          this._settleObserver = null;
        }
        this._setupSettleWatcher();
        // inside reapply in _setupNavigationListener
        this._stopCookieMonitor();
        this._setupCookieMonitor();
      };

      // Wrap history API to detect pushState / replaceState
      const origPush = history.pushState;
      const origReplace = history.replaceState;

      history.pushState = function (...args) {
        console.debug('CMP: history.pushState called', {
          args,
          from: document.referrer,
          before: location.href,
        });
        const result = origPush.apply(this, args);
        setTimeout(() => {
          console.debug('CMP: after pushState new URL', location.href);
          reapply();
        }, 0);
        return result;
      };

      history.replaceState = function (...args) {
        console.debug('CMP: history.replaceState called', {
          args,
          before: location.href,
        });
        const result = origReplace.apply(this, args);
        setTimeout(() => {
          console.debug('CMP: after replaceState new URL', location.href);
          reapply();
        }, 0);
        return result;
      };

      // Back/forward & hash change
      window.addEventListener('popstate', (e) => {
        console.debug('CMP: popstate event', e, 'current URL:', location.href);
        reapply();
      });
      window.addEventListener('hashchange', (e) => {
        console.debug(
          'CMP: hashchange event',
          e,
          'current URL:',
          location.href,
        );
        reapply();
      });
    }

    /** start periodic re-application of the current consent */
    _setupPeriodicReapply() {
      if (this._periodicReapplyId) return;
      this._periodicReapplyId = setInterval(() => {
        console.debug('CMP: periodic reapply of consent');
        this.applyConsent();
      }, 30_000); // 30 seconds
    }

    _setupSettleWatcher() {
      if (this._settleObserver) return;

      let settleTimer = null;
      const scheduleApply = () => {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          console.debug('CMP: page settled, reapplying consent');
          this.applyConsent();
        }, 500); // 500ms of no mutations = settled
      };

      this._settleObserver = new MutationObserver(() => {
        scheduleApply();
      });

      // Observe wide set of changes so we detect dynamic content injection
      this._settleObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      // Kick off initial settle timer
      scheduleApply();

      // Fallback in case mutations keep happening: ensure at least one apply
      setTimeout(() => {
        console.debug('CMP: settle watcher fallback applyConsent');
        this.applyConsent();
      }, 5000);
    }

    /** Called when a cookie is written via document.cookie setter interception */
    _onCookieWrite(name) {
      if (!this._cookieNameToCategory) {
        this._cookieNameToCategory = {};
        (this.categories || []).forEach((cat) => {
          (cat.cookieNames || []).forEach((cn) => {
            this._cookieNameToCategory[cn] = cat.key;
          });
        });
      }

      const catKey = this._cookieNameToCategory[name];
      if (catKey && this.choices[catKey] === false) {
        console.debug(
          `CMP: intercepted write of cookie "${name}" for declined category "${catKey}", deleting it`,
        );
        const normalized = this._normalizeDomainString(this.opts.domain);
        this._deleteCookie(name, normalized);
      }
    }

    /** Hook document.cookie setter to intercept JS writes (with debounce & recursion guard) */
    _setupCookieInterceptor() {
      if (this._cookieInterceptorInstalled) return;
      this._cookieInterceptorInstalled = true;

      try {
        // cookie descriptor lives on Document.prototype in browsers
        const proto = Document.prototype || HTMLDocument.prototype;
        const desc =
          Object.getOwnPropertyDescriptor(proto, 'cookie') ||
          Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
        if (!desc || !desc.configurable) {
          console.warn(
            'CMP: cookie property not configurable; interceptor skipped',
          );
          return;
        }

        const self = this;
        Object.defineProperty(document, 'cookie', {
          configurable: true,
          enumerable: true,
          get() {
            return desc.get.call(document);
          },
          set(val) {
            const name = val.split('=')[0].trim();
            // perform original set
            desc.set.call(document, val);

            // avoid re-entrancy when our own deletion triggers setter
            if (self._suppressCookieHook) return;

            try {
              self._suppressCookieHook = true;
              self._lastHandledCookie ??= {};
              if (self._lastHandledCookie[name]) {
                return; // debounce duplicate rapid writes
              }
              self._lastHandledCookie[name] = true;
              setTimeout(() => {
                delete self._lastHandledCookie[name];
              }, 500);

              // delegate to handler
              self._onCookieWrite?.(name);
            } finally {
              self._suppressCookieHook = false;
            }
          },
        });

        console.debug('CMP: installed cookie write interceptor');
      } catch (e) {
        console.warn('CMP: failed to install cookie interceptor', e);
      }
    }

    /** Poll for new cookies as a fallback (e.g., HTTP-set ones) */
    _setupCookieMonitor(pollInterval = 2000) {
      if (this._cookieMonitorId) return;

      // snapshot current cookie names
      let previousNames = (document.cookie || '')
        .split(';')
        .map((c) => c.trim().split('=')[0])
        .filter(Boolean);

      // keep known set in sync if you need it elsewhere
      this._knownCookies = new Set(previousNames);

      this._cookieMonitorId = setInterval(() => {
        const currentNames = (document.cookie || '')
          .split(';')
          .map((c) => c.trim().split('=')[0])
          .filter(Boolean);

        // newly added cookies since last tick
        const added = currentNames.filter((n) => !previousNames.includes(n));
        if (added.length) {
          console.debug('CMP: cookie monitor detected new cookie(s):', added);
          added.forEach((name) => {
            this._onCookieWrite?.(name);
          });
        }

        // keep baseline for next comparison
        previousNames = currentNames;
        // optionally keep knownCookies updated
        currentNames.forEach((n) => this._knownCookies.add(n));
        // prune if removed (optional)
        Array.from(this._knownCookies).forEach((n) => {
          if (!currentNames.includes(n)) this._knownCookies.delete(n);
        });
      }, pollInterval);
    }

    /** Minimal handler invoked when any cookie appears/written */
    _onCookieWrite(name) {
      // map cookie to category from /cmp/config
      const cat = (this.categories || []).find(
        (c) => Array.isArray(c.cookieNames) && c.cookieNames.includes(name),
      );
      if (!cat) return;

      const key = cat.key || (cat.name && cat.name.toLowerCase());
      if (key && this.choices[key] === false) {
        const normalizedDomain = this._normalizeDomainString(this.opts.domain);
        console.debug(
          `CMP: cookie "${name}" belongs to declined category "${key}", deleting it (domain normalized to "${normalizedDomain}")`,
        );
        this._deleteCookie(name, normalizedDomain);
      }
    }

    _stopCookieMonitor() {
      if (this._cookieMonitorId) {
        clearInterval(this._cookieMonitorId);
        this._cookieMonitorId = null;
      }
    }

    /** insert a full-screen transparent blocker under the banner */
    _renderBlocker() {
      if (this._blockerEl) return;
      const blk = document.createElement('div');
      blk.id = 'cmp-blocker';
      Object.assign(blk.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0)', // transparent
        zIndex: 9999, // just under the banner (banner is at 10000)
        cursor: 'default',
      });
      document.body.appendChild(blk);
      this._blockerEl = blk;
    }

    /** remove that blocker when the banner goes away */
    _removeBlocker() {
      if (this._blockerEl) {
        this._blockerEl.remove();
        this._blockerEl = null;
      }
    }

    /** Render the consent banner */
    _renderBanner() {
      this._removeFloatingBtn();
      // this._renderBlocker();
      if (this._bannerEl) return;
      this._bannerRefs = null;
      const S = this.style || {};
      const bannerStyles = S.bannerStyles || {};
      const layout = S.layout || {};
      const texts = S.texts || {};
      const linkStyles = S.linkStyles || {};
      const buttonStyles = S.buttonStyles || {};
      const prefStyles = S.prefStyles || {};

      const container = document.createElement('div');
      container.id = 'cmp-banner';
      Object.assign(container.style, {
        position: 'fixed',
        backgroundColor: S.backgroundColor || '#111827',
        color: S.textColor || '#ffffff',
        padding: bannerStyles.padding || '1rem',
        borderRadius: bannerStyles.borderRadius || '8px',
        boxShadow: bannerStyles.boxShadow || '0 8px 20px rgba(0,0,0,0.2)',
        fontFamily:
          bannerStyles.fontFamily ||
          'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        fontSize: bannerStyles.fontSize || '14px',
        textAlign: bannerStyles.textAlign || 'left',
        display: 'flex',
        flexDirection:
          bannerStyles.orientation === 'horizontal' ? 'row' : 'column',
        alignItems: S.bannerStyles.alignItems || 'center',
        gap: S.bannerStyles.gap || '1rem',
        flexWrap: 'wrap',
        boxSizing: 'border-box',
        zIndex: 10000,
      });

      const layoutType = layout.type || 'bar';
      const layoutPosition = layout.position || 'bottom';
      const showVendorList = !!layout.showVendorList;

      if (layoutType === 'bar') {
        Object.assign(container.style, {
          left: 0,
          right: 0,
          [layoutPosition]: 0,
          width: '100%',
        });
      } else if (layoutType === 'toast') {
        const [vert, hor] = layoutPosition.split('-');
        Object.assign(container.style, {
          [vert]: '1rem',
          [hor]: '1rem',
          width: '260px',
        });
      } else if (layoutType === 'floating') {
        if (layoutPosition === 'center') {
          Object.assign(container.style, {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            maxWidth: '400px',
          });
        } else if (layoutPosition === 'top-center') {
          Object.assign(container.style, {
            top: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            maxWidth: '400px',
          });
        } else if (layoutPosition === 'bottom-center') {
          Object.assign(container.style, {
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            maxWidth: '400px',
          });
        } else {
          const [vert, hor] = layoutPosition.split('-');
          Object.assign(container.style, {
            [vert]: '1rem',
            [hor]: '1rem',
            width: '80%',
            maxWidth: '400px',
          });
        }
      } else if (layoutType === 'center') {
        Object.assign(container.style, {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          maxWidth: '400px',
        });
      }

      if (S.logo) {
        const img = document.createElement('img');
        img.src = S.logo;
        img.alt = 'Logo';
        Object.assign(img.style, { maxHeight: '40px', objectFit: 'contain' });
        container.appendChild(img);
      }

      const textWrap = document.createElement('div');
      if (bannerStyles.orientation === 'horizontal') {
        textWrap.style.flex = '1';
        textWrap.style.minWidth = '0';
      }
      const pTitle = document.createElement('p');
      pTitle.textContent = texts.title || 'We value your privacy';
      Object.assign(pTitle.style, {
        margin: 0,
        fontWeight: 600,
        fontSize: '1.1rem',
      });
      const pDesc = document.createElement('p');
      pDesc.textContent =
        texts.description || 'We use cookies to improve your experience.';
      Object.assign(pDesc.style, { margin: '0.25rem 0', opacity: 0.85 });
      textWrap.append(pTitle, pDesc);

      const linksRow = document.createElement('div');
      Object.assign(linksRow.style, {
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
      });
      if (S.showPolicyLink) {
        const a = document.createElement('a');
        a.href = S.policyUrl;
        a.textContent = S.policyText || 'Privacy Policy';
        a.style.color = S.acceptColor || '#22c55e';
        a.style.textDecoration = linkStyles.decoration || 'underline';
        linksRow.appendChild(a);
        this._bannerRefs = this._bannerRefs || {};
        this._bannerRefs.policyLink = a;
      }
      if (S.showImprintLink) {
        const a = document.createElement('a');
        a.href = S.imprintUrl;
        a.textContent = S.imprintText || 'Imprint';
        a.style.color = S.acceptColor || '#22c55e';
        a.style.textDecoration = linkStyles.decoration || 'underline';
        linksRow.appendChild(a);
        this._bannerRefs = this._bannerRefs || {};
        this._bannerRefs.imprintLink = a;
      }
      textWrap.appendChild(linksRow);
      container.appendChild(textWrap);

      const btnRow = document.createElement('div');
      Object.assign(btnRow.style, {
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
      });
      const mkBtn = (txt, bg, fg, cb) => {
        const b = document.createElement('button');
        b.textContent = txt;
        Object.assign(b.style, {
          backgroundColor: bg,
          color: fg,
          padding: buttonStyles.padding || '0.5rem 0.75rem',
          border: `${buttonStyles.borderWidth || '1px'} solid ${
            buttonStyles.borderColor || 'transparent'
          }`,
          borderRadius: buttonStyles.borderRadius || '6px',
          transition: buttonStyles.transition || 'all 0.2s ease',
          cursor: 'pointer',
          fontWeight: 500,
        });
        b.onclick = cb;
        return b;
      };
      const acceptBtn = mkBtn(
        texts.acceptAll || 'Accept all',
        S.acceptColor || '#16a34a',
        '#fff',
        () => this._acceptAll(),
      );
      const rejectBtn = mkBtn(
        texts.rejectAll || 'Reject all',
        S.rejectColor || '#dc2626',
        '#fff',
        () => this._rejectAll(),
      );
      const manageBtn = mkBtn(
        texts.managePrefs || 'Manage preferences',
        prefStyles.buttonBg || '#4f46e5',
        prefStyles.buttonText || '#fff',
        () => this.showPreferences(),
      );
      btnRow.append(acceptBtn, rejectBtn, manageBtn);
      container.appendChild(btnRow);

      const langControl = this._createLanguageSelect((code) =>
        this._setLanguage(code),
      );
      if (langControl) {
        const langWrap = document.createElement('div');
        Object.assign(langWrap.style, {
          width: '100%',
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '0.25rem',
        });
        langWrap.appendChild(langControl.wrap);
        container.appendChild(langWrap);
        this._bannerRefs = this._bannerRefs || {};
        this._bannerRefs.languageSelect = langControl.select;
      }

      if (showVendorList) {
        const v = document.createElement('div');
        v.textContent = 'Vendor List…';
        Object.assign(v.style, {
          flexBasis: '100%',
          marginTop: '1rem',
          color: '#555',
          fontSize: '0.9rem',
        });
        container.appendChild(v);
      }

      document.body.appendChild(container);
      this._bannerEl = container;
      this._bannerRefs = {
        ...(this._bannerRefs || {}),
        title: pTitle,
        description: pDesc,
        acceptBtn,
        rejectBtn,
        manageBtn,
      };
      this._applyTranslatedTextToUI();
    }

    /** Accept All */
    _acceptAll() {
      console.log('CMP: _acceptAll()');
      this.categories.forEach((c) => (this.choices[c.key] = true));
      this._saveConsent();
      this._emitConsentChange();
      this._removeBanner();
      this._renderFloatingBtn();
      this._unblockScripts();
      this._releaseScripts();
    }

    /** Reject All */
    _rejectAll() {
      console.log('CMP: _rejectAll()');
      this.categories.forEach((c) => (this.choices[c.key] = false));
      this._saveConsent();
      this._emitConsentChange();
      this._removeBanner();
      this._renderFloatingBtn();
      this._unblockScripts();
      this._releaseScripts();
    }

    /** Remove banner */
    _removeBanner() {
      this._renderFloatingBtn();
      this._removeBlocker();
      if (this._bannerEl) {
        this._bannerEl.remove();
        this._bannerEl = null;
      }
    }

    // — Advanced Preferences Modal —
    _preparePreferenceCenter() {
      this._prefRefs = null;
      const S = this.style || {};
      const prefContent = S.prefContent || {};
      const prefStyles = S.prefStyles || {};
      const prefSectionStyles = S.prefSectionStyles || {};
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        display: 'none',
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 10001,
        justifyContent: 'center',
        alignItems: 'center',
      });

      const modal = document.createElement('div');
      Object.assign(modal.style, {
        background: '#fff',
        borderRadius: '0.5rem',
        width: '90%',
        maxWidth: '500px',
        padding: '1.5rem',
        boxSizing: 'border-box',
        position: 'relative',
        maxHeight: '60vh',
        overflowY: 'auto',
      });

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '0.75rem',
        right: '0.75rem',
        background: 'none',
        border: 'none',
        fontSize: '1.25rem',
        cursor: 'pointer',
      });
      closeBtn.onclick = () => (overlay.style.display = 'none');
      modal.appendChild(closeBtn);

      const h2 = document.createElement('h2');
      h2.textContent = prefContent.title || 'Manage Preferences';
      h2.style.margin = '0';
      h2.style.color = prefStyles.headerColor || '#111827';
      modal.appendChild(h2);

      const desc = document.createElement('p');
      desc.textContent =
        prefContent.description || 'Customize your cookie settings.';
      desc.style.margin = '0.5rem 0 1rem';
      desc.style.color = prefStyles.textColor || '#374151';
      modal.appendChild(desc);

      const prefLangControl = this._createLanguageSelect((code) =>
        this._setLanguage(code),
      );
      if (prefLangControl) {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '0.75rem',
        });
        row.appendChild(prefLangControl.wrap);
        modal.appendChild(row);
      }

      const prefCategoryRefs = [];

      this.categories.forEach((cat) => {
        const section = document.createElement('div');
        Object.assign(section.style, {
          border: `1px solid ${prefSectionStyles.borderColor || '#e5e7eb'}`,
          borderRadius: prefSectionStyles.borderRadius || '6px',
          marginBottom: '1rem',
          overflow: 'hidden',
        });

        const hdr = document.createElement('div');
        Object.assign(hdr.style, {
          backgroundColor: prefSectionStyles.headerBg || '#f9fafb',
          color: prefSectionStyles.headerTextColor || '#111827',
          padding: prefSectionStyles.padding || '0.5rem 0.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        });
        const lbl = document.createElement('span');
        lbl.textContent = cat.name;
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = !!this.choices[cat.key];
        toggle.onchange = () => {
          this.choices[cat.key] = toggle.checked;
        };
        this._toggles[cat.key] = toggle;
        hdr.appendChild(lbl);
        hdr.appendChild(toggle);
        section.appendChild(hdr);

        const body = document.createElement('div');
        Object.assign(body.style, {
          backgroundColor: prefSectionStyles.bodyBg || '#ffffff',
          padding: prefSectionStyles.padding || '0.5rem 0.75rem',
          borderTop: `1px solid ${prefSectionStyles.borderColor || '#e5e7eb'}`,
        });
        const pd = document.createElement('p');
        pd.textContent = cat.description || '';
        pd.style.margin = '0';
        body.appendChild(pd);
        section.appendChild(body);
        prefCategoryRefs.push({ key: cat.key, nameEl: lbl, descEl: pd });

        modal.appendChild(section);
      });

      const actions = document.createElement('div');
      Object.assign(actions.style, {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '0.5rem',
      });

      const btnAccept = document.createElement('button');
      btnAccept.textContent = prefContent.acceptAllText || 'Accept all';
      Object.assign(btnAccept.style, {
        backgroundColor: S.acceptColor || '#16a34a',
        color: '#fff',
        padding: '0.5rem 1rem',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: 'pointer',
      });
      btnAccept.onclick = () => {
        this._acceptAll();
        overlay.style.display = 'none';
      };

      const btnSave = document.createElement('button');
      btnSave.textContent = prefContent.saveAllText || 'Save Preferences';
      Object.assign(btnSave.style, {
        backgroundColor: prefStyles.buttonBg || '#4f46e5',
        color: prefStyles.buttonText || '#fff',
        padding: '0.5rem 1rem',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: 'pointer',
      });
      btnSave.onclick = () => {
        this._saveConsent();
        this._emitConsentChange();
        overlay.style.display = 'none';
        this._removeBanner();
        this._renderFloatingBtn();
        this._unblockScripts();
        this._releaseScripts();
      };

      const btnReject = document.createElement('button');
      btnReject.textContent = prefContent.rejectAllText || 'Reject All';
      Object.assign(btnReject.style, {
        backgroundColor: S.rejectColor || '#dc2626',
        color: '#fff',
        padding: '0.5rem 1rem',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: 'pointer',
      });
      btnReject.onclick = () => {
        this._rejectAll();
        overlay.style.display = 'none';
      };

      actions.append(btnAccept, btnSave, btnReject);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      this._prefRefs = {
        title: h2,
        description: desc,
        acceptBtn: btnAccept,
        saveBtn: btnSave,
        rejectBtn: btnReject,
        categories: prefCategoryRefs,
        languageSelect: prefLangControl?.select || null,
      };

      this._renderPrefs = () => {
        Object.entries(this._toggles).forEach(([key, input]) => {
          input.checked = !!this.choices[key];
        });
        overlay.style.display = 'flex';
        this._applyTranslatedTextToUI();
      };
    }

    /** POST consent */
    async _saveConsent() {
      this.choices['necessary'] = true;
      await fetch(`${this.opts.apiBaseUrl}/cmp/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          domain: this.opts.domain,
          userId: this.userId,
          choices: this.choices,
          metadata: this.metadata,
        }),
      });
    }

    /** Emit consentChange */
    _emitConsentChange() {
      this._applyAllowedCookies(); // apply updated cookie/script state
      this._listeners.consentChange.forEach((fn) => fn({ ...this.choices }));
      if (typeof this.opts.onConsentChange === 'function') {
        this.opts.onConsentChange({ ...this.choices });
      }
    }
  }

  // expose singleton
  window.CMP = new CMP();
  // -------- auto-init logic based on website-id or explicit overrides --------
  async function resolveInitParams() {
    const script =
      document.currentScript ||
      document.querySelector('script[src*="banner-loader3.js"]');
    if (!script) return null;

    // Testing overrides
    const overrideApiBase = script.dataset.apiBaseUrl;
    const overrideConfigId = script.dataset.configId;
    const overrideDomain = script.dataset.domain;
    const overrideSdkVersion = script.dataset.sdkVersion;
    if (overrideApiBase && overrideConfigId) {
      return {
        apiBaseUrl: overrideApiBase,
        configId: overrideConfigId,
        domain: overrideDomain || window.location.hostname,
        sdkVersion: overrideSdkVersion || '1',
      };
    }

    // Production: resolve real config via website-id
    const websiteId = script.dataset.websiteId;
    if (!websiteId) {
      console.warn('CMP: no website-id provided; skipping auto-init');
      return null;
    }

    // lookup endpoint you implement server-side
    // const lookupBase = "http://23.22.92.199:8101/priv";
    const lookupBase = 'https://dev.grc3.io/priv';

    try {
      const res = await fetch(
        lookupBase +
          '/cmp/websites/lookup?websiteId=' +
          encodeURIComponent(websiteId.trim()),
        { credentials: 'include' },
      );
      if (!res.ok) {
        console.warn('CMP: website-id lookup failed', res.status);
        return null;
      }
      const json = await res.json();
      return {
        apiBaseUrl: lookupBase, // or json.apiBaseUrl if variable
        configId: json.configId,
        domain: json.domain || window.location.hostname,
        sdkVersion: json.sdkVersion || '1',
      };
    } catch (e) {
      console.warn('CMP: error resolving website-id', e);
      return null;
    }
  }

  (async function autoInit() {
    const params = await resolveInitParams();
    if (!params) return;
    window.CMP.init({
      apiBaseUrl: params.apiBaseUrl,
      configId: params.configId,
      domain: params.domain,
      sdkVersion: params.sdkVersion,
    }).catch((e) => {
      console.error('CMP auto-init failed:', e);
    });
  })();
})(window, document);


// cmp-sdk.js
(function (window, document) {
  // ————————————————
  // Helpers
  // ————————————————

  // polyfill randomUUID (browser only) so init() never fails
  if (typeof window !== 'undefined') {
    if (typeof crypto === 'undefined') window.crypto = {};
    if (!crypto.getRandomValues) {
      crypto.getRandomValues = function (arr) {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      };
    }
    if (!crypto.randomUUID) {
      crypto.randomUUID = function () {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        // set RFC4122 version & variant bits
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
        return (
          hex.slice(0, 4).join('') +
          '-' +
          hex.slice(4, 6).join('') +
          '-' +
          hex.slice(6, 8).join('') +
          '-' +
          hex.slice(8, 10).join('') +
          '-' +
          hex.slice(10, 16).join('')
        );
      };
    }
  }
  const STORAGE_KEY = 'cmp_user';
  const SHARED_TRANSLATION_SCRIPT = 'translation-service.js';

  function getLoaderScriptEl() {
    return (
      document.currentScript ||
      document.querySelector('script[src*="banner-loader3.js"]')
    );
  }

  function resolveSiblingScriptUrl(fileName) {
    const script = getLoaderScriptEl();
    if (!script?.src) return fileName;
    const u = new URL(script.src, window.location.href);
    const parts = u.pathname.split('/').filter(Boolean);
    parts.pop();
    return `${u.origin}/${parts.join('/')}/${fileName}`;
  }

  function ensureSharedTranslationService() {
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
      s.src = resolveSiblingScriptUrl(SHARED_TRANSLATION_SCRIPT);
      s.onload = finish;
      s.onerror = () =>
        reject(new Error('Failed to load translation service script'));
      document.head.appendChild(s);
    });
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function setDeep(obj, path, val) {
    const parts = path.split('.');
    let cur = obj;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) {
        cur[p] = val;
      } else {
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
    });
  }

  // ————————————————
  // CMP Class
  // ————————————————
  class CMP {
    constructor() {
      this.opts = {};
      this.userId = null;
      this.metadata = {};
      this.style = null;
      this.categories = [];
      this.choices = {};
      this._listeners = { ready: [], consentChange: [] };
      this._toggles = {}; // for preference-modal checkboxes
      this._floatingBtnEl = null;
      // ← initialize your “blocked scripts” stash here:
      this._blocked = [];
      this._blockedScripts = [];
      this._loadedScriptKeys = new Set(); // to avoid double-loading via _loadScript
      // patch before anything else runs:
      // this._patchDOMInsertion();
      // cookie‐watch: interceptor & monitor flags
      this._cookieInterceptorInstalled = false;
      this._cookieMonitorId = null;
      this._suppressCookieHook = false;
      this._lastHandledCookie = {};
      this._knownCookies = new Set();
      this._cookieNameToCategory = null;
      this._i18nBase = null;
      this._translatedText = null;
      this._translationCache = {};
      this._activeLanguage = 'en';
      this._bannerRefs = null;
      this._prefRefs = null;

      // SPA / reapply hooks
      this._navHooked = false;
      this._periodicReapplyId = null;
      this._settleObserver = null;
    }

    // Monkey-patch DOM insertion so *any* script ever appended is intercepted
    // _patchDOMInsertion() {
    //   const origCreate = document.createElement;
    //   const origAppend = Node.prototype.appendChild;
    //   const origInsert = Node.prototype.insertBefore;
    //   const self = this;

    //   // Intercept createElement('script')
    //   document.createElement = function (tagName, options) {
    //     const el = origCreate.call(this, tagName, options);
    //     if (tagName.toLowerCase() === 'script') {
    //       // whenever someone sets src or textContent, hold onto it
    //       Object.defineProperty(el, 'src', {
    //         set(src) {
    //           this._cmpSrc = src;
    //         },
    //         get() {
    //           return this._cmpSrc;
    //         },
    //         configurable: true,
    //       });
    //       Object.defineProperty(el, 'textContent', {
    //         set(txt) {
    //           this._cmpInline = txt;
    //         },
    //         get() {
    //           return this._cmpInline;
    //         },
    //         configurable: true,
    //       });
    //       // mark it so our appendHook knows to buffer it
    //       el._isCmpScript = true;
    //     }
    //     return el;
    //   };

    //   // Helper: if node is a CMP-script, buffer instead of injecting
    //   function bufferIfScript(node) {
    //     if (node.tagName?.toLowerCase() === 'script' && node._isCmpScript) {
    //       self._blockedScripts.push(node);
    //       return true;
    //     }
    //     return false;
    //   }

    //   // Patch appendChild
    //   Node.prototype.appendChild = function (node) {
    //     if (bufferIfScript(node)) {
    //       return node; // swallow it: never runs immediately
    //     }
    //     return origAppend.call(this, node);
    //   };

    //   // Patch insertBefore
    //   Node.prototype.insertBefore = function (newNode, refNode) {
    //     if (bufferIfScript(newNode)) {
    //       return newNode;
    //     }
    //     return origInsert.call(this, newNode, refNode);
    //   };
    // }

    // … your existing _blockScripts / _unblockScripts, etc. …

    /** After user consents, inject all buffered scripts */
    _releaseScripts() {
      this._blockedScripts.forEach((clone) => {
        const s = document.createElement('script');
        // restore attributes
        if (clone._cmpSrc) s.src = clone._cmpSrc;
        if (clone._cmpInline) s.textContent = clone._cmpInline;
        document.head.appendChild(s);
      });
      this._blockedScripts = [];
    }

    /** Hide all <script data-cmp-block> tags and stash them away */
    _blockScripts() {
      console.debug('CMP: _blockScripts() start');
      const els = document.querySelectorAll('script[data-cmp-block]');
      this._blocked = Array.from(els).map((el) => {
        const clone = document.createElement('script');
        for (const { name, value } of el.attributes) {
          clone.setAttribute(name, value);
        }
        clone.textContent = el.textContent;
        el.remove();
        return clone;
      });
      console.debug(`CMP: stashed ${this._blocked.length} scripts`);
    }

    // /** Re-insert only those the user accepted */
    _unblockScripts() {
      console.debug('CMP: _unblockScripts() start', this.choices);
      this._blocked.forEach((clone) => {
        const key = clone.getAttribute('data-vkey');
        console.debug(
          'CMP: considering blocked script',
          key,
          'consent:',
          this.choices[key],
        );
        if (this.choices[key]) {
          // make it executable if it was inert
          if (clone.getAttribute('type') === 'text/cmp-block') {
            clone.removeAttribute('type');
          }
          document.head.appendChild(clone);
          console.debug(`CMP: unleashed script with vkey="${key}"`);
        } else {
          console.debug(`CMP: skipping script vkey="${key}"`);
        }
      });
      this._blocked = [];
      console.debug('CMP: _unblockScripts() done');
    }

    _loadScript({ src, inline, attrs = {}, categoryKey, key }) {
      console.debug('CMP: _loadScript called', {
        src,
        categoryKey,
        key,
        choices: this.choices,
      });
      if (categoryKey && this.choices[categoryKey] === false) {
        console.debug(
          `CMP: skipping load of ${src} because no consent for ${categoryKey}`,
        );
        return Promise.resolve(null);
      }
      if (key && this._loadedScriptKeys.has(key)) {
        console.debug(`CMP: script with key "${key}" already loaded; skipping`);
        return Promise.resolve(null);
      }
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        if (src) s.src = src;
        if (inline) s.textContent = inline;
        Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
        s.onload = () => {
          if (key) this._loadedScriptKeys.add(key);
          console.debug(`CMP: loaded script ${src}`);
          resolve(s);
        };
        s.onerror = (e) => {
          console.warn(`CMP: failed to load script ${src}`, e);
          reject(e);
        };
        document.head.appendChild(s);
      });
    }

    /** Delete a specific cookie */
    _deleteCookie(name, domain, path = '/') {
      console.debug(
        `CMP: _deleteCookie called for cookie name="${name}", domain="${domain}", path="${path}"`,
      );

      const expireStr = 'Thu, 01 Jan 1970 00:00:00 GMT';
      const tryDomains = [];

      if (domain) {
        tryDomains.push(domain);
        // sometimes cookies were set with a leading dot
        if (!domain.startsWith('.')) tryDomains.push(`.${domain}`);
      } else {
        // fallback: current hostname and its dotted variant
        const host = window.location.hostname;
        tryDomains.push(host);
        if (!host.startsWith('.')) tryDomains.push(`.${host}`);
      }

      // Attempt deletion with multiple variants to increase chance of success
      tryDomains.forEach((dom) => {
        const cookieStr1 = `${name}=; Max-Age=0; path=${path}; domain=${dom};`;
        const cookieStr2 = `${name}=; expires=${expireStr}; path=${path}; domain=${dom};`;
        document.cookie = cookieStr1;
        console.debug(
          `CMP: attempted deletion (Max-Age) for "${name}" with domain "${dom}": ${cookieStr1}`,
        );
        document.cookie = cookieStr2;
        console.debug(
          `CMP: attempted deletion (expires) for "${name}" with domain "${dom}": ${cookieStr2}`,
        );
      });

      // Also attempt without explicit domain (some cookies may be host-scoped)
      const fallback1 = `${name}=; Max-Age=0; path=${path};`;
      const fallback2 = `${name}=; expires=${expireStr}; path=${path};`;
      document.cookie = fallback1;
      document.debug &&
        console.debug(
          `CMP: attempted deletion fallback (Max-Age) for "${name}": ${fallback1}`,
        );
      document.cookie = fallback2;
      document.debug &&
        console.debug(
          `CMP: attempted deletion fallback (expires) for "${name}": ${fallback2}`,
        );

      // Check if it's still present (best-effort; cannot detect HttpOnly)
      const stillExists = document.cookie
        .split(';')
        .map((c) => c.trim())
        .some((c) => c.startsWith(`${name}=`));

      if (stillExists) {
        console.warn(
          `CMP: cookie "${name}" still present after deletion attempts (could be HttpOnly / wrong path/domain).`,
        );
      } else {
        console.debug(`CMP: cookie "${name}" appears removed.`);
      }
    }

    /** Clear all non-necessary cookies (fallback) */
    _clearAllCookies() {
      const raw = document.cookie;
      console.debug(
        `CMP: _clearAllCookies called. current document.cookie: "${raw}"`,
      );

      if (!raw) {
        console.debug('CMP: no cookies to clear.');
        return;
      }

      const cookies = raw
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean);
      const skipped = [];
      const attempted = [];

      cookies.forEach((cookie) => {
        const eqIdx = cookie.indexOf('=');
        const name = eqIdx > -1 ? cookie.slice(0, eqIdx) : cookie;
        if (name === 'necessary') {
          skipped.push(name);
          return; // skip the known necessary cookie
        }
        attempted.push(name);
        this._deleteCookie(name);
      });

      console.debug(
        `CMP: _clearAllCookies summary: attempted=[${attempted.join(
          ', ',
        )}], skipped=[${skipped.join(', ')}]`,
      );
    }
    // turn something like "https://dev.grc3.io" into "dev.grc3.io"
    _normalizeDomainString(domainStr) {
      if (!domainStr) return window.location.hostname;
      try {
        return new URL(domainStr).hostname;
      } catch {
        return domainStr.replace(/^https?:\/\//, '').replace(/\/$/, '');
      }
    }

    _domainCandidates(hostname) {
      if (!hostname) return [];
      const parts = hostname.split('.');
      const candidates = new Set();
      // Build from most specific to less: e.g., ["dev.grc3.io", "grc3.io"]
      for (let i = 0; i <= parts.length - 2; i++) {
        const d = parts.slice(i).join('.');
        candidates.add(d);
        candidates.add(`.${d}`);
      }
      return Array.from(candidates);
    }
    /** Apply allowed/denied cookie & script state based on current choices */
    _applyAllowedCookies() {
      console.debug(
        'CMP: _applyAllowedCookies called. current choices:',
        this.choices,
      );
      console.debug('CMP: categories from /cmp/config:', this.categories);

      // Always enforce necessary
      this.choices['necessary'] = true;

      if (!Array.isArray(this.categories)) {
        console.warn(
          'CMP: no categories loaded from /cmp/config; cannot clear cookies per category.',
        );
        return;
      }

      this.categories.forEach((cat) => {
        const key = cat.key || (cat.name && cat.name.toLowerCase());
        if (!key) {
          console.debug('CMP: skipping category with no key/name', cat);
          return;
        }

        const consent = this.choices[key];
        const cookieNames = Array.isArray(cat.cookieNames)
          ? cat.cookieNames
          : [];
        console.debug(
          `CMP: evaluating category "${key}" (consent=${consent})`,
          'cookieNames:',
          cookieNames,
        );

        if (consent === false) {
          if (cookieNames.length) {
            console.debug(
              `CMP: user declined category "${key}", will clear cookies:`,
              cookieNames,
            );
            cookieNames.forEach((name) => {
              // derive domain candidates from the configured domain (e.g., "https://dev.grc3.io")
              const rawDomain = this.opts.domain || window.location.hostname;
              const normalized = this._normalizeDomainString(rawDomain); // e.g. "dev.grc3.io"
              const domainsToTry = this._domainCandidates(normalized); // includes "dev.grc3.io","\.dev.grc3.io","grc3.io",".grc3.io"
              console.log(rawDomain, normalized, domainsToTry);
              domainsToTry.forEach((dom) => {
                this._deleteCookie(name, dom);
                console.debug(
                  `CMP: attempted to clear cookie "${name}" for declined category "${key}" with domain variant "${dom}"`,
                );
              });
            });
          } else {
            console.warn(
              `CMP: category "${key}" declined but no cookieNames provided to clear.`,
            );
          }
        } else {
          console.debug(
            `CMP: category "${key}" accepted or defaulted; skipping deletion.`,
          );
        }
      });
    }

    _getTranslationConfig() {
      const translation = this.style?.translation || {};
      const defaultLanguages =
        window.GRCTranslationService?.DEFAULT_LANGUAGES || [
          { code: 'en', label: 'English' },
        ];
      const languages =
        Array.isArray(translation.languages) && translation.languages.length
          ? translation.languages
          : defaultLanguages;

      return {
        enabled: translation.enabled !== false,
        languages,
        defaultLanguage:
          translation.defaultLanguage || this.opts.defaultLanguage || 'en',
        sourceLanguage: translation.sourceLanguage || 'en',
        googleApiKey:
          translation.googleApiKey || this.opts.googleTranslateApiKey || '',
      };
    }

    _seedI18nBase() {
      const S = this.style || {};
      this._i18nBase = {
        banner: {
          title: S?.texts?.title || 'We value your privacy',
          description:
            S?.texts?.description ||
            'We use cookies to improve your experience.',
          acceptAll: S?.texts?.acceptAll || 'Accept all',
          rejectAll: S?.texts?.rejectAll || 'Reject all',
          managePrefs: S?.texts?.managePrefs || 'Manage preferences',
          policyText: S?.policyText || 'Privacy Policy',
          imprintText: S?.imprintText || 'Imprint',
        },
        pref: {
          title: S?.prefContent?.title || 'Manage Preferences',
          description:
            S?.prefContent?.description || 'Customize your cookie settings.',
          saveAllText: S?.prefContent?.saveAllText || 'Save Preferences',
          rejectAllText: S?.prefContent?.rejectAllText || 'Reject All',
          acceptAllText: S?.prefContent?.acceptAllText || 'Accept all',
        },
        categories: (this.categories || []).map((cat) => ({
          key: cat.key,
          name: cat.name || '',
          description: cat.description || '',
        })),
      };
      this._translatedText = JSON.parse(JSON.stringify(this._i18nBase));
    }

    async _getTranslationsForLanguage(langCode) {
      if (!this._i18nBase) this._seedI18nBase();
      const cfg = this._getTranslationConfig();
      const source = cfg.sourceLanguage || 'en';

      if (!cfg.enabled || !langCode || langCode === source) {
        return JSON.parse(JSON.stringify(this._i18nBase));
      }
      if (this._translationCache[langCode]) {
        return this._translationCache[langCode];
      }

      const keys = [];
      const values = [];
      const add = (k, v) => {
        keys.push(k);
        values.push(v || '');
      };

      add('banner.title', this._i18nBase.banner.title);
      add('banner.description', this._i18nBase.banner.description);
      add('banner.acceptAll', this._i18nBase.banner.acceptAll);
      add('banner.rejectAll', this._i18nBase.banner.rejectAll);
      add('banner.managePrefs', this._i18nBase.banner.managePrefs);
      add('banner.policyText', this._i18nBase.banner.policyText);
      add('banner.imprintText', this._i18nBase.banner.imprintText);
      add('pref.title', this._i18nBase.pref.title);
      add('pref.description', this._i18nBase.pref.description);
      add('pref.saveAllText', this._i18nBase.pref.saveAllText);
      add('pref.rejectAllText', this._i18nBase.pref.rejectAllText);
      add('pref.acceptAllText', this._i18nBase.pref.acceptAllText);
      (this._i18nBase.categories || []).forEach((cat) => {
        add(`category.${cat.key}.name`, cat.name);
        add(`category.${cat.key}.description`, cat.description);
      });

      let translated = [];
      try {
        translated = await window.GRCTranslationService.translateBatch({
          texts: values,
          target: langCode,
          source,
          googleApiKey: cfg.googleApiKey || '',
        });
      } catch (e) {
        console.warn('CMP: translation failed, keeping base language', e);
        return JSON.parse(JSON.stringify(this._i18nBase));
      }

      const map = {};
      keys.forEach((k, idx) => {
        map[k] = translated[idx] || values[idx];
      });

      const out = {
        banner: {
          title: map['banner.title'],
          description: map['banner.description'],
          acceptAll: map['banner.acceptAll'],
          rejectAll: map['banner.rejectAll'],
          managePrefs: map['banner.managePrefs'],
          policyText: map['banner.policyText'],
          imprintText: map['banner.imprintText'],
        },
        pref: {
          title: map['pref.title'],
          description: map['pref.description'],
          saveAllText: map['pref.saveAllText'],
          rejectAllText: map['pref.rejectAllText'],
          acceptAllText: map['pref.acceptAllText'],
        },
        categories: (this._i18nBase.categories || []).map((cat) => ({
          key: cat.key,
          name: map[`category.${cat.key}.name`] || cat.name,
          description:
            map[`category.${cat.key}.description`] || cat.description,
        })),
      };
      this._translationCache[langCode] = out;
      return out;
    }

    _createLanguageSelect(onChange) {
      const cfg = this._getTranslationConfig();
      if (
        !cfg.enabled ||
        !Array.isArray(cfg.languages) ||
        cfg.languages.length < 2
      ) {
        return null;
      }

      return window.GRCTranslationService.createLanguageDropdown({
        languages: cfg.languages,
        value: this._activeLanguage || cfg.defaultLanguage,
        onChange,
        label: 'Language',
        layout: 'row',
      });
    }

    _applyTranslatedTextToUI() {
      const t = this._translatedText;
      if (!t) return;

      if (this._bannerRefs) {
        if (this._bannerRefs.languageSelect) {
          this._bannerRefs.languageSelect.value = this._activeLanguage;
        }
        if (this._bannerRefs.title) {
          this._bannerRefs.title.textContent = t.banner.title;
        }
        if (this._bannerRefs.description) {
          this._bannerRefs.description.textContent = t.banner.description;
        }
        if (this._bannerRefs.acceptBtn) {
          this._bannerRefs.acceptBtn.textContent = t.banner.acceptAll;
        }
        if (this._bannerRefs.rejectBtn) {
          this._bannerRefs.rejectBtn.textContent = t.banner.rejectAll;
        }
        if (this._bannerRefs.manageBtn) {
          this._bannerRefs.manageBtn.textContent = t.banner.managePrefs;
        }
        if (this._bannerRefs.policyLink) {
          this._bannerRefs.policyLink.textContent = t.banner.policyText;
        }
        if (this._bannerRefs.imprintLink) {
          this._bannerRefs.imprintLink.textContent = t.banner.imprintText;
        }
      }

      if (this._prefRefs) {
        if (this._prefRefs.languageSelect) {
          this._prefRefs.languageSelect.value = this._activeLanguage;
        }
        if (this._prefRefs.title) {
          this._prefRefs.title.textContent = t.pref.title;
        }
        if (this._prefRefs.description) {
          this._prefRefs.description.textContent = t.pref.description;
        }
        if (this._prefRefs.acceptBtn) {
          this._prefRefs.acceptBtn.textContent = t.pref.acceptAllText;
        }
        if (this._prefRefs.saveBtn) {
          this._prefRefs.saveBtn.textContent = t.pref.saveAllText;
        }
        if (this._prefRefs.rejectBtn) {
          this._prefRefs.rejectBtn.textContent = t.pref.rejectAllText;
        }
        (this._prefRefs.categories || []).forEach((row) => {
          const found = (t.categories || []).find((c) => c.key === row.key);
          if (!found) return;
          if (row.nameEl) row.nameEl.textContent = found.name;
          if (row.descEl) row.descEl.textContent = found.description;
        });
      }
    }

    async _setLanguage(langCode) {
      this._activeLanguage = langCode;
      this._translatedText = await this._getTranslationsForLanguage(langCode);
      this._applyTranslatedTextToUI();
    }

    /** render the floating cookie button */
    _renderFloatingBtn() {
      if (this._floatingBtnEl) return;
      // ─── inject rotate keyframes once ───
      if (!document.getElementById('floating-btn-animation-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'floating-btn-animation-style';
        styleEl.textContent = `
        @keyframes rotate {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        /* optional: a little pulse on hover */
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.1); }
        }
      `;
        document.head.appendChild(styleEl);
      }
      // ────────────────────────────────────────         // only once
      const btn = document.createElement('button');
      btn.id = 'cmp-floating-btn';
      btn.title = 'Change cookie settings';

      // ─── NEW: put an <img> inside the button instead of innerText ───
      const img = document.createElement('img');
      img.src =
        this.style.prefStyles?.buttonIconUrl ||
        'http://demo2.grc3.io/apiv2/CookieImage.png';
      img.alt = 'Cookie Settings';
      // size it to fit nicely in the circle:
      Object.assign(img.style, {
        width: '70%', // 60% of button width/height
        height: '70%',
        display: 'block',
        margin: 'auto',
      });
      btn.appendChild(img);
      // ───────────────────────────────────────────────────────────────────

      Object.assign(btn.style, {
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        border: 'none',
        background: '#22c55e' || this.style.prefStyles?.buttonBg || '#22c55e',
        color: this.style.prefStyles?.buttonText || '#fff',
        cursor: 'pointer',
        zIndex: 10002,
        padding: '0',
        animation: 'pulse 4s linear infinite',
        transition: 'transform 0.2s ease-in-out',
      });

      btn.addEventListener('mouseover', () => {
        btn.style.animation = 'pulse 1.5s ease-in-out infinite';
      });

      btn.addEventListener('click', () => {
        this._renderBanner();
        this._removeFloatingBtn();
      });
      document.body.appendChild(btn);
      this._floatingBtnEl = btn;
    }

    /** remove the floating button */
    _removeFloatingBtn() {
      if (this._floatingBtnEl) {
        this._floatingBtnEl.remove();
        this._floatingBtnEl = null;
      }
    }

    /** Subscribe to 'ready' or 'consentChange' */
    on(evt, fn) {
      if (this._listeners[evt]) {
        this._listeners[evt].push(fn);
      }
    }

    /** Get current consent choices */
    getConsent() {
      return { ...this.choices };
    }

    /** Get stored metadata */
    getMetadata() {
      return { ...this.metadata };
    }

    /** Set one metadata key & persist */
    setMetadata(key, value) {
      this.metadata[key] = value;
      saveStore({ userId: this.userId, metadata: this.metadata });
    }

    /** Re-open the Preference Center */
    showPreferences() {
      this._renderPrefs && this._renderPrefs();
    }

    // — init(opts) —
    async init(opts) {
      console.log('CMP.init() called with:', opts);
      // 1) Normalize & validate
      this.opts = {
        apiBaseUrl: '',
        configId: null,
        domain: window.location.hostname,
        ...opts,
      };
      if (!this.opts.apiBaseUrl || !this.opts.configId) {
        throw new Error('CMP.init requires { apiBaseUrl, configId }');
      }

      // 2) Load/create userId + metadata
      let store = loadStore();
      if (!store || typeof store.userId !== 'string') {
        store = { userId: crypto.randomUUID(), metadata: {} };
        saveStore(store);
      }
      this.userId = store.userId;
      this.metadata = store.metadata;

      // 3) Fetch banner config
      const cfgRes = await fetch(
        `${this.opts.apiBaseUrl}/cmp/configs/${this.opts.configId}`,
        { credentials: 'include' },
      );
      if (!cfgRes.ok) {
        throw new Error('CMP.init: failed to load banner config');
      }
      const cfg = await cfgRes.json();

      // 4) Merge styleConfig + overrides
      this.style = cloneDeep(cfg.styleConfig || {});
      if (cfg.overrideEnabled && cfg.modifiedFields) {
        Object.entries(cfg.modifiedFields).forEach(([path, val]) =>
          setDeep(this.style, path, val),
        );
      }

      // 5) Fetch categories
      const catUrl = new URL(`${this.opts.apiBaseUrl}/cmp/config`);
      catUrl.searchParams.set('domain', this.opts.domain);
      const catRes = await fetch(catUrl, { credentials: 'include' });
      if (!catRes.ok) {
        throw new Error('CMP.init: failed to load categories');
      }
      this.categories = await catRes.json();

      await ensureSharedTranslationService();
      this._seedI18nBase();
      this._translationCache = {};
      this._activeLanguage = this._getTranslationConfig().defaultLanguage;

      // 6) Fetch existing consent
      const prefUrl = new URL(`${this.opts.apiBaseUrl}/cmp/consent`);
      prefUrl.searchParams.set('domain', this.opts.domain);
      prefUrl.searchParams.set('userId', this.userId);
      const prefRes = await fetch(prefUrl, { credentials: 'include' });
      if (prefRes.ok) {
        const prefJson = await prefRes.json();
        if (Array.isArray(prefJson.categories)) {
          prefJson.categories.forEach((c) => {
            this.choices[c.key] = c.accepted;
          });
        } else if (prefJson.choices && typeof prefJson.choices === 'object') {
          Object.entries(prefJson.choices).forEach(([k, v]) => {
            this.choices[k] = !!v;
          });
        }
      }

      // BLOCK all CMP‐blocked scripts until we know what the user wants
      this._blockScripts();

      // 7) Seed defaults for any unset categories
      (this.style.cookieCategories || []).forEach((cat) => {
        const key = cat.key || cat.name.toLowerCase();
        if (this.choices[key] === undefined) {
          this.choices[key] = Boolean(cat.default);
        }
      });

      // 8) Fire 'ready' event
      this._fireReady();

      // 9) Conditionally render the banner
      const allAnswered = this.categories.every(
        (cat) => typeof this.choices[cat.key] === 'boolean',
      );
      if (!allAnswered) {
        console.log('CMP.init(): showing banner (not all answered)');
        this._renderBanner();
      } else {
        console.log('CMP.init(): all answered, rendering floating button');
        // user already has consent stored → apply it, then show floating / release
        this._applyAllowedCookies();
        this._renderFloatingBtn();
        this._unblockScripts();
        this._releaseScripts();
      }

      // ensure SPA navigation re-applies consent
      this._setupNavigationListener();

      // periodic and settled reapplications
      this._setupPeriodicReapply();
      this._setupSettleWatcher();
      // install interception/monitoring before seeding defaults so any writes during page load
      // are caught immediately
      this._setupCookieInterceptor();
      this._setupCookieMonitor();

      // 10) Build the Preferences modal now that choices are fully seeded
      this._preparePreferenceCenter();
      await this._setLanguage(this._activeLanguage);
      console.log('CMP.init() complete');
    }

    /** Emit 'ready' */
    _fireReady() {
      const payload = {
        style: this.style,
        categories: this.categories,
        userId: this.userId,
        metadata: this.getMetadata(),
        choices: this.getConsent(),
      };
      this._listeners.ready.forEach((fn) => fn(payload));
      if (typeof this.opts.onReady === 'function') {
        this.opts.onReady(payload);
      }
    }

    /** Public helper to re-apply current consent decisions */
    applyConsent() {
      this._applyAllowedCookies();
    }

    /** Install listeners / wrappers so SPA navigations re-apply consent */
    _setupNavigationListener() {
      if (this._navHooked) return;
      this._navHooked = true;

      const reapply = () => {
        console.debug(
          'CMP: SPA navigation detected, reapplying consent. current URL:',
          location.href,
        );
        this.applyConsent();

        // restart settle watcher so it observes new page content
        if (this._settleObserver) {
          this._settleObserver.disconnect();
          this._settleObserver = null;
        }
        this._setupSettleWatcher();
        // inside reapply in _setupNavigationListener
        this._stopCookieMonitor();
        this._setupCookieMonitor();
      };

      // Wrap history API to detect pushState / replaceState
      const origPush = history.pushState;
      const origReplace = history.replaceState;

      history.pushState = function (...args) {
        console.debug('CMP: history.pushState called', {
          args,
          from: document.referrer,
          before: location.href,
        });
        const result = origPush.apply(this, args);
        setTimeout(() => {
          console.debug('CMP: after pushState new URL', location.href);
          reapply();
        }, 0);
        return result;
      };

      history.replaceState = function (...args) {
        console.debug('CMP: history.replaceState called', {
          args,
          before: location.href,
        });
        const result = origReplace.apply(this, args);
        setTimeout(() => {
          console.debug('CMP: after replaceState new URL', location.href);
          reapply();
        }, 0);
        return result;
      };

      // Back/forward & hash change
      window.addEventListener('popstate', (e) => {
        console.debug('CMP: popstate event', e, 'current URL:', location.href);
        reapply();
      });
      window.addEventListener('hashchange', (e) => {
        console.debug(
          'CMP: hashchange event',
          e,
          'current URL:',
          location.href,
        );
        reapply();
      });
    }

    /** start periodic re-application of the current consent */
    _setupPeriodicReapply() {
      if (this._periodicReapplyId) return;
      this._periodicReapplyId = setInterval(() => {
        console.debug('CMP: periodic reapply of consent');
        this.applyConsent();
      }, 30_000); // 30 seconds
    }

    _setupSettleWatcher() {
      if (this._settleObserver) return;

      let settleTimer = null;
      const scheduleApply = () => {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          console.debug('CMP: page settled, reapplying consent');
          this.applyConsent();
        }, 500); // 500ms of no mutations = settled
      };

      this._settleObserver = new MutationObserver(() => {
        scheduleApply();
      });

      // Observe wide set of changes so we detect dynamic content injection
      this._settleObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      // Kick off initial settle timer
      scheduleApply();

      // Fallback in case mutations keep happening: ensure at least one apply
      setTimeout(() => {
        console.debug('CMP: settle watcher fallback applyConsent');
        this.applyConsent();
      }, 5000);
    }

    /** Called when a cookie is written via document.cookie setter interception */
    _onCookieWrite(name) {
      if (!this._cookieNameToCategory) {
        this._cookieNameToCategory = {};
        (this.categories || []).forEach((cat) => {
          (cat.cookieNames || []).forEach((cn) => {
            this._cookieNameToCategory[cn] = cat.key;
          });
        });
      }

      const catKey = this._cookieNameToCategory[name];
      if (catKey && this.choices[catKey] === false) {
        console.debug(
          `CMP: intercepted write of cookie "${name}" for declined category "${catKey}", deleting it`,
        );
        const normalized = this._normalizeDomainString(this.opts.domain);
        this._deleteCookie(name, normalized);
      }
    }

    /** Hook document.cookie setter to intercept JS writes (with debounce & recursion guard) */
    _setupCookieInterceptor() {
      if (this._cookieInterceptorInstalled) return;
      this._cookieInterceptorInstalled = true;

      try {
        // cookie descriptor lives on Document.prototype in browsers
        const proto = Document.prototype || HTMLDocument.prototype;
        const desc =
          Object.getOwnPropertyDescriptor(proto, 'cookie') ||
          Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
        if (!desc || !desc.configurable) {
          console.warn(
            'CMP: cookie property not configurable; interceptor skipped',
          );
          return;
        }

        const self = this;
        Object.defineProperty(document, 'cookie', {
          configurable: true,
          enumerable: true,
          get() {
            return desc.get.call(document);
          },
          set(val) {
            const name = val.split('=')[0].trim();
            // perform original set
            desc.set.call(document, val);

            // avoid re-entrancy when our own deletion triggers setter
            if (self._suppressCookieHook) return;

            try {
              self._suppressCookieHook = true;
              self._lastHandledCookie ??= {};
              if (self._lastHandledCookie[name]) {
                return; // debounce duplicate rapid writes
              }
              self._lastHandledCookie[name] = true;
              setTimeout(() => {
                delete self._lastHandledCookie[name];
              }, 500);

              // delegate to handler
              self._onCookieWrite?.(name);
            } finally {
              self._suppressCookieHook = false;
            }
          },
        });

        console.debug('CMP: installed cookie write interceptor');
      } catch (e) {
        console.warn('CMP: failed to install cookie interceptor', e);
      }
    }

    /** Poll for new cookies as a fallback (e.g., HTTP-set ones) */
    _setupCookieMonitor(pollInterval = 2000) {
      if (this._cookieMonitorId) return;

      // snapshot current cookie names
      let previousNames = (document.cookie || '')
        .split(';')
        .map((c) => c.trim().split('=')[0])
        .filter(Boolean);

      // keep known set in sync if you need it elsewhere
      this._knownCookies = new Set(previousNames);

      this._cookieMonitorId = setInterval(() => {
        const currentNames = (document.cookie || '')
          .split(';')
          .map((c) => c.trim().split('=')[0])
          .filter(Boolean);

        // newly added cookies since last tick
        const added = currentNames.filter((n) => !previousNames.includes(n));
        if (added.length) {
          console.debug('CMP: cookie monitor detected new cookie(s):', added);
          added.forEach((name) => {
            this._onCookieWrite?.(name);
          });
        }

        // keep baseline for next comparison
        previousNames = currentNames;
        // optionally keep knownCookies updated
        currentNames.forEach((n) => this._knownCookies.add(n));
        // prune if removed (optional)
        Array.from(this._knownCookies).forEach((n) => {
          if (!currentNames.includes(n)) this._knownCookies.delete(n);
        });
      }, pollInterval);
    }

    /** Minimal handler invoked when any cookie appears/written */
    _onCookieWrite(name) {
      // map cookie to category from /cmp/config
      const cat = (this.categories || []).find(
        (c) => Array.isArray(c.cookieNames) && c.cookieNames.includes(name),
      );
      if (!cat) return;

      const key = cat.key || (cat.name && cat.name.toLowerCase());
      if (key && this.choices[key] === false) {
        const normalizedDomain = this._normalizeDomainString(this.opts.domain);
        console.debug(
          `CMP: cookie "${name}" belongs to declined category "${key}", deleting it (domain normalized to "${normalizedDomain}")`,
        );
        this._deleteCookie(name, normalizedDomain);
      }
    }

    _stopCookieMonitor() {
      if (this._cookieMonitorId) {
        clearInterval(this._cookieMonitorId);
        this._cookieMonitorId = null;
      }
    }

    /** insert a full-screen transparent blocker under the banner */
    _renderBlocker() {
      if (this._blockerEl) return;
      const blk = document.createElement('div');
      blk.id = 'cmp-blocker';
      Object.assign(blk.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0)', // transparent
        zIndex: 9999, // just under the banner (banner is at 10000)
        cursor: 'default',
      });
      document.body.appendChild(blk);
      this._blockerEl = blk;
    }

    /** remove that blocker when the banner goes away */
    _removeBlocker() {
      if (this._blockerEl) {
        this._blockerEl.remove();
        this._blockerEl = null;
      }
    }

    /** Render the consent banner */
    _renderBanner() {
      this._removeFloatingBtn();
      if (this._bannerEl) return;
      this._bannerRefs = null;

      const S = this.style;

      const container = document.createElement('div');
      container.id = 'cmp-banner';

      Object.assign(container.style, {
        position: 'fixed',
        backgroundColor: S.backgroundColor,
        color: S.textColor,
        padding: S.bannerStyles.padding,
        borderRadius: S.bannerStyles.borderRadius,
        boxShadow: S.bannerStyles.boxShadow,
        fontFamily: S.bannerStyles.fontFamily,
        fontSize: S.bannerStyles.fontSize,
        textAlign: S.bannerStyles.textAlign,
        display: 'flex',
        flexDirection:
          S.bannerStyles.orientation === 'horizontal' ? 'row' : 'column',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        boxSizing: 'border-box',
        zIndex: 10000,
      });

      const { type: layoutType, position: layoutPosition } = S.layout;

      if (layoutType === 'bar') {
        Object.assign(container.style, {
          left: 0,
          right: 0,
          [layoutPosition]: 0,
          width: '100%',
        });
      } else if (layoutType === 'toast') {
        const [vert, hor] = layoutPosition.split('-');
        Object.assign(container.style, {
          [vert]: '1rem',
          [hor]: '1rem',
          width: '260px',
        });
      } else if (layoutType === 'floating') {
        if (layoutPosition === 'center') {
          Object.assign(container.style, {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            maxWidth: '400px',
          });
        } else if (layoutPosition === 'top-center') {
          Object.assign(container.style, {
            top: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            maxWidth: '400px',
          });
        } else if (layoutPosition === 'bottom-center') {
          Object.assign(container.style, {
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            maxWidth: '400px',
          });
        } else {
          const [vert, hor] = layoutPosition.split('-');
          Object.assign(container.style, {
            [vert]: '1rem',
            [hor || 'left']: '1rem',
            width: '80%',
            maxWidth: '400px',
          });
        }
      }

      // ================= CLOSE BUTTON =================
      if (S.bannerClose?.enabled) {
        const close = document.createElement('button');
        close.textContent = '×';

        Object.assign(close.style, {
          position: 'absolute',
          top: S.bannerClose.offset,
          right: S.bannerClose.offset,
          fontSize: S.bannerClose.size,
          background: S.bannerClose.bg,
          color: S.bannerClose.color,
          border: `${S.bannerClose.borderWidth} solid ${S.bannerClose.borderColor}`,
          borderRadius: S.bannerClose.borderRadius,
          cursor: 'pointer',
        });

        close.onclick = () => this._removeBanner();
        container.appendChild(close);
      }

      // ================= LOGO =================
      if (S.logo) {
        const img = document.createElement('img');
        img.src = S.logo;
        img.alt = 'Logo';
        img.style.maxHeight = '40px';
        container.appendChild(img);
      }

      // ================= TEXT =================
      const textWrap = document.createElement('div');
      textWrap.style.flex = '1';

      const pTitle = document.createElement('p');
      pTitle.textContent = S.texts.title;
      Object.assign(pTitle.style, {
        margin: 0,
        fontWeight: 600,
      });

      const pDesc = document.createElement('p');
      pDesc.textContent = S.texts.description;
      pDesc.style.margin = '0.25rem 0';

      textWrap.append(pTitle, pDesc);

      // ================= LINKS =================
      const linksRow = document.createElement('div');
      Object.assign(linksRow.style, {
        marginTop: '0.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        justifyContent: S.bannerStyles.linkAlign || 'left',
      });

      let policyLink = null;
      let imprintLink = null;

      if (S.showPolicyLink) {
        const a = document.createElement('a');
        a.href = S.policyUrl;
        a.textContent = S.policyText;
        a.style.color = S.linkStyles?.textColor;
        a.style.textDecoration = S.linkStyles?.decoration;
        linksRow.appendChild(a);
        policyLink = a;
      }

      if (S.showImprintLink) {
        const a = document.createElement('a');
        a.href = S.imprintUrl;
        a.textContent = S.imprintText;
        a.style.color = S.linkStyles?.textColor;
        a.style.textDecoration = S.linkStyles?.decoration;
        linksRow.appendChild(a);
        imprintLink = a;
      }

      if (S.policyLinkPosition === 'separate') {
        // container.appendChild(linksRow);
        pDesc.appendChild(document.createTextNode(' '));
        pDesc.appendChild(linksRow);
      } else {
        textWrap.appendChild(linksRow);
      }

      container.appendChild(textWrap);

      // ================= BUTTONS =================
      const btnRow = document.createElement('div');

      Object.assign(btnRow.style, {
        display: 'flex',
        gap: '0.5rem',
        flexDirection: S.bannerButtonStyles?.stackButtons ? 'column' : 'row',
        justifyContent: S.bannerStyles.buttonAlign || 'left',
      });

      const btnConfig = Object.entries(S.bannerButtonStyles || {})
        .filter(([k, v]) => v && typeof v === 'object' && v.enabled === true)
        .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

      const bannerBtnRefs = {};

      btnConfig.forEach(([type, cfg]) => {
        const actionMap = {
          accept: () => this._acceptAll(),
          reject: () => this._rejectAll(),
          manage: () => this.showPreferences(),
        };

        const textMap = {
          accept: S.texts.acceptAll,
          reject: S.texts.rejectAll,
          manage: S.texts.managePrefs,
        };

        if (!actionMap[type]) return;

        const b = document.createElement('button');
        b.textContent = textMap[type];

        Object.assign(b.style, {
          backgroundColor: cfg.bg,
          color: cfg.text,
          padding: cfg.padding,
          borderRadius: cfg.borderRadius,
          border: `${cfg.borderWidth} solid ${cfg.borderColor}`,
          transition: cfg.transition,
          fontWeight: cfg.fontWeight,
          textDecoration: cfg.underline ? 'underline' : 'none',
          cursor: 'pointer',
        });

        b.onclick = actionMap[type];
        btnRow.appendChild(b);
        bannerBtnRefs[type] = b;
      });

      container.appendChild(btnRow);

      const langControl = this._createLanguageSelect((code) =>
        this._setLanguage(code),
      );
      if (langControl) {
        const langWrap = document.createElement('div');
        Object.assign(langWrap.style, {
          width: '100%',
          flexBasis: '100%',
          marginTop: '0.5rem',
        });
        langWrap.appendChild(langControl.wrap);
        container.appendChild(langWrap);
        this._bannerRefs = this._bannerRefs || {};
        this._bannerRefs.languageSelect = langControl.select;
      }

      document.body.appendChild(container);
      this._bannerEl = container;
      this._bannerRefs = {
        ...(this._bannerRefs || {}),
        title: pTitle,
        description: pDesc,
        acceptBtn: bannerBtnRefs.accept,
        rejectBtn: bannerBtnRefs.reject,
        manageBtn: bannerBtnRefs.manage,
        policyLink,
        imprintLink,
      };
      this._applyTranslatedTextToUI();
    }

    /** Accept All */
    _acceptAll() {
      console.log('CMP: _acceptAll()');
      this.categories.forEach((c) => (this.choices[c.key] = true));
      this._saveConsent();
      this._emitConsentChange();
      this._removeBanner();
      this._renderFloatingBtn();
      this._unblockScripts();
      this._releaseScripts();
    }

    /** Reject All */
    _rejectAll() {
      console.log('CMP: _rejectAll()');
      this.categories.forEach((c) => (this.choices[c.key] = false));
      this._saveConsent();
      this._emitConsentChange();
      this._removeBanner();
      this._renderFloatingBtn();
      this._unblockScripts();
      this._releaseScripts();
    }

    /** Remove banner */
    _removeBanner() {
      this._renderFloatingBtn();
      this._removeBlocker();
      if (this._bannerEl) {
        this._bannerEl.remove();
        this._bannerEl = null;
      }
    }

    // — Advanced Preferences Modal —
    _preparePreferenceCenter() {
      const S = this.style;
      this._prefRefs = null;

      const overlay = document.createElement('div');
      overlay.id = 'cmp-preferences-overlay';
      Object.assign(overlay.style, {
        display: 'none',
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 10001,
        justifyContent: 'center',
        alignItems: 'center',
      });

      const modal = document.createElement('div');
      Object.assign(modal.style, {
        background: S.prefStyles.bgColor,
        borderRadius: '0.5rem',
        width: '90%',
        maxWidth: '500px',
        boxSizing: 'border-box',
        position: 'relative',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      });

      // ================= HEADER =================
      const header = document.createElement('div');
      Object.assign(header.style, {
        background: S.prefStyles.prefHeaderBg,
        color: S.prefStyles.prefHeaderTextColor,
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      });

      const h2 = document.createElement('h2');
      h2.textContent = S.prefContent.title;
      h2.style.margin = '0';

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        fontSize: '1.25rem',
        cursor: 'pointer',
      });
      closeBtn.onclick = () => (overlay.style.display = 'none');

      header.append(h2, closeBtn);
      modal.appendChild(header);

      // ================= BODY =================
      const bodyWrap = document.createElement('div');
      Object.assign(bodyWrap.style, {
        padding: '1rem',
        overflowY: 'auto',
      });

      // ================= DESCRIPTION + POLICY LINK =================
      const descWrap = document.createElement('div');

      const desc = document.createElement('p');
      desc.textContent = S.prefContent.description;
      desc.style.margin = '0 0 0.5rem';
      desc.style.color = S.prefStyles.textColor;

      descWrap.appendChild(desc);

      // INLINE MODE
      if (S.showPrefPolicyLink && S.prefPolicyLinkPosition === 'inline') {
        const link = document.createElement('a');
        link.href = S.prefPolicyUrl;
        link.textContent = S.prefPolicyText;

        link.style.color = S.prefPolicyLinkStyles?.textColor;
        link.style.textDecoration = S.prefPolicyLinkStyles?.decoration;

        desc.appendChild(document.createTextNode(' '));
        desc.appendChild(link);
      }

      // SEPARATE MODE
      if (S.showPrefPolicyLink && S.prefPolicyLinkPosition === 'separate') {
        const link = document.createElement('a');
        link.href = S.prefPolicyUrl;
        link.textContent = S.prefPolicyText;

        link.style.display = 'block';
        link.style.marginBottom = '1rem';
        link.style.color = S.prefPolicyLinkStyles?.textColor;
        link.style.textDecoration = S.prefPolicyLinkStyles?.decoration;

        descWrap.appendChild(link);
      }

      bodyWrap.appendChild(descWrap);

      const prefLangControl = this._createLanguageSelect((code) =>
        this._setLanguage(code),
      );
      if (prefLangControl) {
        const langRow = document.createElement('div');
        Object.assign(langRow.style, {
          width: '100%',
          marginBottom: '0.75rem',
        });
        langRow.appendChild(prefLangControl.wrap);
        bodyWrap.appendChild(langRow);
      }

      const prefCategoryRefs = [];

      this.categories.forEach((cat) => {
        const section = document.createElement('div');
        Object.assign(section.style, {
          border: `1px solid ${S.prefSectionStyles.borderColor}`,
          borderRadius: S.prefSectionStyles.borderRadius,
          marginBottom: '1rem',
          overflow: 'hidden',
        });

        let expanded = false;

        const hdr = document.createElement('div');
        Object.assign(hdr.style, {
          backgroundColor: S.prefSectionStyles.categoryTitleBg,
          color: S.prefSectionStyles.categoryTitleText,
          padding: S.prefSectionStyles.titlePadding,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        });

        const left = document.createElement('div');
        Object.assign(left.style, {
          display: 'flex',
          alignItems: 'center',
          gap: S.prefSectionStyles.iconTitleGap,
        });

        if (cat.icon) {
          const icon = document.createElement('img');
          icon.src = cat.icon;
          icon.style.width = '20px';
          icon.style.height = '20px';
          left.appendChild(icon);
        }

        const lbl = document.createElement('span');
        lbl.textContent = cat.name;
        left.appendChild(lbl);

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = !!this.choices[cat.key];
        toggle.disabled = cat.default; // lock Necessary
        toggle.onchange = () => {
          this.choices[cat.key] = toggle.checked;
        };

        this._toggles[cat.key] = toggle;

        hdr.append(left, toggle);
        section.appendChild(hdr);

        // ================= COLLAPSIBLE BODY =================
        const body = document.createElement('div');
        Object.assign(body.style, {
          display: 'none',
          backgroundColor: S.prefSectionStyles.categoryDescBg,
          color: S.prefSectionStyles.categoryDescText,
          padding: S.prefSectionStyles.descPadding,
        });

        // Description
        const descBox = document.createElement('p');
        descBox.textContent = cat.description || '';
        descBox.style.margin = '0 0 0.5rem';
        body.appendChild(descBox);
        prefCategoryRefs.push({ key: cat.key, nameEl: lbl, descEl: descBox });

        // POLICY LINK (INLINE SUPPORT)
        if (S.showPrefPolicyLink && S.prefPolicyLinkPosition === 'inline') {
          const link = document.createElement('a');
          link.href = S.prefPolicyUrl;
          link.textContent = S.prefPolicyText;
          link.style.color = S.prefPolicyLinkStyles?.textColor;
          link.style.textDecoration = S.prefPolicyLinkStyles?.decoration;
          body.appendChild(link);
        }

        // ================= VENDOR LIST (TOGGLE) =================
        if (cat.showVendors && S.listsContent?.vendors?.length) {
          const vLink = document.createElement('div');
          vLink.textContent = S.listsContent.vendorListTitle;
          Object.assign(vLink.style, {
            color: S.prefPolicyLinkStyles?.textColor,
            textDecoration: 'underline',
            cursor: 'pointer',
            marginTop: '0.5rem',
          });

          const vList = document.createElement('div');
          vList.style.display = 'none';

          S.listsContent.vendors.forEach((v) => {
            const item = document.createElement('div');
            Object.assign(item.style, {
              background: S.listsStyles.dataBgColor,
              color: S.listsStyles.dataTextColor,
              padding: S.listsStyles.dataPadding,
              marginTop: '4px',
            });
            item.innerHTML = `<strong>${v.title}</strong><br>${v.description}`;
            vList.appendChild(item);
          });

          vLink.onclick = () => {
            vList.style.display =
              vList.style.display === 'none' ? 'block' : 'none';
          };

          body.appendChild(vLink);
          body.appendChild(vList);
        }

        // ================= COOKIE LIST (TOGGLE) =================
        if (cat.showCookieList && S.listsContent?.cookies?.length) {
          const cLink = document.createElement('div');
          cLink.textContent = S.listsContent.cookieListTitle;
          Object.assign(cLink.style, {
            color: S.prefPolicyLinkStyles?.textColor,
            textDecoration: 'underline',
            cursor: 'pointer',
            marginTop: '0.5rem',
          });

          const cList = document.createElement('div');
          cList.style.display = 'none';

          S.listsContent.cookies.forEach((group) => {
            const g = document.createElement('div');
            g.style.marginTop = '4px';

            const title = document.createElement('div');
            title.innerHTML = `<strong>${group.title}</strong>`;
            g.appendChild(title);

            group.description.forEach((c) => {
              const row = document.createElement('div');
              Object.assign(row.style, {
                background: S.listsStyles.dataBgColor,
                color: S.listsStyles.dataTextColor,
                padding: S.listsStyles.dataPadding,
                marginTop: '4px',
              });

              row.innerHTML = `
            ${c.name} (${c.duration})<br>
            ${c.description}
          `;
              g.appendChild(row);
            });

            cList.appendChild(g);
          });

          cLink.onclick = () => {
            cList.style.display =
              cList.style.display === 'none' ? 'block' : 'none';
          };

          body.appendChild(cLink);
          body.appendChild(cList);
        }

        section.appendChild(body);

        // ================= ACCORDION =================
        hdr.onclick = () => {
          expanded = !expanded;
          body.style.display = expanded ? 'block' : 'none';
        };

        bodyWrap.appendChild(section);
      });

      modal.appendChild(bodyWrap);

      // ================= FOOTER BUTTON BAR =================
      const footer = document.createElement('div');
      Object.assign(footer.style, {
        background: S.prefStyles.footerBg,
        padding: '1rem',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '0.5rem',
      });

      const makeBtn = (cfg, text, handler) => {
        if (!cfg?.enabled) return null;
        const b = document.createElement('button');
        b.textContent = text;
        Object.assign(b.style, {
          background: cfg.bg,
          color: cfg.text,
          padding: cfg.padding,
          borderRadius: cfg.borderRadius,
          border: `${cfg.borderWidth} solid ${cfg.borderColor}`,
          cursor: 'pointer',
          fontWeight: cfg.fontWeight,
        });
        b.onclick = handler;
        return b;
      };

      const btnAccept = makeBtn(
        S.prefButtonStyles.acceptAll,
        S.prefContent.acceptAllText || "Accept All",
        () => {
          this._acceptAll();
          overlay.style.display = 'none';
        },
      );

      const btnSave = makeBtn(
        S.prefButtonStyles.saveAll,
        S.prefContent.saveAllText,
        () => {
          this._saveConsent();
          this._emitConsentChange();
          overlay.style.display = 'none';
          this._removeBanner();
          this._renderFloatingBtn();
          this._unblockScripts();
          this._releaseScripts();
        },
      );

      const btnReject = makeBtn(
        S.prefButtonStyles.rejectAll,
        S.prefContent.rejectAllText,
        () => {
          this._rejectAll();
          overlay.style.display = 'none';
        },
      );

      [btnAccept, btnSave, btnReject].forEach(
        (b) => b && footer.appendChild(b),
      );

      modal.appendChild(footer);
      const powered = document.createElement('div');
      Object.assign(powered.style, {
        background: S.prefStyles.footerBg,
        color: S.prefStyles.footerTextColor,
        padding: '0.5rem 1rem',
        fontSize: '0.75rem',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '0.5rem',
        borderTop: `1px solid ${S.prefSectionStyles.borderColor}`,
      });

      // optional logo
      if (S.prefFooterLogo) {
        const logo = document.createElement('img');
        logo.src = S.prefFooterLogo;
        logo.style.height = '14px';
        logo.style.objectFit = 'contain';
        powered.appendChild(logo);
      }

      // text
      const txt = document.createElement('span');
      txt.style.opacity = '0.7';
      txt.textContent = `Powered by ${S.prefFooterText || ''}`;
      powered.appendChild(txt);

      modal.appendChild(powered);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      this._prefRefs = {
        title: h2,
        description: desc,
        acceptBtn: btnAccept,
        saveBtn: btnSave,
        rejectBtn: btnReject,
        categories: prefCategoryRefs,
        languageSelect: prefLangControl?.select || null,
      };

      this._renderPrefs = () => {
        Object.entries(this._toggles).forEach(([key, input]) => {
          input.checked = !!this.choices[key];
        });
        overlay.style.display = 'flex';
        this._applyTranslatedTextToUI();
      };
    }

    /** POST consent */
    async _saveConsent() {
      this.choices['necessary'] = true;
      await fetch(`${this.opts.apiBaseUrl}/cmp/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          domain: this.opts.domain,
          userId: this.userId,
          choices: this.choices,
          metadata: this.metadata,
        }),
      });
    }

    /** Emit consentChange */
    _emitConsentChange() {
      this._applyAllowedCookies(); // apply updated cookie/script state
      this._listeners.consentChange.forEach((fn) => fn({ ...this.choices }));
      if (typeof this.opts.onConsentChange === 'function') {
        this.opts.onConsentChange({ ...this.choices });
      }
    }
  }

  // expose singleton
  window.CMP = new CMP();
  // -------- auto-init logic based on website-id or explicit overrides --------
  async function resolveInitParams() {
    const script =
      document.currentScript ||
      document.querySelector('script[src*="banner-loader3.js"]');
    if (!script) return null;

    // Testing overrides
    const overrideApiBase = script.dataset.apiBaseUrl;
    const overrideConfigId = script.dataset.configId;
    const overrideDomain = script.dataset.domain;
    const overrideSdkVersion = script.dataset.sdkVersion;
    if (overrideApiBase && overrideConfigId) {
      return {
        apiBaseUrl: overrideApiBase,
        configId: overrideConfigId,
        domain: overrideDomain || window.location.hostname,
        sdkVersion: overrideSdkVersion || '1',
      };
    }

    // Production: resolve real config via website-id
    const websiteId = script.dataset.websiteId;
    if (!websiteId) {
      console.warn('CMP: no website-id provided; skipping auto-init');
      return null;
    }

    // lookup endpoint you implement server-side
    // const lookupBase = "http://23.22.92.199:8101/priv";
    const lookupBase = 'https://demo2.grc3.io/apiv2';

    try {
      const res = await fetch(
        lookupBase +
          '/cmp/websites/lookup?websiteId=' +
          encodeURIComponent(websiteId.trim()),
        { credentials: 'include' },
      );
      if (!res.ok) {
        console.warn('CMP: website-id lookup failed', res.status);
        return null;
      }
      const json = await res.json();
      return {
        apiBaseUrl: lookupBase, // or json.apiBaseUrl if variable
        configId: json.configId,
        domain: json.domain || window.location.hostname,
        sdkVersion: json.sdkVersion || '1',
      };
    } catch (e) {
      console.warn('CMP: error resolving website-id', e);
      return null;
    }
  }

  (async function autoInit() {
    const params = await resolveInitParams();
    if (!params) return;
    window.CMP.init({
      apiBaseUrl: params.apiBaseUrl,
      configId: params.configId,
      domain: params.domain,
      sdkVersion: params.sdkVersion,
    }).catch((e) => {
      console.error('CMP auto-init failed:', e);
    });
  })();
})(window, document);

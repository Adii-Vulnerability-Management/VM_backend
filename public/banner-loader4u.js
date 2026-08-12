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
      this.vendorList = [];
      this.cookieList = [];
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
        'http://23.22.92.199:8101/priv/CookieImage.png';
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

    _categoryKey(cat) {
      if (!cat) return '';
      if (cat.key) return String(cat.key);

      return String(cat.name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    _isNecessaryCategory(cat) {
      const key = this._categoryKey(cat);
      return (
        key === 'necessary' ||
        cat?.required === true ||
        String(cat?.name || '')
          .trim()
          .toLowerCase() === 'necessary'
      );
    }

    _normalizeCategories(categories) {
      return (Array.isArray(categories) ? categories : []).map((cat, index) => {
        const key = this._categoryKey(cat) || `category_${index + 1}`;
        const required =
          key === 'necessary' ||
          cat.required === true ||
          String(cat.name || '')
            .trim()
            .toLowerCase() === 'necessary';

        return {
          ...cat,
          key,
          required,
          default: required ? true : !!cat.default,
          cookieNames: Array.isArray(cat.cookieNames) ? cat.cookieNames : [],
        };
      });
    }

    async _fetchRuntimeList(path) {
      const url = new URL(`${this.opts.apiBaseUrl}${path}`);
      url.searchParams.set('domain', this.opts.domain);

      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];

      const json = await res.json();

      if (Array.isArray(json)) return json;
      if (Array.isArray(json.items)) return json.items;
      if (Array.isArray(json.vendors)) return json.vendors;
      if (Array.isArray(json.cookies)) return json.cookies;

      return [];
    }

    async _loadRuntimeLists() {
      this.vendorList = [];
      this.cookieList = [];

      if (this.style?.showVendorList) {
        try {
          this.vendorList = await this._fetchRuntimeList('/cmp/vendors');
        } catch (err) {
          console.warn('CMP: failed to load vendor list', err);
          this.vendorList = [];
        }
      }

      if (this.style?.showCookieList) {
        try {
          this.cookieList = await this._fetchRuntimeList('/cmp/cookies');
        } catch (err) {
          console.warn('CMP: failed to load cookie list', err);
          this.cookieList = [];
        }
      }
    }

    _makeTextEl(tag, text) {
      const el = document.createElement(tag);
      el.textContent = text || '';
      return el;
    }

    _styleLinkButton(btn) {
      const S = this.style;

      Object.assign(btn.style, {
        fontSize: '15px',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: S.prefPolicyLinkStyles?.textColor,
        textDecoration: S.prefPolicyLinkStyles?.decoration,
      });
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

      // BLOCK all CMP-blocked scripts as early as this SDK can.
      // Note: scripts that already executed before this SDK loaded cannot be undone.
      this._blockScripts();

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

      // 5) Fetch real categories from runtime category API
      // style.cookieCategories is only design/preview fallback from admin/template.
      const catUrl = new URL(`${this.opts.apiBaseUrl}/cmp/config`);
      catUrl.searchParams.set('domain', this.opts.domain);

      const catRes = await fetch(catUrl, { credentials: 'include' });
      if (!catRes.ok) {
        throw new Error('CMP.init: failed to load categories');
      }

      this.categories = this._normalizeCategories(await catRes.json());

      // 6) Fetch real vendor/cookie lists from runtime APIs.
      // style.listsContent is used only for labels/styles/fallback text, not real production data.
      await this._loadRuntimeLists();

      // 7) Fetch existing consent
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
            const key = c.key || this._categoryKey(c);
            if (key) this.choices[key] = !!c.accepted;
          });
        } else if (prefJson.choices && typeof prefJson.choices === 'object') {
          hasStoredConsent = Object.keys(prefJson.choices).length > 0;
          Object.entries(prefJson.choices).forEach(([k, v]) => {
            this.choices[k] = !!v;
          });
        }
      }

      // 8) Seed defaults for runtime categories.
      // Defaults are NOT stored consent; they only initialize the UI.
      this.categories.forEach((cat) => {
        if (this._isNecessaryCategory(cat)) {
          this.choices[cat.key] = true;
        } else if (this.choices[cat.key] === undefined) {
          this.choices[cat.key] = !!cat.default;
        }
      });

      // 9) Fire 'ready' event
      this._fireReady();

      // 10) Render banner or apply stored consent
      if (!hasStoredConsent) {
        console.log('CMP.init(): showing banner; no stored consent found');
        this._renderBanner();
      } else {
        console.log('CMP.init(): stored consent found; applying choices');
        this._applyAllowedCookies();
        this._renderFloatingBtn();
        this._unblockScripts();
      }

      // ensure SPA navigation re-applies consent
      this._setupNavigationListener();

      // periodic and settled reapplications
      this._setupPeriodicReapply();
      this._setupSettleWatcher();

      // install interception/monitoring
      this._setupCookieInterceptor();
      this._setupCookieMonitor();

      // 11) Build the Preferences modal now that choices are seeded
      this._preparePreferenceCenter();

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

    _renderInlinePreferenceCenter(parent) {
      const S = this.style;

      const wrap = document.createElement('div');
      wrap.id = 'cmp-inline-preferences';

      Object.assign(wrap.style, {
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: `1px solid ${S.prefStyles?.borderColor || '#e5e7eb'}`,
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        // minHeight: 'calc(100vh - 1rem)',
      });

      // ================= BODY =================
      const bodyWrap = document.createElement('div');
      Object.assign(bodyWrap.style, {
        padding: '0',
        overflowY: 'visible',
      });

      const footer = document.createElement('div');

      const powered = document.createElement('div');
      powered.style.marginTop = 'auto';
      powered.style.marginLeft = `calc(-1 * ${
        S.bannerStyles.padding || '1rem'
      })`;
      powered.style.marginRight = `calc(-1 * ${
        S.bannerStyles.padding || '1rem'
      })`;
      // powered.style.marginBottom = `calc(-1 * ${
      //   S.bannerStyles.padding || '1rem'
      // })`;
      powered.style.position = 'absolute';
      powered.style.bottom = '0';
      powered.style.width = '100%';

      this._renderPreferenceCenterContent({
        bodyWrap,
        footer,
        powered,
        onClose: () => {},
      });

      wrap.appendChild(bodyWrap);
      wrap.appendChild(footer);
      // wrap.appendChild(powered);

      parent.appendChild(wrap);
      parent.appendChild(powered);
    }
    // _renderInlinePreferenceCenter(parent) {
    //   const S = this.style;

    //   const wrap = document.createElement('div');
    //   wrap.id = 'cmp-inline-preferences';

    //   Object.assign(wrap.style, {
    //     marginTop: '1rem',
    //     paddingTop: '1rem',
    //     borderTop: `1px solid ${S.prefStyles?.borderColor || '#e5e7eb'}`,
    //     width: '100%',
    //     boxSizing: 'border-box',
    //   });

    //   // ================= BODY =================
    //   const bodyWrap = document.createElement('div');
    //   Object.assign(bodyWrap.style, {
    //     padding: '0',
    //     overflowY: 'visible',
    //   });

    //   const footer = document.createElement('div');

    //   const powered = document.createElement('div');

    //   this._renderPreferenceCenterContent({
    //     bodyWrap,
    //     footer,
    //     powered,
    //     onClose: () => {},
    //   });

    //   wrap.appendChild(bodyWrap);
    //   wrap.appendChild(footer);
    //   wrap.appendChild(powered);

    //   parent.appendChild(wrap);
    // }

    // _renderInlinePreferenceCenter(parent) {
    //   const S = this.style;

    //   const wrap = document.createElement('div');
    //   wrap.id = 'cmp-inline-preferences';

    //   Object.assign(wrap.style, {
    //     marginTop: '1rem',
    //     paddingTop: '1rem',
    //     borderTop: `1px solid ${S.prefStyles?.borderColor || '#e5e7eb'}`,
    //     width: '100%',
    //     boxSizing: 'border-box',
    //   });

    //   const title = document.createElement('h2');
    //   title.textContent = S.prefContent?.title || 'Manage Preferences';

    //   Object.assign(title.style, {
    //     margin: '0 0 0.5rem',
    //     color: S.prefStyles?.headerColor || '#333333',
    //     fontSize: '1.1rem',
    //     fontWeight: '600',
    //   });

    //   const desc = document.createElement('p');
    //   desc.textContent = S.prefContent?.description || '';

    //   Object.assign(desc.style, {
    //     margin: '0 0 1rem',
    //     color: S.prefStyles?.textColor || '#000000',
    //     fontSize: '0.9rem',
    //   });

    //   wrap.append(title, desc);

    //   this.categories.forEach((cat) => {
    //     const section = document.createElement('div');

    //     Object.assign(section.style, {
    //       border: `1px solid ${S.prefSectionStyles?.borderColor || '#e5e7eb'}`,
    //       borderRadius: S.prefSectionStyles?.borderRadius || '0.375rem',
    //       marginBottom: '0.75rem',
    //       overflow: 'hidden',
    //     });

    //     const header = document.createElement('div');

    //     Object.assign(header.style, {
    //       backgroundColor: S.prefSectionStyles?.categoryTitleBg || '#f9fafb',
    //       color: S.prefSectionStyles?.categoryTitleText || '#111827',
    //       padding: S.prefSectionStyles?.titlePadding || '0.75rem',
    //       display: 'flex',
    //       justifyContent: 'space-between',
    //       alignItems: 'center',
    //       gap: '0.5rem',
    //       cursor: 'pointer',
    //     });

    //     const left = document.createElement('div');

    //     Object.assign(left.style, {
    //       display: 'flex',
    //       alignItems: 'center',
    //       gap: S.prefSectionStyles?.iconTitleGap || '0.5rem',
    //       minWidth: '0',
    //     });

    //     if (cat.icon) {
    //       const icon = document.createElement('img');
    //       icon.src = cat.icon;
    //       icon.alt = '';
    //       Object.assign(icon.style, {
    //         width: '20px',
    //         height: '20px',
    //         objectFit: 'contain',
    //         flexShrink: '0',
    //       });
    //       left.appendChild(icon);
    //     }

    //     const label = document.createElement('span');
    //     label.textContent = cat.name || cat.key;

    //     Object.assign(label.style, {
    //       fontSize: S.prefSectionStyles?.titleFontSize || '0.9rem',
    //       fontWeight: S.prefSectionStyles?.titleFontWeight || '500',
    //     });

    //     left.appendChild(label);

    //     const toggle = document.createElement('input');
    //     toggle.type = 'checkbox';
    //     toggle.checked = !!this.choices[cat.key];
    //     toggle.disabled = this._isNecessaryCategory(cat);

    //     toggle.onclick = (e) => e.stopPropagation();

    //     toggle.onchange = () => {
    //       if (this._isNecessaryCategory(cat)) {
    //         this.choices[cat.key] = true;
    //         toggle.checked = true;
    //         return;
    //       }

    //       this.choices[cat.key] = toggle.checked;
    //     };

    //     this._toggles[cat.key] = toggle;

    //     header.append(left, toggle);

    //     const body = document.createElement('div');

    //     Object.assign(body.style, {
    //       display: 'none',
    //       backgroundColor: S.prefSectionStyles?.categoryDescBg || '#ffffff',
    //       color: S.prefSectionStyles?.categoryDescText || '#111827',
    //       padding: S.prefSectionStyles?.descPadding || '0.75rem',
    //       fontSize: S.prefSectionStyles?.descFontSize || '0.85rem',
    //       fontWeight: S.prefSectionStyles?.descFontWeight || '400',
    //       lineHeight: S.prefSectionStyles?.descLineHeight || '1.5',
    //     });

    //     body.textContent = cat.description || '';

    //     let open = false;

    //     header.onclick = () => {
    //       open = !open;
    //       body.style.display = open ? 'block' : 'none';
    //     };

    //     section.append(header, body);
    //     wrap.appendChild(section);
    //   });

    //   const footer = document.createElement('div');

    //   Object.assign(footer.style, {
    //     marginTop: '1rem',
    //     display: 'flex',
    //     gap: '0.5rem',
    //     flexDirection: 'column',
    //   });

    //   const makeBtn = (cfg, text, handler) => {
    //     if (!cfg?.enabled) return null;

    //     const btn = document.createElement('button');
    //     btn.textContent = text;

    //     Object.assign(btn.style, {
    //       backgroundColor: cfg.bg,
    //       color: cfg.text,
    //       padding: cfg.padding,
    //       borderRadius: cfg.borderRadius,
    //       border: `${cfg.borderWidth} solid ${cfg.borderColor}`,
    //       transition: cfg.transition,
    //       fontWeight: cfg.fontWeight,
    //       cursor: 'pointer',
    //       width: '100%',
    //       textAlign: 'center',
    //     });

    //     btn.onclick = handler;
    //     return btn;
    //   };

    //   const acceptBtn = makeBtn(
    //     S.prefButtonStyles?.acceptAll,
    //     S.prefContent?.acceptAllText || 'Accept All',
    //     () => this._acceptAll(),
    //   );

    //   const saveBtn = makeBtn(
    //     S.prefButtonStyles?.saveAll,
    //     S.prefContent?.saveAllText || 'Save Preferences',
    //     async () => {
    //       try {
    //         await this._saveConsent();
    //         this._emitConsentChange();
    //         this._removeBanner();
    //         this._renderFloatingBtn();
    //         this._unblockScripts();
    //         this._releaseScripts();
    //       } catch (err) {
    //         console.error('CMP: failed to save inline preferences', err);
    //       }
    //     },
    //   );

    //   const rejectBtn = makeBtn(
    //     S.prefButtonStyles?.rejectAll,
    //     S.prefContent?.rejectAllText || 'Reject All',
    //     () => this._rejectAll(),
    //   );

    //   [acceptBtn, saveBtn, rejectBtn].forEach((btn) => {
    //     if (btn) footer.appendChild(btn);
    //   });

    //   wrap.appendChild(footer);
    //   parent.appendChild(wrap);
    // }

    /** Render the consent banner */
    _renderBanner() {
      this._removeFloatingBtn();
      if (this._bannerEl) return;

      const S = this.style;

      const container = document.createElement('div');
      container.id = 'cmp-banner';

      const { type: layoutType = 'bar', position: layoutPosition = 'bottom' } =
        S.layout || {};

      const inlinePrefOnBanner =
        layoutType === 'bar' &&
        (layoutPosition === 'left' || layoutPosition === 'right') &&
        S.showInlinePrefOnBanner;

      // target for translator
      const languageTarget = document.createElement('div');
      languageTarget.id = 'cmp-language-target';
      languageTarget.setAttribute('data-no-translate', 'true');
      Object.assign(languageTarget.style, {
        position: 'absolute',
        bottom: '4px',
        left: '4px',
        zIndex: '9999',
      });
      container.append(languageTarget);

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
        alignItems: S.bannerStyles.alignItems || 'center',
        gap: S.bannerStyles.gap || '1rem',
        flexWrap: 'wrap',
        boxSizing: 'border-box',
        zIndex: 10000,
      });

      // if (layoutType === 'bar') {
      //   Object.assign(container.style, {
      //     left: 0,
      //     right: 0,
      //     [layoutPosition]: 0,
      //     width: '100%',
      //   });
      // }

      if (layoutType === 'bar') {
        if (layoutPosition === 'top' || layoutPosition === 'bottom') {
          Object.assign(container.style, {
            top: layoutPosition === 'top' ? '0' : 'auto',
            bottom: layoutPosition === 'bottom' ? '0' : 'auto',
            left: '0',
            right: '0',
            width: '100%',
            height: 'auto',
            maxWidth: 'none',
          });
        }

        if (layoutPosition === 'left' || layoutPosition === 'right') {
          Object.assign(container.style, {
            top: '0',
            bottom: '0',
            left: layoutPosition === 'left' ? '0' : 'auto',
            right: layoutPosition === 'right' ? '0' : 'auto',
            width: '320px',
            maxWidth: '90vw',
            height: '100vh',
            display: 'block',
            overflow: 'auto',
          });
        }
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
            maxWidth: '480px',
          });
        } else if (layoutPosition === 'top-center') {
          Object.assign(container.style, {
            top: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            maxWidth: '480px',
          });
        } else if (layoutPosition === 'bottom-center') {
          Object.assign(container.style, {
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            maxWidth: '480px',
          });
        } else {
          const [vert, hor] = layoutPosition.split('-');
          Object.assign(container.style, {
            [vert]: '1rem',
            [hor || 'left']: '1rem',
            width: '80%',
            maxWidth: '480px',
          });
        }
      } else if (layoutType === 'center') {
        Object.assign(container.style, {
          position: 'fixed',
          top: '50%',
          left: '50%',
          right: 'auto',
          bottom: 'auto',
          transform: 'translate(-50%, -50%)',
          width: 'min(92vw, 520px)',
          maxWidth: '520px',
          maxHeight: '80vh',
          overflow: 'auto',
          display: 'block',
        });
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

      // Inline policy link: appears directly after description text
      if (
        S.showPolicyLink &&
        S.policyLinkPosition === 'inline' &&
        S.policyText &&
        S.policyUrl
      ) {
        const policyInline = document.createElement('a');
        policyInline.href = S.policyUrl;
        policyInline.textContent = S.policyText;
        policyInline.style.color = S.linkStyles?.textColor;
        policyInline.style.textDecoration = S.linkStyles?.decoration;

        pDesc.appendChild(document.createTextNode(' '));
        pDesc.appendChild(policyInline);
      }

      // Separate policy/imprint links area
      if (
        (S.showPolicyLink && S.policyLinkPosition === 'separate') ||
        S.showImprintLink
      ) {
        const linksRow = document.createElement('div');

        const linkAlign =
          S.bannerStyles.linkAlign === 'center'
            ? 'center'
            : S.bannerStyles.linkAlign === 'right'
              ? 'flex-end'
              : 'flex-start';

        Object.assign(linksRow.style, {
          marginTop: '0.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: linkAlign,
        });

        if (
          S.showPolicyLink &&
          S.policyLinkPosition === 'separate' &&
          S.policyText &&
          S.policyUrl
        ) {
          const policySeparate = document.createElement('a');
          policySeparate.href = S.policyUrl;
          policySeparate.textContent = S.policyText;
          policySeparate.style.color = S.linkStyles?.textColor;
          policySeparate.style.textDecoration = S.linkStyles?.decoration;
          linksRow.appendChild(policySeparate);
        }

        if (S.showImprintLink && S.imprintText && S.imprintUrl) {
          const imprint = document.createElement('a');
          imprint.href = S.imprintUrl;
          imprint.textContent = S.imprintText;
          imprint.style.color = S.linkStyles?.textColor;
          imprint.style.textDecoration = S.linkStyles?.decoration;
          linksRow.appendChild(imprint);
        }

        if (linksRow.children.length) {
          textWrap.appendChild(linksRow);
        }
      }

      container.appendChild(textWrap);

      //   // ================= BUTTONS =================
      //   const btnRow = document.createElement('div');

      //   Object.assign(btnRow.style, {
      //     display: 'flex',
      //     gap: '0.5rem',
      //     flexDirection: S.bannerButtonStyles?.stackButtons ? 'column' : 'row',
      //     justifyContent: S.bannerStyles.buttonAlign || 'left',
      //   });

      //   const btnConfig = Object.entries(S.bannerButtonStyles || {})
      //     .filter(([k, v]) => v && typeof v === 'object' && v.enabled === true)
      //     .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

      //   btnConfig.forEach(([type, cfg]) => {
      //     const actionMap = {
      //       accept: () => this._acceptAll(),
      //       reject: () => this._rejectAll(),
      //       manage: () => this.showPreferences(),
      //     };

      //     const textMap = {
      //       accept: S.texts.acceptAll,
      //       reject: S.texts.rejectAll,
      //       manage: S.texts.managePrefs,
      //     };

      //     if (!actionMap[type]) return;

      //     const b = document.createElement('button');
      //     b.textContent = textMap[type];

      //     Object.assign(b.style, {
      //       backgroundColor: cfg.bg,
      //       color: cfg.text,
      //       padding: cfg.padding,
      //       borderRadius: cfg.borderRadius,
      //       border: `${cfg.borderWidth} solid ${cfg.borderColor}`,
      //       transition: cfg.transition,
      //       fontWeight: cfg.fontWeight,
      //       textDecoration: cfg.underline ? 'underline' : 'none',
      //       cursor: 'pointer',
      //     });

      //     b.onclick = actionMap[type];
      //     btnRow.appendChild(b);
      //   });

      //   container.appendChild(btnRow);
      // ================= BUTTONS =================
      const btnRow = document.createElement('div');

      const isCompactLayout =
        layoutType === 'toast' ||
        layoutType === 'floating' ||
        layoutType === 'center' ||
        (layoutType === 'bar' &&
          (layoutPosition === 'left' || layoutPosition === 'right'));

      const growButtonsRow =
        isCompactLayout && !S.bannerButtonStyles?.stackButtons;

      const toJustify = (align) => {
        if (align === 'center') return 'center';
        if (align === 'right') return 'flex-end';
        return 'flex-start';
      };

      Object.assign(btnRow.style, {
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        flexDirection: S.bannerButtonStyles?.stackButtons ? 'column' : 'row',
        justifyContent: toJustify(S.bannerStyles.buttonAlign),
        width:
          S.bannerButtonStyles?.stackButtons && isCompactLayout
            ? '100%'
            : S.bannerButtonStyles?.stackButtons
              ? 'auto'
              : 'auto',
        alignItems: S.bannerButtonStyles?.stackButtons ? 'stretch' : 'center',
      });

      // const btnConfig = Object.entries(S.bannerButtonStyles || {})
      //   .filter(([k, v]) => v && typeof v === 'object' && v.enabled === true)
      //   .filter(([k]) => ['accept', 'reject', 'manage'].includes(k))
      //   .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

      const btnConfig = Object.entries(S.bannerButtonStyles || {})
        .filter(([k, v]) => v && typeof v === 'object' && v.enabled === true)
        .filter(([k]) => ['accept', 'reject', 'manage'].includes(k))
        .filter(([k]) => !(inlinePrefOnBanner && k === 'manage'))
        .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

      const manageIndex = btnConfig.findIndex(([type]) => type === 'manage');

      const splitActive =
        S.bannerButtonStyles?.splitManageButton &&
        !S.bannerButtonStyles?.stackButtons &&
        !growButtonsRow &&
        manageIndex !== -1 &&
        btnConfig.length > 1;

      btnConfig.forEach(([type, cfg], index) => {
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

        const extra = {};

        // Same-width stacked buttons
        if (S.bannerButtonStyles?.stackButtons) {
          extra.width = '100%';
        }

        // Same-width compact inline buttons for toast/floating/center/side bar
        if (growButtonsRow) {
          extra.flexGrow = '1';
          extra.flexShrink = '0';

          if (
            (layoutType === 'floating' || layoutType === 'center') &&
            S.bannerStyles.orientation === 'horizontal'
          ) {
            extra.flexBasis = '45%';
          } else {
            extra.flexBasis = '0';
          }
        }

        // Separate Manage button logic for normal non-compact rows
        if (splitActive) {
          const lastIdx = btnConfig.length - 1;

          if (manageIndex === lastIdx && type === 'manage') {
            // Manage is last: Accept/Reject group on left, Manage on right
            extra.marginLeft = 'auto';
          } else if (manageIndex === 0 && index === 1) {
            // Manage is first: Manage on left, other buttons on right
            extra.marginLeft = 'auto';
          }
        }

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
          textAlign: 'center',
          ...extra,
        });

        b.onclick = actionMap[type];
        btnRow.appendChild(b);
      });

      container.appendChild(btnRow);

      // outer func one
      if (inlinePrefOnBanner) {
        this._renderInlinePreferenceCenter(container);
      }

      document.body.appendChild(container);
      this._bannerEl = container;
    }

    /** Accept All */
    async _acceptAll() {
      console.log('CMP: _acceptAll()');

      this.categories.forEach((cat) => {
        this.choices[cat.key] = true;
      });

      try {
        await this._saveConsent();
        this._emitConsentChange();
        this._removeBanner();
        this._renderFloatingBtn();
        this._unblockScripts();
        this._releaseScripts();
      } catch (err) {
        console.error('CMP: failed to save accept-all consent', err);
      }
    }

    /** Reject All */
    async _rejectAll() {
      console.log('CMP: _rejectAll()');

      this.categories.forEach((cat) => {
        this.choices[cat.key] = this._isNecessaryCategory(cat) ? true : false;
      });

      try {
        await this._saveConsent();
        this._emitConsentChange();
        this._removeBanner();
        this._renderFloatingBtn();
        this._unblockScripts();
        this._releaseScripts();
      } catch (err) {
        console.error('CMP: failed to save reject-all consent', err);
      }
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
      this.categories.forEach((cat) => {
        this.choices[cat.key] = this._isNecessaryCategory(cat) ? true : false;
      });
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

    _renderPreferenceCenterContent({ bodyWrap, footer, powered, onClose }) {
      const S = this.style;

      const renderMainView = () => {
        bodyWrap.innerHTML = '';

        // ================= DESCRIPTION + POLICY LINK =================
        const descWrap = document.createElement('div');

        // title
        const prefTitleText = document.createElement('h4');
        prefTitleText.textContent = S.prefContent.title;
        prefTitleText.style.margin = '0 0 0.4rem';
        prefTitleText.style.color = S.prefStyles.headerColor;

        descWrap.appendChild(prefTitleText);

        // description
        const desc = document.createElement('p');
        desc.textContent = S.prefContent.description;
        desc.style.margin = '0 0 0.7rem';
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

        // ================= GLOBAL VENDOR / COOKIE LIST LINKS =================
        const listLinks = document.createElement('div');
        Object.assign(listLinks.style, {
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        });

        if (S.showVendorList) {
          const vendorBtn = document.createElement('button');
          vendorBtn.type = 'button';
          vendorBtn.textContent =
            S.listsContent?.vendorListTitle || 'Vendor List';
          this._styleLinkButton(vendorBtn);
          vendorBtn.onclick = () => renderListView('vendors');
          listLinks.appendChild(vendorBtn);
        }

        if (S.showCookieList) {
          const cookieBtn = document.createElement('button');
          cookieBtn.type = 'button';
          cookieBtn.textContent =
            S.listsContent?.cookieListTitle || 'Cookie List';
          this._styleLinkButton(cookieBtn);
          cookieBtn.onclick = () => renderListView('cookies');
          listLinks.appendChild(cookieBtn);
        }

        if (listLinks.children.length) {
          bodyWrap.appendChild(listLinks);
        }

        // ================= CATEGORY ACCORDIONS =================
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
          toggle.disabled = this._isNecessaryCategory(cat);

          toggle.onclick = (e) => e.stopPropagation();
          toggle.onchange = () => {
            if (this._isNecessaryCategory(cat)) {
              this.choices[cat.key] = true;
              toggle.checked = true;
              return;
            }

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

          const descBox = document.createElement('p');
          descBox.textContent = cat.description || '';
          descBox.style.margin = '0 0 0.5rem';
          body.appendChild(descBox);

          section.appendChild(body);

          // ================= ACCORDION =================
          hdr.onclick = () => {
            expanded = !expanded;
            body.style.display = expanded ? 'block' : 'none';
          };

          bodyWrap.appendChild(section);
        });
      };

      const renderListView = (listKey) => {
        bodyWrap.innerHTML = '';

        const listTitle =
          listKey === 'vendors'
            ? S.listsContent?.vendorListTitle || 'Vendor List'
            : S.listsContent?.cookieListTitle || 'Cookie List';

        const items = listKey === 'vendors' ? this.vendorList : this.cookieList;

        const top = document.createElement('div');
        Object.assign(top.style, {
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1rem',
        });

        const back = document.createElement('button');
        back.type = 'button';
        back.setAttribute('aria-label', 'Back to Manage Preferences');
        Object.assign(back.style, {
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: '18px',
        });

        if (S.prefBackIcon) {
          const img = document.createElement('img');
          img.src = S.prefBackIcon;
          img.alt = 'Back';
          img.style.width = '20px';
          img.style.height = '20px';
          img.style.objectFit = 'contain';
          back.appendChild(img);
        } else {
          back.textContent = '←';
        }

        back.onclick = renderMainView;

        const title = document.createElement('h3');
        title.textContent = listTitle;
        Object.assign(title.style, {
          margin: 0,
          color: S.listsStyles.headerColor,
        });

        top.append(back, title);
        bodyWrap.appendChild(top);

        if (!items.length) {
          const empty = document.createElement('p');
          empty.textContent =
            listKey === 'vendors' ? 'No vendors found.' : 'No cookies found.';
          empty.style.color = S.listsStyles.textColor;
          bodyWrap.appendChild(empty);
          return;
        }

        items.forEach((item) => {
          const block = document.createElement('div');
          Object.assign(block.style, {
            border: `1px solid ${S.listsStyles.borderColor}`,
            borderRadius: S.listsStyles.borderRadius,
            marginBottom: '0.75rem',
            overflow: 'hidden',
          });

          const itemHeader = document.createElement('div');
          itemHeader.textContent =
            item.title || item.name || item.vendorName || 'Item';

          Object.assign(itemHeader.style, {
            background: S.listsStyles.listTitleBg,
            color: S.listsStyles.listTitleText,
            padding: S.listsStyles.titlePadding,
            fontSize: S.listsStyles.titleFontSize,
            fontWeight: S.listsStyles.titleFontWeight,
          });

          const itemBody = document.createElement('div');
          Object.assign(itemBody.style, {
            background: S.listsStyles.listDescBg,
            color: S.listsStyles.listDescText,
            padding: S.listsStyles.descPadding,
            fontSize: S.listsStyles.descFontSize,
            fontWeight: S.listsStyles.descFontWeight,
            lineHeight: S.listsStyles.descLineHeight,
          });

          if (listKey === 'vendors') {
            itemBody.textContent = item.description || item.purpose || '—';
          } else {
            const rows = Array.isArray(item.description)
              ? item.description
              : Array.isArray(item.cookies)
                ? item.cookies
                : [item];

            rows.forEach((row) => {
              const rowBox = document.createElement('div');
              Object.assign(rowBox.style, {
                background: S.listsStyles.dataBgColor || '#f3f4f6',
                color: S.listsStyles.dataTextColor,
                padding: S.listsStyles.dataPadding || '0.5rem',
                marginBottom: '0.5rem',
              });

              const name = document.createElement('div');
              name.textContent = `Name: ${row.name || item.name || '—'}`;

              const host = document.createElement('div');
              host.textContent = `Host: ${row.host || item.host || '—'}`;

              const duration = document.createElement('div');
              duration.textContent = `Duration: ${
                row.duration || item.duration || '—'
              }`;

              const description = document.createElement('div');
              description.textContent = `Description: ${
                row.description || item.descriptionText || '—'
              }`;

              rowBox.append(name, host, duration, description);
              itemBody.appendChild(rowBox);
            });
          }

          block.append(itemHeader, itemBody);
          bodyWrap.appendChild(block);
        });
      };

      renderMainView();

      // ================= FOOTER BUTTON BAR =================
      Object.assign(footer.style, {
        background: S.prefStyles.buttonBarBg,
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
        S.prefContent.acceptAllText || 'Accept All',
        async () => {
          await this._acceptAll();
          onClose && onClose();
        },
      );

      const btnSave = makeBtn(
        S.prefButtonStyles.saveAll,
        S.prefContent.saveAllText,
        async () => {
          try {
            await this._saveConsent();
            this._emitConsentChange();
            onClose && onClose();
            this._removeBanner();
            this._renderFloatingBtn();
            this._unblockScripts();
          } catch (err) {
            console.error('CMP: failed to save preferences', err);
          }
        },
      );

      const btnReject = makeBtn(
        S.prefButtonStyles.rejectAll,
        S.prefContent.rejectAllText,
        async () => {
          await this._rejectAll();
          onClose && onClose();
        },
      );

      [btnAccept, btnSave, btnReject].forEach(
        (b) => b && footer.appendChild(b),
      );

      // ================= POWERED BY FOOTER =================
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

      if (S.prefFooterLogo) {
        const logo = document.createElement('img');
        logo.src = S.prefFooterLogo;
        logo.style.height = '14px';
        logo.style.objectFit = 'contain';
        powered.appendChild(logo);
      }

      const txt = document.createElement('span');
      txt.style.opacity = '0.7';
      txt.textContent = `Powered by ${S.prefFooterText || ''}`;
      powered.appendChild(txt);

      return {
        renderMainView,
        renderListView,
      };
    }

    // — Advanced Preferences Modal —
    _preparePreferenceCenter() {
      const S = this.style;

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

      const prefHeaderText = document.createElement('h3');
      prefHeaderText.textContent = S.prefHeaderText;
      prefHeaderText.style.margin = '0';
      prefHeaderText.style.color = S.prefStyles.prefHeaderTextColor;

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        fontSize: '1.25rem',
        cursor: 'pointer',
      });
      closeBtn.onclick = () => (overlay.style.display = 'none');

      // target for translator
      const languageTarget = document.createElement('div');
      languageTarget.id = 'cmp-language-target';
      languageTarget.setAttribute('data-no-translate', 'true');

      header.append(prefHeaderText, languageTarget, closeBtn);
      modal.appendChild(header);

      // ================= BODY =================
      const bodyWrap = document.createElement('div');
      Object.assign(bodyWrap.style, {
        padding: '1rem',
        overflowY: 'auto',
      });

      const footer = document.createElement('div');

      const powered = document.createElement('div');

      const prefCenter = this._renderPreferenceCenterContent({
        bodyWrap,
        footer,
        powered,
        onClose: () => {
          overlay.style.display = 'none';
        },
      });

      modal.appendChild(bodyWrap);

      modal.appendChild(footer);

      modal.appendChild(powered);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      this._renderPrefs = () => {
        Object.entries(this._toggles).forEach(([key, input]) => {
          input.checked = !!this.choices[key];
        });

        prefCenter.renderMainView();
        overlay.style.display = 'flex';
      };
    }

    // // — Advanced Preferences Modal —
    // _preparePreferenceCenter() {
    //   const S = this.style;

    //   const overlay = document.createElement('div');
    //   overlay.id = 'cmp-preferences-overlay';
    //   Object.assign(overlay.style, {
    //     display: 'none',
    //     position: 'fixed',
    //     inset: 0,
    //     background: 'rgba(0,0,0,0.5)',
    //     zIndex: 10001,
    //     justifyContent: 'center',
    //     alignItems: 'center',
    //   });

    //   const modal = document.createElement('div');
    //   Object.assign(modal.style, {
    //     background: S.prefStyles.bgColor,
    //     borderRadius: '0.5rem',
    //     width: '90%',
    //     maxWidth: '500px',
    //     boxSizing: 'border-box',
    //     position: 'relative',
    //     maxHeight: '80vh',
    //     display: 'flex',
    //     flexDirection: 'column',
    //     overflow: 'hidden',
    //   });

    //   // ================= HEADER =================
    //   const header = document.createElement('div');
    //   Object.assign(header.style, {
    //     background: S.prefStyles.prefHeaderBg,
    //     color: S.prefStyles.prefHeaderTextColor,
    //     padding: '1rem',
    //     display: 'flex',
    //     alignItems: 'center',
    //     justifyContent: 'space-between',
    //   });

    //   const prefHeaderText = document.createElement('h3');
    //   prefHeaderText.textContent = S.prefHeaderText;
    //   prefHeaderText.style.margin = '0';
    //   prefHeaderText.style.color = S.prefStyles.prefHeaderTextColor;

    //   const closeBtn = document.createElement('button');
    //   closeBtn.textContent = '×';
    //   Object.assign(closeBtn.style, {
    //     background: 'none',
    //     border: 'none',
    //     fontSize: '1.25rem',
    //     cursor: 'pointer',
    //   });
    //   closeBtn.onclick = () => (overlay.style.display = 'none');

    //   // target for translator
    //   const languageTarget = document.createElement('div');
    //   languageTarget.id = 'cmp-language-target';
    //   languageTarget.setAttribute('data-no-translate', 'true');

    //   header.append(prefHeaderText, languageTarget, closeBtn);
    //   modal.appendChild(header);

    //   // ================= BODY =================
    //   const bodyWrap = document.createElement('div');
    //   Object.assign(bodyWrap.style, {
    //     padding: '1rem',
    //     overflowY: 'auto',
    //   });

    //   const renderMainView = () => {
    //     bodyWrap.innerHTML = '';

    //     // ================= DESCRIPTION + POLICY LINK =================
    //     const descWrap = document.createElement('div');

    //     // title
    //     const prefTitleText = document.createElement('h4');
    //     prefTitleText.textContent = S.prefContent.title;
    //     prefTitleText.style.margin = '0 0 0.4rem';
    //     prefTitleText.style.color = S.prefStyles.headerColor;

    //     descWrap.appendChild(prefTitleText);

    //     // description
    //     const desc = document.createElement('p');
    //     desc.textContent = S.prefContent.description;
    //     desc.style.margin = '0 0 0.7rem';
    //     desc.style.color = S.prefStyles.textColor;

    //     descWrap.appendChild(desc);

    //     // INLINE MODE
    //     if (S.showPrefPolicyLink && S.prefPolicyLinkPosition === 'inline') {
    //       const link = document.createElement('a');
    //       link.href = S.prefPolicyUrl;
    //       link.textContent = S.prefPolicyText;
    //       link.style.color = S.prefPolicyLinkStyles?.textColor;
    //       link.style.textDecoration = S.prefPolicyLinkStyles?.decoration;

    //       desc.appendChild(document.createTextNode(' '));
    //       desc.appendChild(link);
    //     }

    //     // SEPARATE MODE
    //     if (S.showPrefPolicyLink && S.prefPolicyLinkPosition === 'separate') {
    //       const link = document.createElement('a');
    //       link.href = S.prefPolicyUrl;
    //       link.textContent = S.prefPolicyText;
    //       link.style.display = 'block';
    //       link.style.marginBottom = '1rem';
    //       link.style.color = S.prefPolicyLinkStyles?.textColor;
    //       link.style.textDecoration = S.prefPolicyLinkStyles?.decoration;

    //       descWrap.appendChild(link);
    //     }

    //     bodyWrap.appendChild( descWrap);

    //     // ================= GLOBAL VENDOR / COOKIE LIST LINKS =================
    //     const listLinks = document.createElement('div');
    //     Object.assign(listLinks.style, {
    //       display: 'flex',
    //       gap: '1rem',
    //       flexWrap: 'wrap',
    //       marginBottom: '1rem',
    //     });

    //     if (S.showVendorList) {
    //       const vendorBtn = document.createElement('button');
    //       vendorBtn.type = 'button';
    //       vendorBtn.textContent =
    //         S.listsContent?.vendorListTitle || 'Vendor List';
    //       this._styleLinkButton(vendorBtn);
    //       vendorBtn.onclick = () => renderListView('vendors');
    //       listLinks.appendChild(vendorBtn);
    //     }

    //     if (S.showCookieList) {
    //       const cookieBtn = document.createElement('button');
    //       cookieBtn.type = 'button';
    //       cookieBtn.textContent =
    //         S.listsContent?.cookieListTitle || 'Cookie List';
    //       this._styleLinkButton(cookieBtn);
    //       cookieBtn.onclick = () => renderListView('cookies');
    //       listLinks.appendChild(cookieBtn);
    //     }

    //     if (listLinks.children.length) {
    //       bodyWrap.appendChild(listLinks);
    //     }

    //     // ================= CATEGORY ACCORDIONS =================
    //     this.categories.forEach((cat) => {
    //       const section = document.createElement('div');
    //       Object.assign(section.style, {
    //         border: `1px solid ${S.prefSectionStyles.borderColor}`,
    //         borderRadius: S.prefSectionStyles.borderRadius,
    //         marginBottom: '1rem',
    //         overflow: 'hidden',
    //       });

    //       let expanded = false;

    //       const hdr = document.createElement('div');
    //       Object.assign(hdr.style, {
    //         backgroundColor: S.prefSectionStyles.categoryTitleBg,
    //         color: S.prefSectionStyles.categoryTitleText,
    //         padding: S.prefSectionStyles.titlePadding,
    //         display: 'flex',
    //         justifyContent: 'space-between',
    //         alignItems: 'center',
    //         cursor: 'pointer',
    //       });

    //       const left = document.createElement('div');
    //       Object.assign(left.style, {
    //         display: 'flex',
    //         alignItems: 'center',
    //         gap: S.prefSectionStyles.iconTitleGap,
    //       });

    //       if (cat.icon) {
    //         const icon = document.createElement('img');
    //         icon.src = cat.icon;
    //         icon.style.width = '20px';
    //         icon.style.height = '20px';
    //         left.appendChild(icon);
    //       }

    //       const lbl = document.createElement('span');
    //       lbl.textContent = cat.name;
    //       left.appendChild(lbl);

    //       const toggle = document.createElement('input');
    //       toggle.type = 'checkbox';
    //       toggle.checked = !!this.choices[cat.key];
    //       toggle.disabled = this._isNecessaryCategory(cat);

    //       toggle.onclick = (e) => e.stopPropagation();
    //       toggle.onchange = () => {
    //         if (this._isNecessaryCategory(cat)) {
    //           this.choices[cat.key] = true;
    //           toggle.checked = true;
    //           return;
    //         }

    //         this.choices[cat.key] = toggle.checked;
    //       };

    //       this._toggles[cat.key] = toggle;

    //       hdr.append(left, toggle);
    //       section.appendChild(hdr);

    //       // ================= COLLAPSIBLE BODY =================
    //       const body = document.createElement('div');
    //       Object.assign(body.style, {
    //         display: 'none',
    //         backgroundColor: S.prefSectionStyles.categoryDescBg,
    //         color: S.prefSectionStyles.categoryDescText,
    //         padding: S.prefSectionStyles.descPadding,
    //       });

    //       const descBox = document.createElement('p');
    //       descBox.textContent = cat.description || '';
    //       descBox.style.margin = '0 0 0.5rem';
    //       body.appendChild(descBox);

    //       section.appendChild(body);

    //       // ================= ACCORDION =================
    //       hdr.onclick = () => {
    //         expanded = !expanded;
    //         body.style.display = expanded ? 'block' : 'none';
    //       };

    //       bodyWrap.appendChild(section);
    //     });
    //   };

    //   const renderListView = (listKey) => {
    //     bodyWrap.innerHTML = '';

    //     const listTitle =
    //       listKey === 'vendors'
    //         ? S.listsContent?.vendorListTitle || 'Vendor List'
    //         : S.listsContent?.cookieListTitle || 'Cookie List';

    //     const items = listKey === 'vendors' ? this.vendorList : this.cookieList;

    //     const top = document.createElement('div');
    //     Object.assign(top.style, {
    //       display: 'flex',
    //       alignItems: 'center',
    //       gap: '0.75rem',
    //       marginBottom: '1rem',
    //     });

    //     const back = document.createElement('button');
    //     back.type = 'button';
    //     back.setAttribute('aria-label', 'Back to Manage Preferences');
    //     Object.assign(back.style, {
    //       background: 'transparent',
    //       border: 'none',
    //       cursor: 'pointer',
    //       padding: 0,
    //       fontSize: '18px',
    //     });

    //     if (S.prefBackIcon) {
    //       const img = document.createElement('img');
    //       img.src = S.prefBackIcon;
    //       img.alt = 'Back';
    //       img.style.width = '20px';
    //       img.style.height = '20px';
    //       img.style.objectFit = 'contain';
    //       back.appendChild(img);
    //     } else {
    //       back.textContent = '←';
    //     }

    //     back.onclick = renderMainView;

    //     const title = document.createElement('h3');
    //     title.textContent = listTitle;
    //     Object.assign(title.style, {
    //       margin: 0,
    //       color: S.listsStyles.headerColor,
    //     });

    //     top.append(back, title);
    //     bodyWrap.appendChild(top);

    //     if (!items.length) {
    //       const empty = document.createElement('p');
    //       empty.textContent =
    //         listKey === 'vendors' ? 'No vendors found.' : 'No cookies found.';
    //       empty.style.color = S.listsStyles.textColor;
    //       bodyWrap.appendChild(empty);
    //       return;
    //     }

    //     items.forEach((item) => {
    //       const block = document.createElement('div');
    //       Object.assign(block.style, {
    //         border: `1px solid ${S.listsStyles.borderColor}`,
    //         borderRadius: S.listsStyles.borderRadius,
    //         marginBottom: '0.75rem',
    //         overflow: 'hidden',
    //       });

    //       const itemHeader = document.createElement('div');
    //       itemHeader.textContent =
    //         item.title || item.name || item.vendorName || 'Item';

    //       Object.assign(itemHeader.style, {
    //         background: S.listsStyles.listTitleBg,
    //         color: S.listsStyles.listTitleText,
    //         padding: S.listsStyles.titlePadding,
    //         fontSize: S.listsStyles.titleFontSize,
    //         fontWeight: S.listsStyles.titleFontWeight,
    //       });

    //       const itemBody = document.createElement('div');
    //       Object.assign(itemBody.style, {
    //         background: S.listsStyles.listDescBg,
    //         color: S.listsStyles.listDescText,
    //         padding: S.listsStyles.descPadding,
    //         fontSize: S.listsStyles.descFontSize,
    //         fontWeight: S.listsStyles.descFontWeight,
    //         lineHeight: S.listsStyles.descLineHeight,
    //       });

    //       if (listKey === 'vendors') {
    //         itemBody.textContent = item.description || item.purpose || '—';
    //       } else {
    //         const rows = Array.isArray(item.description)
    //           ? item.description
    //           : Array.isArray(item.cookies)
    //             ? item.cookies
    //             : [item];

    //         rows.forEach((row) => {
    //           const rowBox = document.createElement('div');
    //           Object.assign(rowBox.style, {
    //             background: S.listsStyles.dataBgColor || '#f3f4f6',
    //             color: S.listsStyles.dataTextColor,
    //             padding: S.listsStyles.dataPadding || '0.5rem',
    //             marginBottom: '0.5rem',
    //           });

    //           const name = document.createElement('div');
    //           name.textContent = `Name: ${row.name || item.name || '—'}`;

    //           const host = document.createElement('div');
    //           host.textContent = `Host: ${row.host || item.host || '—'}`;

    //           const duration = document.createElement('div');
    //           duration.textContent = `Duration: ${
    //             row.duration || item.duration || '—'
    //           }`;

    //           const description = document.createElement('div');
    //           description.textContent = `Description: ${
    //             row.description || item.descriptionText || '—'
    //           }`;

    //           rowBox.append(name, host, duration, description);
    //           itemBody.appendChild(rowBox);
    //         });
    //       }

    //       block.append(itemHeader, itemBody);
    //       bodyWrap.appendChild(block);
    //     });
    //   };

    //   renderMainView();

    //   modal.appendChild(bodyWrap);

    //   // ================= FOOTER BUTTON BAR =================
    //   const footer = document.createElement('div');
    //   Object.assign(footer.style, {
    //     background: S.prefStyles.buttonBarBg,
    //     padding: '1rem',
    //     display: 'flex',
    //     justifyContent: 'flex-end',
    //     gap: '0.5rem',
    //   });

    //   const makeBtn = (cfg, text, handler) => {
    //     if (!cfg?.enabled) return null;

    //     const b = document.createElement('button');
    //     b.textContent = text;

    //     Object.assign(b.style, {
    //       background: cfg.bg,
    //       color: cfg.text,
    //       padding: cfg.padding,
    //       borderRadius: cfg.borderRadius,
    //       border: `${cfg.borderWidth} solid ${cfg.borderColor}`,
    //       cursor: 'pointer',
    //       fontWeight: cfg.fontWeight,
    //     });

    //     b.onclick = handler;
    //     return b;
    //   };

    //   const btnAccept = makeBtn(
    //     S.prefButtonStyles.acceptAll,
    //     S.prefContent.acceptAllText || 'Accept All',
    //     async () => {
    //       await this._acceptAll();
    //       overlay.style.display = 'none';
    //     },
    //   );

    //   const btnSave = makeBtn(
    //     S.prefButtonStyles.saveAll,
    //     S.prefContent.saveAllText,
    //     async () => {
    //       try {
    //         await this._saveConsent();
    //         this._emitConsentChange();
    //         overlay.style.display = 'none';
    //         this._removeBanner();
    //         this._renderFloatingBtn();
    //         this._unblockScripts();
    //       } catch (err) {
    //         console.error('CMP: failed to save preferences', err);
    //       }
    //     },
    //   );

    //   const btnReject = makeBtn(
    //     S.prefButtonStyles.rejectAll,
    //     S.prefContent.rejectAllText,
    //     async () => {
    //       await this._rejectAll();
    //       overlay.style.display = 'none';
    //     },
    //   );

    //   [btnAccept, btnSave, btnReject].forEach(
    //     (b) => b && footer.appendChild(b),
    //   );

    //   modal.appendChild(footer);

    //   // ================= POWERED BY FOOTER =================
    //   const powered = document.createElement('div');
    //   Object.assign(powered.style, {
    //     background: S.prefStyles.footerBg,
    //     color: S.prefStyles.footerTextColor,
    //     padding: '0.5rem 1rem',
    //     fontSize: '0.75rem',
    //     display: 'flex',
    //     justifyContent: 'flex-end',
    //     alignItems: 'center',
    //     gap: '0.5rem',
    //     borderTop: `1px solid ${S.prefSectionStyles.borderColor}`,
    //   });

    //   if (S.prefFooterLogo) {
    //     const logo = document.createElement('img');
    //     logo.src = S.prefFooterLogo;
    //     logo.style.height = '14px';
    //     logo.style.objectFit = 'contain';
    //     powered.appendChild(logo);
    //   }

    //   const txt = document.createElement('span');
    //   txt.style.opacity = '0.7';
    //   txt.textContent = `Powered by ${S.prefFooterText || ''}`;
    //   powered.appendChild(txt);

    //   modal.appendChild(powered);

    //   overlay.appendChild(modal);
    //   document.body.appendChild(overlay);

    //   this._renderPrefs = () => {
    //     Object.entries(this._toggles).forEach(([key, input]) => {
    //       input.checked = !!this.choices[key];
    //     });

    //     renderMainView();
    //     overlay.style.display = 'flex';
    //   };
    // }

    /** POST consent */
    async _saveConsent() {
      this.categories.forEach((cat) => {
        if (this._isNecessaryCategory(cat)) {
          this.choices[cat.key] = true;
        }
      });

      const res = await fetch(`${this.opts.apiBaseUrl}/cmp/consent`, {
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

      if (!res.ok) {
        throw new Error(`CMP: failed to save consent (${res.status})`);
      }
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

// // cmp-sdk.js
// (function (window, document) {
//   // ————————————————
//   // Helpers
//   // ————————————————

//   // polyfill randomUUID (browser only) so init() never fails
//   if (typeof window !== 'undefined') {
//     if (typeof crypto === 'undefined') window.crypto = {};
//     if (!crypto.getRandomValues) {
//       crypto.getRandomValues = function (arr) {
//         for (let i = 0; i < arr.length; i++) {
//           arr[i] = Math.floor(Math.random() * 256);
//         }
//         return arr;
//       };
//     }
//     if (!crypto.randomUUID) {
//       crypto.randomUUID = function () {
//         const bytes = crypto.getRandomValues(new Uint8Array(16));
//         // set RFC4122 version & variant bits
//         bytes[6] = (bytes[6] & 0x0f) | 0x40;
//         bytes[8] = (bytes[8] & 0x3f) | 0x80;
//         const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
//         return (
//           hex.slice(0, 4).join('') +
//           '-' +
//           hex.slice(4, 6).join('') +
//           '-' +
//           hex.slice(6, 8).join('') +
//           '-' +
//           hex.slice(8, 10).join('') +
//           '-' +
//           hex.slice(10, 16).join('')
//         );
//       };
//     }
//   }
//   const STORAGE_KEY = 'cmp_user';

//   function loadStore() {
//     try {
//       return JSON.parse(localStorage.getItem(STORAGE_KEY));
//     } catch {
//       return null;
//     }
//   }

//   function saveStore(store) {
//     localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
//   }

//   function cloneDeep(obj) {
//     return JSON.parse(JSON.stringify(obj));
//   }

//   function setDeep(obj, path, val) {
//     const parts = path.split('.');
//     let cur = obj;
//     parts.forEach((p, i) => {
//       if (i === parts.length - 1) {
//         cur[p] = val;
//       } else {
//         cur[p] = cur[p] || {};
//         cur = cur[p];
//       }
//     });
//   }

//   // ————————————————
//   // CMP Class
//   // ————————————————
//   class CMP {
//     constructor() {
//       this.opts = {};
//       this.userId = null;
//       this.metadata = {};
//       this.style = null;
//       this.categories = [];
//       this.vendorList = [];
//       this.cookieList = [];
//       this.choices = {};
//       this._listeners = { ready: [], consentChange: [] };
//       this._toggles = {}; // for preference-modal checkboxes
//       this._floatingBtnEl = null;
//       // ← initialize your “blocked scripts” stash here:
//       this._blocked = [];
//       this._blockedScripts = [];
//       this._loadedScriptKeys = new Set(); // to avoid double-loading via _loadScript
//       // patch before anything else runs:
//       // this._patchDOMInsertion();
//       // cookie‐watch: interceptor & monitor flags
//       this._cookieInterceptorInstalled = false;
//       this._cookieMonitorId = null;
//       this._suppressCookieHook = false;
//       this._lastHandledCookie = {};
//       this._knownCookies = new Set();
//       this._cookieNameToCategory = null;

//       // SPA / reapply hooks
//       this._navHooked = false;
//       this._periodicReapplyId = null;
//       this._settleObserver = null;
//     }

//     // Monkey-patch DOM insertion so *any* script ever appended is intercepted
//     // _patchDOMInsertion() {
//     //   const origCreate = document.createElement;
//     //   const origAppend = Node.prototype.appendChild;
//     //   const origInsert = Node.prototype.insertBefore;
//     //   const self = this;

//     //   // Intercept createElement('script')
//     //   document.createElement = function (tagName, options) {
//     //     const el = origCreate.call(this, tagName, options);
//     //     if (tagName.toLowerCase() === 'script') {
//     //       // whenever someone sets src or textContent, hold onto it
//     //       Object.defineProperty(el, 'src', {
//     //         set(src) {
//     //           this._cmpSrc = src;
//     //         },
//     //         get() {
//     //           return this._cmpSrc;
//     //         },
//     //         configurable: true,
//     //       });
//     //       Object.defineProperty(el, 'textContent', {
//     //         set(txt) {
//     //           this._cmpInline = txt;
//     //         },
//     //         get() {
//     //           return this._cmpInline;
//     //         },
//     //         configurable: true,
//     //       });
//     //       // mark it so our appendHook knows to buffer it
//     //       el._isCmpScript = true;
//     //     }
//     //     return el;
//     //   };

//     //   // Helper: if node is a CMP-script, buffer instead of injecting
//     //   function bufferIfScript(node) {
//     //     if (node.tagName?.toLowerCase() === 'script' && node._isCmpScript) {
//     //       self._blockedScripts.push(node);
//     //       return true;
//     //     }
//     //     return false;
//     //   }

//     //   // Patch appendChild
//     //   Node.prototype.appendChild = function (node) {
//     //     if (bufferIfScript(node)) {
//     //       return node; // swallow it: never runs immediately
//     //     }
//     //     return origAppend.call(this, node);
//     //   };

//     //   // Patch insertBefore
//     //   Node.prototype.insertBefore = function (newNode, refNode) {
//     //     if (bufferIfScript(newNode)) {
//     //       return newNode;
//     //     }
//     //     return origInsert.call(this, newNode, refNode);
//     //   };
//     // }

//     // … your existing _blockScripts / _unblockScripts, etc. …

//     /** After user consents, inject all buffered scripts */
//     _releaseScripts() {
//       this._blockedScripts.forEach((clone) => {
//         const s = document.createElement('script');
//         // restore attributes
//         if (clone._cmpSrc) s.src = clone._cmpSrc;
//         if (clone._cmpInline) s.textContent = clone._cmpInline;
//         document.head.appendChild(s);
//       });
//       this._blockedScripts = [];
//     }

//     /** Hide all <script data-cmp-block> tags and stash them away */
//     _blockScripts() {
//       console.debug('CMP: _blockScripts() start');
//       const els = document.querySelectorAll('script[data-cmp-block]');
//       this._blocked = Array.from(els).map((el) => {
//         const clone = document.createElement('script');
//         for (const { name, value } of el.attributes) {
//           clone.setAttribute(name, value);
//         }
//         clone.textContent = el.textContent;
//         el.remove();
//         return clone;
//       });
//       console.debug(`CMP: stashed ${this._blocked.length} scripts`);
//     }

//     // /** Re-insert only those the user accepted */
//     _unblockScripts() {
//       console.debug('CMP: _unblockScripts() start', this.choices);
//       this._blocked.forEach((clone) => {
//         const key = clone.getAttribute('data-vkey');
//         console.debug(
//           'CMP: considering blocked script',
//           key,
//           'consent:',
//           this.choices[key],
//         );
//         if (this.choices[key]) {
//           // make it executable if it was inert
//           if (clone.getAttribute('type') === 'text/cmp-block') {
//             clone.removeAttribute('type');
//           }
//           document.head.appendChild(clone);
//           console.debug(`CMP: unleashed script with vkey="${key}"`);
//         } else {
//           console.debug(`CMP: skipping script vkey="${key}"`);
//         }
//       });
//       this._blocked = [];
//       console.debug('CMP: _unblockScripts() done');
//     }

//     _loadScript({ src, inline, attrs = {}, categoryKey, key }) {
//       console.debug('CMP: _loadScript called', {
//         src,
//         categoryKey,
//         key,
//         choices: this.choices,
//       });
//       if (categoryKey && this.choices[categoryKey] === false) {
//         console.debug(
//           `CMP: skipping load of ${src} because no consent for ${categoryKey}`,
//         );
//         return Promise.resolve(null);
//       }
//       if (key && this._loadedScriptKeys.has(key)) {
//         console.debug(`CMP: script with key "${key}" already loaded; skipping`);
//         return Promise.resolve(null);
//       }
//       return new Promise((resolve, reject) => {
//         const s = document.createElement('script');
//         if (src) s.src = src;
//         if (inline) s.textContent = inline;
//         Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
//         s.onload = () => {
//           if (key) this._loadedScriptKeys.add(key);
//           console.debug(`CMP: loaded script ${src}`);
//           resolve(s);
//         };
//         s.onerror = (e) => {
//           console.warn(`CMP: failed to load script ${src}`, e);
//           reject(e);
//         };
//         document.head.appendChild(s);
//       });
//     }

//     /** Delete a specific cookie */
//     _deleteCookie(name, domain, path = '/') {
//       console.debug(
//         `CMP: _deleteCookie called for cookie name="${name}", domain="${domain}", path="${path}"`,
//       );

//       const expireStr = 'Thu, 01 Jan 1970 00:00:00 GMT';
//       const tryDomains = [];

//       if (domain) {
//         tryDomains.push(domain);
//         // sometimes cookies were set with a leading dot
//         if (!domain.startsWith('.')) tryDomains.push(`.${domain}`);
//       } else {
//         // fallback: current hostname and its dotted variant
//         const host = window.location.hostname;
//         tryDomains.push(host);
//         if (!host.startsWith('.')) tryDomains.push(`.${host}`);
//       }

//       // Attempt deletion with multiple variants to increase chance of success
//       tryDomains.forEach((dom) => {
//         const cookieStr1 = `${name}=; Max-Age=0; path=${path}; domain=${dom};`;
//         const cookieStr2 = `${name}=; expires=${expireStr}; path=${path}; domain=${dom};`;
//         document.cookie = cookieStr1;
//         console.debug(
//           `CMP: attempted deletion (Max-Age) for "${name}" with domain "${dom}": ${cookieStr1}`,
//         );
//         document.cookie = cookieStr2;
//         console.debug(
//           `CMP: attempted deletion (expires) for "${name}" with domain "${dom}": ${cookieStr2}`,
//         );
//       });

//       // Also attempt without explicit domain (some cookies may be host-scoped)
//       const fallback1 = `${name}=; Max-Age=0; path=${path};`;
//       const fallback2 = `${name}=; expires=${expireStr}; path=${path};`;
//       document.cookie = fallback1;
//       document.debug &&
//         console.debug(
//           `CMP: attempted deletion fallback (Max-Age) for "${name}": ${fallback1}`,
//         );
//       document.cookie = fallback2;
//       document.debug &&
//         console.debug(
//           `CMP: attempted deletion fallback (expires) for "${name}": ${fallback2}`,
//         );

//       // Check if it's still present (best-effort; cannot detect HttpOnly)
//       const stillExists = document.cookie
//         .split(';')
//         .map((c) => c.trim())
//         .some((c) => c.startsWith(`${name}=`));

//       if (stillExists) {
//         console.warn(
//           `CMP: cookie "${name}" still present after deletion attempts (could be HttpOnly / wrong path/domain).`,
//         );
//       } else {
//         console.debug(`CMP: cookie "${name}" appears removed.`);
//       }
//     }

//     /** Clear all non-necessary cookies (fallback) */
//     _clearAllCookies() {
//       const raw = document.cookie;
//       console.debug(
//         `CMP: _clearAllCookies called. current document.cookie: "${raw}"`,
//       );

//       if (!raw) {
//         console.debug('CMP: no cookies to clear.');
//         return;
//       }

//       const cookies = raw
//         .split(';')
//         .map((c) => c.trim())
//         .filter(Boolean);
//       const skipped = [];
//       const attempted = [];

//       cookies.forEach((cookie) => {
//         const eqIdx = cookie.indexOf('=');
//         const name = eqIdx > -1 ? cookie.slice(0, eqIdx) : cookie;
//         if (name === 'necessary') {
//           skipped.push(name);
//           return; // skip the known necessary cookie
//         }
//         attempted.push(name);
//         this._deleteCookie(name);
//       });

//       console.debug(
//         `CMP: _clearAllCookies summary: attempted=[${attempted.join(
//           ', ',
//         )}], skipped=[${skipped.join(', ')}]`,
//       );
//     }
//     // turn something like "https://dev.grc3.io" into "dev.grc3.io"
//     _normalizeDomainString(domainStr) {
//       if (!domainStr) return window.location.hostname;
//       try {
//         return new URL(domainStr).hostname;
//       } catch {
//         return domainStr.replace(/^https?:\/\//, '').replace(/\/$/, '');
//       }
//     }

//     _domainCandidates(hostname) {
//       if (!hostname) return [];
//       const parts = hostname.split('.');
//       const candidates = new Set();
//       // Build from most specific to less: e.g., ["dev.grc3.io", "grc3.io"]
//       for (let i = 0; i <= parts.length - 2; i++) {
//         const d = parts.slice(i).join('.');
//         candidates.add(d);
//         candidates.add(`.${d}`);
//       }
//       return Array.from(candidates);
//     }
//     /** Apply allowed/denied cookie & script state based on current choices */
//     _applyAllowedCookies() {
//       console.debug(
//         'CMP: _applyAllowedCookies called. current choices:',
//         this.choices,
//       );
//       console.debug('CMP: categories from /cmp/config:', this.categories);

//       // Always enforce necessary
//       this.choices['necessary'] = true;

//       if (!Array.isArray(this.categories)) {
//         console.warn(
//           'CMP: no categories loaded from /cmp/config; cannot clear cookies per category.',
//         );
//         return;
//       }

//       this.categories.forEach((cat) => {
//         const key = cat.key || (cat.name && cat.name.toLowerCase());
//         if (!key) {
//           console.debug('CMP: skipping category with no key/name', cat);
//           return;
//         }

//         const consent = this.choices[key];
//         const cookieNames = Array.isArray(cat.cookieNames)
//           ? cat.cookieNames
//           : [];
//         console.debug(
//           `CMP: evaluating category "${key}" (consent=${consent})`,
//           'cookieNames:',
//           cookieNames,
//         );

//         if (consent === false) {
//           if (cookieNames.length) {
//             console.debug(
//               `CMP: user declined category "${key}", will clear cookies:`,
//               cookieNames,
//             );
//             cookieNames.forEach((name) => {
//               // derive domain candidates from the configured domain (e.g., "https://dev.grc3.io")
//               const rawDomain = this.opts.domain || window.location.hostname;
//               const normalized = this._normalizeDomainString(rawDomain); // e.g. "dev.grc3.io"
//               const domainsToTry = this._domainCandidates(normalized); // includes "dev.grc3.io","\.dev.grc3.io","grc3.io",".grc3.io"
//               console.log(rawDomain, normalized, domainsToTry);
//               domainsToTry.forEach((dom) => {
//                 this._deleteCookie(name, dom);
//                 console.debug(
//                   `CMP: attempted to clear cookie "${name}" for declined category "${key}" with domain variant "${dom}"`,
//                 );
//               });
//             });
//           } else {
//             console.warn(
//               `CMP: category "${key}" declined but no cookieNames provided to clear.`,
//             );
//           }
//         } else {
//           console.debug(
//             `CMP: category "${key}" accepted or defaulted; skipping deletion.`,
//           );
//         }
//       });
//     }

//     /** render the floating cookie button */
//     _renderFloatingBtn() {
//       if (this._floatingBtnEl) return;
//       // ─── inject rotate keyframes once ───
//       if (!document.getElementById('floating-btn-animation-style')) {
//         const styleEl = document.createElement('style');
//         styleEl.id = 'floating-btn-animation-style';
//         styleEl.textContent = `
//           @keyframes rotate {
//             0%   { transform: rotate(0deg); }
//             100% { transform: rotate(360deg); }
//           }
//           /* optional: a little pulse on hover */
//           @keyframes pulse {
//             0%, 100% { transform: scale(1); }
//             50%      { transform: scale(1.1); }
//           }
//         `;
//         document.head.appendChild(styleEl);
//       }
//       // ────────────────────────────────────────         // only once
//       const btn = document.createElement('button');
//       btn.id = 'cmp-floating-btn';
//       btn.title = 'Change cookie settings';

//       // ─── NEW: put an <img> inside the button instead of innerText ───
//       const img = document.createElement('img');
//       img.src =
//         this.style.prefStyles?.buttonIconUrl ||
//         'http://23.22.92.199:8101/priv/CookieImage.png';
//       img.alt = 'Cookie Settings';
//       // size it to fit nicely in the circle:
//       Object.assign(img.style, {
//         width: '70%', // 60% of button width/height
//         height: '70%',
//         display: 'block',
//         margin: 'auto',
//       });
//       btn.appendChild(img);
//       // ───────────────────────────────────────────────────────────────────

//       Object.assign(btn.style, {
//         position: 'fixed',
//         bottom: '1rem',
//         right: '1rem',
//         width: '50px',
//         height: '50px',
//         borderRadius: '50%',
//         border: 'none',
//         background: '#22c55e' || this.style.prefStyles?.buttonBg || '#22c55e',
//         color: this.style.prefStyles?.buttonText || '#fff',
//         cursor: 'pointer',
//         zIndex: 10002,
//         padding: '0',
//         animation: 'pulse 4s linear infinite',
//         transition: 'transform 0.2s ease-in-out',
//       });

//       btn.addEventListener('mouseover', () => {
//         btn.style.animation = 'pulse 1.5s ease-in-out infinite';
//       });

//       btn.addEventListener('click', () => {
//         this._renderBanner();
//         this._removeFloatingBtn();
//       });
//       document.body.appendChild(btn);
//       this._floatingBtnEl = btn;
//     }

//     /** remove the floating button */
//     _removeFloatingBtn() {
//       if (this._floatingBtnEl) {
//         this._floatingBtnEl.remove();
//         this._floatingBtnEl = null;
//       }
//     }

//     /** Subscribe to 'ready' or 'consentChange' */
//     on(evt, fn) {
//       if (this._listeners[evt]) {
//         this._listeners[evt].push(fn);
//       }
//     }

//     /** Get current consent choices */
//     getConsent() {
//       return { ...this.choices };
//     }

//     /** Get stored metadata */
//     getMetadata() {
//       return { ...this.metadata };
//     }

//     /** Set one metadata key & persist */
//     setMetadata(key, value) {
//       this.metadata[key] = value;
//       saveStore({ userId: this.userId, metadata: this.metadata });
//     }

//     /** Re-open the Preference Center */
//     showPreferences() {
//       this._renderPrefs && this._renderPrefs();
//     }

//     _categoryKey(cat) {
//       if (!cat) return '';
//       if (cat.key) return String(cat.key);

//       return String(cat.name || '')
//         .trim()
//         .toLowerCase()
//         .replace(/[^a-z0-9]+/g, '_')
//         .replace(/^_+|_+$/g, '');
//     }

//     _isNecessaryCategory(cat) {
//       const key = this._categoryKey(cat);
//       return (
//         key === 'necessary' ||
//         cat?.required === true ||
//         String(cat?.name || '')
//           .trim()
//           .toLowerCase() === 'necessary'
//       );
//     }

//     _normalizeCategories(categories) {
//       return (Array.isArray(categories) ? categories : []).map((cat, index) => {
//         const key = this._categoryKey(cat) || `category_${index + 1}`;
//         const required =
//           key === 'necessary' ||
//           cat.required === true ||
//           String(cat.name || '')
//             .trim()
//             .toLowerCase() === 'necessary';

//         return {
//           ...cat,
//           key,
//           required,
//           default: required ? true : !!cat.default,
//           cookieNames: Array.isArray(cat.cookieNames) ? cat.cookieNames : [],
//         };
//       });
//     }

//     async _fetchRuntimeList(path) {
//       const url = new URL(`${this.opts.apiBaseUrl}${path}`);
//       url.searchParams.set('domain', this.opts.domain);

//       const res = await fetch(url, { credentials: 'include' });
//       if (!res.ok) return [];

//       const json = await res.json();

//       if (Array.isArray(json)) return json;
//       if (Array.isArray(json.items)) return json.items;
//       if (Array.isArray(json.vendors)) return json.vendors;
//       if (Array.isArray(json.cookies)) return json.cookies;

//       return [];
//     }

//     async _loadRuntimeLists() {
//       this.vendorList = [];
//       this.cookieList = [];

//       if (this.style?.showVendorList) {
//         try {
//           this.vendorList = await this._fetchRuntimeList('/cmp/vendors');
//         } catch (err) {
//           console.warn('CMP: failed to load vendor list', err);
//           this.vendorList = [];
//         }
//       }

//       if (this.style?.showCookieList) {
//         try {
//           this.cookieList = await this._fetchRuntimeList('/cmp/cookies');
//         } catch (err) {
//           console.warn('CMP: failed to load cookie list', err);
//           this.cookieList = [];
//         }
//       }
//     }

//     _makeTextEl(tag, text) {
//       const el = document.createElement(tag);
//       el.textContent = text || '';
//       return el;
//     }

//     _styleLinkButton(btn) {
//       const S = this.style;

//       Object.assign(btn.style, {
//         fontSize: '15px',
//         background: 'transparent',
//         border: 'none',
//         padding: 0,
//         cursor: 'pointer',
//         color: S.prefPolicyLinkStyles?.textColor,
//         textDecoration: S.prefPolicyLinkStyles?.decoration,
//       });
//     }

//     // — init(opts) —
//     async init(opts) {
//       console.log('CMP.init() called with:', opts);

//       // 1) Normalize & validate
//       this.opts = {
//         apiBaseUrl: '',
//         configId: null,
//         domain: window.location.hostname,
//         ...opts,
//       };

//       if (!this.opts.apiBaseUrl || !this.opts.configId) {
//         throw new Error('CMP.init requires { apiBaseUrl, configId }');
//       }

//       // BLOCK all CMP-blocked scripts as early as this SDK can.
//       // Note: scripts that already executed before this SDK loaded cannot be undone.
//       this._blockScripts();

//       // 2) Load/create userId + metadata
//       let store = loadStore();
//       if (!store || typeof store.userId !== 'string') {
//         store = { userId: crypto.randomUUID(), metadata: {} };
//         saveStore(store);
//       }

//       this.userId = store.userId;
//       this.metadata = store.metadata;

//       // 3) Fetch banner config
//       const cfgRes = await fetch(
//         `${this.opts.apiBaseUrl}/cmp/configs/${this.opts.configId}`,
//         { credentials: 'include' },
//       );

//       if (!cfgRes.ok) {
//         throw new Error('CMP.init: failed to load banner config');
//       }

//       const cfg = await cfgRes.json();

//       // 4) Merge styleConfig + overrides
//       this.style = cloneDeep(cfg.styleConfig || {});
//       if (cfg.overrideEnabled && cfg.modifiedFields) {
//         Object.entries(cfg.modifiedFields).forEach(([path, val]) =>
//           setDeep(this.style, path, val),
//         );
//       }

//       // 5) Fetch real categories from runtime category API
//       // style.cookieCategories is only design/preview fallback from admin/template.
//       const catUrl = new URL(`${this.opts.apiBaseUrl}/cmp/config`);
//       catUrl.searchParams.set('domain', this.opts.domain);

//       const catRes = await fetch(catUrl, { credentials: 'include' });
//       if (!catRes.ok) {
//         throw new Error('CMP.init: failed to load categories');
//       }

//       this.categories = this._normalizeCategories(await catRes.json());

//       // 6) Fetch real vendor/cookie lists from runtime APIs.
//       // style.listsContent is used only for labels/styles/fallback text, not real production data.
//       await this._loadRuntimeLists();

//       // 7) Fetch existing consent
//       let hasStoredConsent = false;

//       const prefUrl = new URL(`${this.opts.apiBaseUrl}/cmp/consent`);
//       prefUrl.searchParams.set('domain', this.opts.domain);
//       prefUrl.searchParams.set('userId', this.userId);

//       const prefRes = await fetch(prefUrl, { credentials: 'include' });
//       if (prefRes.ok) {
//         const prefJson = await prefRes.json();

//         if (Array.isArray(prefJson.categories)) {
//           hasStoredConsent = true;
//           prefJson.categories.forEach((c) => {
//             const key = c.key || this._categoryKey(c);
//             if (key) this.choices[key] = !!c.accepted;
//           });
//         } else if (prefJson.choices && typeof prefJson.choices === 'object') {
//           hasStoredConsent = true;
//           Object.entries(prefJson.choices).forEach(([k, v]) => {
//             this.choices[k] = !!v;
//           });
//         }
//       }

//       // 8) Seed defaults for runtime categories.
//       // Defaults are NOT stored consent; they only initialize the UI.
//       this.categories.forEach((cat) => {
//         if (this._isNecessaryCategory(cat)) {
//           this.choices[cat.key] = true;
//         } else if (this.choices[cat.key] === undefined) {
//           this.choices[cat.key] = !!cat.default;
//         }
//       });

//       // 9) Fire 'ready' event
//       this._fireReady();

//       // 10) Render banner or apply stored consent
//       if (!hasStoredConsent) {
//         console.log('CMP.init(): showing banner; no stored consent found');
//         this._renderBanner();
//       } else {
//         console.log('CMP.init(): stored consent found; applying choices');
//         this._applyAllowedCookies();
//         this._renderFloatingBtn();
//         this._unblockScripts();
//       }

//       // ensure SPA navigation re-applies consent
//       this._setupNavigationListener();

//       // periodic and settled reapplications
//       this._setupPeriodicReapply();
//       this._setupSettleWatcher();

//       // install interception/monitoring
//       this._setupCookieInterceptor();
//       this._setupCookieMonitor();

//       // 11) Build the Preferences modal now that choices are seeded
//       this._preparePreferenceCenter();

//       console.log('CMP.init() complete');
//     }

//     /** Emit 'ready' */
//     _fireReady() {
//       const payload = {
//         style: this.style,
//         categories: this.categories,
//         userId: this.userId,
//         metadata: this.getMetadata(),
//         choices: this.getConsent(),
//       };
//       this._listeners.ready.forEach((fn) => fn(payload));
//       if (typeof this.opts.onReady === 'function') {
//         this.opts.onReady(payload);
//       }
//     }

//     /** Public helper to re-apply current consent decisions */
//     applyConsent() {
//       this._applyAllowedCookies();
//     }

//     /** Install listeners / wrappers so SPA navigations re-apply consent */
//     _setupNavigationListener() {
//       if (this._navHooked) return;
//       this._navHooked = true;

//       const reapply = () => {
//         console.debug(
//           'CMP: SPA navigation detected, reapplying consent. current URL:',
//           location.href,
//         );
//         this.applyConsent();

//         // restart settle watcher so it observes new page content
//         if (this._settleObserver) {
//           this._settleObserver.disconnect();
//           this._settleObserver = null;
//         }
//         this._setupSettleWatcher();
//         // inside reapply in _setupNavigationListener
//         this._stopCookieMonitor();
//         this._setupCookieMonitor();
//       };

//       // Wrap history API to detect pushState / replaceState
//       const origPush = history.pushState;
//       const origReplace = history.replaceState;

//       history.pushState = function (...args) {
//         console.debug('CMP: history.pushState called', {
//           args,
//           from: document.referrer,
//           before: location.href,
//         });
//         const result = origPush.apply(this, args);
//         setTimeout(() => {
//           console.debug('CMP: after pushState new URL', location.href);
//           reapply();
//         }, 0);
//         return result;
//       };

//       history.replaceState = function (...args) {
//         console.debug('CMP: history.replaceState called', {
//           args,
//           before: location.href,
//         });
//         const result = origReplace.apply(this, args);
//         setTimeout(() => {
//           console.debug('CMP: after replaceState new URL', location.href);
//           reapply();
//         }, 0);
//         return result;
//       };

//       // Back/forward & hash change
//       window.addEventListener('popstate', (e) => {
//         console.debug('CMP: popstate event', e, 'current URL:', location.href);
//         reapply();
//       });
//       window.addEventListener('hashchange', (e) => {
//         console.debug(
//           'CMP: hashchange event',
//           e,
//           'current URL:',
//           location.href,
//         );
//         reapply();
//       });
//     }

//     /** start periodic re-application of the current consent */
//     _setupPeriodicReapply() {
//       if (this._periodicReapplyId) return;
//       this._periodicReapplyId = setInterval(() => {
//         console.debug('CMP: periodic reapply of consent');
//         this.applyConsent();
//       }, 30_000); // 30 seconds
//     }

//     _setupSettleWatcher() {
//       if (this._settleObserver) return;

//       let settleTimer = null;
//       const scheduleApply = () => {
//         if (settleTimer) clearTimeout(settleTimer);
//         settleTimer = setTimeout(() => {
//           console.debug('CMP: page settled, reapplying consent');
//           this.applyConsent();
//         }, 500); // 500ms of no mutations = settled
//       };

//       this._settleObserver = new MutationObserver(() => {
//         scheduleApply();
//       });

//       // Observe wide set of changes so we detect dynamic content injection
//       this._settleObserver.observe(document.body, {
//         childList: true,
//         subtree: true,
//         attributes: true,
//         characterData: true,
//       });

//       // Kick off initial settle timer
//       scheduleApply();

//       // Fallback in case mutations keep happening: ensure at least one apply
//       setTimeout(() => {
//         console.debug('CMP: settle watcher fallback applyConsent');
//         this.applyConsent();
//       }, 5000);
//     }

//     /** Called when a cookie is written via document.cookie setter interception */
//     _onCookieWrite(name) {
//       if (!this._cookieNameToCategory) {
//         this._cookieNameToCategory = {};
//         (this.categories || []).forEach((cat) => {
//           (cat.cookieNames || []).forEach((cn) => {
//             this._cookieNameToCategory[cn] = cat.key;
//           });
//         });
//       }

//       const catKey = this._cookieNameToCategory[name];
//       if (catKey && this.choices[catKey] === false) {
//         console.debug(
//           `CMP: intercepted write of cookie "${name}" for declined category "${catKey}", deleting it`,
//         );
//         const normalized = this._normalizeDomainString(this.opts.domain);
//         this._deleteCookie(name, normalized);
//       }
//     }

//     /** Hook document.cookie setter to intercept JS writes (with debounce & recursion guard) */
//     _setupCookieInterceptor() {
//       if (this._cookieInterceptorInstalled) return;
//       this._cookieInterceptorInstalled = true;

//       try {
//         // cookie descriptor lives on Document.prototype in browsers
//         const proto = Document.prototype || HTMLDocument.prototype;
//         const desc =
//           Object.getOwnPropertyDescriptor(proto, 'cookie') ||
//           Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
//         if (!desc || !desc.configurable) {
//           console.warn(
//             'CMP: cookie property not configurable; interceptor skipped',
//           );
//           return;
//         }

//         const self = this;
//         Object.defineProperty(document, 'cookie', {
//           configurable: true,
//           enumerable: true,
//           get() {
//             return desc.get.call(document);
//           },
//           set(val) {
//             const name = val.split('=')[0].trim();
//             // perform original set
//             desc.set.call(document, val);

//             // avoid re-entrancy when our own deletion triggers setter
//             if (self._suppressCookieHook) return;

//             try {
//               self._suppressCookieHook = true;
//               self._lastHandledCookie ??= {};
//               if (self._lastHandledCookie[name]) {
//                 return; // debounce duplicate rapid writes
//               }
//               self._lastHandledCookie[name] = true;
//               setTimeout(() => {
//                 delete self._lastHandledCookie[name];
//               }, 500);

//               // delegate to handler
//               self._onCookieWrite?.(name);
//             } finally {
//               self._suppressCookieHook = false;
//             }
//           },
//         });

//         console.debug('CMP: installed cookie write interceptor');
//       } catch (e) {
//         console.warn('CMP: failed to install cookie interceptor', e);
//       }
//     }

//     /** Poll for new cookies as a fallback (e.g., HTTP-set ones) */
//     _setupCookieMonitor(pollInterval = 2000) {
//       if (this._cookieMonitorId) return;

//       // snapshot current cookie names
//       let previousNames = (document.cookie || '')
//         .split(';')
//         .map((c) => c.trim().split('=')[0])
//         .filter(Boolean);

//       // keep known set in sync if you need it elsewhere
//       this._knownCookies = new Set(previousNames);

//       this._cookieMonitorId = setInterval(() => {
//         const currentNames = (document.cookie || '')
//           .split(';')
//           .map((c) => c.trim().split('=')[0])
//           .filter(Boolean);

//         // newly added cookies since last tick
//         const added = currentNames.filter((n) => !previousNames.includes(n));
//         if (added.length) {
//           console.debug('CMP: cookie monitor detected new cookie(s):', added);
//           added.forEach((name) => {
//             this._onCookieWrite?.(name);
//           });
//         }

//         // keep baseline for next comparison
//         previousNames = currentNames;
//         // optionally keep knownCookies updated
//         currentNames.forEach((n) => this._knownCookies.add(n));
//         // prune if removed (optional)
//         Array.from(this._knownCookies).forEach((n) => {
//           if (!currentNames.includes(n)) this._knownCookies.delete(n);
//         });
//       }, pollInterval);
//     }

//     /** Minimal handler invoked when any cookie appears/written */
//     _onCookieWrite(name) {
//       // map cookie to category from /cmp/config
//       const cat = (this.categories || []).find(
//         (c) => Array.isArray(c.cookieNames) && c.cookieNames.includes(name),
//       );
//       if (!cat) return;

//       const key = cat.key || (cat.name && cat.name.toLowerCase());
//       if (key && this.choices[key] === false) {
//         const normalizedDomain = this._normalizeDomainString(this.opts.domain);
//         console.debug(
//           `CMP: cookie "${name}" belongs to declined category "${key}", deleting it (domain normalized to "${normalizedDomain}")`,
//         );
//         this._deleteCookie(name, normalizedDomain);
//       }
//     }

//     _stopCookieMonitor() {
//       if (this._cookieMonitorId) {
//         clearInterval(this._cookieMonitorId);
//         this._cookieMonitorId = null;
//       }
//     }

//     /** insert a full-screen transparent blocker under the banner */
//     _renderBlocker() {
//       if (this._blockerEl) return;
//       const blk = document.createElement('div');
//       blk.id = 'cmp-blocker';
//       Object.assign(blk.style, {
//         position: 'fixed',
//         top: '0',
//         left: '0',
//         width: '100vw',
//         height: '100vh',
//         background: 'rgba(0,0,0,0)', // transparent
//         zIndex: 9999, // just under the banner (banner is at 10000)
//         cursor: 'default',
//       });
//       document.body.appendChild(blk);
//       this._blockerEl = blk;
//     }

//     /** remove that blocker when the banner goes away */
//     _removeBlocker() {
//       if (this._blockerEl) {
//         this._blockerEl.remove();
//         this._blockerEl = null;
//       }
//     }

//     /** Render the consent banner */
//     _renderBanner() {
//       this._removeFloatingBtn();
//       if (this._bannerEl) return;

//       const S = this.style;

//       const container = document.createElement('div');
//       container.id = 'cmp-banner';

//       // target for translator
//       const languageTarget = document.createElement('div');
//       languageTarget.id = 'cmp-language-target';
//       languageTarget.setAttribute('data-no-translate', 'true');
//       Object.assign(languageTarget.style, {
//         position: 'absolute',
//         bottom: '4px',
//         left: '4px',
//         zIndex: '9999',
//       });
//       container.append(languageTarget);

//       Object.assign(container.style, {
//         position: 'fixed',
//         backgroundColor: S.backgroundColor,
//         color: S.textColor,
//         padding: S.bannerStyles.padding,
//         borderRadius: S.bannerStyles.borderRadius,
//         boxShadow: S.bannerStyles.boxShadow,
//         fontFamily: S.bannerStyles.fontFamily,
//         fontSize: S.bannerStyles.fontSize,
//         textAlign: S.bannerStyles.textAlign,
//         display: 'flex',
//         flexDirection:
//           S.bannerStyles.orientation === 'horizontal' ? 'row' : 'column',
//         alignItems: S.bannerStyles.alignItems || 'center',
//         gap: S.bannerStyles.gap || '1rem',
//         flexWrap: 'wrap',
//         boxSizing: 'border-box',
//         zIndex: 10000,
//       });

//       const { type: layoutType = 'bar', position: layoutPosition = 'bottom' } =
//         S.layout || {};

//       if (layoutType === 'bar') {
//         Object.assign(container.style, {
//           left: 0,
//           right: 0,
//           [layoutPosition]: 0,
//           width: '100%',
//         });
//       }
//        else if (layoutType === 'toast') {
//         const [vert, hor] = layoutPosition.split('-');
//         Object.assign(container.style, {
//           [vert]: '1rem',
//           [hor]: '1rem',
//           width: '260px',
//         });
//       } else if (layoutType === 'floating') {
//         if (layoutPosition === 'center') {
//           Object.assign(container.style, {
//             top: '50%',
//             left: '50%',
//             transform: 'translate(-50%, -50%)',
//             width: '80%',
//             maxWidth: '480px',
//           });
//         } else if (layoutPosition === 'top-center') {
//           Object.assign(container.style, {
//             top: '1rem',
//             left: '50%',
//             transform: 'translateX(-50%)',
//             width: '80%',
//             maxWidth: '480px',
//           });
//         } else if (layoutPosition === 'bottom-center') {
//           Object.assign(container.style, {
//             bottom: '1rem',
//             left: '50%',
//             transform: 'translateX(-50%)',
//             width: '80%',
//             maxWidth: '480px',
//           });
//         } else {
//           const [vert, hor] = layoutPosition.split('-');
//           Object.assign(container.style, {
//             [vert]: '1rem',
//             [hor || 'left']: '1rem',
//             width: '80%',
//             maxWidth: '480px',
//           });
//         }
//       } else if (layoutType === 'center') {
//         Object.assign(container.style, {
//           position: 'fixed',
//           top: '50%',
//           left: '50%',
//           right: 'auto',
//           bottom: 'auto',
//           transform: 'translate(-50%, -50%)',
//           width: 'min(92vw, 520px)',
//           maxWidth: '520px',
//           maxHeight: '80vh',
//           overflow: 'auto',
//           display: 'block',
//         });
//       }

//       // ================= CLOSE BUTTON =================
//       if (S.bannerClose?.enabled) {
//         const close = document.createElement('button');
//         close.textContent = '×';

//         Object.assign(close.style, {
//           position: 'absolute',
//           top: S.bannerClose.offset,
//           right: S.bannerClose.offset,
//           fontSize: S.bannerClose.size,
//           background: S.bannerClose.bg,
//           color: S.bannerClose.color,
//           border: `${S.bannerClose.borderWidth} solid ${S.bannerClose.borderColor}`,
//           borderRadius: S.bannerClose.borderRadius,
//           cursor: 'pointer',
//         });

//         close.onclick = () => this._removeBanner();
//         container.appendChild(close);
//       }

//       // ================= LOGO =================
//       if (S.logo) {
//         const img = document.createElement('img');
//         img.src = S.logo;
//         img.alt = 'Logo';
//         img.style.maxHeight = '40px';
//         container.appendChild(img);
//       }

//       // ================= TEXT =================
//       const textWrap = document.createElement('div');
//       textWrap.style.flex = '1';

//       const pTitle = document.createElement('p');
//       pTitle.textContent = S.texts.title;
//       Object.assign(pTitle.style, {
//         margin: 0,
//         fontWeight: 600,
//       });

//       const pDesc = document.createElement('p');
//       pDesc.textContent = S.texts.description;
//       pDesc.style.margin = '0.25rem 0';

//       textWrap.append(pTitle, pDesc);

//       // ================= LINKS =================

//       // Inline policy link: appears directly after description text
//       if (
//         S.showPolicyLink &&
//         S.policyLinkPosition === 'inline' &&
//         S.policyText &&
//         S.policyUrl
//       ) {
//         const policyInline = document.createElement('a');
//         policyInline.href = S.policyUrl;
//         policyInline.textContent = S.policyText;
//         policyInline.style.color = S.linkStyles?.textColor;
//         policyInline.style.textDecoration = S.linkStyles?.decoration;

//         pDesc.appendChild(document.createTextNode(' '));
//         pDesc.appendChild(policyInline);
//       }

//       // Separate policy/imprint links area
//       if (
//         (S.showPolicyLink && S.policyLinkPosition === 'separate') ||
//         S.showImprintLink
//       ) {
//         const linksRow = document.createElement('div');

//         const linkAlign =
//           S.bannerStyles.linkAlign === 'center'
//             ? 'center'
//             : S.bannerStyles.linkAlign === 'right'
//               ? 'flex-end'
//               : 'flex-start';

//         Object.assign(linksRow.style, {
//           marginTop: '0.25rem',
//           display: 'flex',
//           alignItems: 'center',
//           gap: '1rem',
//           flexWrap: 'wrap',
//           justifyContent: linkAlign,
//         });

//         if (
//           S.showPolicyLink &&
//           S.policyLinkPosition === 'separate' &&
//           S.policyText &&
//           S.policyUrl
//         ) {
//           const policySeparate = document.createElement('a');
//           policySeparate.href = S.policyUrl;
//           policySeparate.textContent = S.policyText;
//           policySeparate.style.color = S.linkStyles?.textColor;
//           policySeparate.style.textDecoration = S.linkStyles?.decoration;
//           linksRow.appendChild(policySeparate);
//         }

//         if (S.showImprintLink && S.imprintText && S.imprintUrl) {
//           const imprint = document.createElement('a');
//           imprint.href = S.imprintUrl;
//           imprint.textContent = S.imprintText;
//           imprint.style.color = S.linkStyles?.textColor;
//           imprint.style.textDecoration = S.linkStyles?.decoration;
//           linksRow.appendChild(imprint);
//         }

//         if (linksRow.children.length) {
//           textWrap.appendChild(linksRow);
//         }
//       }

//       container.appendChild(textWrap);

//       //   // ================= BUTTONS =================
//       //   const btnRow = document.createElement('div');

//       //   Object.assign(btnRow.style, {
//       //     display: 'flex',
//       //     gap: '0.5rem',
//       //     flexDirection: S.bannerButtonStyles?.stackButtons ? 'column' : 'row',
//       //     justifyContent: S.bannerStyles.buttonAlign || 'left',
//       //   });

//       //   const btnConfig = Object.entries(S.bannerButtonStyles || {})
//       //     .filter(([k, v]) => v && typeof v === 'object' && v.enabled === true)
//       //     .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

//       //   btnConfig.forEach(([type, cfg]) => {
//       //     const actionMap = {
//       //       accept: () => this._acceptAll(),
//       //       reject: () => this._rejectAll(),
//       //       manage: () => this.showPreferences(),
//       //     };

//       //     const textMap = {
//       //       accept: S.texts.acceptAll,
//       //       reject: S.texts.rejectAll,
//       //       manage: S.texts.managePrefs,
//       //     };

//       //     if (!actionMap[type]) return;

//       //     const b = document.createElement('button');
//       //     b.textContent = textMap[type];

//       //     Object.assign(b.style, {
//       //       backgroundColor: cfg.bg,
//       //       color: cfg.text,
//       //       padding: cfg.padding,
//       //       borderRadius: cfg.borderRadius,
//       //       border: `${cfg.borderWidth} solid ${cfg.borderColor}`,
//       //       transition: cfg.transition,
//       //       fontWeight: cfg.fontWeight,
//       //       textDecoration: cfg.underline ? 'underline' : 'none',
//       //       cursor: 'pointer',
//       //     });

//       //     b.onclick = actionMap[type];
//       //     btnRow.appendChild(b);
//       //   });

//       //   container.appendChild(btnRow);
//       // ================= BUTTONS =================
//       const btnRow = document.createElement('div');

//       const isCompactLayout =
//         layoutType === 'toast' ||
//         layoutType === 'floating' ||
//         layoutType === 'center' ||
//         (layoutType === 'bar' &&
//           (layoutPosition === 'left' || layoutPosition === 'right'));

//       const growButtonsRow =
//         isCompactLayout && !S.bannerButtonStyles?.stackButtons;

//       const toJustify = (align) => {
//         if (align === 'center') return 'center';
//         if (align === 'right') return 'flex-end';
//         return 'flex-start';
//       };

//       Object.assign(btnRow.style, {
//         display: 'flex',
//         gap: '0.5rem',
//         flexWrap: 'wrap',
//         flexDirection: S.bannerButtonStyles?.stackButtons ? 'column' : 'row',
//         justifyContent: toJustify(S.bannerStyles.buttonAlign),
//         width:
//           S.bannerButtonStyles?.stackButtons && isCompactLayout
//             ? '100%'
//             : S.bannerButtonStyles?.stackButtons
//               ? 'auto'
//               : 'auto',
//         alignItems: S.bannerButtonStyles?.stackButtons ? 'stretch' : 'center',
//       });

//       const btnConfig = Object.entries(S.bannerButtonStyles || {})
//         .filter(([k, v]) => v && typeof v === 'object' && v.enabled === true)
//         .filter(([k]) => ['accept', 'reject', 'manage'].includes(k))
//         .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

//       const manageIndex = btnConfig.findIndex(([type]) => type === 'manage');

//       const splitActive =
//         S.bannerButtonStyles?.splitManageButton &&
//         !S.bannerButtonStyles?.stackButtons &&
//         !growButtonsRow &&
//         manageIndex !== -1 &&
//         btnConfig.length > 1;

//       btnConfig.forEach(([type, cfg], index) => {
//         const actionMap = {
//           accept: () => this._acceptAll(),
//           reject: () => this._rejectAll(),
//           manage: () => this.showPreferences(),
//         };

//         const textMap = {
//           accept: S.texts.acceptAll,
//           reject: S.texts.rejectAll,
//           manage: S.texts.managePrefs,
//         };

//         if (!actionMap[type]) return;

//         const b = document.createElement('button');
//         b.textContent = textMap[type];

//         const extra = {};

//         // Same-width stacked buttons
//         if (S.bannerButtonStyles?.stackButtons) {
//           extra.width = '100%';
//         }

//         // Same-width compact inline buttons for toast/floating/center/side bar
//         if (growButtonsRow) {
//           extra.flexGrow = '1';
//           extra.flexShrink = '0';

//           if (
//             (layoutType === 'floating' || layoutType === 'center') &&
//             S.bannerStyles.orientation === 'horizontal'
//           ) {
//             extra.flexBasis = '45%';
//           } else {
//             extra.flexBasis = '0';
//           }
//         }

//         // Separate Manage button logic for normal non-compact rows
//         if (splitActive) {
//           const lastIdx = btnConfig.length - 1;

//           if (manageIndex === lastIdx && type === 'manage') {
//             // Manage is last: Accept/Reject group on left, Manage on right
//             extra.marginLeft = 'auto';
//           } else if (manageIndex === 0 && index === 1) {
//             // Manage is first: Manage on left, other buttons on right
//             extra.marginLeft = 'auto';
//           }
//         }

//         Object.assign(b.style, {
//           backgroundColor: cfg.bg,
//           color: cfg.text,
//           padding: cfg.padding,
//           borderRadius: cfg.borderRadius,
//           border: `${cfg.borderWidth} solid ${cfg.borderColor}`,
//           transition: cfg.transition,
//           fontWeight: cfg.fontWeight,
//           textDecoration: cfg.underline ? 'underline' : 'none',
//           cursor: 'pointer',
//           textAlign: 'center',
//           ...extra,
//         });

//         b.onclick = actionMap[type];
//         btnRow.appendChild(b);
//       });

//       container.appendChild(btnRow);

//       document.body.appendChild(container);
//       this._bannerEl = container;
//     }

//     /** Accept All */
//     async _acceptAll() {
//       console.log('CMP: _acceptAll()');

//       this.categories.forEach((cat) => {
//         this.choices[cat.key] = true;
//       });

//       try {
//         await this._saveConsent();
//         this._emitConsentChange();
//         this._removeBanner();
//         this._renderFloatingBtn();
//         this._unblockScripts();
//         this._releaseScripts();
//       } catch (err) {
//         console.error('CMP: failed to save accept-all consent', err);
//       }
//     }

//     /** Reject All */
//     async _rejectAll() {
//       console.log('CMP: _rejectAll()');

//       this.categories.forEach((cat) => {
//         this.choices[cat.key] = this._isNecessaryCategory(cat) ? true : false;
//       });

//       try {
//         await this._saveConsent();
//         this._emitConsentChange();
//         this._removeBanner();
//         this._renderFloatingBtn();
//         this._unblockScripts();
//         this._releaseScripts();
//       } catch (err) {
//         console.error('CMP: failed to save reject-all consent', err);
//       }
//     }

//     /** Accept All */
//     _acceptAll() {
//       console.log('CMP: _acceptAll()');
//       this.categories.forEach((c) => (this.choices[c.key] = true));
//       this._saveConsent();
//       this._emitConsentChange();
//       this._removeBanner();
//       this._renderFloatingBtn();
//       this._unblockScripts();
//       this._releaseScripts();
//     }

//     /** Reject All */
//     _rejectAll() {
//       console.log('CMP: _rejectAll()');
//       this.categories.forEach((c) => (this.choices[c.key] = false));
//       this._saveConsent();
//       this._emitConsentChange();
//       this._removeBanner();
//       this._renderFloatingBtn();
//       this._unblockScripts();
//       this._releaseScripts();
//     }

//     /** Remove banner */
//     _removeBanner() {
//       this._renderFloatingBtn();
//       this._removeBlocker();
//       if (this._bannerEl) {
//         this._bannerEl.remove();
//         this._bannerEl = null;
//       }
//     }

//     // — Advanced Preferences Modal —
//     _preparePreferenceCenter() {
//       const S = this.style;

//       const overlay = document.createElement('div');
//       overlay.id = 'cmp-preferences-overlay';
//       Object.assign(overlay.style, {
//         display: 'none',
//         position: 'fixed',
//         inset: 0,
//         background: 'rgba(0,0,0,0.5)',
//         zIndex: 10001,
//         justifyContent: 'center',
//         alignItems: 'center',
//       });

//       const modal = document.createElement('div');
//       Object.assign(modal.style, {
//         background: S.prefStyles.bgColor,
//         borderRadius: '0.5rem',
//         width: '90%',
//         maxWidth: '500px',
//         boxSizing: 'border-box',
//         position: 'relative',
//         maxHeight: '80vh',
//         display: 'flex',
//         flexDirection: 'column',
//         overflow: 'hidden',
//       });

//       // ================= HEADER =================
//       const header = document.createElement('div');
//       Object.assign(header.style, {
//         background: S.prefStyles.prefHeaderBg,
//         color: S.prefStyles.prefHeaderTextColor,
//         padding: '1rem',
//         display: 'flex',
//         alignItems: 'center',
//         justifyContent: 'space-between',
//       });

//       const h2 = document.createElement('h2');
//       h2.textContent = S.prefContent.title;
//       h2.style.margin = '0';
//       h2.style.color = S.prefStyles.prefHeaderTextColor;

//       const closeBtn = document.createElement('button');
//       closeBtn.textContent = '×';
//       Object.assign(closeBtn.style, {
//         background: 'none',
//         border: 'none',
//         fontSize: '1.25rem',
//         cursor: 'pointer',
//       });
//       closeBtn.onclick = () => (overlay.style.display = 'none');

//       // target for translator
//       const languageTarget = document.createElement('div');
//       languageTarget.id = 'cmp-language-target';
//       languageTarget.setAttribute('data-no-translate', 'true');

//       header.append(h2, languageTarget, closeBtn);
//       modal.appendChild(header);

//       // ================= BODY =================
//       const bodyWrap = document.createElement('div');
//       Object.assign(bodyWrap.style, {
//         padding: '1rem',
//         overflowY: 'auto',
//       });

//       const renderMainView = () => {
//         bodyWrap.innerHTML = '';

//         // ================= DESCRIPTION + POLICY LINK =================
//         const descWrap = document.createElement('div');

//         const desc = document.createElement('p');
//         desc.textContent = S.prefContent.description;
//         desc.style.margin = '0 0 0.5rem';
//         desc.style.color = S.prefStyles.textColor;

//         descWrap.appendChild(desc);

//         // INLINE MODE
//         if (S.showPrefPolicyLink && S.prefPolicyLinkPosition === 'inline') {
//           const link = document.createElement('a');
//           link.href = S.prefPolicyUrl;
//           link.textContent = S.prefPolicyText;
//           link.style.color = S.prefPolicyLinkStyles?.textColor;
//           link.style.textDecoration = S.prefPolicyLinkStyles?.decoration;

//           desc.appendChild(document.createTextNode(' '));
//           desc.appendChild(link);
//         }

//         // SEPARATE MODE
//         if (S.showPrefPolicyLink && S.prefPolicyLinkPosition === 'separate') {
//           const link = document.createElement('a');
//           link.href = S.prefPolicyUrl;
//           link.textContent = S.prefPolicyText;
//           link.style.display = 'block';
//           link.style.marginBottom = '1rem';
//           link.style.color = S.prefPolicyLinkStyles?.textColor;
//           link.style.textDecoration = S.prefPolicyLinkStyles?.decoration;

//           descWrap.appendChild(link);
//         }

//         bodyWrap.appendChild(descWrap);

//         // ================= GLOBAL VENDOR / COOKIE LIST LINKS =================
//         const listLinks = document.createElement('div');
//         Object.assign(listLinks.style, {
//           display: 'flex',
//           gap: '1rem',
//           flexWrap: 'wrap',
//           marginBottom: '1rem',
//         });

//         if (S.showVendorList) {
//           const vendorBtn = document.createElement('button');
//           vendorBtn.type = 'button';
//           vendorBtn.textContent =
//             S.listsContent?.vendorListTitle || 'Vendor List';
//           this._styleLinkButton(vendorBtn);
//           vendorBtn.onclick = () => renderListView('vendors');
//           listLinks.appendChild(vendorBtn);
//         }

//         if (S.showCookieList) {
//           const cookieBtn = document.createElement('button');
//           cookieBtn.type = 'button';
//           cookieBtn.textContent =
//             S.listsContent?.cookieListTitle || 'Cookie List';
//           this._styleLinkButton(cookieBtn);
//           cookieBtn.onclick = () => renderListView('cookies');
//           listLinks.appendChild(cookieBtn);
//         }

//         if (listLinks.children.length) {
//           bodyWrap.appendChild(listLinks);
//         }

//         // ================= CATEGORY ACCORDIONS =================
//         this.categories.forEach((cat) => {
//           const section = document.createElement('div');
//           Object.assign(section.style, {
//             border: `1px solid ${S.prefSectionStyles.borderColor}`,
//             borderRadius: S.prefSectionStyles.borderRadius,
//             marginBottom: '1rem',
//             overflow: 'hidden',
//           });

//           let expanded = false;

//           const hdr = document.createElement('div');
//           Object.assign(hdr.style, {
//             backgroundColor: S.prefSectionStyles.categoryTitleBg,
//             color: S.prefSectionStyles.categoryTitleText,
//             padding: S.prefSectionStyles.titlePadding,
//             display: 'flex',
//             justifyContent: 'space-between',
//             alignItems: 'center',
//             cursor: 'pointer',
//           });

//           const left = document.createElement('div');
//           Object.assign(left.style, {
//             display: 'flex',
//             alignItems: 'center',
//             gap: S.prefSectionStyles.iconTitleGap,
//           });

//           if (cat.icon) {
//             const icon = document.createElement('img');
//             icon.src = cat.icon;
//             icon.style.width = '20px';
//             icon.style.height = '20px';
//             left.appendChild(icon);
//           }

//           const lbl = document.createElement('span');
//           lbl.textContent = cat.name;
//           left.appendChild(lbl);

//           const toggle = document.createElement('input');
//           toggle.type = 'checkbox';
//           toggle.checked = !!this.choices[cat.key];
//           toggle.disabled = this._isNecessaryCategory(cat);

//           toggle.onclick = (e) => e.stopPropagation();
//           toggle.onchange = () => {
//             if (this._isNecessaryCategory(cat)) {
//               this.choices[cat.key] = true;
//               toggle.checked = true;
//               return;
//             }

//             this.choices[cat.key] = toggle.checked;
//           };

//           this._toggles[cat.key] = toggle;

//           hdr.append(left, toggle);
//           section.appendChild(hdr);

//           // ================= COLLAPSIBLE BODY =================
//           const body = document.createElement('div');
//           Object.assign(body.style, {
//             display: 'none',
//             backgroundColor: S.prefSectionStyles.categoryDescBg,
//             color: S.prefSectionStyles.categoryDescText,
//             padding: S.prefSectionStyles.descPadding,
//           });

//           const descBox = document.createElement('p');
//           descBox.textContent = cat.description || '';
//           descBox.style.margin = '0 0 0.5rem';
//           body.appendChild(descBox);

//           section.appendChild(body);

//           // ================= ACCORDION =================
//           hdr.onclick = () => {
//             expanded = !expanded;
//             body.style.display = expanded ? 'block' : 'none';
//           };

//           bodyWrap.appendChild(section);
//         });
//       };

//       const renderListView = (listKey) => {
//         bodyWrap.innerHTML = '';

//         const listTitle =
//           listKey === 'vendors'
//             ? S.listsContent?.vendorListTitle || 'Vendor List'
//             : S.listsContent?.cookieListTitle || 'Cookie List';

//         const items = listKey === 'vendors' ? this.vendorList : this.cookieList;

//         const top = document.createElement('div');
//         Object.assign(top.style, {
//           display: 'flex',
//           alignItems: 'center',
//           gap: '0.75rem',
//           marginBottom: '1rem',
//         });

//         const back = document.createElement('button');
//         back.type = 'button';
//         back.setAttribute('aria-label', 'Back to Manage Preferences');
//         Object.assign(back.style, {
//           background: 'transparent',
//           border: 'none',
//           cursor: 'pointer',
//           padding: 0,
//           fontSize: '18px',
//         });

//         if (S.prefBackIcon) {
//           const img = document.createElement('img');
//           img.src = S.prefBackIcon;
//           img.alt = 'Back';
//           img.style.width = '20px';
//           img.style.height = '20px';
//           img.style.objectFit = 'contain';
//           back.appendChild(img);
//         } else {
//           back.textContent = '←';
//         }

//         back.onclick = renderMainView;

//         const title = document.createElement('h3');
//         title.textContent = listTitle;
//         Object.assign(title.style, {
//           margin: 0,
//           color: S.listsStyles.headerColor,
//         });

//         top.append(back, title);
//         bodyWrap.appendChild(top);

//         if (!items.length) {
//           const empty = document.createElement('p');
//           empty.textContent =
//             listKey === 'vendors' ? 'No vendors found.' : 'No cookies found.';
//           empty.style.color = S.listsStyles.textColor;
//           bodyWrap.appendChild(empty);
//           return;
//         }

//         items.forEach((item) => {
//           const block = document.createElement('div');
//           Object.assign(block.style, {
//             border: `1px solid ${S.listsStyles.borderColor}`,
//             borderRadius: S.listsStyles.borderRadius,
//             marginBottom: '0.75rem',
//             overflow: 'hidden',
//           });

//           const itemHeader = document.createElement('div');
//           itemHeader.textContent =
//             item.title || item.name || item.vendorName || 'Item';

//           Object.assign(itemHeader.style, {
//             background: S.listsStyles.listTitleBg,
//             color: S.listsStyles.listTitleText,
//             padding: S.listsStyles.titlePadding,
//             fontSize: S.listsStyles.titleFontSize,
//             fontWeight: S.listsStyles.titleFontWeight,
//           });

//           const itemBody = document.createElement('div');
//           Object.assign(itemBody.style, {
//             background: S.listsStyles.listDescBg,
//             color: S.listsStyles.listDescText,
//             padding: S.listsStyles.descPadding,
//             fontSize: S.listsStyles.descFontSize,
//             fontWeight: S.listsStyles.descFontWeight,
//             lineHeight: S.listsStyles.descLineHeight,
//           });

//           if (listKey === 'vendors') {
//             itemBody.textContent = item.description || item.purpose || '—';
//           } else {
//             const rows = Array.isArray(item.description)
//               ? item.description
//               : Array.isArray(item.cookies)
//                 ? item.cookies
//                 : [item];

//             rows.forEach((row) => {
//               const rowBox = document.createElement('div');
//               Object.assign(rowBox.style, {
//                 background: S.listsStyles.dataBgColor || '#f3f4f6',
//                 color: S.listsStyles.dataTextColor,
//                 padding: S.listsStyles.dataPadding || '0.5rem',
//                 marginBottom: '0.5rem',
//               });

//               const name = document.createElement('div');
//               name.textContent = `Name: ${row.name || item.name || '—'}`;

//               const host = document.createElement('div');
//               host.textContent = `Host: ${row.host || item.host || '—'}`;

//               const duration = document.createElement('div');
//               duration.textContent = `Duration: ${
//                 row.duration || item.duration || '—'
//               }`;

//               const description = document.createElement('div');
//               description.textContent = `Description: ${
//                 row.description || item.descriptionText || '—'
//               }`;

//               rowBox.append(name, host, duration, description);
//               itemBody.appendChild(rowBox);
//             });
//           }

//           block.append(itemHeader, itemBody);
//           bodyWrap.appendChild(block);
//         });
//       };

//       renderMainView();

//       modal.appendChild(bodyWrap);

//       // ================= FOOTER BUTTON BAR =================
//       const footer = document.createElement('div');
//       Object.assign(footer.style, {
//         background: S.prefStyles.buttonBarBg,
//         padding: '1rem',
//         display: 'flex',
//         justifyContent: 'flex-end',
//         gap: '0.5rem',
//       });

//       const makeBtn = (cfg, text, handler) => {
//         if (!cfg?.enabled) return null;

//         const b = document.createElement('button');
//         b.textContent = text;

//         Object.assign(b.style, {
//           background: cfg.bg,
//           color: cfg.text,
//           padding: cfg.padding,
//           borderRadius: cfg.borderRadius,
//           border: `${cfg.borderWidth} solid ${cfg.borderColor}`,
//           cursor: 'pointer',
//           fontWeight: cfg.fontWeight,
//         });

//         b.onclick = handler;
//         return b;
//       };

//       const btnAccept = makeBtn(
//         S.prefButtonStyles.acceptAll,
//         S.prefContent.acceptAllText || 'Accept All',
//         async () => {
//           await this._acceptAll();
//           overlay.style.display = 'none';
//         },
//       );

//       const btnSave = makeBtn(
//         S.prefButtonStyles.saveAll,
//         S.prefContent.saveAllText,
//         async () => {
//           try {
//             await this._saveConsent();
//             this._emitConsentChange();
//             overlay.style.display = 'none';
//             this._removeBanner();
//             this._renderFloatingBtn();
//             this._unblockScripts();
//           } catch (err) {
//             console.error('CMP: failed to save preferences', err);
//           }
//         },
//       );

//       const btnReject = makeBtn(
//         S.prefButtonStyles.rejectAll,
//         S.prefContent.rejectAllText,
//         async () => {
//           await this._rejectAll();
//           overlay.style.display = 'none';
//         },
//       );

//       [btnAccept, btnSave, btnReject].forEach(
//         (b) => b && footer.appendChild(b),
//       );

//       modal.appendChild(footer);

//       // ================= POWERED BY FOOTER =================
//       const powered = document.createElement('div');
//       Object.assign(powered.style, {
//         background: S.prefStyles.footerBg,
//         color: S.prefStyles.footerTextColor,
//         padding: '0.5rem 1rem',
//         fontSize: '0.75rem',
//         display: 'flex',
//         justifyContent: 'flex-end',
//         alignItems: 'center',
//         gap: '0.5rem',
//         borderTop: `1px solid ${S.prefSectionStyles.borderColor}`,
//       });

//       if (S.prefFooterLogo) {
//         const logo = document.createElement('img');
//         logo.src = S.prefFooterLogo;
//         logo.style.height = '14px';
//         logo.style.objectFit = 'contain';
//         powered.appendChild(logo);
//       }

//       const txt = document.createElement('span');
//       txt.style.opacity = '0.7';
//       txt.textContent = `Powered by ${S.prefFooterText || ''}`;
//       powered.appendChild(txt);

//       modal.appendChild(powered);

//       overlay.appendChild(modal);
//       document.body.appendChild(overlay);

//       this._renderPrefs = () => {
//         Object.entries(this._toggles).forEach(([key, input]) => {
//           input.checked = !!this.choices[key];
//         });

//         renderMainView();
//         overlay.style.display = 'flex';
//       };
//     }

//     /** POST consent */
//     async _saveConsent() {
//       this.categories.forEach((cat) => {
//         if (this._isNecessaryCategory(cat)) {
//           this.choices[cat.key] = true;
//         }
//       });

//       const res = await fetch(`${this.opts.apiBaseUrl}/cmp/consent`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         credentials: 'include',
//         body: JSON.stringify({
//           domain: this.opts.domain,
//           userId: this.userId,
//           choices: this.choices,
//           metadata: this.metadata,
//         }),
//       });

//       if (!res.ok) {
//         throw new Error(`CMP: failed to save consent (${res.status})`);
//       }
//     }

//     /** Emit consentChange */
//     _emitConsentChange() {
//       this._applyAllowedCookies(); // apply updated cookie/script state
//       this._listeners.consentChange.forEach((fn) => fn({ ...this.choices }));
//       if (typeof this.opts.onConsentChange === 'function') {
//         this.opts.onConsentChange({ ...this.choices });
//       }
//     }
//   }

//   // expose singleton
//   window.CMP = new CMP();
//   // -------- auto-init logic based on website-id or explicit overrides --------
//   async function resolveInitParams() {
//     const script =
//       document.currentScript ||
//       document.querySelector('script[src*="banner-loader3.js"]');
//     if (!script) return null;

//     // Testing overrides
//     const overrideApiBase = script.dataset.apiBaseUrl;
//     const overrideConfigId = script.dataset.configId;
//     const overrideDomain = script.dataset.domain;
//     const overrideSdkVersion = script.dataset.sdkVersion;
//     if (overrideApiBase && overrideConfigId) {
//       return {
//         apiBaseUrl: overrideApiBase,
//         configId: overrideConfigId,
//         domain: overrideDomain || window.location.hostname,
//         sdkVersion: overrideSdkVersion || '1',
//       };
//     }

//     // Production: resolve real config via website-id
//     const websiteId = script.dataset.websiteId;
//     if (!websiteId) {
//       console.warn('CMP: no website-id provided; skipping auto-init');
//       return null;
//     }

//     // lookup endpoint you implement server-side
//     // const lookupBase = "http://23.22.92.199:8101/priv";
//     const lookupBase = 'https://dev.grc3.io/priv';

//     try {
//       const res = await fetch(
//         lookupBase +
//           '/cmp/websites/lookup?websiteId=' +
//           encodeURIComponent(websiteId.trim()),
//         { credentials: 'include' },
//       );
//       if (!res.ok) {
//         console.warn('CMP: website-id lookup failed', res.status);
//         return null;
//       }
//       const json = await res.json();
//       return {
//         apiBaseUrl: lookupBase, // or json.apiBaseUrl if variable
//         configId: json.configId,
//         domain: json.domain || window.location.hostname,
//         sdkVersion: json.sdkVersion || '1',
//       };
//     } catch (e) {
//       console.warn('CMP: error resolving website-id', e);
//       return null;
//     }
//   }

//   (async function autoInit() {
//     const params = await resolveInitParams();
//     if (!params) return;
//     window.CMP.init({
//       apiBaseUrl: params.apiBaseUrl,
//       configId: params.configId,
//       domain: params.domain,
//       sdkVersion: params.sdkVersion,
//     }).catch((e) => {
//       console.error('CMP auto-init failed:', e);
//     });
//   })();
// })(window, document);

// cmp-sdk.js
; (function (window, document) {
  // ————————————————
  // Helpers
  // ————————————————
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
      this.choices = {};
      this._listeners = { ready: [], consentChange: [] };
      this._toggles = {};  // for preference-modal checkboxes
      this._floatingBtnEl = null;
      // ← initialize your “blocked scripts” stash here:
      this._blocked = [];
      // patch before anything else runs:
      this._patchDOMInsertion();
      this._blockedScripts = [];
    }

        // Monkey-patch DOM insertion so *any* script ever appended is intercepted
    _patchDOMInsertion() {
      const origCreate = document.createElement;
      const origAppend = Node.prototype.appendChild;
      const origInsert = Node.prototype.insertBefore;
      const self = this;

      // Intercept createElement('script')
      document.createElement = function(tagName, options) {
        const el = origCreate.call(this, tagName, options);
        if (tagName.toLowerCase() === 'script') {
          // whenever someone sets src or textContent, hold onto it
          Object.defineProperty(el, 'src', {
            set(src) {
              this._cmpSrc = src;
            },
            get() {
              return this._cmpSrc;
            },
            configurable: true,
          });
          Object.defineProperty(el, 'textContent', {
            set(txt) {
              this._cmpInline = txt;
            },
            get() {
              return this._cmpInline;
            },
            configurable: true,
          });
          // mark it so our appendHook knows to buffer it
          el._isCmpScript = true;
        }
        return el;
      };

      // Helper: if node is a CMP-script, buffer instead of injecting
      function bufferIfScript(node) {
        if (node.tagName?.toLowerCase() === 'script' && node._isCmpScript) {
          self._blockedScripts.push(node);
          return true;
        }
        return false;
      }

      // Patch appendChild
      Node.prototype.appendChild = function(node) {
        if (bufferIfScript(node)) {
          return node; // swallow it: never runs
        }
        return origAppend.call(this, node);
      };

      // Patch insertBefore
      Node.prototype.insertBefore = function(newNode, refNode) {
        if (bufferIfScript(newNode)) {
          return newNode;
        }
        return origInsert.call(this, newNode, refNode);
      };
    }

    // … your existing _blockScripts / _unblockScripts, etc. …

    /** After user consents, inject all buffered scripts */
    _releaseScripts() {
      this._blockedScripts.forEach(clone => {
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
  this._blocked = Array.from(els).map(el => {
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
  console.debug('CMP: _unblockScripts() start');
  this._blocked.forEach(clone => {
    const key = clone.getAttribute('data-vkey');
    if (this.choices[key]) {
      document.head.appendChild(clone);
      console.debug(`CMP: unleashed script with vkey="${key}"`);
    } else {
      console.debug(`CMP: skipping script vkey="${key}"`);
    }
  });
  this._blocked = [];
  console.debug('CMP: _unblockScripts() done');
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
      img.src = this.style.prefStyles?.buttonIconUrl || "http://23.22.92.199:8101/priv/CookieImage.png";
      img.alt = 'Cookie Settings';
      // size it to fit nicely in the circle:
      Object.assign(img.style, {
        width: '70%',   // 60% of button width/height
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
        background: "#22c55e" || this.style.prefStyles?.buttonBg || '#22c55e',
        color: this.style.prefStyles?.buttonText || '#fff',
        cursor: 'pointer',
        zIndex: 10002,
        padding: '0',        // make sure there’s no extra padding
        // ─── add the rotate animation ───
        animation: 'pulse 4s linear infinite',
        transition: 'transform 0.2s ease-in-out'
      });

      // ─── optional: make it pulse on hover ───
      btn.addEventListener('mouseover', () => {
        btn.style.animation = 'pulse 1.5s ease-in-out infinite';
      });
      // ────────────────────────────────────────

      btn.addEventListener('click', () => {
        // re-show the banner whenever they click
        this._renderBanner();
        this._removeFloatingBtn();
      });
      document.body.appendChild(btn);
      this._floatingBtnEl = btn;
    };

    /** remove the floating button */
    _removeFloatingBtn() {
      if (this._floatingBtnEl) {
        this._floatingBtnEl.remove();
        this._floatingBtnEl = null;
      }
    };

    /** Subscribe to 'ready' or 'consentChange' */
    on(evt, fn) {
      if (this._listeners[evt]) {
        this._listeners[evt].push(fn);
      }
    };

    /** Get current consent choices */
    getConsent() {
      return { ...this.choices };
    };

    /** Get stored metadata */
    getMetadata() {
      return { ...this.metadata };
    };

    /** Set one metadata key & persist */
    setMetadata(key, value) {
      this.metadata[key] = value;
      saveStore({ userId: this.userId, metadata: this.metadata });
    };

    /** Re-open the Preference Center */
    showPreferences() {
      this._renderPrefs && this._renderPrefs();
    };

    // — init(opts) —
    async init(opts) {
      console.log('CMP.init() called with:', opts);
      // 1) Normalize & validate
      this.opts = {
        apiBaseUrl: '',
        configId: null,
        domain: window.location.hostname,
        ...opts
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
        { credentials: 'include' }
      );
      if (!cfgRes.ok) {
        throw new Error('CMP.init: failed to load banner config');
      }
      const cfg = await cfgRes.json();

      // 4) Merge styleConfig + overrides
      this.style = cloneDeep(cfg.styleConfig || {});
      if (cfg.overrideEnabled && cfg.modifiedFields) {
        Object.entries(cfg.modifiedFields)
          .forEach(([path, val]) => setDeep(this.style, path, val));
      }

      // 5) Fetch categories
      const catUrl = new URL(`${this.opts.apiBaseUrl}/cmp/config`);
      catUrl.searchParams.set('domain', this.opts.domain);
      const catRes = await fetch(catUrl, { credentials: 'include' });
      if (!catRes.ok) {
        throw new Error('CMP.init: failed to load categories');
      }
      this.categories = await catRes.json();

      // 6) Fetch existing consent
      const prefUrl = new URL(`${this.opts.apiBaseUrl}/cmp/consent`);
      prefUrl.searchParams.set('domain', this.opts.domain);
      prefUrl.searchParams.set('userId', this.userId);
      const prefRes = await fetch(prefUrl, { credentials: 'include' });
      if (prefRes.ok) {
        const prefJson = await prefRes.json();
        (prefJson.categories || []).forEach(c => {
          this.choices[c.key] = c.accepted;
        });
      }

      // BLOCK all CMP‐blocked scripts until we know what the user wants
      this._blockScripts();

      // 7) Seed defaults for any unset categories
      (this.style.cookieCategories || []).forEach(cat => {
        const key = cat.key || cat.name.toLowerCase();
        if (this.choices[key] === undefined) {
          this.choices[key] = Boolean(cat.default);
        }
      });

      // 8) Fire 'ready' event
      this._fireReady();

      // 9) Conditionally render the banner
      const allAnswered = this.categories.every(cat =>
        typeof this.choices[cat.key] === 'boolean'
      );
      if (!allAnswered) {
                console.log('CMP.init(): showing banner (not all answered)');
        this._renderBanner();
      } else {
                console.log('CMP.init(): all answered, rendering floating button');

        // user already has consent stored → show floating button instead
        this._renderFloatingBtn();
        this._unblockScripts();
        this._releaseScripts();

      }


      // 10) Build the Preferences modal now that choices are fully seeded
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
        choices: this.getConsent()
      };
      this._listeners.ready.forEach(fn => fn(payload));
      if (typeof this.opts.onReady === 'function') {
        this.opts.onReady(payload);
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
        zIndex: 9999,            // just under the banner (banner is at 10000)
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
      this._renderBlocker();          // ← block everything underneath
      if (this._bannerEl) return;
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
        flexDirection: S.bannerStyles.orientation === 'horizontal' ? 'row' : 'column',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        boxSizing: 'border-box',
        zIndex: 10000
      });

      const { type: layoutType, position: layoutPosition, showVendorList } = S.layout;

      // BAR: full-width at top or bottom
      if (layoutType === 'bar') {
        Object.assign(container.style, {
          left: 0,
          right: 0,
          [layoutPosition]: 0,   // "top" or "bottom"
          width: '100%'
        });
      }

      // TOAST: small popup in any corner
      else if (layoutType === 'toast') {
        const [vert, hor] = layoutPosition.split('-'); // e.g. ["top","left"]
        Object.assign(container.style, {
          [vert]: '1rem',        // top or bottom
          [hor]: '1rem',        // left or right
          width: '260px'
        });
      }

      // FLOATING: either centered or cornered with a wider box
      // FLOATING: center, top-center, bottom-center, or any corner
      else if (layoutType === 'floating') {
        if (layoutPosition === 'center') {
          // dead-center
          Object.assign(container.style, {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            maxWidth: '400px'
          });
        }
        else if (layoutPosition === 'top-center') {
          // top center
          Object.assign(container.style, {
            top: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            maxWidth: '400px'
          });
        }
        else if (layoutPosition === 'bottom-center') {
          // bottom center
          Object.assign(container.style, {
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            maxWidth: '400px'
          });
        }
        else {
          // any corner: top-left, top-right, bottom-left, bottom-right
          const [vert, hor] = layoutPosition.split('-');
          Object.assign(container.style, {
            [vert]: '1rem',
            [hor]: '1rem',
            width: '80%',
            maxWidth: '400px'
          });
        }
      }

      // CENTER: always dead-center (new layout type)
      else if (layoutType === 'center') {
        Object.assign(container.style, {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          maxWidth: '400px'
        });
      }

      // Logo
      if (S.logo) {
        const img = document.createElement('img');
        img.src = S.logo;
        img.alt = 'Logo';
        Object.assign(img.style, { maxHeight: '40px', objectFit: 'contain' });
        container.appendChild(img);
      }

      // Text block
      const textWrap = document.createElement('div');
      if (S.bannerStyles.orientation === 'horizontal') {
        textWrap.style.flex = '1';
        textWrap.style.minWidth = '0';
      }
      const pTitle = document.createElement('p');
      pTitle.textContent = S.texts.title;
      Object.assign(pTitle.style, { margin: 0, fontWeight: 600, fontSize: '1.1rem' });
      const pDesc = document.createElement('p');
      pDesc.textContent = S.texts.description;
      Object.assign(pDesc.style, { margin: '0.25rem 0', opacity: 0.85 });
      textWrap.append(pTitle, pDesc);

      // Links
      const linksRow = document.createElement('div');
      Object.assign(linksRow.style, { display: 'flex', gap: '1rem', flexWrap: 'wrap' });
      if (S.showPolicyLink) {
        const a = document.createElement('a');
        a.href = S.policyUrl;
        a.textContent = S.policyText;
        a.style.color = S.acceptColor;
        a.style.textDecoration = S.linkStyles.decoration;
        linksRow.appendChild(a);
      }
      if (S.showImprintLink) {
        const a = document.createElement('a');
        a.href = S.imprintUrl;
        a.textContent = S.imprintText;
        a.style.color = S.acceptColor;
        a.style.textDecoration = S.linkStyles.decoration;
        linksRow.appendChild(a);
      }
      textWrap.appendChild(linksRow);
      container.appendChild(textWrap);

      // Buttons
      const btnRow = document.createElement('div');
      Object.assign(btnRow.style, { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' });
      const mkBtn = (txt, bg, fg, cb) => {
        const b = document.createElement('button');
        b.textContent = txt;
        Object.assign(b.style, {
          backgroundColor: bg,
          color: fg,
          padding: S.buttonStyles.padding,
          border: `${S.buttonStyles.borderWidth} solid ${S.buttonStyles.borderColor}`,
          borderRadius: S.buttonStyles.borderRadius,
          transition: S.buttonStyles.transition,
          cursor: 'pointer',
          fontWeight: 500
        });
        b.onclick = cb;
        return b;
      };
      btnRow.append(
        mkBtn(S.texts.acceptAll, S.acceptColor, '#fff', () => this._acceptAll()),
        mkBtn(S.texts.rejectAll, S.rejectColor, '#fff', () => this._rejectAll()),
        mkBtn(S.texts.managePrefs, S.prefStyles.buttonBg, S.prefStyles.buttonText, () => this.showPreferences())
      );
      container.appendChild(btnRow);

      // Vendor‐list placeholder
      if (showVendorList) {
        const v = document.createElement('div');
        v.textContent = 'Vendor List…';
        Object.assign(v.style, {
          flexBasis: '100%',
          marginTop: '1rem',
          color: '#555',
          fontSize: '0.9rem'
        });
        container.appendChild(v);
      }

      document.body.appendChild(container);
      this._bannerEl = container;
    }

    /** Accept All */
    _acceptAll() {
      console.log('CMP: _acceptAll()');
      this.categories.forEach(c => this.choices[c.key] = true);
      this._saveConsent();
      this._emitConsentChange();
      this._removeBanner();
      this._renderFloatingBtn();
      this._unblockScripts();
            this._releaseScripts();


    }

    /** Reject All */
    _rejectAll() {
      console.log('CMP: _acceptAll()');
      this.categories.forEach(c => this.choices[c.key] = false);
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
      this._removeBlocker();         // ← unblock the page
      if (this._bannerEl) {
        this._bannerEl.remove();
        this._bannerEl = null;
      }
    }

    // — Advanced Preferences Modal —
    _preparePreferenceCenter() {
      const S = this.style;
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        display: 'none',
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 10001,
        justifyContent: 'center',
        alignItems: 'center'
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
        maxHeight: '60vh',      // ← cap at 60% of viewport height
        overflowY: 'auto',      // ← enable vertical scrolling
      });

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '0.75rem',
        right: '0.75rem',
        background: 'none',
        border: 'none',
        fontSize: '1.25rem',
        cursor: 'pointer'
      });
      closeBtn.onclick = () => overlay.style.display = 'none';
      modal.appendChild(closeBtn);

      // Title + description
      const h2 = document.createElement('h2');
      h2.textContent = S.prefContent.title;
      h2.style.margin = '0';
      h2.style.color = S.prefStyles.headerColor;
      modal.appendChild(h2);

      const desc = document.createElement('p');
      desc.textContent = S.prefContent.description;
      desc.style.margin = '0.5rem 0 1rem';
      desc.style.color = S.prefStyles.textColor;
      modal.appendChild(desc);

      // Sections for each category
      this.categories.forEach(cat => {
        const section = document.createElement('div');
        Object.assign(section.style, {
          border: `1px solid ${S.prefSectionStyles.borderColor}`,
          borderRadius: S.prefSectionStyles.borderRadius,
          marginBottom: '1rem',
          overflow: 'hidden'
        });

        // Header row with toggle
        const hdr = document.createElement('div');
        Object.assign(hdr.style, {
          backgroundColor: S.prefSectionStyles.headerBg,
          color: S.prefSectionStyles.headerTextColor,
          padding: S.prefSectionStyles.padding,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer'
        });
        const lbl = document.createElement('span');
        lbl.textContent = cat.name;
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = !!this.choices[cat.key];  // ← pre-check
        toggle.onchange = () => { this.choices[cat.key] = toggle.checked; };
        this._toggles[cat.key] = toggle;
        hdr.appendChild(lbl);
        hdr.appendChild(toggle);
        section.appendChild(hdr);

        // Body
        const body = document.createElement('div');
        Object.assign(body.style, {
          backgroundColor: S.prefSectionStyles.bodyBg,
          padding: S.prefSectionStyles.padding,
          borderTop: `1px solid ${S.prefSectionStyles.borderColor}`
        });
        const pd = document.createElement('p');
        pd.textContent = cat.description || '';
        pd.style.margin = '0';
        body.appendChild(pd);
        section.appendChild(body);

        modal.appendChild(section);
      });

      // Action buttons
      const actions = document.createElement('div');
      Object.assign(actions.style, {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '0.5rem'
      });

      const btnAccept = document.createElement('button');
      btnAccept.textContent = S.texts.acceptAll;
      Object.assign(btnAccept.style, {
        backgroundColor: S.acceptColor,
        color: '#fff',
        padding: '0.5rem 1rem',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: 'pointer'
      });
      btnAccept.onclick = () => {
        this._acceptAll();
        overlay.style.display = 'none';
      };

      const btnSave = document.createElement('button');
      btnSave.textContent = S.prefContent.saveAllText;
      Object.assign(btnSave.style, {
        backgroundColor: S.prefStyles.buttonBg,
        color: S.prefStyles.buttonText,
        padding: '0.5rem 1rem',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: 'pointer'
      });
      btnSave.onclick = () => {
        this._saveConsent();
        this._emitConsentChange();
        overlay.style.display = 'none';
        this._removeBanner()
        this._renderFloatingBtn();
        this._unblockScripts();
              this._releaseScripts();

      };

      const btnReject = document.createElement('button');
      btnReject.textContent = S.prefContent.rejectAllText;
      Object.assign(btnReject.style, {
        backgroundColor: S.rejectColor,
        color: '#fff',
        padding: '0.5rem 1rem',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: 'pointer'
      });
      btnReject.onclick = () => {
        this._rejectAll();
        overlay.style.display = 'none';
      };

      actions.append(btnAccept, btnSave, btnReject);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Re-sync toggles and show overlay on demand
      this._renderPrefs = () => {
        Object.entries(this._toggles).forEach(([key, input]) => {
          input.checked = !!this.choices[key];
        });
        overlay.style.display = 'flex';
      };
    }

    /** POST consent */
    async _saveConsent() {
      // Always mark “necessary” as true, regardless of user toggles:
      this.choices['necessary'] = true;
      await fetch(`${this.opts.apiBaseUrl}/cmp/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          domain: this.opts.domain,
          userId: this.userId,
          choices: this.choices,
          metadata: this.metadata
        })
      });
    }

    /** Emit consentChange */
    _emitConsentChange() {
      this._listeners.consentChange.forEach(fn => fn({ ...this.choices }));
      if (typeof this.opts.onConsentChange === 'function') {
        this.opts.onConsentChange({ ...this.choices });
      }
    }
  }

  // expose singleton
  window.CMP = new CMP();
})(window, document);

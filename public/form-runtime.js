// /public/form-runtime.js
// Fetch config by domain; render inline or bind modal on element with id == formId.
// On Submit, store values in DB via POST /internal-webform-submissions
// /public/form-runtime.js
// Fetch config by domain; render inline or bind modal on element with id == formId.
// On Submit, store values in DB via POST /internal-webform-submissions
(function () {
  console.log('[form-runtime] file evaluated');

  const CMP_USER_ID_STORAGE_KEY = 'cmp_user';
  const SOURCE_LANG = 'en';
  const VF_LANG_STORAGE_KEY = 'vf_ui_lang';
  const SHARED_TRANSLATION_SCRIPT = 'translation-service.js';
  const DEFAULT_PDF_PREVIEW_FILE = 'DPDPA_consent_form_for_data_processing.pdf';

  /* ===================== OFFLINE QUEUE (IndexedDB) ===================== */

  const OFFLINE_DB_NAME = 'grc_offline_consent_db';
  const OFFLINE_DB_VERSION = 1;
  const OFFLINE_STORE = 'offlineSubmissions';
  const OFFLINE_EXPIRY_DAYS = 30;

  function openOfflineDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

      req.onupgradeneeded = function (event) {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
          const store = db.createObjectStore(OFFLINE_STORE, {
            keyPath: 'clientSubmissionId',
          });

          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function cleanupExpiredOfflineSubmissions() {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      const store = tx.objectStore(OFFLINE_STORE);

      const expiryMs = OFFLINE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const req = store.getAll();

      req.onsuccess = function () {
        const all = req.result || [];
        all.forEach((item) => {
          if (item.createdAt && now - item.createdAt > expiryMs) {
            store.delete(item.clientSubmissionId);
          }
        });
      };
    } catch (err) {
      console.warn('[offline] cleanup failed', err);
    }
  }

  // Run cleanup once on load
  cleanupExpiredOfflineSubmissions();

  function generateUUID() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function queueOfflineSubmission(payload) {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      const store = tx.objectStore(OFFLINE_STORE);

      const record = {
        clientSubmissionId: payload.clientSubmissionId,
        payload: payload,
        createdAt: Date.now(),
      };

      store.put(record);

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          console.log(
            '[offline] queued submission',
            payload.clientSubmissionId,
          );
          resolve(true);
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('[offline] queue failed', err);
      throw err;
    }
  }

  async function getAllOfflineSubmissions() {
    try {
      const db = await openOfflineDB();
      return new Promise((resolve) => {
        const tx = db.transaction(OFFLINE_STORE, 'readonly');
        const store = tx.objectStore(OFFLINE_STORE);
        const req = store.getAll();
        req.onsuccess = (e) => {
          const all = e.target.result || [];
          resolve(all.filter((r) => !r.formType || r.formType === 'webform'));
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      console.warn('[offline] getAll failed', err);
      return [];
    }
  }

  async function deleteOfflineSubmission(clientSubmissionId) {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      const store = tx.objectStore(OFFLINE_STORE);
      store.delete(clientSubmissionId);
    } catch (err) {
      console.warn('[offline] delete failed', err);
    }
  }

  let isSyncing = false;

  async function syncOfflineQueue() {
    if (isSyncing) {
      console.log('[offline] sync already running, skipping');
      return;
    }
    if (!navigator.onLine) {
      console.log('[offline] still offline, skip sync');
      return;
    }

    isSyncing = true;
    console.log('[offline] starting sync...');

    try {
      const items = await getAllOfflineSubmissions();
      console.log(`[offline] found ${items.length} queued submission(s)`);

      for (const item of items) {
        try {
          const payload = item.payload;
          const base = getRuntimeBase();
          const url = `${base}/internal-webform-submissions`;

          const resp = await fetch(url, {
            method: 'POST',
            credentials: 'omit',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (resp.ok) {
            const body = await resp.json().catch(() => ({}));
            console.log(
              `[offline] synced ${item.clientSubmissionId}, duplicate=${!!body.duplicate}`,
            );
            await deleteOfflineSubmission(item.clientSubmissionId);
          } else {
            console.warn(
              `[offline] sync failed for ${item.clientSubmissionId}, status=${resp.status}`,
            );
            // Leave in queue for next retry
          }
        } catch (err) {
          console.warn(
            `[offline] sync error for ${item.clientSubmissionId}`,
            err,
          );
          // Network error, break and try later
          break;
        }
      }
    } finally {
      isSyncing = false;
    }
  }

  // Listen for online event
  window.addEventListener('online', () => {
    console.log('[offline] browser back online, triggering sync');
    syncOfflineQueue();
  });

  // Sync on page load (in case something is queued from last session)
  syncOfflineQueue();

  /* ===================== END OFFLINE QUEUE ===================== */

  const FALLBACK_LANGUAGES = [
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

  const VF_UI_DEFAULTS = {
    submitLabel: 'Submit Consent',
    submittingLabel: 'Submitting…',
    successMessage:
      'Your consent request has been submitted. Please confirm your consent through the link sent to your email.',
    submitFailedPrefix: 'Submit failed: ',
    pleaseFillPrefix: 'Please fill: ',
    // modalTitle: 'Web Form Consent',
    closeAriaLabel: 'Close',
    labelLanguage: 'Language',
    consentTitle: '🔐 Consent Notice',
    consentP1:
      'We collect and process your personal data in accordance with the <strong>Digital Personal Data Protection Act, 2023</strong>.',
    consentP2:
      'This may include basic personal details, contact information, transaction-related data, and technical usage data.',
    consentP3:
      'Your data is used to provide services, meet legal obligations, improve user experience, and send marketing only with your consent.',
    consentP4:
      'You may access, correct, erase, or withdraw consent for your personal data at any time.',
    consentP5:
      'By clicking <strong>“Submit Consent”</strong>, you provide free, specific, informed, and unambiguous consent.',
    labelCmpUserId: 'CMP User ID',
    cmpUserIdOptional: 'Auto-generated',
    cmpUserIdPlaceholder: 'CMP User ID',
    labelDomainName: 'Domain Name',
    domainOptional: 'Auto-filled',
    domainPlaceholder: 'Domain Name',
    confirmLabel:
      'I confirm that I have read and understood this web form consent notice.',
    infoNote:
      'Your information will only be collected and processed for the purpose described in this web form.',
    missingConfirmLabel: 'Consent Confirmation',
    selectPlaceholder: 'Select…',
    pdfPreviewTitle: 'Consent Form Preview',
    pdfPreviewDescription:
      'Please review the consent document before confirming and submitting this form.',
    pdfPreviewButtonLabel: 'View Consent Details',
    pdfOpenLabel: 'Open PDF in new tab',
    pdfUnavailableNote:
      'If the PDF preview does not load, open it in a new tab and make sure the file is publicly accessible.',
    otpLabel: 'Email OTP',
    otpPlaceholder: 'Enter OTP',
    otpSendLabel: 'Send OTP',
    otpSendingLabel: 'Sending OTP…',
    otpSentMessage: 'OTP has been sent to your email.',
    otpSendFailedPrefix: 'OTP send failed: ',
    otpEmailRequiredMessage:
      'Please enter a valid email before requesting OTP.',
  };

  let activeLanguage = SOURCE_LANG;
  let formTranslationCache = {};
  let mergedFormSchema = null;
  let baseFormSchema = null;
  let translateFormRequestId = 0;
  let currentFormId = '';
  let currentShowModal = false;

  function getScriptEl() {
    return (
      document.currentScript ||
      document.querySelector('script[src*="form-runtime.js"]')
    );
  }

  function resolveSiblingScriptUrl(fileName) {
    const script = getScriptEl();
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

  function isTranslationEnabled() {
    const el = getScriptEl();
    if (el?.dataset?.vfTranslate === 'false') return false;
    return true;
  }

  function getLanguageOptions() {
    const el = getScriptEl();
    const raw = el?.dataset?.vfLanguages;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (e) {
        console.warn('[form-runtime] Invalid data-vf-languages JSON', e);
      }
    }
    return (
      window.GRCTranslationService?.DEFAULT_LANGUAGES || FALLBACK_LANGUAGES
    );
  }

  function readStoredLanguage() {
    try {
      const v = localStorage.getItem(VF_LANG_STORAGE_KEY);
      if (v) return v;
    } catch (e) {
      /* ignore */
    }
    return SOURCE_LANG;
  }

  function persistLanguage(code) {
    try {
      localStorage.setItem(VF_LANG_STORAGE_KEY, code);
    } catch (e) {
      /* ignore */
    }
  }

  function getFormUi(schema) {
    return { ...VF_UI_DEFAULTS, ...(schema?._vfUi || {}) };
  }

  function attachFormUi(schema, ui) {
    return { ...schema, _vfUi: { ...VF_UI_DEFAULTS, ...ui } };
  }

  function buildFormTranslationPayload(schema, ui) {
    const keys = [];
    const texts = [];
    const add = (key, text) => {
      keys.push(key);
      texts.push(typeof text === 'string' ? text : '');
    };

    add('title', getHeaderTitle(schema));
    add('subtitle', getHeaderSubtitle(schema));
    add('submitLabel', ui.submitLabel);
    add('submittingLabel', ui.submittingLabel);
    add('successMessage', ui.successMessage);
    add('submitFailedPrefix', ui.submitFailedPrefix);
    add('pleaseFillPrefix', ui.pleaseFillPrefix);
    add('modalTitle', ui.modalTitle);
    add('closeAriaLabel', ui.closeAriaLabel);
    add('labelLanguage', ui.labelLanguage);
    add('consentTitle', ui.consentTitle);
    add('consentP1', ui.consentP1);
    add('consentP2', ui.consentP2);
    add('consentP3', ui.consentP3);
    add('consentP4', ui.consentP4);
    add('consentP5', ui.consentP5);
    add('labelCmpUserId', ui.labelCmpUserId);
    add('cmpUserIdOptional', ui.cmpUserIdOptional);
    add('cmpUserIdPlaceholder', ui.cmpUserIdPlaceholder);
    add('labelDomainName', ui.labelDomainName);
    add('domainOptional', ui.domainOptional);
    add('domainPlaceholder', ui.domainPlaceholder);
    add('confirmLabel', ui.confirmLabel);
    add('infoNote', ui.infoNote);
    add('missingConfirmLabel', ui.missingConfirmLabel);
    add('selectPlaceholder', ui.selectPlaceholder);
    add('pdfPreviewTitle', ui.pdfPreviewTitle);
    add('pdfPreviewDescription', ui.pdfPreviewDescription);
    add('pdfPreviewButtonLabel', ui.pdfPreviewButtonLabel);
    add('pdfOpenLabel', ui.pdfOpenLabel);
    add('pdfUnavailableNote', ui.pdfUnavailableNote);
    add('otpLabel', ui.otpLabel);
    add('otpPlaceholder', ui.otpPlaceholder);
    add('otpSendLabel', ui.otpSendLabel);
    add('otpSendingLabel', ui.otpSendingLabel);
    add('otpSentMessage', ui.otpSentMessage);
    add('otpSendFailedPrefix', ui.otpSendFailedPrefix);
    add('otpEmailRequiredMessage', ui.otpEmailRequiredMessage);

    (schema.fields || []).forEach((field, index) => {
      add(`field.${index}.label`, field.label || field.id || '');
      add(`field.${index}.placeholder`, field.placeholder || '');
      add(`field.${index}.optionalLabel`, field.optionalLabel || '');
      if (Array.isArray(field.options)) {
        field.options.forEach((opt, optIndex) => {
          const label =
            typeof opt === 'string' ? opt : (opt?.label ?? opt?.value ?? '');
          add(`field.${index}.opt.${optIndex}`, label);
          getSubOptions(opt).forEach((sub, subIndex) => {
            const subLabel =
              typeof sub === 'string' ? sub : sub?.label ?? sub?.value ?? '';
            add(`field.${index}.opt.${optIndex}.sub.${subIndex}`, subLabel);
          });
        });
      }
    });

    (schema.contents || []).forEach((content, index) => {
      add(`content.${index}`, content?.text || '');
    });

    return { keys, texts };
  }

  function applyFormTranslationPayload(baseSchema, ui, keys, translated) {
    const svc = window.GRCTranslationService;
    const map = {};
    keys.forEach((key, index) => {
      const orig = '';
      const t = translated[index];
      map[key] = svc?.sanitizeTranslatedText
        ? svc.sanitizeTranslatedText(t, orig)
        : t || orig;
    });

    const schema = JSON.parse(JSON.stringify(baseSchema));
    const nextUi = { ...VF_UI_DEFAULTS, ...ui };

    const setUi = (k) => {
      if (map[k]) nextUi[k] = map[k];
    };
    [
      'submitLabel',
      'submittingLabel',
      'successMessage',
      'submitFailedPrefix',
      'pleaseFillPrefix',
      'modalTitle',
      'closeAriaLabel',
      'labelLanguage',
      'consentTitle',
      'consentP1',
      'consentP2',
      'consentP3',
      'consentP4',
      'consentP5',
      'labelCmpUserId',
      'cmpUserIdOptional',
      'cmpUserIdPlaceholder',
      'labelDomainName',
      'domainOptional',
      'domainPlaceholder',
      'confirmLabel',
      'infoNote',
      'missingConfirmLabel',
      'selectPlaceholder',
      'pdfPreviewTitle',
      'pdfPreviewDescription',
      'pdfPreviewButtonLabel',
      'pdfOpenLabel',
      'pdfUnavailableNote',
      'otpLabel',
      'otpPlaceholder',
      'otpSendLabel',
      'otpSendingLabel',
      'otpSentMessage',
      'otpSendFailedPrefix',
      'otpEmailRequiredMessage',
    ].forEach(setUi);

    if (map.title) {
      schema.title = map.title;
      schema.formTitle = map.title;
    }
    if (map.subtitle) {
      schema.subtitle = map.subtitle;
      schema.description = map.subtitle;
    }

    (schema.fields || []).forEach((field, index) => {
      if (map[`field.${index}.label`])
        field.label = map[`field.${index}.label`];
      if (map[`field.${index}.placeholder`]) {
        field.placeholder = map[`field.${index}.placeholder`];
      }
      if (map[`field.${index}.optionalLabel`]) {
        field.optionalLabel = map[`field.${index}.optionalLabel`];
      }
      if (Array.isArray(field.options)) {
        field.options = field.options.map((opt, optIndex) => {
          const translatedLabel = map[`field.${index}.opt.${optIndex}`];
          if (!translatedLabel) return opt;
          if (typeof opt === 'string') return translatedLabel;
          return { ...opt, label: translatedLabel };
        });
      }
    });

    if (Array.isArray(schema.contents)) {
      schema.contents = schema.contents.map((content, index) => ({
        ...content,
        text: map[`content.${index}`] || content?.text || '',
      }));
    }

    return attachFormUi(schema, nextUi);
  }

  async function translateFormSchema(schema, ui, target, source) {
    const { keys, texts } = buildFormTranslationPayload(schema, ui);
    const translated = await window.GRCTranslationService.translateBatch({
      texts,
      target,
      source,
      googleApiKey: getScriptEl()?.dataset?.googleTranslateApiKey || '',
    });
    return applyFormTranslationPayload(schema, ui, keys, translated);
  }

  // function buildLanguageSelect(schema, onLanguageChange) {
  //   if (!isTranslationEnabled()) return null;
  //   const svc = window.GRCTranslationService;
  //   if (!svc?.createLanguageDropdown) return null;

  //   const langs = getLanguageOptions();
  //   const ui = getFormUi(schema);
  //   const picker = svc.createLanguageDropdown({
  //     languages: langs,
  //     value: langs.some((l) => l.code === activeLanguage)
  //       ? activeLanguage
  //       : SOURCE_LANG,
  //     layout: 'stacked',
  //     label: ui.labelLanguage || 'Language',
  //     variant: 'on-dark',
  //     id: 'vf_ui_lang',
  //     onChange: onLanguageChange,
  //   });
  //   if (!picker) return null;
  //   return picker.wrap;
  // }
  function buildLanguageSelect(schema, onLanguageChange) {
    if (!isTranslationEnabled()) return null;

    const langs = getLanguageOptions();
    if (!Array.isArray(langs) || langs.length === 0) return null;

    const ui = getFormUi(schema);

    const selectedCode = langs.some((l) => l.code === activeLanguage)
      ? activeLanguage
      : SOURCE_LANG;

    const selectedLang = langs.find((l) => l.code === selectedCode) || langs[0];

    const wrap = h('div', { class: 'vf-custom-lang-wrap' });

    const label = h(
      'label',
      {
        class: 'vf-custom-lang-label',
        for: 'vf_custom_lang_btn',
      },
      ui.labelLanguage || 'Language',
    );

    const button = h(
      'button',
      {
        type: 'button',
        id: 'vf_custom_lang_btn',
        class: 'vf-custom-lang-button',
        'aria-expanded': 'false',
      },
      [
        h(
          'span',
          { class: 'vf-custom-lang-text' },
          selectedLang.nativeLabel || selectedLang.label || selectedLang.code,
        ),
        h('span', { class: 'vf-custom-lang-icon' }, '▾'),
      ],
    );

    const menu = h('div', {
      class: 'vf-custom-lang-menu',
      hidden: 'hidden',
    });

    function closeMenu() {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('open');
    }

    function openMenu() {
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      wrap.classList.add('open');
    }

    function toggleMenu() {
      if (menu.hidden) openMenu();
      else closeMenu();
    }

    langs.forEach((lang) => {
      const isActive = lang.code === selectedCode;

      const item = h(
        'button',
        {
          type: 'button',
          class: isActive
            ? 'vf-custom-lang-item active'
            : 'vf-custom-lang-item',
          'data-code': lang.code,
        },
        lang.nativeLabel || lang.label || lang.code,
      );

      item.addEventListener('click', () => {
        const textEl = button.querySelector('.vf-custom-lang-text');
        if (textEl) {
          textEl.textContent = lang.nativeLabel || lang.label || lang.code;
        }

        menu.querySelectorAll('.vf-custom-lang-item').forEach((el) => {
          el.classList.remove('active');
        });

        item.classList.add('active');
        closeMenu();

        if (typeof onLanguageChange === 'function') {
          onLanguageChange(lang.code);
        }
      });

      menu.appendChild(item);
    });

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });

    document.addEventListener('click', function onDocClick(e) {
      if (!wrap.isConnected) {
        document.removeEventListener('click', onDocClick);
        return;
      }

      if (!wrap.contains(e.target)) {
        closeMenu();
      }
    });

    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    wrap.append(label, button, menu);
    return wrap;
  }
  function remountFormUI() {
    const schema = mergedFormSchema;
    if (!schema || !currentFormId) return;

    const openModal = document.querySelector('.vf-ovl');
    if (openModal) {
      const body = openModal.querySelector('.vf-body');
      if (body) {
        body.innerHTML = '';
        body.appendChild(buildFormCard(schema));
        return;
      }
    }

    if (!currentShowModal) {
      mountInline(currentFormId, schema);
    }
  }

  //   /* ---------------- CSS ---------------- */
  //   function injectStyles() {
  //     console.log('[form-runtime] injectStyles called');
  //     if (document.getElementById('vf-styles')) {
  //       console.log('[form-runtime] styles already injected');
  //       return;
  //     }

  //     const css = `
  // :root{
  //   --vf-bg:#ffffff;
  //   --vf-page:#f3f6fb;
  //   --vf-fg:#0f172a;
  //   --vf-muted:#64748b;
  //   --vf-border:#d9e0ea;
  //   --vf-brand:#2f66e3;
  //   --vf-brand-hover:#2456c7;
  //   --vf-danger:#dc2626;
  //   --vf-shadow:0 10px 28px rgba(15,23,42,.10);
  //   --vf-radius:14px;
  // }

  // .vf-reset,
  // .vf-reset *{
  //   box-sizing:border-box;
  //   font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Helvetica Neue',Arial,'Noto Sans',sans-serif;
  // }

  // .vf-reset{
  //   color:var(--vf-fg);
  // }

  // .vf-card{
  //   background:var(--vf-bg);
  //   border:1px solid var(--vf-border);
  //   border-radius:16px;
  //   box-shadow:var(--vf-shadow);
  //   overflow:hidden;
  //   padding:0;
  // }

  // .vf-top{
  //   background:linear-gradient(135deg,#2f66e3 0%, #2d5fda 100%);
  //   color:#fff;
  //   padding:18px 20px;
  // }

  // .vf-top-title{
  //   margin:0 0 6px 0;
  //   font-size:16px;
  //   font-weight:700;
  //   line-height:1.3;
  // }

  // .vf-top-subtitle{
  //   margin:0;
  //   font-size:13px;
  //   line-height:1.5;
  //   opacity:.96;
  // }

  // .vf-lang-row{
  //   margin-top:12px;
  // }

  // .vf-lang-row .grc-lang-select{
  //   max-width:100%;
  // }

  // .vf-inner{
  //   padding:20px;
  //   background:#fff;
  // }

  // .vf-form{
  //   display:grid;
  //   gap:16px;
  // }

  // .vf-row{
  //   display:flex;
  //   flex-direction:column;
  //   gap:7px;
  //   min-width:0;
  // }

  // .vf-row.full{
  //   grid-column:1/-1;
  // }

  // .vf-label{
  //   font-size:13px;
  //   font-weight:600;
  //   color:var(--vf-fg);
  //   line-height:1.4;
  // }

  // .vf-label .vf-optional{
  //   color:var(--vf-muted);
  //   font-weight:500;
  // }

  // .vf-req{
  //   color:var(--vf-danger);
  // }

  // .vf-input,
  // .vf-select,
  // .vf-textarea{
  //   width:100%;
  //   max-width:100%;
  //   box-sizing:border-box;
  //   border:1px solid var(--vf-border);
  //   border-radius:10px;
  //   padding:12px 14px;
  //   font-size:14px;
  //   background:#fff;
  //   color:var(--vf-fg);
  //   outline:none;
  //   transition:border-color .15s, box-shadow .15s, background-color .15s;
  //   display:block;
  // }

  // .vf-input::placeholder,
  // .vf-textarea::placeholder{
  //   color:#98a2b3;
  // }

  // .vf-input:focus,
  // .vf-select:focus,
  // .vf-textarea:focus{
  //   border-color:var(--vf-brand);
  //   box-shadow:0 0 0 3px rgba(47,102,227,.14);
  // }

  // .vf-input[readonly],
  // .vf-select[readonly],
  // .vf-textarea[readonly]{
  //   background:#f8fafc;
  //   color:#475569;
  // }

  // .vf-otp-wrap{
  //   display:flex;
  //   gap:8px;
  //   align-items:stretch;
  // }

  // .vf-otp-wrap .vf-input{
  //   flex:1;
  // }

  // .vf-otp-btn{
  //   flex:0 0 auto;
  //   border:1px solid var(--vf-brand);
  //   border-radius:10px;
  //   background:#fff;
  //   color:var(--vf-brand);
  //   font-size:13px;
  //   font-weight:700;
  //   padding:0 14px;
  //   cursor:pointer;
  //   transition:background-color .15s, color .15s, opacity .15s;
  // }

  // .vf-otp-btn:hover{
  //   background:var(--vf-brand);
  //   color:#fff;
  // }

  // .vf-otp-btn[disabled]{
  //   opacity:.7;
  //   cursor:not-allowed;
  // }

  // .vf-otp-status{
  //   min-height:16px;
  //   font-size:12px;
  //   line-height:1.4;
  //   color:var(--vf-muted);
  // }

  // .vf-otp-status.success{
  //   color:#166534;
  // }

  // .vf-otp-status.error{
  //   color:#b91c1c;
  // }

  // .vf-textarea{
  //   min-height:110px;
  //   resize:vertical;
  // }

  // .vf-checkbox-group{
  //   border:1px solid var(--vf-border);
  //   border-radius:10px;
  //   background:#fff;
  //   padding:10px 12px;
  //   display:flex;
  //   flex-direction:column;
  //   gap:10px;
  // }

  // .vf-checkbox-item{
  //   display:flex;
  //   align-items:flex-start;
  //   gap:10px;
  //   font-size:14px;
  //   color:var(--vf-fg);
  //   line-height:1.45;
  // }

  // .vf-checkbox-item input{
  //   width:16px;
  //   height:16px;
  //   margin-top:2px;
  //   flex:0 0 auto;
  // }

  // .vf-checkbox{
  //   display:flex;
  //   align-items:flex-start;
  //   gap:10px;
  // }

  // .vf-checkbox input{
  //   width:16px;
  //   height:16px;
  //   margin-top:2px;
  //   flex:0 0 auto;
  // }

  // .vf-info{
  //   border:1px solid #cfe0ff;
  //   background:#f8fbff;
  //   color:#64748b;
  //   border-radius:10px;
  //   padding:12px 14px;
  //   font-size:13px;
  //   line-height:1.5;
  // }

  // .vf-actions{
  //   padding-top:2px;
  //   display:flex;
  //   flex-direction:column;
  //   gap:10px;
  // }

  // .vf-btn{
  //   width:100%;
  //   display:inline-flex;
  //   align-items:center;
  //   justify-content:center;
  //   padding:13px 16px;
  //   border-radius:10px;
  //   border:1px solid transparent;
  //   background:var(--vf-brand);
  //   color:#fff;
  //   font-weight:700;
  //   font-size:14px;
  //   cursor:pointer;
  //   transition:background-color .15s, transform .1s, opacity .15s;
  // }

  // .vf-btn:hover{
  //   background:var(--vf-brand-hover);
  // }

  // .vf-btn:active{
  //   transform:translateY(.5px);
  // }

  // .vf-btn[disabled]{
  //   opacity:.75;
  //   cursor:not-allowed;
  // }

  // .vf-note{
  //   font-size:12px;
  //   color:var(--vf-muted);
  //   line-height:1.5;
  // }

  // .vf-help{
  //   font-size:13px;
  //   line-height:1.45;
  //   min-height:18px;
  // }

  // .vf-help.success{
  //   color:#166534;
  // }

  // .vf-help.error{
  //   color:#b91c1c;
  // }

  // .vf-ovl{
  //   position:fixed;
  //   inset:0;
  //   background:rgba(15,23,42,.48);
  //   display:flex;
  //   align-items:center;
  //   justify-content:center;
  //   padding:16px;
  //   z-index:9999;
  // }

  // .vf-panel{
  //   width:100%;
  //   max-width:760px;
  // }

  // .vf-head{
  //   background:#fff;
  //   border:1px solid var(--vf-border);
  //   border-bottom:none;
  //   border-radius:16px 16px 0 0;
  //   // padding:10px 14px;
  //   display:flex;
  //   align-items:center;
  //   justify-content:space-between;
  // }

  // .vf-head-title{
  //   font-size:14px;
  //   font-weight:600;
  //   color:var(--vf-fg);
  // }

  // .vf-close{
  //   background:#fff;
  //   border:1px solid var(--vf-border);
  //   border-radius:10px;
  //   width:36px;
  //   height:34px;
  //   display:inline-flex;
  //   align-items:center;
  //   justify-content:center;
  //   cursor:pointer;
  //   font-size:18px;
  //   line-height:1;
  // }

  // .vf-close:hover{
  //   background:#f8fafc;
  // }

  // .vf-body{
  //   background:#fff;
  //   border:1px solid var(--vf-border);
  //   border-top:none;
  //   border-radius:0 0 16px 16px;
  //   padding:0;
  //   overflow:hidden;
  // }

  // .vf-consent-notice-wrap{
  //   margin-top:14px;
  // }

  // .vf-consent-notice{
  //   border:1px solid #dbeafe;
  //   background:#f8fbff;
  //   color:#334155;
  //   border-radius:12px;
  //   padding:14px 16px;
  //   font-size:12px;
  //   line-height:1.45;
  // }

  // .vf-consent-notice h3{
  //   margin:0 0 8px;
  //   font-size:14px;
  //   font-weight:700;
  //   color:#0f172a;
  // }

  // .vf-consent-notice p{
  //   margin:0 0 6px;
  // }

  // .vf-consent-notice strong{
  //   color:#0f172a;
  // }

  // .vf-pdf-preview-row{
  //   grid-column:1/-1;
  //   border:1px solid #dbeafe;
  //   background:#f8fbff;
  //   border-radius:12px;
  //   padding:14px;
  //   display:flex;
  //   align-items:center;
  //   justify-content:space-between;
  //   gap:12px;
  // }

  // .vf-pdf-preview-copy{
  //   min-width:0;
  //   flex:1;
  //   cursor:pointer;
  //   border-radius:8px;
  // }

  // .vf-pdf-preview-copy:focus{
  //   outline:2px solid rgba(47,102,227,.45);
  //   outline-offset:4px;
  // }

  // .vf-pdf-preview-copy:hover .vf-pdf-title{
  //   color:var(--vf-brand);
  //   text-decoration:underline;
  // }

  // .vf-pdf-title{
  //   margin:0 0 4px;
  //   font-size:14px;
  //   font-weight:700;
  //   color:#0f172a;
  // }

  // .vf-pdf-desc{
  //   margin:0;
  //   font-size:12px;
  //   line-height:1.45;
  //   color:#475569;
  // }

  // .vf-pdf-preview-btn{
  //   flex:0 0 auto;
  //   display:inline-flex;
  //   align-items:center;
  //   justify-content:center;
  //   border:1px solid var(--vf-brand);
  //   border-radius:10px;
  //   background:#fff;
  //   color:var(--vf-brand);
  //   font-size:13px;
  //   font-weight:700;
  //   padding:10px 14px;
  //   cursor:pointer;
  //   transition:background-color .15s, color .15s, transform .1s;
  // }

  // .vf-pdf-preview-btn:hover{
  //   background:var(--vf-brand);
  //   color:#fff;
  // }

  // .vf-pdf-preview-btn:active{
  //   transform:translateY(.5px);
  // }

  // .vf-pdf-ovl{
  //   z-index:10000;
  // }

  // .vf-pdf-panel{
  //   max-width:920px;
  // }

  // .vf-pdf-body{
  //   background:#fff;
  //   border:1px solid var(--vf-border);
  //   border-top:none;
  //   border-radius:0 0 16px 16px;
  //   padding:14px;
  // }

  // .vf-pdf-frame-wrap{
  //   width:100%;
  //   height:70vh;
  //   min-height:420px;
  //   overflow:hidden;
  //   border:1px solid var(--vf-border);
  //   border-radius:10px;
  //   background:#fff;
  // }

  // .vf-pdf-frame{
  //   width:100%;
  //   height:100%;
  //   border:0;
  //   display:block;
  //   background:#fff;
  // }

  // .vf-pdf-actions{
  //   margin-top:10px;
  //   display:flex;
  //   flex-wrap:wrap;
  //   gap:8px;
  //   align-items:center;
  //   justify-content:space-between;
  // }

  // .vf-pdf-link{
  //   color:var(--vf-brand);
  //   font-size:13px;
  //   font-weight:700;
  //   text-decoration:none;
  // }

  // .vf-pdf-link:hover{
  //   text-decoration:underline;
  // }

  // .vf-pdf-note{
  //   font-size:12px;
  //   line-height:1.45;
  //   color:var(--vf-muted);
  // }

  // @media (min-width:640px){
  //   .vf-form.two-col{
  //     grid-template-columns:1fr 1fr;
  //     column-gap:16px;
  //     row-gap:16px;
  //   }
  // }

  // @media (max-width:639px){
  //   .vf-inner{
  //     padding:16px;
  //   }

  //   .vf-pdf-preview-row{
  //     align-items:stretch;
  //     flex-direction:column;
  //   }

  //   .vf-pdf-preview-btn{
  //     width:100%;
  //   }

  //   .vf-pdf-frame-wrap{
  //     height:62vh;
  //     min-height:320px;
  //   }

  //   .vf-otp-wrap{
  //     flex-direction:column;
  //   }

  //   .vf-otp-btn{
  //     width:100%;
  //     min-height:42px;
  //   }
  // }
  // `.trim();

  //     const style = document.createElement('style');
  //     style.id = 'vf-styles';
  //     style.textContent = css;
  //     document.head.appendChild(style);
  //     document.body.classList.add('vf-reset');
  //     if (!document.body.style.backgroundColor) {
  //       document.body.style.backgroundColor = 'var(--vf-page)';
  //     }
  //     console.log('[form-runtime] styles injected');
  //   }

  function injectStyles() {
    console.log('[form-runtime] injectStyles called');
    if (document.getElementById('vf-styles')) {
      console.log('[form-runtime] styles already injected');
      return;
    }

    const css = `
:root{
  --vf-bg:#ffffff;
  --vf-page:#f5f7fb;
  --vf-fg:#111827;
  --vf-muted:#667085;
  --vf-soft:#f8fafc;
  --vf-border:#e4e7ec;
  --vf-border-strong:#d0d5dd;
  --vf-primary:#2B245C;
  --vf-primary-hover:#211b4a;
  --vf-primary-soft:#f1effb;
  --vf-brand:#2B245C;
  --vf-brand-hover:#211b4a;
  --vf-danger:#dc2626;
  --vf-success:#15803d;
  --vf-shadow:0 20px 55px rgba(17,24,39,.22);
  --vf-shadow-soft:0 10px 28px rgba(17,24,39,.10);
  --vf-radius:16px;
}

.vf-reset,
.vf-reset *{
  box-sizing:border-box;
  font-family:'Roboto', sans-serif;
}

.vf-reset{
  color:var(--vf-fg);
}

.vf-card{
  width:100%;
  background:var(--vf-bg);
  border:1px solid rgba(228,231,236,.95);
  border-radius:var(--vf-radius);
  box-shadow:var(--vf-shadow-soft);
  overflow:hidden;
  padding:0;
  display:flex;
  flex-direction:column;
  max-height:82vh !important;
}

.vf-top{
  position:relative;
  background:#2B245C !important;
  color:#ffffff !important;
  padding:14px 18px 13px !important;
  overflow:hidden;
  flex:0 0 auto;
}

.vf-top:before{
  content:'';
  position:absolute;
  inset:-90px -125px auto auto;
  width:230px;
  height:230px;
  border-radius:999px;
  background:rgba(255,255,255,.10);
  pointer-events:none;
}

.vf-top:after{
  content:'';
  position:absolute;
  inset:auto -95px -125px auto;
  width:210px;
  height:210px;
  border-radius:999px;
  background:rgba(255,255,255,.07);
  pointer-events:none;
}

.vf-top-title,
.vf-top-subtitle,
.vf-lang-row{
  position:relative;
  z-index:1;
}

.vf-top-title{
  margin:0 42px 5px 0;
  font-size:17px;
  font-weight:800;
  line-height:1.2;
  letter-spacing:-.02em;
  color:#ffffff !important;
  text-shadow:0 1px 2px rgba(0,0,0,.25);
}

.vf-top-subtitle{
  max-width:620px;
  margin:0;
  font-size:12px;
  line-height:1.35;
  color:rgba(255,255,255,.94) !important;
}

.vf-lang-row{
  margin-top:10px;
  max-width:205px !important;
  color:#ffffff !important;
  position:relative;
  z-index:20;
}

.vf-lang-row label,
.vf-lang-row .grc-lang-label,
.vf-lang-row p{
  color:#ffffff !important;
  font-weight:700 !important;
  font-size:11px !important;
  line-height:1.2 !important;
  margin-bottom:5px !important;
}

.vf-lang-row .grc-lang-select,
.vf-lang-row select{
  max-width:100%;
}

.vf-lang-row select,
.vf-lang-row .grc-lang-select select{
  width:205px !important;
  max-width:205px !important;
  height:34px !important;
  min-height:34px !important;
  border-radius:8px;
  border:1px solid rgba(255,255,255,.35);
  background:#ffffff !important;
  color:#111827 !important;
  outline:none;
  box-shadow:0 5px 14px rgba(0,0,0,.12);
  font-size:12px !important;
  padding:7px 10px !important;
}

.vf-lang-row select option,
.vf-lang-row .grc-lang-select select option{
  background:#ffffff !important;
  color:#111827 !important;
  font-size:12px !important;
  padding:5px 8px !important;
  line-height:1.2 !important;
}

.vf-lang-row .grc-lang-options,
.vf-lang-row .grc-lang-menu,
.vf-lang-row .grc-language-options,
.vf-lang-row .grc-language-menu,
.vf-lang-row [role="listbox"],
.vf-lang-row ul{
  max-height:145px !important;
  overflow-y:auto !important;
  overflow-x:hidden !important;
  background:#ffffff !important;
  border:1px solid #d0d5dd !important;
  border-radius:9px !important;
  box-shadow:0 12px 28px rgba(17,24,39,.18) !important;
  z-index:99999 !important;
}

.vf-lang-row .grc-lang-options *,
.vf-lang-row .grc-lang-menu *,
.vf-lang-row .grc-language-options *,
.vf-lang-row .grc-language-menu *,
.vf-lang-row [role="listbox"] *,
.vf-lang-row ul *{
  font-size:12px !important;
  line-height:1.25 !important;
}

.vf-inner{
  padding:18px 20px;
  background:linear-gradient(180deg,#ffffff 0%,#fbfcff 100%);
  overflow-y:auto !important;
  overflow-x:hidden !important;
  flex:1 1 auto;
  max-height:calc(82vh - 105px) !important;
}

.vf-inner::-webkit-scrollbar,
.vf-body::-webkit-scrollbar{
  width:7px;
}

.vf-inner::-webkit-scrollbar-track,
.vf-body::-webkit-scrollbar-track{
  background:#f1f5f9;
  border-radius:20px;
}

.vf-inner::-webkit-scrollbar-thumb,
.vf-body::-webkit-scrollbar-thumb{
  background:#c7c2df;
  border-radius:20px;
}

.vf-inner::-webkit-scrollbar-thumb:hover,
.vf-body::-webkit-scrollbar-thumb:hover{
  background:#2B245C;
}

.vf-form{
  display:grid;
  gap:13px;
}

.vf-row{
  display:flex;
  flex-direction:column;
  gap:6px;
  min-width:0;
}

.vf-row.full{
  grid-column:1/-1;
}

.vf-label{
  font-size:12px;
  font-weight:700;
  color:#1f2937;
  line-height:1.35;
}

.vf-label .vf-optional{
  color:var(--vf-muted);
  font-weight:500;
}

.vf-checkbox-label-wrap{
  min-width:0;
  font-size:11.5px;
  line-height:1.35;
  color:#344054;
}

.vf-checkbox-label-wrap .vf-label{
  display:inline;
}

.vf-label-link{
  color:var(--vf-primary);
  font-weight:500;
  text-decoration:underline;
  text-underline-offset:2px;
}

.vf-label-link:hover{
  color:var(--vf-primary-hover);
}

.vf-req{
  color:var(--vf-danger);
}

.vf-input,
.vf-select,
.vf-textarea{
  width:100%;
  max-width:100%;
  box-sizing:border-box;
  border:1px solid var(--vf-border);
  border-radius:10px;
  padding:10px 12px;
  font-size:13px;
  line-height:1.35;
  background:#ffffff;
  color:var(--vf-fg);
  outline:none;
  transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease, transform .12s ease;
  display:block;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.vf-select{
  appearance:auto;
  cursor:pointer;
}

.vf-input::placeholder,
.vf-textarea::placeholder{
  color:#98a2b3;
}

.vf-input:hover,
.vf-select:hover,
.vf-textarea:hover{
  border-color:#c7c2df;
}

.vf-input:focus,
.vf-select:focus,
.vf-textarea:focus{
  border-color:var(--vf-primary);
  box-shadow:0 0 0 4px rgba(43,36,92,.14);
}

.vf-input[readonly],
.vf-select[readonly],
.vf-textarea[readonly]{
  background:#f8fafc;
  color:#475569;
  border-style:dashed;
}

.vf-otp-wrap{
  display:flex;
  gap:9px;
  align-items:stretch;
}

.vf-otp-wrap .vf-input{
  flex:1;
}

.vf-otp-btn{
  flex:0 0 auto;
  min-height:40px;
  border:1px solid var(--vf-primary);
  border-radius:10px;
  background:#ffffff;
  color:var(--vf-primary);
  font-size:12px;
  font-weight:800;
  padding:0 14px;
  cursor:pointer;
  transition:background-color .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease, opacity .18s ease;
  white-space:nowrap;
}

.vf-otp-btn:hover{
  background:var(--vf-primary);
  color:#ffffff;
  box-shadow:0 8px 18px rgba(43,36,92,.20);
}

.vf-otp-btn[disabled]{
  opacity:.7;
  cursor:not-allowed;
  box-shadow:none;
}

.vf-otp-status{
  min-height:14px;
  font-size:11px;
  line-height:1.35;
  color:var(--vf-muted);
}

.vf-otp-status.success{
  color:var(--vf-success);
}

.vf-otp-status.error{
  color:#b91c1c;
}

.vf-textarea{
  min-height:86px;
  resize:vertical;
}

.vf-checkbox-group{
  border:1px solid var(--vf-border);
  border-radius:12px;
  background:#ffffff;
  padding:10px 12px;
  display:flex;
  flex-direction:column;
  gap:8px;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.vf-checkbox-item{
  display:flex;
  align-items:flex-start;
  gap:9px;
  font-size:12px;
  color:#344054;
  line-height:1.35;
}


.vf-checkbox-subgroup{
  display:flex;
  flex-wrap:wrap;
  gap:8px 18px;
  margin-left:24px;
  margin-top:-2px;
}

.vf-checkbox-subitem{
  margin-bottom:0;
}

.vf-checkbox-item input,
.vf-checkbox input{
  width:15px;
  height:15px;
  margin-top:1px;
  flex:0 0 auto;
  accent-color:var(--vf-primary);
}

.vf-checkbox{
  display:flex;
  align-items:flex-start;
  gap:10px;
  border:1px solid var(--vf-border);
  background:#ffffff;
  border-radius:12px;
  padding:10px 12px;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.vf-checkbox .vf-label{
  font-size:12px !important;
}

.vf-info{
  border:1px solid #e0dcf4;
  background:var(--vf-primary-soft);
  color:#4b5563;
  border-radius:12px;
  padding:10px 12px;
  font-size:11.5px;
  line-height:1.45;
}

.vf-actions{
  padding-top:14px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:8px;
}

.vf-actions .vf-btn,
.vf-btn{
  width:fit-content !important;
  min-width:155px !important;
  max-width:none !important;
  min-height:40px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:10px 26px;
  border-radius:9px;
  border:1px solid transparent;
  background:#2B245C;
  color:#ffffff;
  font-weight:800;
  font-size:12px;
  line-height:1;
  letter-spacing:.01em;
  cursor:pointer;
  white-space:nowrap !important;
  text-align:center;
  transition:background-color .18s ease, transform .12s ease, opacity .18s ease, box-shadow .18s ease;
  box-shadow:0 9px 20px rgba(43,36,92,.28);
}

.vf-btn:hover{
  background:var(--vf-primary-hover);
  box-shadow:0 12px 24px rgba(43,36,92,.34);
}

.vf-btn:active{
  transform:translateY(1px);
}

.vf-btn[disabled]{
  opacity:.75;
  cursor:not-allowed;
  box-shadow:none;
}

.vf-help{
  width:100%;
  text-align:center;
  font-size:12px;
  line-height:1.35;
  min-height:16px;
}

.vf-help.success{
  color:var(--vf-success);
}

.vf-help.error{
  color:#b91c1c;
}

.vf-ovl{
  position:fixed;
  inset:0;
  background:rgba(15,23,42,.58);
  backdrop-filter:blur(6px);
  -webkit-backdrop-filter:blur(6px);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:16px;
  z-index:9999;
}

.vf-panel{
  width:100%;
  max-width:760px;
  max-height:82vh !important;
  overflow:hidden !important;
  border-radius:var(--vf-radius);
  box-shadow:var(--vf-shadow);
}

.vf-head{
  background:#2B245C;
  border:1px solid rgba(43,36,92,.95);
  border-bottom:none;
  border-radius:var(--vf-radius) var(--vf-radius) 0 0;
  min-height:0;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:1rem;
}

.vf-head:empty{
  display:none;
}

.vf-head-title{
  font-size:13px;
  font-weight:700;
  color:#ffffff;
}

.vf-close{
  background:rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.28);
  border-radius:999px;
  width:30px;
  height:30px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  font-size:18px;
  line-height:1;
  color:#ffffff;
  transition:background-color .18s ease, transform .12s ease, border-color .18s ease;
}

.vf-top .vf-close{
  position:absolute !important;
  top:10px !important;
  right:12px !important;
  z-index:3 !important;
  width:30px !important;
  height:30px !important;
  border:1px solid rgba(255,255,255,.28) !important;
  border-radius:999px !important;
  background:rgba(255,255,255,.14) !important;
  color:#ffffff !important;
  font-size:20px !important;
  box-shadow:none !important;
}

.vf-close:hover,
.vf-top .vf-close:hover{
  background:rgba(255,255,255,.22) !important;
  border-color:rgba(255,255,255,.42) !important;
  transform:translateY(-1px);
}

.vf-body{
  background:#ffffff;
  border:1px solid var(--vf-border);
  border-radius:var(--vf-radius);
  padding:0;
  overflow:hidden !important;
  max-height:82vh !important;
}

.vf-head:not(:empty) + .vf-body{
  border-top:none;
  border-radius:0 0 var(--vf-radius) var(--vf-radius);
}

.vf-body .vf-card{
  border:0;
  border-radius:0;
  box-shadow:none;
  max-height:82vh !important;
  overflow:hidden !important;
}

.vf-consent-notice-wrap{
  margin-top:12px;
}

.vf-consent-notice{
  border:1px solid #e0dcf4;
  background:var(--vf-primary-soft);
  color:#334155;
  border-radius:12px;
  padding:12px 14px;
  font-size:11.5px;
  line-height:1.45;
}

.vf-consent-notice h3{
  margin:0 0 7px;
  font-size:13px;
  font-weight:800;
  color:#111827;
}

.vf-consent-notice p{
  margin:0 0 5px;
}

.vf-consent-notice strong{
  color:#111827;
}

.vf-pdf-preview-row{
  grid-column:1/-1;
  border:1px solid #e0dcf4;
  background:linear-gradient(135deg,#f7f5ff 0%,#ffffff 100%);
  border-radius:14px;
  padding:13px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.vf-pdf-preview-copy{
  min-width:0;
  flex:1;
  cursor:pointer;
  border-radius:10px;
}

.vf-pdf-preview-copy:focus{
  outline:2px solid rgba(43,36,92,.45);
  outline-offset:4px;
}

.vf-pdf-preview-copy:hover .vf-pdf-title{
  color:var(--vf-primary);
  text-decoration:underline;
}

.vf-pdf-title{
  margin:0 0 4px;
  font-size:13px;
  font-weight:800;
  color:#111827;
}

.vf-pdf-desc{
  margin:0;
  font-size:11px;
  line-height:1.45;
  color:#475569;
}

.vf-pdf-preview-btn{
  flex:0 0 auto;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border:1px solid var(--vf-primary);
  border-radius:10px;
  background:#ffffff;
  color:var(--vf-primary);
  font-size:12px;
  font-weight:800;
  padding:9px 13px;
  cursor:pointer;
  transition:background-color .18s ease, color .18s ease, transform .12s ease, box-shadow .18s ease;
}

.vf-pdf-preview-btn:hover{
  background:var(--vf-primary);
  color:#ffffff;
  box-shadow:0 8px 18px rgba(43,36,92,.20);
}

.vf-pdf-preview-btn:active{
  transform:translateY(1px);
}

.vf-pdf-ovl{
  z-index:10000;
}

.vf-pdf-panel{
  max-width:860px;
  max-height:84vh !important;
}

.vf-pdf-body{
  background:#ffffff;
  border:1px solid var(--vf-border);
  border-top:none;
  border-radius:0 0 var(--vf-radius) var(--vf-radius);
  padding:12px;
  overflow:auto;
  max-height:84vh !important;
}

.vf-pdf-frame-wrap{
  width:100%;
  height:62vh;
  min-height:340px;
  overflow:hidden;
  border:1px solid var(--vf-border);
  border-radius:12px;
  background:#ffffff;
}

.vf-pdf-frame{
  width:100%;
  height:100%;
  border:0;
  display:block;
  background:#ffffff;
}

.vf-pdf-actions{
  margin-top:9px;
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  align-items:center;
  justify-content:space-between;
}

.vf-pdf-link{
  color:var(--vf-primary);
  font-size:12px;
  font-weight:800;
  text-decoration:none;
}

.vf-pdf-link:hover{
  text-decoration:underline;
}

.vf-pdf-note{
  font-size:11px;
  line-height:1.4;
  color:var(--vf-muted);
}

/* KEEP FUNCTIONALITY SAME - ONLY UI HEIGHT FIX */

.vf-ovl{
  align-items:center !important;
  padding:14px !important;
}

.vf-panel{
  max-width:740px !important;
  max-height:78vh !important;
  overflow:hidden !important;
  border-radius:16px !important;
}

.vf-body{
  max-height:78vh !important;
  overflow:hidden !important;
}

.vf-body .vf-card{
  max-height:78vh !important;
  overflow:hidden !important;
  display:flex !important;
  flex-direction:column !important;
}

.vf-top{
  padding:12px 18px 12px !important;
  flex:0 0 auto !important;
}

.vf-top-title{
  font-size:16px !important;
  margin-bottom:4px !important;
}

.vf-top-subtitle{
  font-size:11.5px !important;
  line-height:1.35 !important;
}

.vf-lang-row{
  margin-top:8px !important;
  max-width:190px !important;
}

.vf-lang-row select,
.vf-lang-row .grc-lang-select select{
  width:190px !important;
  max-width:190px !important;
  height:32px !important;
  min-height:32px !important;
  font-size:12px !important;
  padding:6px 9px !important;
  border-radius:8px !important;
}

.vf-inner{
  flex:1 1 auto !important;
  max-height:calc(78vh - 96px) !important;
  overflow-y:auto !important;
  overflow-x:hidden !important;
  padding:16px 20px !important;
}

.vf-form{
  gap:11px !important;
}

.vf-label{
  font-size:11.5px !important;
}

.vf-input,
.vf-select,
.vf-textarea{
  min-height:36px !important;
  padding:9px 11px !important;
  font-size:12.5px !important;
  border-radius:9px !important;
}

.vf-checkbox{
  padding:9px 11px !important;
  border-radius:10px !important;
}

.vf-checkbox .vf-label{
  font-size:11.5px !important;
}

.vf-info{
  padding:9px 11px !important;
  font-size:11px !important;
  border-radius:10px !important;
}

.vf-pdf-preview-row{
  padding:11px !important;
  border-radius:12px !important;
}

.vf-pdf-title{
  font-size:12px !important;
}

.vf-pdf-desc{
  font-size:10.5px !important;
}

.vf-pdf-preview-btn{
  padding:8px 12px !important;
  font-size:11.5px !important;
  border-radius:9px !important;
}

.vf-actions{
  padding-top:12px !important;
}

.vf-actions .vf-btn,
.vf-btn{
  min-width:150px !important;
  min-height:38px !important;
  padding:9px 24px !important;
  font-size:12px !important;
  border-radius:9px !important;
}

.vf-inner::-webkit-scrollbar{
  width:6px;
}

.vf-inner::-webkit-scrollbar-track{
  background:#f1f5f9;
  border-radius:20px;
}

.vf-inner::-webkit-scrollbar-thumb{
  background:#b8b1d8;
  border-radius:20px;
}

.vf-inner::-webkit-scrollbar-thumb:hover{
  background:#2B245C;
}

@media (max-width:639px){
  .vf-panel,
  .vf-body,
  .vf-body .vf-card{
    max-height:88vh !important;
  }

  .vf-inner{
    max-height:calc(88vh - 95px) !important;
    padding:14px !important;
  }

  .vf-lang-row{
    max-width:100% !important;
  }

  .vf-lang-row select,
  .vf-lang-row .grc-lang-select select{
    width:100% !important;
    max-width:100% !important;
  }
}
  /* compact modal height */
.vf-ovl{
  align-items:center !important;
  padding:12px !important;
}

.vf-panel{
  max-width:720px !important;
  max-height:76vh !important;
  overflow:hidden !important;
}

.vf-body{
  max-height:76vh !important;
  overflow:hidden !important;
}

.vf-body .vf-card{
  max-height:76vh !important;
  overflow:hidden !important;
  display:flex !important;
  flex-direction:column !important;
}

.vf-top{
  overflow:visible !important;
  padding:12px 18px 12px !important;
  flex:0 0 auto !important;
  z-index:5;
}

.vf-top-title{
  font-size:16px !important;
  margin-bottom:4px !important;
  color:#ffffff !important;
}

.vf-top-subtitle{
  font-size:11.5px !important;
  line-height:1.35 !important;
  color:rgba(255,255,255,.94) !important;
}

.vf-inner{
  flex:1 1 auto !important;
  max-height:calc(76vh - 92px) !important;
  overflow-y:auto !important;
  overflow-x:hidden !important;
  padding:16px 20px !important;
}

/* custom language dropdown small height */
.vf-lang-row{
  margin-top:8px !important;
  max-width:185px !important;
  position:relative !important;
  z-index:99999 !important;
}

.vf-custom-lang-wrap{
  width:185px;
  max-width:185px;
  position:relative;
  z-index:99999;
}

.vf-custom-lang-label{
  display:block;
  margin:0 0 5px 0;
  color:#ffffff !important;
  font-size:11px !important;
  font-weight:800 !important;
  line-height:1.2;
}

.vf-custom-lang-button{
  width:100%;
  height:31px;
  border:1px solid rgba(255,255,255,.35);
  border-radius:8px;
  background:#ffffff;
  color:#111827;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:6px 9px;
  font-size:12px;
  font-weight:500;
  cursor:pointer;
  box-shadow:0 5px 14px rgba(0,0,0,.12);
}

.vf-custom-lang-button:focus{
  outline:none;
  box-shadow:0 0 0 3px rgba(255,255,255,.25);
}

.vf-custom-lang-text{
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
}

.vf-custom-lang-icon{
  font-size:10px;
  color:#111827;
  flex:0 0 auto;
}

.vf-custom-lang-menu{
  position:absolute;
  left:0;
  top:calc(100% + 4px);
  width:100%;
  max-height:118px !important;
  overflow-y:auto !important;
  overflow-x:hidden;
  background:#ffffff;
  border:1px solid #d0d5dd;
  border-radius:8px;
  box-shadow:0 12px 24px rgba(17,24,39,.22);
  padding:4px;
  z-index:999999;
}

.vf-custom-lang-menu[hidden]{
  display:none !important;
}

.vf-custom-lang-item{
  width:100%;
  min-height:24px;
  border:0;
  border-radius:6px;
  background:#ffffff;
  color:#111827;
  display:flex;
  align-items:center;
  justify-content:flex-start;
  padding:5px 8px;
  font-size:12px;
  line-height:1.2;
  cursor:pointer;
  text-align:left;
}

.vf-custom-lang-item:hover{
  background:#f1effb;
  color:#2B245C;
}

.vf-custom-lang-item.active{
  background:#2B245C;
  color:#ffffff;
}

.vf-custom-lang-menu::-webkit-scrollbar,
.vf-inner::-webkit-scrollbar{
  width:6px;
}

.vf-custom-lang-menu::-webkit-scrollbar-track,
.vf-inner::-webkit-scrollbar-track{
  background:#f1f5f9;
  border-radius:20px;
}

.vf-custom-lang-menu::-webkit-scrollbar-thumb,
.vf-inner::-webkit-scrollbar-thumb{
  background:#b8b1d8;
  border-radius:20px;
}

.vf-custom-lang-menu::-webkit-scrollbar-thumb:hover,
.vf-inner::-webkit-scrollbar-thumb:hover{
  background:#2B245C;
}

.vf-form{
  gap:11px !important;
}

.vf-input,
.vf-select,
.vf-textarea{
  min-height:36px !important;
  padding:9px 11px !important;
  font-size:12.5px !important;
  border-radius:9px !important;
}

.vf-checkbox{
  padding:9px 11px !important;
  border-radius:10px !important;
}

.vf-info{
  padding:9px 11px !important;
  font-size:11px !important;
  border-radius:10px !important;
}

.vf-actions{
  padding-top:12px !important;
}

.vf-actions .vf-btn,
.vf-btn{
  min-width:150px !important;
  min-height:38px !important;
  padding:9px 24px !important;
  font-size:12px !important;
  border-radius:9px !important;
}

@media (max-width:639px){
  .vf-panel,
  .vf-body,
  .vf-body .vf-card{
    max-height:88vh !important;
  }

  .vf-inner{
    max-height:calc(88vh - 92px) !important;
    padding:14px !important;
  }

  .vf-lang-row,
  .vf-custom-lang-wrap{
    max-width:100% !important;
    width:100% !important;
  }

  .vf-custom-lang-menu{
    max-height:110px !important;
  }
}
@media (min-width:640px){
  .vf-form.two-col{
    grid-template-columns:1fr 1fr;
    column-gap:16px;
    row-gap:13px;
  }
}

@media (max-width:639px){
  .vf-ovl{
    align-items:flex-start;
    padding:10px;
  }

  .vf-panel,
  .vf-body,
  .vf-body .vf-card{
    max-height:90vh !important;
  }

  .vf-card{
    max-height:90vh !important;
  }

  .vf-top{
    padding:14px 16px 13px !important;
  }

  .vf-top-title{
    font-size:16px;
    margin-right:36px;
    color:#ffffff !important;
  }

  .vf-top-subtitle{
    font-size:11.5px;
  }

  .vf-inner{
    padding:15px !important;
    max-height:calc(90vh - 100px) !important;
  }

  .vf-lang-row{
    max-width:100% !important;
  }

  .vf-lang-row select,
  .vf-lang-row .grc-lang-select select{
    width:100% !important;
    max-width:100% !important;
  }

  .vf-checkbox{
    padding:10px 11px;
  }

  .vf-pdf-preview-row{
    align-items:stretch;
    flex-direction:column;
  }

  .vf-pdf-preview-btn{
    width:100%;
  }

  .vf-pdf-frame-wrap{
    height:58vh;
    min-height:300px;
  }

  .vf-otp-wrap{
    flex-direction:column;
  }

  .vf-otp-btn{
    width:100%;
    min-height:40px;
  }

  .vf-actions .vf-btn,
  .vf-btn{
    min-width:145px !important;
    padding:10px 22px;
  }
}
  /* FIX: selected language text visible inside white dropdown box */
.vf-custom-lang-button,
.vf-custom-lang-button *,
.vf-custom-lang-text,
.vf-custom-lang-icon{
  color:#111827 !important;
}

.vf-custom-lang-button{
  background:#ffffff !important;
}

.vf-custom-lang-text{
  display:block !important;
  color:#111827 !important;
  opacity:1 !important;
  visibility:visible !important;
  font-size:12px !important;
  font-weight:500 !important;
  line-height:1.2 !important;
  max-width:135px;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
}

.vf-custom-lang-icon{
  color:#111827 !important;
  opacity:1 !important;
}

/* Keep only label white, not selected value */
.vf-lang-row .vf-custom-lang-label{
  color:#ffffff !important;
}

/* Override old rule that was making all spans white */
.vf-lang-row .vf-custom-lang-button span{
  color:#111827 !important;
}
  /* REMOVE BLURRY / EXTRA BOLD TEXT - CLEAN FONT FIX */

.vf-reset,
.vf-reset *,
.ccf-reset,
.ccf-reset *{
  -webkit-font-smoothing:antialiased !important;
  -moz-osx-font-smoothing:grayscale !important;
  text-rendering:optimizeLegibility !important;
  letter-spacing:0 !important;
  text-shadow:none !important;
}

/* Main header title */
.vf-top-title,
.ccf-title{
  font-weight:600 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Header subtitle */
.vf-top-subtitle,
.ccf-subtitle{
  font-weight:400 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Language label */
.vf-custom-lang-label,
.vf-lang-row label,
.vf-lang-row .grc-lang-label,
.ccf-custom-lang-label,
.ccf-headbar label,
.ccf-headbar .grc-lang-label,
.ccf-headbar .grc-language-label{
  font-weight:500 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Section titles like Your Details / Consent Preview */
.vf-pdf-title,
.vf-consent-notice h3,
.ccf-section-title{
  font-weight:600 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Field labels */
.vf-label,
.ccf-label{
  font-weight:500 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Checkbox labels */
.vf-checkbox .vf-label,
.vf-checkbox-item,
.ccf-check label{
  font-weight:400 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Input text */
.vf-input,
.vf-select,
.vf-textarea,
.ccf-input,
.ccf-select,
.ccf-textarea{
  font-weight:400 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Info / note / description text */
.vf-info,
.vf-pdf-desc,
.vf-note,
.vf-help,
.ccf-section-note,
.ccf-help-inline,
.ccf-banner,
.ccf-footnote,
.ccf-status{
  font-weight:400 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Buttons less heavy */
.vf-btn,
.vf-otp-btn,
.vf-pdf-preview-btn,
.ccf-btn{
  font-weight:600 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Custom language dropdown text */
.vf-custom-lang-text,
.vf-custom-lang-item,
.ccf-custom-lang-text,
.ccf-custom-lang-item{
  font-weight:400 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Required star can stay clear */
.vf-req,
.ccf-req{
  font-weight:600 !important;
  text-shadow:none !important;
}
  /* WEBFORM POPUP HEADER + TITLE HOVER EFFECT */
.vf-top{
  transition:
    background-color .22s ease,
    box-shadow .22s ease,
    filter .22s ease !important;
  cursor: default;
}

.vf-top:hover{
  background:#211b4a !important;
  box-shadow: inset 0 -1px 0 rgba(255,255,255,.14), 0 10px 24px rgba(43,36,92,.22) !important;
  filter: brightness(1.04);
}

.vf-top-title{
  display:block !important;
  width:fit-content !important;
  max-width:100% !important;
  transition:
    transform .22s ease,
    color .22s ease,
    text-shadow .22s ease !important;
  cursor: default;
}

.vf-top-title:hover{
  transform: translateY(-2px);
  color:#ffffff !important;
  text-shadow:0 8px 20px rgba(255,255,255,.28) !important;
}

.vf-top-subtitle{
  display:block !important;
  width:fit-content !important;
  max-width:620px !important;
  transition:
    transform .22s ease,
    color .22s ease,
    text-shadow .22s ease !important;
  cursor: default;
}

.vf-top-subtitle:hover{
  transform: translateY(-2px);
  color:#ffffff !important;
  text-shadow:0 8px 18px rgba(255,255,255,.24) !important;
}

/* When hovering full webform purple header */
.vf-top:hover .vf-top-title{
  transform: translateY(-1px);
  color:#ffffff !important;
  text-shadow:0 8px 20px rgba(255,255,255,.22) !important;
}

.vf-top:hover .vf-top-subtitle{
  color:#ffffff !important;
}
`.trim();

    const style = document.createElement('style');
    style.id = 'vf-styles';
    style.textContent = css;
    document.head.appendChild(style);
    document.body.classList.add('vf-reset');
    if (!document.body.style.backgroundColor) {
      document.body.style.backgroundColor = 'var(--vf-page)';
    }
    console.log('[form-runtime] styles injected');
  }
  /* ---------------- Utils ---------------- */
  const normalizeDomain = (d) => {
    const result = d || '';
    console.log(
      '[form-runtime] normalizeDomain input =',
      d,
      'output =',
      result,
    );
    return result;
  };

 function getRuntimeBase() {
  console.log('[form-runtime] getRuntimeBase called');

  const scriptEl =
    document.getElementById('grc-form-runtime') ||
    document.currentScript ||
    document.querySelector('script[src*="form-runtime.js"]');

  const dataApiBase = scriptEl?.dataset?.apiBase?.trim();

  if (dataApiBase) {
    const result = dataApiBase.replace(/\/+$/, '');

    console.log(
      '[form-runtime] API base resolved from data-api-base =',
      result,
    );

    return result;
  }

  if (!scriptEl?.src) {
    console.error('[form-runtime] Cannot determine API base URL.');
    return null;
  }

  const scriptUrl = new URL(scriptEl.src, window.location.href);
  const pathParts = scriptUrl.pathname.split('/').filter(Boolean);

  pathParts.pop();

  const basePath =
    pathParts.length > 0 ? `/${pathParts.join('/')}` : '';

  const result = `${scriptUrl.origin}${basePath}`;

  console.log(
    '[form-runtime] API base resolved from script URL =',
    result,
  );

  return result;
}

  function getDomainFromScript() {
    console.log('[form-runtime] getDomainFromScript called');
    const el =
      document.currentScript ||
      document.querySelector('script[src*="form-runtime.js"]');
    console.log('[form-runtime] getDomainFromScript scriptEl =', el);
    console.log('[form-runtime] getDomainFromScript dataset =', el?.dataset);
    const result = normalizeDomain(el?.dataset?.domain || '');
    console.log('[form-runtime] getDomainFromScript result =', result);
    return result;
  }

  // formId identifies the logical form; path defaults to the root deployment.
  function getFormLookupFromScript() {
    const el =
      document.currentScript ||
      document.querySelector('script[src*="form-runtime.js"]');
    const rawVersion = String(el?.dataset?.version || '').trim();
    const parsedVersion = rawVersion ? Number(rawVersion) : undefined;

    return {
      formId: String(el?.dataset?.formId || '').trim(),
      path: String(el?.dataset?.path || '').trim(),
      version:
        Number.isInteger(parsedVersion) && parsedVersion > 0
          ? parsedVersion
          : undefined,
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function generateCMPUser() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `cmp-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  }

  function getOrCreateCMPUser() {
    let raw = localStorage.getItem(CMP_USER_ID_STORAGE_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.userId) return parsed.userId;
      } catch {}
    }

    const newId = generateCMPUser();
    localStorage.setItem(
      CMP_USER_ID_STORAGE_KEY,
      JSON.stringify({ userId: newId, metadata: {} }),
    );

    return newId;
  }

  function getHeaderTitle(schema) {
    return (
      schema?.title || schema?.formTitle || schema?.name || 'Web Form Consent'
    );
  }

  function getHeaderSubtitle(schema) {
    return (
      schema?.subtitle ||
      schema?.description ||
      'Please review and provide your consent before submitting this web form.'
    );
  }

  function formHasOtp(schema) {
    if (!schema?.fields) return false;
    return schema.fields.some(
      (f) =>
        f?.otpEnabled === true ||
        f?.otpRequiredForSubmit === true ||
        f?.type === 'otp',
    );
  }

  function isCheckboxListField(field) {
    return (
      field &&
      (field.type === 'checkbox-group' ||
        field.type === 'multiselect' ||
        field.type === 'multi-checkbox' ||
        (field.type === 'checkbox' &&
          Array.isArray(field.options) &&
          field.options.length > 0))
    );
  }

  function getOptionValue(opt, fallback) {
    return typeof opt === 'string'
      ? opt
      : opt?.value ?? opt?.label ?? fallback;
  }

  function getOptionLabel(opt, fallback) {
    return typeof opt === 'string'
      ? opt
      : opt?.label ?? opt?.value ?? fallback;
  }

  function getSubOptions(opt) {
    if (!opt || typeof opt === 'string') return [];
    return Array.isArray(opt.subOptions)
      ? opt.subOptions
      : Array.isArray(opt.children)
        ? opt.children
        : [];
  }

  function collectCheckboxGroupValue(field, formEl) {
    const result = {};
    const options = Array.isArray(field.options) ? field.options : [];

    options.forEach((opt, idx) => {
      const optValue = getOptionValue(opt, `option_${idx}`);
      const optLabel = getOptionLabel(opt, `Option ${idx + 1}`);
      const optKey = String(optValue || optLabel || `option_${idx}`)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
      const optInput = formEl.querySelector(
        `#f_${CSS.escape(field.id)}_${idx}`,
      );
      const subOptions = getSubOptions(opt);
      const subValues = [];

      subOptions.forEach((sub, subIndex) => {
        const subValue = getOptionValue(
          sub,
          `${optValue}_sub_${subIndex + 1}`,
        );
        const subLabel = getOptionLabel(sub, `Sub Option ${subIndex + 1}`);
        const subInput = formEl.querySelector(
          `#f_${CSS.escape(field.id)}_${idx}_${subIndex}`,
        );

        if (subInput?.checked) {
          subValues.push({
            label: subLabel,
            value: subValue,
            selected: true,
          });
        }
      });

      if (optInput?.checked || subValues.length > 0) {
        result[optKey] = {
          label: optLabel,
          value: optValue,
          selected: !!optInput?.checked,
          subOptions: subValues,
        };
      }
    });

    return result;
  }


  /* ---------------- API ---------------- */
  async function fetchConfigByDomain(domain, formId, path, version) {
    console.log(
      '[form-runtime] fetchConfigByDomain called with domain =',
      domain,
    );
    const base = getRuntimeBase();
    if (!base)
      throw new Error('Cannot determine runtime base from script src.');

    const params = new URLSearchParams({ domain });
    if (formId) params.set('formId', formId);
    if (path) params.set('path', path);
    // No version means the backend resolves the active published version.
    if (version) params.set('version', String(version));

    const url = `${base}/internal-webforms?${params.toString()}`;
    console.log('[form-runtime] fetchConfigByDomain url =', url);
    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    console.log(
      '[form-runtime] fetchConfigByDomain response =',
      resp.status,
      resp.statusText,
      'ok=',
      resp.ok,
    );
    if (!resp.ok)
      throw new Error(`Fetch failed ${resp.status} ${resp.statusText}`);
    const data = await resp.json();
    console.log('[form-runtime] fetchConfigByDomain raw data =', data);
    if (Array.isArray(data)) {
      console.log(
        '[form-runtime] fetchConfigByDomain resolved config from array',
      );
      return data[0] || null;
    }
    if (data && data.data && Array.isArray(data.data)) {
      console.log(
        '[form-runtime] fetchConfigByDomain resolved config from data.data array',
      );
      return data.data[0] || null;
    }
    console.log(
      '[form-runtime] fetchConfigByDomain resolved config from object',
    );
    return data || null;
  }

  async function postSubmission({
    configId,
    domain,
    formId,
    values,
    clientSubmissionId,
    submittedAt,
  }) {
    console.log('[form-runtime] postSubmission called with =', {
      configId,
      domain,
      formId,
      values,
      clientSubmissionId,
      submittedAt,
    });
    const base = getRuntimeBase();
    const url = `${base}/internal-webform-submissions`;
    console.log('[form-runtime] postSubmission url =', url);
    const resp = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        configId,
        domain,
        formId,
        values,
        cmpUserId: values?.cmpUser || values?.cmpUserId || undefined,
        consentAccepted: values?.dataSubjectConfirmation === true,
        clientSubmissionId,
        submittedAt,
      }),
    });
    console.log(
      '[form-runtime] postSubmission response =',
      resp.status,
      resp.statusText,
      'ok=',
      resp.ok,
    );
    const body = await resp.json().catch(() => ({}));
    console.log('[form-runtime] postSubmission body =', body);
    if (!resp.ok) {
      const msg =
        body?.message || body?.error || `${resp.status} ${resp.statusText}`;
      throw new Error(msg);
    }
    return body;
  }

  async function requestWebformOtp({ email, configId, domain, formId }) {
    console.log('[form-runtime] requestWebformOtp called with =', {
      email,
      configId,
      domain,
      formId,
    });
    const base = getRuntimeBase();
    const url = `${base}/internal-webform-submissions/request-otp`;
    console.log('[form-runtime] requestWebformOtp url =', url);
    const resp = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email, configId, domain, formId }),
    });
    const body = await resp.json().catch(() => ({}));
    console.log('[form-runtime] requestWebformOtp response =', {
      status: resp.status,
      statusText: resp.statusText,
      ok: resp.ok,
      body,
    });
    if (!resp.ok) {
      const msg =
        body?.message || body?.error || `${resp.status} ${resp.statusText}`;
      throw new Error(msg);
    }
    return body;
  }

  function isEmailLikeField(field) {
    const id = String(field?.id || '').toLowerCase();
    const label = String(field?.label || '').toLowerCase();
    return (
      field?.type === 'email' ||
      id === 'email' ||
      id.includes('email') ||
      label.includes('email')
    );
  }

  function getOtpEmailFieldId(otpField, schema) {
    const configured =
      otpField?.emailFieldId ||
      otpField?.emailField ||
      otpField?.verifyFieldId ||
      schema?.otpEmailFieldId ||
      schema?.emailFieldId;
    if (configured) return String(configured);

    const emailField = (schema?.fields || []).find(isEmailLikeField);
    return emailField?.id ? String(emailField.id) : '';
  }

  function getEmailForOtp(formEl, otpField, schema) {
    const emailFieldId = getOtpEmailFieldId(otpField, schema);
    if (emailFieldId) {
      const el = formEl.querySelector(`#f_${CSS.escape(emailFieldId)}`);
      if (el?.value) return String(el.value).trim();
    }

    const emailEl = formEl.querySelector('input[type="email"]');
    if (emailEl?.value) return String(emailEl.value).trim();

    return '';
  }

  function isValidEmailValue(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  /* ---------------- Consent Notice Renderer ---------------- */
  function renderConsentNotice(ui) {
    const u = ui || VF_UI_DEFAULTS;
    return h('div', { class: 'vf-consent-notice-wrap' }, [
      h('div', { class: 'vf-consent-notice' }, [
        h('h3', {}, u.consentTitle),
        h('p', { html: u.consentP1 }),
        h('p', {}, u.consentP2),
        h('p', {}, u.consentP3),
        h('p', {}, u.consentP4),
        h('p', { html: u.consentP5 }),
      ]),
    ]);
  }

  function isAbsoluteOrRootUrl(url) {
    return (
      /^(https?:|blob:|data:)/i.test(url) || String(url || '').startsWith('/')
    );
  }

  function normalizePdfUrl(rawUrl) {
    const url = String(rawUrl || '').trim();
    if (!url) return '';
    if (isAbsoluteOrRootUrl(url)) return url;
    return resolveSiblingScriptUrl(url);
  }

  function getCheckboxPdfUrl(field) {
    const rawUrl =
      field?.pdfUrl?.previewUrl?.success ||
      field?.pdfUrl?.previewUrl ||
      field?.pdfUrl?.url ||
      field?.pdfUrl ||
      field?.labelLinkPdfUrl ||
      '';

    return normalizePdfUrl(rawUrl);
  }

  function getPdfPreviewUrl(schema) {
    const el = getScriptEl();
    const scriptUrl =
      el?.dataset?.vfPdfUrl ||
      el?.dataset?.pdfUrl ||
      el?.dataset?.consentPdfUrl ||
      '';

    const schemaUrl =
      schema?.pdfPreviewUrl ||
      schema?.consentPdfUrl ||
      schema?.pdfUrl ||
      schema?.documentUrl ||
      '';

    return normalizePdfUrl(scriptUrl || schemaUrl || DEFAULT_PDF_PREVIEW_FILE);
  }

  function addPdfHash(url) {
    if (!url || url.includes('#')) return url;
    return `${url}#toolbar=1&navpanes=0&view=FitH`;
  }

  function shouldRenderPdfPreview(schema) {
    const el = getScriptEl();
    if (
      el?.dataset?.vfPdfPreview === 'false' ||
      el?.dataset?.pdfPreview === 'false'
    ) {
      return false;
    }
    if (schema?.showPdfPreview === false || schema?.pdfPreview === false) {
      return false;
    }
    return !!getPdfPreviewUrl(schema);
  }

  function getPdfPreviewTitle(schema) {
    const ui = getFormUi(schema);
    const el = getScriptEl();
    return (
      el?.dataset?.vfPdfTitle ||
      el?.dataset?.pdfTitle ||
      schema?.pdfPreviewTitle ||
      schema?.pdfTitle ||
      ui.pdfPreviewTitle
    );
  }
  function openPdfPreviewModal(schema, preview = {}) {
    const overridePdfUrl = normalizePdfUrl(preview.pdfUrl || '');

    if (!overridePdfUrl && !shouldRenderPdfPreview(schema)) return;

    injectStyles();

    const previousOverflow = document.body.style.overflow;
    // document.body.style.overflow = 'hidden';

    const ui = getFormUi(schema);
    const pdfUrl = overridePdfUrl || getPdfPreviewUrl(schema);
    const pdfTitle = preview.title || getPdfPreviewTitle(schema);

    const ovl = h('div', { class: 'vf-ovl vf-pdf-ovl' });
    const panel = h('div', { class: 'vf-panel vf-pdf-panel' });

    const head = h('div', { class: 'vf-head' }, [
      h('span', { class: 'vf-head-title' }, pdfTitle),
      h(
        'button',
        {
          type: 'button',
          class: 'vf-close',
          'data-close': '1',
          'aria-label': ui.closeAriaLabel,
        },
        '×',
      ),
    ]);

    const body = h('div', { class: 'vf-pdf-body' }, [
      h('div', { class: 'vf-pdf-frame-wrap' }, [
        h('iframe', {
          class: 'vf-pdf-frame',
          src: addPdfHash(pdfUrl),
          title: pdfTitle,
          loading: 'lazy',
        }),
      ]),
      h('div', { class: 'vf-pdf-actions' }, [
        h(
          'a',
          {
            class: 'vf-pdf-link',
            href: pdfUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          ui.pdfOpenLabel,
        ),
        h('span', { class: 'vf-pdf-note' }, ui.pdfUnavailableNote),
      ]),
    ]);

    panel.append(head, body);
    ovl.appendChild(panel);
    document.body.appendChild(ovl);
    document.body.style.overflow = 'hidden';

    function close() {
      document.body.style.overflow = previousOverflow;
      ovl.remove();
    }

    ovl.addEventListener('click', (e) => {
      if (e.target === ovl || e.target.dataset.close === '1') close();
    });

    window.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') {
        close();
        window.removeEventListener('keydown', onEsc);
      }
    });
  }

  function renderPdfPreviewButton(schema) {
    if (!shouldRenderPdfPreview(schema)) return null;

    const ui = getFormUi(schema);
    const pdfTitle = getPdfPreviewTitle(schema);

    const openPreview = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      openPdfPreviewModal(schema);
    };

    const copy = h(
      'div',
      {
        class: 'vf-pdf-preview-copy',
        role: 'button',
        tabindex: '0',
        'aria-label': `Preview ${pdfTitle}`,
      },
      [
        h('h3', { class: 'vf-pdf-title' }, pdfTitle),
        h('p', { class: 'vf-pdf-desc' }, ui.pdfPreviewDescription),
      ],
    );

    copy.addEventListener('click', openPreview);
    copy.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') openPreview(e);
    });

    const btn = h(
      'button',
      { type: 'button', class: 'vf-pdf-preview-btn' },
      ui.pdfPreviewButtonLabel || 'View Consent Details',
    );

    btn.addEventListener('click', openPreview);

    return h('div', { class: 'vf-pdf-preview-row' }, [copy, btn]);
  }

  /* ---------------- DOM helpers ---------------- */
  function h(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'for') n.htmlFor = v;
      else if (k === 'html') n.innerHTML = v;
      else if (v !== null && v !== undefined) n.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .forEach((c) =>
        typeof c === 'string'
          ? n.appendChild(document.createTextNode(c))
          : n.appendChild(c),
      );
    return n;
  }

  /* ---------------- Renderers ---------------- */
  function renderField(f, schema) {
    console.log('[form-runtime] renderField called for field =', f);
    const ui = getFormUi(schema);
    const id = `f_${f.id}`;

    const labelHtml = `${escapeHtml(f.label || f.id || '')}${
      f.required ? '<span class="vf-req"> *</span>' : ''
    }${
      f.optionalLabel
        ? ` <span class="vf-optional">(${escapeHtml(f.optionalLabel)})</span>`
        : ''
    }`;

    // if (isCheckboxListField(f)) {
    //   const options = Array.isArray(f.options) ? f.options : [];
    //   const wrapper = h('div', { class: 'vf-row' });
    //   const label = h('label', { class: 'vf-label', html: labelHtml });
    //   const group = h('div', { class: 'vf-checkbox-group' });

    //   options.forEach((opt, idx) => {
    //     const optValue =
    //       typeof opt === 'string'
    //         ? opt
    //         : opt?.value ?? opt?.label ?? `option_${idx}`;
    //     const optLabel =
    //       typeof opt === 'string'
    //         ? opt
    //         : opt?.label ?? opt?.value ?? `Option ${idx + 1}`;
    //     const optId = `${id}_${idx}`;

    //     const itemLabel = h('label', { class: 'vf-checkbox-item', for: optId });
    //     const input = h('input', {
    //       id: optId,
    //       type: 'checkbox',
    //       value: optValue,
    //       'data-group-id': f.id,
    //     });
    //     const text = h('span', {}, optLabel);
    //     itemLabel.append(input, text);
    //     group.appendChild(itemLabel);
    //   });

    //   wrapper.append(label, group);
    //   return wrapper;
    // }

    if (isCheckboxListField(f)) {
      const options = Array.isArray(f.options) ? f.options : [];
      const wrapper = h('div', { class: 'vf-row' });
      const group = h('div', { class: 'vf-checkbox-group' });

      options.forEach((opt, idx) => {
        const optValue = getOptionValue(opt, `option_${idx}`);
        const optLabel =
          f.type === 'checkbox-group'
            ? getOptionLabel(opt, f.label || `Option ${idx + 1}`)
            : getOptionLabel(opt, `Option ${idx + 1}`);
        const optId = `${id}_${idx}`;
        const subOptions = getSubOptions(opt);

        const itemLabel = h('label', { class: 'vf-checkbox-item', for: optId });
        const input = h('input', {
          id: optId,
          type: 'checkbox',
          value: optValue,
          'data-group-id': f.id,
        });
        const text = h('span', {}, optLabel);
        itemLabel.append(input, text);
        group.appendChild(itemLabel);

        if (subOptions.length > 0) {
          const subGroup = h('div', { class: 'vf-checkbox-subgroup' });

          subOptions.forEach((sub, subIndex) => {
            const subValue = getOptionValue(
              sub,
              `${optValue}_sub_${subIndex + 1}`,
            );
            const subLabel = getOptionLabel(
              sub,
              `Sub Option ${subIndex + 1}`,
            );
            const subId = `${optId}_${subIndex}`;

            const subItem = h('label', {
              class: 'vf-checkbox-item vf-checkbox-subitem',
              for: subId,
            });
            const subInput = h('input', {
              id: subId,
              type: 'checkbox',
              value: subValue,
              'data-group-id': f.id,
            });
            subItem.append(subInput, h('span', {}, subLabel));
            subGroup.appendChild(subItem);
          });

          group.appendChild(subGroup);
        }
      });

      if (f.type !== 'checkbox-group') {
        wrapper.appendChild(h('label', { class: 'vf-label', html: labelHtml }));
      }
      wrapper.appendChild(group);
      return wrapper;
    }

    if (f.type === 'checkbox') {
      const input = h('input', { id, type: 'checkbox' });

      const label = h('label', {
        for: id,
        class: 'vf-label',
        html: labelHtml,
      });

      const labelWrap = h('div', { class: 'vf-checkbox-label-wrap' }, [label]);

      const labelLinkAction = f.labelLinkAction || 'link';
      const checkboxPdfUrl = getCheckboxPdfUrl(f);

      if (
        f.labelLinkText &&
        ((labelLinkAction === 'popup' && checkboxPdfUrl) ||
          (labelLinkAction !== 'popup' && f.labelLinkUrl))
      ) {
        const link = h(
          'a',
          {
            href: labelLinkAction === 'popup' ? checkboxPdfUrl : f.labelLinkUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'vf-label-link',
          },
          f.labelLinkText,
        );

        link.addEventListener('click', function (e) {
          e.stopPropagation();

          if (labelLinkAction === 'popup') {
            e.preventDefault();

            openPdfPreviewModal(schema, {
              pdfUrl: checkboxPdfUrl,
              title: f.labelLinkText,
            });
          }
        });

        labelWrap.appendChild(document.createTextNode(' '));
        labelWrap.appendChild(link);
      }

      if (
        f.openPopupOnCheckboxClick === true &&
        labelLinkAction === 'popup' &&
        checkboxPdfUrl
      ) {
        input.addEventListener('change', function () {
          if (!input.checked) return;

          openPdfPreviewModal(schema, {
            pdfUrl: checkboxPdfUrl,
            title: f.labelLinkText || getPdfPreviewTitle(schema),
          });
        });
      }

      const checkboxRow = h('div', { class: 'vf-row full' }, [
        h('div', { class: 'vf-checkbox' }, [input, labelWrap]),
      ]);

      return checkboxRow;
    }

    if (f.type === 'otp') {
      const input = h('input', {
        id,
        type: 'text',
        class: 'vf-input',
        placeholder: f.placeholder || ui.otpPlaceholder || 'Enter OTP',
        inputmode: 'numeric',
        autocomplete: 'one-time-code',
        maxlength: String(f.maxLength || 6),
      });

      const sendBtn = h(
        'button',
        { type: 'button', class: 'vf-otp-btn' },
        f.sendLabel || ui.otpSendLabel || 'Send OTP',
      );
      const status = h('div', {
        class: 'vf-otp-status',
        'aria-live': 'polite',
      });

      sendBtn.addEventListener('click', async () => {
        const formEl = sendBtn.closest('form');
        const email = getEmailForOtp(formEl, f, schema);

        status.className = 'vf-otp-status';
        status.textContent = '';

        if (!isValidEmailValue(email)) {
          status.classList.add('error');
          status.textContent =
            ui.otpEmailRequiredMessage ||
            'Please enter a valid email before requesting OTP.';
          return;
        }

        const originalLabel = sendBtn.textContent;
        sendBtn.disabled = true;
        sendBtn.textContent = ui.otpSendingLabel || 'Sending OTP…';

        try {
          const res = await requestWebformOtp({
            email,
            configId: schema?._id,
            domain: schema?.domain,
            formId: schema?.formId,
          });
          status.className = 'vf-otp-status success';
          status.textContent = res?.message || ui.otpSentMessage;
        } catch (err) {
          status.className = 'vf-otp-status error';
          status.textContent = `${
            ui.otpSendFailedPrefix || 'OTP send failed: '
          }${err?.message || err}`;
        } finally {
          sendBtn.disabled = false;
          sendBtn.textContent = originalLabel;
        }
      });

      const label = h('label', { for: id, class: 'vf-label', html: labelHtml });
      return h('div', { class: 'vf-row' }, [
        label,
        h('div', { class: 'vf-otp-wrap' }, [input, sendBtn]),
        status,
      ]);
    }

    let control;
    switch (f.type) {
      case 'text':
      case 'email':
      case 'number':
        control = h('input', {
          id,
          type: f.type === 'number' ? 'number' : f.type,
          class: 'vf-input',
          placeholder: f.placeholder || '',
        });
        break;
      case 'textarea':
        control = h('textarea', {
          id,
          class: 'vf-textarea',
          rows: '4',
          placeholder: f.placeholder || '',
        });
        break;
      case 'select':
        control = h('select', { id, class: 'vf-select' }, [
          h('option', { value: '' }, ui.selectPlaceholder),
          ...(f.options || []).map((opt) => {
            const optValue =
              typeof opt === 'string' ? opt : (opt?.value ?? opt?.label ?? '');
            const optLabel =
              typeof opt === 'string' ? opt : (opt?.label ?? opt?.value ?? '');
            return h('option', { value: optValue }, optLabel);
          }),
        ]);
        break;
      default:
        control = h('input', {
          id,
          type: 'text',
          class: 'vf-input',
          placeholder: f.placeholder || '',
        });
    }

    const label = h('label', { for: id, class: 'vf-label', html: labelHtml });

    let rowClass = 'vf-row';
    if (f.type === 'textarea') rowClass = 'vf-row full';

    const lowerLabel = String(f.label || '').toLowerCase();
    const lowerId = String(f.id || '').toLowerCase();

    if (
      lowerLabel.includes('additional') ||
      lowerLabel.includes('message') ||
      lowerLabel.includes('information') ||
      lowerId.includes('additional') ||
      lowerId.includes('message') ||
      lowerId.includes('info')
    ) {
      rowClass = 'vf-row full';
    }

    if (f.otpEnabled === true || f.otpRequiredForSubmit === true) {
      const otpInputId = `vf_otp_${f.id}`;
      const otpInput = h('input', {
        id: otpInputId,
        type: 'text',
        class: 'vf-input',
        placeholder: ui.otpPlaceholder || 'Enter OTP',
        inputmode: 'numeric',
        autocomplete: 'one-time-code',
        maxlength: '6',
        'data-otp-for': f.id,
      });

      const sendBtn = h(
        'button',
        { type: 'button', class: 'vf-otp-btn' },
        f.sendLabel || ui.otpSendLabel || 'Send OTP',
      );
      const status = h('div', {
        class: 'vf-otp-status',
        'aria-live': 'polite',
      });

      sendBtn.addEventListener('click', async () => {
        const formEl = sendBtn.closest('form');
        const email = isEmailLikeField(f)
          ? String(control?.value || '').trim()
          : getEmailForOtp(formEl, f, schema);

        status.className = 'vf-otp-status';
        status.textContent = '';

        if (!isValidEmailValue(email)) {
          status.classList.add('error');
          status.textContent =
            ui.otpEmailRequiredMessage ||
            'Please enter a valid email before requesting OTP.';
          return;
        }

        const originalLabel = sendBtn.textContent;
        sendBtn.disabled = true;
        sendBtn.textContent = ui.otpSendingLabel || 'Sending OTP…';

        try {
          const res = await requestWebformOtp({
            email,
            configId: schema?._id,
            domain: schema?.domain,
            formId: schema?.formId,
          });
          status.className = 'vf-otp-status success';
          status.textContent = res?.message || ui.otpSentMessage;
        } catch (err) {
          status.className = 'vf-otp-status error';
          status.textContent = `${
            ui.otpSendFailedPrefix || 'OTP send failed: '
          }${err?.message || err}`;
        } finally {
          sendBtn.disabled = false;
          sendBtn.textContent = originalLabel;
        }
      });

      return h('div', { class: rowClass }, [
        label,
        h('div', { class: 'vf-otp-wrap' }, [control, sendBtn]),
        h(
          'label',
          { for: otpInputId, class: 'vf-label' },
          ui.otpLabel || 'Email OTP',
        ),
        otpInput,
        status,
      ]);
    }

    return h('div', { class: rowClass }, [label, control]);
  }

  function renderContents(contents) {
    console.log('[form-runtime] renderContents called with =', contents);
    if (!Array.isArray(contents) || contents.length === 0) return null;

    const wrap = h('div', { class: 'vf-row full' });
    contents.forEach((c) => {
      wrap.appendChild(h('div', { class: 'vf-info' }, c?.text || ''));
    });
    return wrap;
  }

  function appendAutoInfoFields(schema, form) {
    const ui = getFormUi(schema);
    const domainValue = schema?.domain || '';
    const cmpUser = getOrCreateCMPUser();

    // const serviceConsentText =
    //   'I hereby consent to the collection and processing of my personal data for accessing GRC³ services, product demos, account setup, onboarding, support, compliance communication, and related services in the manner described in the Privacy Policy.';

    // const marketingConsentText =
    //   'I hereby consent to the processing of my personal data for receiving personalized offers, product updates, newsletters, event invitations, and marketing communications from GRC³ through Call, SMS, WhatsApp, Email, or other communication channels in the manner described in the Privacy Policy.';

    const cmpRow = h('div', { class: 'vf-row' }, [
      h('label', {
        class: 'vf-label',
        html: `${escapeHtml(
          ui.labelCmpUserId,
        )} <span class="vf-optional">(${escapeHtml(
          ui.cmpUserIdOptional,
        )})</span>`,
      }),
      h('input', {
        id: 'vf_cmp_user',
        class: 'vf-input',
        type: 'text',
        value: cmpUser,
        readonly: 'readonly',
        placeholder: ui.cmpUserIdPlaceholder,
      }),
    ]);

    const domainRow = h('div', { class: 'vf-row' }, [
      h('label', {
        class: 'vf-label',
        html: `${escapeHtml(
          ui.labelDomainName,
        )} <span class="vf-optional">(${escapeHtml(ui.domainOptional)})</span>`,
      }),
      h('input', {
        id: 'vf_domain_name',
        class: 'vf-input',
        type: 'text',
        value: domainValue,
        readonly: 'readonly',
        placeholder: ui.domainPlaceholder,
      }),
    ]);

    // const serviceCheckbox = h('input', {
    //   id: 'vf_service_consent',
    //   type: 'checkbox',
    // });

    // const marketingCheckbox = h('input', {
    //   id: 'vf_marketing_consent',
    //   type: 'checkbox',
    // });

    // marketingCheckbox.addEventListener('change', function () {
    //   if (this.checked) {
    //     openPdfPreviewModal(schema);
    //   }
    // });

    // const consentRow = h('div', { class: 'vf-row full' }, [
    //   h('div', { class: 'vf-checkbox-group' }, [
    //     // h('label', { class: 'vf-checkbox-item', for: 'vf_service_consent' }, [
    //     //   serviceCheckbox,
    //     //   h('span', {}, serviceConsentText),
    //     // ]),
    //     h('label', { class: 'vf-checkbox-item', for: 'vf_marketing_consent' }, [
    //       marketingCheckbox,
    //       h('span', {}, marketingConsentText),
    //     ]),
    //   ]),
    // ]);

    const infoRow = h('div', { class: 'vf-row full' }, [
      h('div', { class: 'vf-info' }, ui.infoNote),
    ]);

    /*
     * Removed direct DPDPA Consent Form Preview card from form UI.
     * PDF will open only when second checkbox is clicked.
     */
    form.append(infoRow, cmpRow, domainRow);
  }

  /* ---------------- Collect + Validate ---------------- */
  function collectValues(schema, formEl) {
    console.log('[form-runtime] collectValues called with schema =', schema);
    const values = {};
    const missing = [];

    (schema.fields || []).forEach((f) => {
      if (isCheckboxListField(f)) {
        const selected = Array.from(
          formEl.querySelectorAll(
            `input[data-group-id="${CSS.escape(f.id)}"]:checked`,
          ),
        ).map((el) => el.value);

        if (f.required && selected.length === 0) {
          missing.push(f.label || f.id);
        }

        values[f.id] = selected;
        return;
      }

      const el = formEl.querySelector(`#f_${CSS.escape(f.id)}`);
      let v = undefined;

      if (!el) {
        console.warn(
          '[form-runtime] collectValues missing DOM element for field =',
          f,
        );
        if (f.required) missing.push(f.label || f.id);
        return;
      }

      if (f.type === 'checkbox') {
        v = !!el.checked;
        if (f.required && v !== true) missing.push(f.label || f.id);
      } else if (f.type === 'number') {
        const raw = el.value;
        if (f.required && (!raw || String(raw).trim() === '')) {
          missing.push(f.label || f.id);
        }
        const n = Number(raw);
        v = raw === '' ? '' : Number.isFinite(n) ? n : raw;
      } else {
        v = el.value ?? '';
        if (f.required && String(v).trim() === '') {
          missing.push(f.label || f.id);
        }
      }

      if (v !== undefined || f.type === 'checkbox') {
        values[f.id] = v;
      }
    });

    const otpEnabledFields = (schema.fields || []).filter(
      (f) => f.otpEnabled === true || f.otpRequiredForSubmit === true,
    );

    otpEnabledFields.forEach((f) => {
      const otpEl = formEl.querySelector(`#vf_otp_${CSS.escape(f.id)}`);
      const otpValue = otpEl?.value ? String(otpEl.value).trim() : '';

      if (otpValue) {
        values.otp = otpValue;
        values.emailOtp = otpValue;
      }

      if (f.otpRequiredForSubmit === true && !otpValue) {
        missing.push(getFormUi(schema).otpLabel || 'Email OTP');
      }
    });

    // const confirmEl = formEl.querySelector('#vf_data_subject_confirm');
    // if (confirmEl) {
    //   values.dataSubjectConfirmation = !!confirmEl.checked;
    //   if (!confirmEl.checked) {
    //     missing.push(getFormUi(schema).missingConfirmLabel);
    //   }
    // }

    const serviceConsentEl = formEl.querySelector('#vf_service_consent');
    const marketingConsentEl = formEl.querySelector('#vf_marketing_consent');

    const serviceConsentText =
      'I hereby consent to the collection and processing of my personal data for accessing GRC³ services, product demos, account setup, onboarding, support, compliance communication, and related services in the manner described in the Privacy Policy.';

    const marketingConsentText =
      'I hereby consent to the processing of my personal data for receiving personalized offers, product updates, newsletters, event invitations, and marketing communications from GRC³ through Call, SMS, WhatsApp, Email, or other communication channels in the manner described in the Privacy Policy.';

    if (serviceConsentEl || marketingConsentEl) {
      const serviceConsentChecked = !!serviceConsentEl?.checked;
      const marketingConsentChecked = !!marketingConsentEl?.checked;

      values.serviceConsentAccepted = serviceConsentChecked;
      values.marketingConsentAccepted = marketingConsentChecked;

      values.serviceConsentText = serviceConsentText;
      values.marketingConsentText = marketingConsentText;

      // Temporary: allow submit even if last marketing checkbox is unchecked.
      values.dataSubjectConfirmation = true;

      // Temporary: do not block submit for service/marketing consent.
      // if (serviceConsentEl && !serviceConsentChecked) {
      //   missing.push('Service consent');
      // }

      // if (marketingConsentEl && !marketingConsentChecked) {
      //   missing.push('Marketing consent');
      // }

      // this is commmented out cause validation error coming in checkbox for testing
      // Keep this old key because postSubmission uses it for consentAccepted.
      // values.dataSubjectConfirmation =
      //   serviceConsentChecked && marketingConsentChecked;

      // if (!serviceConsentChecked) {
      //   missing.push('Service consent');
      // }

      // if (!marketingConsentChecked) {
      //   missing.push('Marketing consent');
      // }
    }
    const cmpUserEl = formEl.querySelector('#vf_cmp_user');
    if (cmpUserEl) {
      values.cmpUser = cmpUserEl.value || '';
    }

    const domainEl = formEl.querySelector('#vf_domain_name');
    if (domainEl) {
      values.domainName = domainEl.value || '';
    }

    console.log('[form-runtime] collectValues result values =', values);
    console.log('[form-runtime] collectValues result missing =', missing);
    return { values, missing };
  }

  /* ---------------- Card builder (with submit logic) ---------------- */
  function buildFormCard(schema) {
    console.log('[form-runtime] buildFormCard called with schema =', schema);
    const ui = getFormUi(schema);

    const topChildren = [
      h('h2', { class: 'vf-top-title' }, getHeaderTitle(schema)),
      h('p', { class: 'vf-top-subtitle' }, getHeaderSubtitle(schema)),
    ];

    const langPicker = buildLanguageSelect(schema, async function (code) {
      translateFormRequestId += 1;
      const reqId = translateFormRequestId;
      activeLanguage = code || SOURCE_LANG;
      persistLanguage(activeLanguage);

      const base = attachFormUi(
        JSON.parse(JSON.stringify(baseFormSchema)),
        VF_UI_DEFAULTS,
      );
      const baseUi = getFormUi(base);

      if (!isTranslationEnabled() || activeLanguage === SOURCE_LANG) {
        mergedFormSchema = base;
      } else {
        try {
          const payloadKey = `${SOURCE_LANG}|${activeLanguage}|${buildFormTranslationPayload(
            base,
            baseUi,
          ).texts.join('\u241F')}`;
          if (formTranslationCache[payloadKey]) {
            mergedFormSchema = formTranslationCache[payloadKey];
          } else {
            const translated = await translateFormSchema(
              base,
              baseUi,
              activeLanguage,
              SOURCE_LANG,
            );
            formTranslationCache[payloadKey] = translated;
            mergedFormSchema = translated;
          }
        } catch (err) {
          console.error('[form-runtime] Translation failed', err);
          mergedFormSchema = base;
        }
      }

      if (reqId !== translateFormRequestId) return;
      remountFormUI();
    });
    console.log(schema);
    if (langPicker) {
      const langWrap = h('div', { class: 'vf-lang-row' });
      langWrap.appendChild(langPicker);

      const but = h(
        'button',
        {
          type: 'button',
          class: 'vf-close',
          'data-close': '1',
          'aria-label': ui.closeAriaLabel || ui._vfUi.closeAriaLabel || 'close',
          style: `
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 10;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 50%;
      background: #f1f1f1;
      color: #333;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    `,
        },
        '×',
      );
      topChildren.push(but);

      topChildren.push(langWrap);
    }

    const top = h('div', { class: 'vf-top' }, topChildren);

    const formChildren = (schema.fields || []).map((field) =>
      renderField(field, schema),
    );
    const extra = renderContents(schema.contents || []);

    const form = h('form', { class: 'vf-form two-col' }, formChildren);
    if (extra) form.appendChild(extra);

    appendAutoInfoFields(schema, form);

    const help = h('div', { class: 'vf-help', 'aria-live': 'polite' });
    const submit = h(
      'button',
      { type: 'button', class: 'vf-btn' },
      ui.submitLabel,
    );

    submit.addEventListener('click', async () => {
      console.log('[form-runtime] submit clicked');
      help.className = 'vf-help';
      help.textContent = '';

      const { values, missing } = collectValues(schema, form);
      if (missing.length) {
        console.warn(
          '[form-runtime] submit blocked, missing fields =',
          missing,
        );
        help.classList.add('error');
        help.textContent = `${ui.pleaseFillPrefix}${missing.join(', ')}`;
        return;
      }

      submit.disabled = true;
      help.textContent = ui.submittingLabel;

      const clientSubmissionId = generateUUID();
      const submittedAt = new Date().toISOString();

      // ===== OFFLINE HANDLING =====
      // If browser is offline AND form does NOT require OTP → queue it
      if (!navigator.onLine && !formHasOtp(schema)) {
        try {
          const offlinePayload = {
            configId: schema._id,
            domain: schema.domain,
            formId: schema.formId,
            values,
            cmpUserId: values?.cmpUser || values?.cmpUserId || undefined,
            consentAccepted: values?.dataSubjectConfirmation === true,
            clientSubmissionId,
            submittedAt,
          };

          await queueOfflineSubmission(offlinePayload);

          help.className = 'vf-help success';
          help.textContent =
            "You are offline. Your consent will be submitted automatically when you're back online.";

          receiptBtn.style.display = 'none';
          receiptBtn.onclick = null;

          // Clear form
          (schema.fields || []).forEach((f) => {
            if (isCheckboxListField(f)) {
              form
                .querySelectorAll(`input[data-group-id="${CSS.escape(f.id)}"]`)
                .forEach((el) => (el.checked = false));
              return;
            }
            const el = form.querySelector(`#f_${CSS.escape(f.id)}`);
            if (!el) return;
            if (f.type === 'checkbox') el.checked = false;
            else el.value = '';
          });

          submit.disabled = false;
          return;
        } catch (queueErr) {
          console.error('[form-runtime] offline queue failed', queueErr);
          help.className = 'vf-help error';
          help.textContent = 'Failed to save offline. Please try again.';
          submit.disabled = false;
          return;
        }
      }

      // If offline AND form requires OTP → block with error
      if (!navigator.onLine && formHasOtp(schema)) {
        help.className = 'vf-help error';
        help.textContent =
          'You are offline. OTP verification requires an internet connection.';
        submit.disabled = false;
        return;
      }

      // Otherwise → normal online submit
     try {
  const res = await postSubmission({
    configId: schema._id,
    domain: schema.domain,
    formId: schema.formId,
    values,
    clientSubmissionId,
    submittedAt,
  });
  console.log('[form-runtime] submit success response =', res);
  help.className = 'vf-help success';
  const isPendingEmailConfirmation =
    res?.consentStatus === 'PENDING_EMAIL_CONFIRMATION' ||
    res?.emailConfirmationStatus === 'PENDING';

  help.textContent = isPendingEmailConfirmation
    ? 'Your consent request has been submitted. Please confirm your consent through the link sent to your email.'
    : ui.successMessage;

  const _wfReceiptId =
    res?._id || res?.submissionId || res?.id || clientSubmissionId;
  const isActiveConsent =
    res?.consentStatus === 'ACTIVE' || res?.consentStatus === 'active';

  if (_wfReceiptId && isActiveConsent) {
    try {
      localStorage.setItem('grc_last_receipt_webform', _wfReceiptId);
    } catch (e) {}
    receiptBtn.style.display = '';
    receiptBtn.onclick = function () {
      const base = getRuntimeBase();
      const a = document.createElement('a');
      a.href = `${base}/consent-receipt/${_wfReceiptId}?type=webform`;
      a.download = `consent-receipt-${_wfReceiptId}.pdf`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
  } else {
    receiptBtn.style.display = 'none';
    receiptBtn.onclick = null;
  }

  (schema.fields || []).forEach((f) => {
    if (isCheckboxListField(f)) {
      form
        .querySelectorAll(`input[data-group-id="${CSS.escape(f.id)}"]`)
        .forEach((el) => {
          el.checked = false;
        });
      return;
    }

    const el = form.querySelector(`#f_${CSS.escape(f.id)}`);
    if (!el) return;
    if (f.type === 'checkbox') el.checked = false;
    else el.value = '';
  });

  const serviceConsentEl = form.querySelector('#vf_service_consent');
  const marketingConsentEl = form.querySelector('#vf_marketing_consent');

  if (serviceConsentEl) serviceConsentEl.checked = false;
  if (marketingConsentEl) marketingConsentEl.checked = false;
  
  submit.disabled = false;
} catch (err) {
  console.error('[form-runtime] submit failed', err);
  
  const errorMessage = err?.message || 'Something went wrong';
  const errorTitle = err?.errorTitle;
  
  help.className = 'vf-help error';
  
  // Show clean DPDP message for compliance errors, generic prefix for others
  if (errorTitle) {
    help.textContent = errorMessage;
  } else {
    help.textContent = `${ui.submitFailedPrefix}${errorMessage}`;
  }
  
  submit.disabled = false;
}
    });

    const receiptBtn = h(
      'button',
      {
        type: 'button',
        class: 'vf-btn vf-receipt-btn',
        style:
          'display:none;background:#fff;color:#2B245C;border:1px solid #2B245C;box-shadow:none;',
      },
      '⬇ Download Receipt',
    );

    const btnRow = h(
      'div',
      {
        style:
          'display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;',
      },
      [submit, receiptBtn],
    );

    const actions = h('div', { class: 'vf-actions' }, [btnRow, help]);

    // Consent notice is intentionally hidden/commented out from the form UI.
    // const consentNoticeWrap = renderConsentNotice(ui);

    const inner = h('div', { class: 'vf-inner' }, [
      form,
      actions,
      // consentNoticeWrap,
    ]);

    const card = h('div', { class: 'vf-card' });
    card.append(top, inner);

    console.log('[form-runtime] buildFormCard complete');
    return card;
  }

  /* ---------------- Modal ---------------- */
  function openModalWith(card, schema) {
    console.log('[form-runtime] openModalWith called');
    const ui = getFormUi(schema || mergedFormSchema || {});
    console.log(ui);
    const ovl = h('div', { class: 'vf-ovl' });
    const panel = h('div', { class: 'vf-panel' });

    const head = h('div', { class: 'vf-head' }, [
      // h('span', { class: 'vf-head-title' }, ui.modalTitle),
      // h(
      //   'button',
      //   {
      //     type: 'button',
      //     class: 'vf-close',
      //     'data-close': '1',
      //     'aria-label': ui.closeAriaLabel,
      //   },
      //   '×',
      // ),
    ]);

    const body = h('div', { class: 'vf-body' }, [card]);

    panel.append(head, body);
    ovl.append(panel);
    document.body.appendChild(ovl);
    document.body.style.overflow = 'hidden';
    console.log('[form-runtime] modal appended to body');

    function close() {
      console.log('[form-runtime] modal close called');
      document.body.style.overflow = '';
      ovl.remove();
    }

    ovl.addEventListener('click', (e) => {
      if (e.target === ovl || e.target.dataset.close === '1') close();
    });

    window.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') {
        close();
        window.removeEventListener('keydown', onEsc);
      }
    });

    setTimeout(() => {
      const first = ovl.querySelector('input, select, textarea, button');
      if (first) first.focus();
      console.log('[form-runtime] modal first focus target =', first);
    }, 0);
  }

  /* ---------------- Binding / Mounting ---------------- */
  function mountInline(formId, schema) {
    console.log('[form-runtime] mountInline called with formId =', formId);
    const host = document.getElementById(formId);
    console.log('[form-runtime] mountInline host =', host);
    if (!host) {
      console.warn(
        `[form-runtime] Inline host with id="${formId}" not found. Skipping render.`,
      );
      return;
    }
    injectStyles();
    host.innerHTML = '';
    const card = buildFormCard(schema);
    host.appendChild(card);
    console.log('[form-runtime] inline form appended');
  }

  function bindModalById(formId, schema) {
    console.log('[form-runtime] bindModalById called with formId =', formId);
    const attach = (el) => {
      console.log('[form-runtime] bindModalById attach called with el =', el);
      if (!el || el.__vfBound) {
        console.log(
          '[form-runtime] bindModalById attach skipped; el missing or already bound',
        );
        return;
      }
      el.addEventListener('click', (e) => {
        console.log('[form-runtime] modal trigger clicked');
        e.preventDefault();
        injectStyles();
        const live = mergedFormSchema || schema;
        const card = buildFormCard(live);
        openModalWith(card, live);
      });
      el.__vfBound = true;
      console.log('[form-runtime] modal trigger bound');
    };

    const el = document.getElementById(formId);
    console.log('[form-runtime] initial modal trigger lookup =', el);
    if (el) attach(el);

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!(n instanceof Element)) continue;
          if (n.id === formId) {
            console.log('[form-runtime] found modal trigger via mutation =', n);
            attach(n);
          } else if (n.querySelector) {
            const cand = n.querySelector(`#${CSS.escape(formId)}`);
            if (cand) {
              console.log(
                '[form-runtime] found nested modal trigger via mutation =',
                cand,
              );
              attach(cand);
            }
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    console.log('[form-runtime] mutation observer started');
  }

  /* ---------------- Boot ---------------- */
  async function initFormRuntime() {
    console.log('[form-runtime] init start');
    try {
      console.log('[form-runtime] document.readyState =', document.readyState);
      console.log(
        '[form-runtime] document.currentScript =',
        document.currentScript,
      );

      const scriptEl =
        document.currentScript ||
        document.querySelector('script[src*="form-runtime.js"]');

      console.log('[form-runtime] resolved scriptEl =', scriptEl);

      if (scriptEl) {
        console.log('[form-runtime] script src =', scriptEl.src);
        console.log('[form-runtime] script dataset =', { ...scriptEl.dataset });
      } else {
        console.warn('[form-runtime] script element not found');
      }

      const domain = getDomainFromScript();
      const { formId, path, version } = getFormLookupFromScript();
      console.log('[form-runtime] resolved domain =', domain);
      console.log('[form-runtime] resolved form lookup =', {
        formId,
        path,
        version,
      });

      if (!domain) {
        console.warn('[form-runtime] No data-domain provided on script tag.');
        return;
      }

      try {
        await ensureSharedTranslationService();
      } catch (loadErr) {
        console.warn('[form-runtime] Translation service load failed', loadErr);
      }

      const cfg = await fetchConfigByDomain(
        domain,
        formId,
        path,
        version,
      );
      console.log('[form-runtime] fetched config =', cfg);

      if (!cfg || !Array.isArray(cfg.fields)) {
        console.warn('[form-runtime] No config found for domain:', domain, cfg);
        return;
      }

      activeLanguage = readStoredLanguage();
      const langs = getLanguageOptions();
      if (!langs.some((l) => l.code === activeLanguage)) {
        activeLanguage = SOURCE_LANG;
      }

      baseFormSchema = attachFormUi(cfg, VF_UI_DEFAULTS);
      let schema = baseFormSchema;
      const baseUi = getFormUi(schema);

      if (isTranslationEnabled() && activeLanguage !== SOURCE_LANG) {
        try {
          const payloadKey = `${SOURCE_LANG}|${activeLanguage}|${buildFormTranslationPayload(
            schema,
            baseUi,
          ).texts.join('\u241F')}`;
          if (formTranslationCache[payloadKey]) {
            schema = formTranslationCache[payloadKey];
          } else {
            schema = await translateFormSchema(
              schema,
              baseUi,
              activeLanguage,
              SOURCE_LANG,
            );
            formTranslationCache[payloadKey] = schema;
          }
        } catch (e) {
          console.error('[form-runtime] Initial translation failed', e);
        }
      }

      mergedFormSchema = schema;
      currentFormId = cfg.formId;
      currentShowModal = !!cfg.showModal;

      console.log('[form-runtime] cfg.showModal =', cfg.showModal);
      console.log('[form-runtime] cfg.formId =', cfg.formId);
      console.log('[form-runtime] cfg.fields =', cfg.fields);

      if (cfg.showModal) {
        console.log('[form-runtime] entering modal mode');
        bindModalById(cfg.formId, schema);
      } else {
        console.log('[form-runtime] entering inline mode');
        mountInline(cfg.formId, schema);
      }

      console.log('[form-runtime] init complete');
    } catch (err) {
      console.error('[form-runtime] Failed to initialize:', err);
    }
  }

  if (document.readyState === 'loading') {
    console.log('[form-runtime] waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', async () => {
      console.log('[form-runtime] DOMContentLoaded fired');
      await initFormRuntime();
    });
  } else {
    console.log('[form-runtime] DOM already ready, initializing immediately');
    initFormRuntime();
  }
})();
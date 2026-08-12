(function () {
  console.log('[dsar-runtime] simple upgraded file evaluated');

  const DSAR_CONTAINER_ID = 'dsar-widget';
  const CMP_USER_ID_STORAGE_KEY = 'cmp_user';
  // OTP State Management
  let otpVerified = false;
  let otpRequested = false;
  let resendCooldown = false;
  let resendInterval = null;

  const RUNTIME_SCRIPT =
    document.currentScript ||
    document.querySelector('script[src*="dsar-runtime.js"]');

  const DEFAULT_CONFIG = {
    showModal: true,
    title: 'Data Privacy Request',
    subtitle:
      'Submit your request to access, delete, correct, or manage your personal data.',
    submitLabel: 'Submit Request',
    // floatingButtonLabel: 'Privacy Request',
  };

  const SOURCE_LANG = 'en';
  const DSAR_LANG_STORAGE_KEY = 'dsar_ui_lang';
  const SHARED_TRANSLATION_SCRIPT = 'translation-service.js';

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

  const FORM_UI_DEFAULTS = {
    modalHeadTitle: 'Privacy Request Form',
    labelFirstName: 'First Name',
    placeholderFirstName: 'Enter your first name',
    labelLastName: 'Last Name',
    placeholderLastName: 'Enter your last name',
    labelFullName: 'Full Name',
    placeholderFullName: 'Enter your full name',
    placeholderFullName: 'Enter your full name',
    labelEmail: 'Email Address',
    placeholderEmail: 'you@example.com',
    labelCountry: 'Country',
    placeholderCountry: 'Enter your country',
    labelRequestTypes: 'Request Type(s)',
    requestTypeAccess: 'Access My Data',
    requestTypeDelete: 'Delete My Data',
    requestTypeCorrect: 'Correct My Data',
    requestTypeRestrict: 'Restrict Processing',
    requestTypeOptOut: 'Opt-Out of Marketing',
    labelNotes: 'Additional Information',
    optionalSuffix: '(Optional)',
    placeholderNotes: 'Provide any relevant information...',
    labelCmpUserId: 'CMP User ID',
    placeholderCmpUserId: 'CMP user ID',
    labelOtp: 'Email Verification OTP',
    placeholderOtp: 'Enter OTP sent to your email',
    sendOtpLabel: 'Send OTP',
    verifyOtpLabel: 'Verify OTP',
    resendOtpLabel: 'Resend OTP',
    sendingOtpLabel: 'Sending...',
    verifyingOtpLabel: 'Verifying...',
    verifiedOtpLabel: 'Verified',
    confirmAuthText:
      'I confirm that I am the data subject or an authorized agent submitting this request.',
    trustNote:
      'Your information will only be used to process this privacy request securely.',
    labelValidEmail: 'Valid Email Address',
    labelConfirmation: 'Confirmation',
    submittingLabel: 'Submitting...',
    pleaseFillPrefix: 'Please fill: ',
    submitFailedPrefix: 'Submit failed: ',
    successDefault: 'Thanks! Your DSAR request was received successfully.',
    labelLanguage: 'Language',
    closeAriaLabel: 'Close',
    otpInvalidEmail: 'Please enter a valid email address.',
    otpWaitMsg: 'Please wait before requesting another OTP.',
    otpSentPrefix: 'OTP has been sent to',
    otpEnterMsg: 'Please enter OTP.',
    otpRequestFirst: 'Please request OTP before submission.',
    otpVerifyFirst: 'Please verify OTP before submission.',
  };

  const FORM_STRING_KEYS = [
    'title',
    'subtitle',
    'submitLabel',
    'floatingButtonLabel',
    'modalHeadTitle',
    'labelFirstName',
    'placeholderFirstName',
    'labelLastName',
    'placeholderLastName',
    'labelFullName',
    'placeholderFullName',
    'labelEmail',
    'placeholderEmail',
    'labelCountry',
    'placeholderCountry',
    'labelRequestTypes',
    'requestTypeAccess',
    'requestTypeDelete',
    'requestTypeCorrect',
    'requestTypeRestrict',
    'requestTypeOptOut',
    'labelNotes',
    'optionalSuffix',
    'placeholderNotes',
    'labelCmpUserId',
    'placeholderCmpUserId',
    'labelOtp',
    'placeholderOtp',
    'sendOtpLabel',
    'verifyOtpLabel',
    'resendOtpLabel',
    'confirmAuthText',
    'trustNote',
    'labelValidEmail',
    'labelConfirmation',
    'submittingLabel',
    'pleaseFillPrefix',
    'submitFailedPrefix',
    'successDefault',
    'labelLanguage',
    'closeAriaLabel',
    'otpInvalidEmail',
    'otpWaitMsg',
    'otpSentPrefix',
    'otpEnterMsg',
    'otpRequestFirst',
    'otpVerifyFirst',
  ];

  let activeLanguage = SOURCE_LANG;
  let formTranslationCache = {};
  let mergedFormConfig = null;
  let translateFormRequestId = 0;
  let runtimeDomain = '';

  // ===================== OFFLINE SYNC / IDEMPOTENCY =====================
  // ===================== OFFLINE SYNC / IDEMPOTENCY =====================
  const DSAR_DB_NAME = 'grc_offline_consent_db';
  const DSAR_STORE_NAME = 'offlineSubmissions';
  const DSAR_FORM_TYPE = 'dsar';
  const DSAR_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  let dsarIsSyncing = false;

  function dsarGenerateUUID() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function dsarOpenDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DSAR_DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DSAR_STORE_NAME)) {
          const store = db.createObjectStore(DSAR_STORE_NAME, {
            keyPath: 'clientSubmissionId',
          });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function dsarQueueOfflineSubmission(payload) {
    const db = await dsarOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DSAR_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DSAR_STORE_NAME);
      const req = store.put({
        clientSubmissionId: payload.clientSubmissionId,
        formType: DSAR_FORM_TYPE,
        payload,
        createdAt: Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function dsarGetAllOfflineSubmissions() {
    const db = await dsarOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DSAR_STORE_NAME, 'readonly');
      const store = tx.objectStore(DSAR_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = (e) => {
        const all = e.target.result || [];
        resolve(all.filter((r) => r.formType === DSAR_FORM_TYPE));
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function dsarDeleteOfflineSubmission(clientSubmissionId) {
    const db = await dsarOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DSAR_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DSAR_STORE_NAME);
      const req = store.delete(clientSubmissionId);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function dsarCleanupExpired() {
    const db = await dsarOpenDb();
    return new Promise((resolve) => {
      const tx = db.transaction(DSAR_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DSAR_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = (e) => {
        const now = Date.now();
        (e.target.result || []).forEach((r) => {
          if (
            r.formType === DSAR_FORM_TYPE &&
            now - r.createdAt > DSAR_EXPIRY_MS
          ) {
            store.delete(r.clientSubmissionId);
          }
        });
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

  async function dsarSyncOfflineQueue() {
    if (dsarIsSyncing) return;
    dsarIsSyncing = true;

    try {
      const records = await dsarGetAllOfflineSubmissions();
      for (const record of records) {
        try {
          await postSubmission(record.payload);
          await dsarDeleteOfflineSubmission(record.clientSubmissionId);
          console.log(
            '[dsar-runtime] offline sync success:',
            record.clientSubmissionId,
          );
        } catch (err) {
          const status = err?.status || err?.statusCode || 0;
          if (status >= 400 && status < 500) {
            await dsarDeleteOfflineSubmission(record.clientSubmissionId);
            console.warn(
              '[dsar-runtime] offline sync permanent error, removed:',
              record.clientSubmissionId,
              err?.message,
            );
          } else {
            console.warn(
              '[dsar-runtime] offline sync temp error, will retry:',
              record.clientSubmissionId,
              err?.message,
            );
          }
        }
      }
    } finally {
      dsarIsSyncing = false;
    }
  }

  window.addEventListener('online', dsarSyncOfflineQueue);
  dsarCleanupExpired();
  dsarSyncOfflineQueue();
  // ===================== END =====================

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
        if (
          existing.readyState === 'complete' ||
          existing.readyState === 'loaded'
        ) {
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

  function mergeFormConfig(base) {
    return {
      ...FORM_UI_DEFAULTS,
      ...DEFAULT_CONFIG,
      ...base,
    };
  }

  function buildFormPayload(cfg) {
    return FORM_STRING_KEYS.map((k) =>
      typeof cfg[k] === 'string' ? cfg[k] : '',
    );
  }

  function applyFormStringTranslations(baseCfg, translatedArr) {
    const svc = window.GRCTranslationService;
    const next = { ...baseCfg };
    FORM_STRING_KEYS.forEach((k, i) => {
      const orig = baseCfg[k] || '';
      next[k] = svc?.sanitizeTranslatedText
        ? svc.sanitizeTranslatedText(translatedArr[i], orig)
        : translatedArr[i] || orig;
    });
    return next;
  }

  function isTranslationEnabled() {
    const el = getScriptEl();
    if (el?.dataset?.dsarTranslate === 'false') return false;
    return true;
  }

  function getLanguageOptions() {
    const el = getScriptEl();
    const raw = el?.dataset?.dsarLanguages;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (e) {
        console.warn('[dsar-runtime] Invalid data-dsar-languages JSON', e);
      }
    }
    return (
      window.GRCTranslationService?.DEFAULT_LANGUAGES || FALLBACK_LANGUAGES
    );
  }

  function readStoredLanguage() {
    try {
      const v = localStorage.getItem(DSAR_LANG_STORAGE_KEY);
      if (v && typeof v === 'string') return v;
    } catch (e) {
      /* ignore */
    }
    return SOURCE_LANG;
  }

  function persistLanguage(code) {
    try {
      localStorage.setItem(DSAR_LANG_STORAGE_KEY, code);
    } catch (e) {
      /* ignore */
    }
  }

  async function translateFormStrings(texts, target, source) {
    return window.GRCTranslationService.translateBatch({
      texts,
      target,
      source,
      googleApiKey: getScriptEl()?.dataset?.googleTranslateApiKey || '',
    });
  }

  function resetOtpFlowState() {
    otpVerified = false;
    otpRequested = false;
    resendCooldown = false;
    if (resendInterval) {
      clearInterval(resendInterval);
      resendInterval = null;
    }
  }

  function snapshotFormValues(formEl) {
    if (!formEl) return null;
    return {
      firstName: formEl.querySelector('#dsar_firstName')?.value || '',
      lastName: formEl.querySelector('#dsar_lastName')?.value || '',
      email: formEl.querySelector('#dsar_email')?.value || '',
      country: formEl.querySelector('#dsar_country')?.value || '',
      notes: formEl.querySelector('#dsar_notes')?.value || '',
      cmpUserId: formEl.querySelector('#dsar_cmpUserId')?.value || '',
      confirmAuth: !!formEl.querySelector('#dsar_confirmAuth')?.checked,
      requestTypes: Array.from(
        formEl.querySelectorAll('input[name="requestTypes"]:checked'),
      ).map((el) => el.value),
      otp: formEl.querySelector('#dsar_otp')?.value || '',
      emailReadonly: formEl
        .querySelector('#dsar_email')
        ?.hasAttribute('readonly'),
    };
  }

  function restoreFormValues(formEl, snapshot) {
    if (!formEl || !snapshot) return;

    const firstName = formEl.querySelector('#dsar_firstName');
    const lastName = formEl.querySelector('#dsar_lastName');
    const email = formEl.querySelector('#dsar_email');
    const country = formEl.querySelector('#dsar_country');
    const notes = formEl.querySelector('#dsar_notes');
    const cmpUserId = formEl.querySelector('#dsar_cmpUserId');
    const confirmAuth = formEl.querySelector('#dsar_confirmAuth');
    const otpInput = formEl.querySelector('#dsar_otp');
    const sendOtpBtn = formEl.querySelector('#dsar_sendOtpBtn');
    const verifyOtpBtn = formEl.querySelector('#dsar_verifyOtpBtn');

    if (firstName) firstName.value = snapshot.firstName || '';
    if (lastName) lastName.value = snapshot.lastName || '';
    if (country) country.value = snapshot.country;
    if (notes) notes.value = snapshot.notes;
    if (cmpUserId && snapshot.cmpUserId) cmpUserId.value = snapshot.cmpUserId;
    if (confirmAuth) confirmAuth.checked = snapshot.confirmAuth;

    formEl.querySelectorAll('input[name="requestTypes"]').forEach((el) => {
      el.checked = snapshot.requestTypes.includes(el.value);
    });

    if (email) {
      email.value = snapshot.email;
      if (snapshot.emailReadonly) {
        email.setAttribute('readonly', 'readonly');
      } else {
        email.removeAttribute('readonly');
      }
    }

    if (otpInput) {
      otpInput.value = snapshot.otp;
      otpInput.disabled = !otpRequested || otpVerified;
    }
    if (sendOtpBtn) {
      sendOtpBtn.disabled = resendCooldown;
      sendOtpBtn.textContent =
        otpRequested && !resendCooldown
          ? mergedFormConfig?.resendOtpLabel || 'Resend OTP'
          : mergedFormConfig?.sendOtpLabel || 'Send OTP';
    }
    if (verifyOtpBtn) {
      verifyOtpBtn.disabled = !otpRequested || otpVerified;
      verifyOtpBtn.textContent = otpVerified
        ? mergedFormConfig?.verifiedOtpLabel || 'Verified'
        : mergedFormConfig?.verifyOtpLabel || 'Verify OTP';
    }
  }

  // Email Validation function
  function validateEmail(v) {
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
  }

  // OTP Request function with API Call
  async function requestOtp(email) {
    console.log('Requesting OTP for email:', email);

    const base = getApiBase();
    const url = `${base}/dsar/request-otp`;

    try {
      // API call to generate and send OTP to backend
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send OTP');
      }

      console.log('OTP sent successfully');

      return true;
    } catch (error) {
      console.error('Error requesting OTP:', error);
      throw error;
    }
  }

  // OTP Validation function with API Call
  async function validateOtp(email, otp) {
    const base = getApiBase();
    const url = `${base}/dsar/validate-otp`;

    try {
      // Call backend API to validate OTP
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          otp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Invalid OTP');
      }

      console.log('OTP validated successfully');

      return true;
    } catch (error) {
      console.error('Error validating OTP:', error);
      throw error;
    }
  }

  // function injectStyles() {
  //   if (document.getElementById('dsar-styles')) return;

  //   const css = `
  // :root{
  //   --dsar-bg:#ffffff;
  //   --dsar-surface:#ffffff;
  //   --dsar-fg:#111827;
  //   --dsar-muted:#6b7280;
  //   --dsar-border:#e5e7eb;
  //   --dsar-brand:#050038;
  //   --dsar-brand-hover:#1d4ed8;
  //   --dsar-soft:#f8fafc;
  //   --dsar-danger:#dc2626;
  //   --dsar-danger-bg:#fef2f2;
  //   --dsar-success:#065f46;
  //   --dsar-success-bg:#ecfdf5;
  //   --dsar-shadow:0 10px 30px rgba(0,0,0,.08);
  //   --dsar-radius-lg:16px;
  //   --dsar-radius-md:12px;
  //   --dsar-radius-sm:10px;
  // }

  // .dsar-reset,
  // .dsar-reset *{
  //   box-sizing:border-box;
  // }

  // .dsar-reset{
  //   font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Helvetica Neue',Arial,'Noto Sans',sans-serif;
  //   color:var(--dsar-fg);
  // }

  // .dsar-card{
  //   background:var(--dsar-surface);
  //   border:1px solid var(--dsar-border);
  //   border-radius:var(--dsar-radius-lg);
  //   box-shadow:var(--dsar-shadow);
  //   overflow:hidden;
  // }

  // .dsar-header{
  //   background:var(--dsar-brand);
  //   color:#fff;
  //   padding:24px;
  // }

  // .dsar-lang-row{
  //   width:100%;
  //   margin-top:12px;
  // }

  // .dsar-lang-row--body{
  //   margin:0 0 16px;
  //   padding:14px;
  //   border:1px solid var(--dsar-border);
  //   border-radius:var(--dsar-radius-md);
  //   background:var(--dsar-soft);
  // }

  // .dsar-lang-row--body .grc-lang-picker-label{
  //   color:var(--dsar-fg);
  // }

  // .dsar-lang-row--body .grc-lang-select{
  //   max-width:100%;
  // }

  // .dsar-title{
  //   margin:0;
  //   font-size:24px;
  //   color:#fff;
  //   font-weight:700;
  //   line-height:1.2;
  // }

  // .dsar-subtitle{
  //   margin:8px 0 0;
  //   font-size:14px;
  //   line-height:1.6;
  //   color:rgba(255,255,255,.92);
  // }

  // .dsar-body{
  //   padding:24px;
  //   background:var(--dsar-bg);
  // }

  // .dsar-form{
  //   display:grid;
  //   gap:18px;
  // }

  // .dsar-grid{
  //   display:grid;
  //   grid-template-columns:1fr;
  //   gap:18px;
  // }

  // .dsar-row{
  //   display:flex;
  //   flex-direction:column;
  //   gap:8px;
  //   min-width:0;
  // }

  // .dsar-row.full{
  //   grid-column:1/-1;
  // }

  // .dsar-label{
  //   font-size:14px;
  //   font-weight:600;
  //   color:var(--dsar-fg);
  // }

  // .dsar-req{
  //   color:var(--dsar-danger);
  // }

  // .dsar-optional{
  //   color:var(--dsar-muted);
  //   font-weight:500;
  // }

  // .dsar-input,
  // .dsar-textarea,
  // .dsar-select{
  //   width:100%;
  //   border:1px solid var(--dsar-border);
  //   border-radius:var(--dsar-radius-sm);
  //   padding:12px 14px;
  //   font-size:14px;
  //   background:#fff;
  //   color:var(--dsar-fg);
  //   outline:none;
  //   transition:border-color .15s ease, box-shadow .15s ease;
  // }

  // .dsar-input[readonly]{
  //   background:#f9fafb;
  //   color:#6b7280;
  // }

  // .dsar-input:focus,
  // .dsar-textarea:focus,
  // .dsar-select:focus{
  //   border-color:var(--dsar-brand);
  //   box-shadow:0 0 0 3px rgba(37,99,235,.12);
  // }

  // .dsar-textarea{
  //   min-height:120px;
  //   resize:vertical;
  // }

  // .dsar-check-group{
  //   display:grid;
  //   gap:10px;
  //   padding:14px;
  //   border:1px solid var(--dsar-border);
  //   border-radius:var(--dsar-radius-md);
  //   background:var(--dsar-soft);
  // }

  // .dsar-check{
  //   display:flex;
  //   align-items:flex-start;
  //   gap:10px;
  //   font-size:14px;
  //   line-height:1.5;
  //   color:var(--dsar-fg);
  // }

  // .dsar-check input{
  //   width:16px;
  //   height:16px;
  //   margin-top:2px;
  //   accent-color:var(--dsar-brand);
  // }

  // .dsar-trust{
  //   padding:14px 16px;
  //   border:1px solid #dbeafe;
  //   border-radius:var(--dsar-radius-md);
  //   background:#f8fbff;
  //   font-size:13px;
  //   line-height:1.6;
  //   color:var(--dsar-muted);
  // }

  // .dsar-actions{
  //   display:flex;
  //   flex-direction:column;
  //   gap:12px;
  //   padding-top:4px;
  // }

  // .dsar-btn{
  //   display:inline-flex;
  //   align-items:center;
  //   justify-content:center;
  //   min-height:46px;
  //   padding:12px 16px;
  //   border:none;
  //   border-radius:var(--dsar-radius-sm);
  //   background:var(--dsar-brand);
  //   color:#fff;
  //   font-size:15px;
  //   font-weight:700;
  //   cursor:pointer;
  //   transition:background .15s ease, opacity .15s ease;
  // }

  // .dsar-btn:hover{
  //   background:var(--dsar-brand-hover);
  // }

  // .dsar-btn[disabled]{
  //   opacity:.7;
  //   cursor:not-allowed;
  // }

  // .dsar-help{
  //   display:none;
  //   font-size:13px;
  //   line-height:1.5;
  //   padding:12px 14px;
  //   border-radius:var(--dsar-radius-sm);
  //   border:1px solid transparent;
  // }

  // .dsar-help.show{
  //   display:block;
  // }

  // .dsar-help.success{
  //   color:var(--dsar-success);
  //   background:var(--dsar-success-bg);
  //   border-color:#a7f3d0;
  // }

  // .dsar-help.error{
  //   color:#991b1b;
  //   background:var(--dsar-danger-bg);
  //   border-color:#fecaca;
  // }

  // .dsar-ovl{
  //   position:fixed;
  //   inset:0;
  //   background:rgba(0,0,0,.45);
  //   display:flex;
  //   align-items:center;
  //   justify-content:center;
  //   padding:16px;
  //   z-index:9999;
  // }

  // .dsar-panel{
  //   width:100%;
  //   max-width:860px;
  // }

  // .dsar-head{
  //   background:#fff;
  //   border:1px solid var(--dsar-border);
  //   border-bottom:none;
  //   border-radius:16px 16px 0 0;
  //   padding:10px 12px;
  //   display:flex;
  //   align-items:center;
  //   justify-content:space-between;
  // }

  // .dsar-head-title{
  //   font-size:13px;
  //   font-weight:600;
  //   color:var(--dsar-muted);
  // }

  // .dsar-close{
  //   background:#fff;
  //   border:1px solid var(--dsar-border);
  //   border-radius:8px;
  //   width:36px;
  //   height:32px;
  //   display:inline-flex;
  //   align-items:center;
  //   justify-content:center;
  //   cursor:pointer;
  //   font-size:18px;
  //   line-height:1;
  //   color:var(--dsar-fg);
  // }

  // .dsar-close:hover{
  //   background:#f9fafb;
  // }

  // .dsar-modal-body{
  //   background:#fff;
  //   border:1px solid var(--dsar-border);
  //   border-top:none;
  //   border-radius:0 0 16px 16px;
  // }

  // @media (min-width:640px){
  //   .dsar-grid.two-col{
  //     grid-template-columns:1fr 1fr;
  //   }
  // }

  // @media (max-width:639px){
  //   .dsar-header{
  //     padding:20px;
  //   }

  //   .dsar-body{
  //     padding:20px;
  //   }

  //   .dsar-title{
  //     font-size:22px;
  //   }
  // }
  // `.trim();

  //   const style = document.createElement('style');
  //   style.id = 'dsar-styles';
  //   style.textContent = css;
  //   document.head.appendChild(style);
  //   document.body.classList.add('dsar-reset');
  // }
  function injectStyles() {
    if (document.getElementById('dsar-styles')) return;

    const css = `
:root{
  --dsar-bg:#ffffff;
  --dsar-surface:#ffffff;
  --dsar-fg:#111827;
  --dsar-muted:#667085;
  --dsar-border:#e4e7ec;
  --dsar-border-strong:#d0d5dd;
  --dsar-brand:#2B245C;
  --dsar-brand-hover:#211b4a;
  --dsar-soft:#f8fafc;
  --dsar-brand-soft:#f1effb;
  --dsar-danger:#dc2626;
  --dsar-danger-bg:#fef2f2;
  --dsar-success:#15803d;
  --dsar-success-bg:#ecfdf5;
  --dsar-shadow:0 22px 60px rgba(17,24,39,.22);
  --dsar-shadow-soft:0 10px 30px rgba(17,24,39,.10);
  --dsar-radius-lg:16px;
  --dsar-radius-md:12px;
  --dsar-radius-sm:10px;
}

.dsar-reset,
.dsar-reset *{
  box-sizing:border-box;
  font-family:'Roboto', sans-serif;
  // -moz-osx-font-smoothing:grayscale;
  text-rendering:optimizeLegibility;
  letter-spacing:0;
  text-shadow:none;
}

.dsar-reset{
  color:var(--dsar-fg);
}

/* Card */
.dsar-card{
  width:100%;
  background:var(--dsar-surface);
  border:1px solid rgba(228,231,236,.95);
  border-radius:var(--dsar-radius-lg);
  box-shadow:var(--dsar-shadow-soft);
  overflow:hidden;
  display:flex;
  flex-direction:column;
  max-height:80vh;
}

/* Header */
.dsar-header{
  position:relative;
  background:#2B245C;
  color:#ffffff;
  padding:18px 22px 17px;
  overflow:visible;
  flex:0 0 auto;
}

.dsar-header:before{
  content:'';
  position:absolute;
  top:-90px;
  right:-115px;
  width:250px;
  height:250px;
  border-radius:999px;
  background:rgba(255,255,255,.10);
  pointer-events:none;
}

.dsar-header:after{
  content:'';
  position:absolute;
  right:-80px;
  bottom:-125px;
  width:220px;
  height:220px;
  border-radius:999px;
  background:rgba(255,255,255,.07);
  pointer-events:none;
}

.dsar-title{
  position:relative;
  z-index:1;
  margin:0;
  font-size:19px;
  color:#ffffff;
  font-weight:600;
  line-height:1.25;
}

.dsar-subtitle{
  position:relative;
  z-index:1;
  margin:6px 0 0;
  max-width:680px;
  font-size:12.5px;
  font-weight:400;
  line-height:1.5;
  color:rgba(255,255,255,.92);
}

/* Body */
.dsar-body{
  padding:20px 22px;
  background:linear-gradient(180deg,#ffffff 0%,#fbfcff 100%);
  overflow-y:auto;
  overflow-x:hidden;
  flex:1 1 auto;
  max-height:calc(80vh - 96px);
}

.dsar-body::-webkit-scrollbar,
.dsar-panel::-webkit-scrollbar{
  width:7px;
}

.dsar-body::-webkit-scrollbar-track,
.dsar-panel::-webkit-scrollbar-track{
  background:#f1f5f9;
  border-radius:20px;
}

.dsar-body::-webkit-scrollbar-thumb,
.dsar-panel::-webkit-scrollbar-thumb{
  background:#b8b1d8;
  border-radius:20px;
}

.dsar-body::-webkit-scrollbar-thumb:hover,
.dsar-panel::-webkit-scrollbar-thumb:hover{
  background:#2B245C;
}

/* Language */
.dsar-lang-row{
  width:100%;
  margin-top:12px;
}

.dsar-lang-row--body{
  margin:0 0 16px;
  padding:12px;
  border:1px solid #e0dcf4;
  border-radius:var(--dsar-radius-md);
  background:var(--dsar-brand-soft);
}

.dsar-lang-row--body .grc-lang-picker-label,
.dsar-lang-row--body label,
.dsar-lang-row--body .grc-lang-label,
.dsar-lang-row--body .grc-language-label{
  color:#111827 !important;
  font-size:12px !important;
  font-weight:500 !important;
  line-height:1.25 !important;
  margin-bottom:6px !important;
}

.dsar-lang-row--body .grc-lang-select,
.dsar-lang-row--body .grc-language-select{
  max-width:210px !important;
}

.dsar-lang-row--body select,
.dsar-lang-row--body .grc-lang-select select,
.dsar-lang-row--body .grc-language-select select{
  width:210px !important;
  max-width:210px !important;
  min-height:34px !important;
  height:34px !important;
  border-radius:8px !important;
  border:1px solid #d0d5dd !important;
  background:#ffffff !important;
  color:#111827 !important;
  font-size:12px !important;
  font-weight:400 !important;
  padding:6px 10px !important;
  outline:none !important;
  box-shadow:0 1px 2px rgba(16,24,40,.04) !important;
}

.dsar-lang-row--body select option{
  background:#ffffff !important;
  color:#111827 !important;
  font-size:12px !important;
}

.dsar-lang-row--body .grc-lang-options,
.dsar-lang-row--body .grc-lang-menu,
.dsar-lang-row--body .grc-language-options,
.dsar-lang-row--body .grc-language-menu,
.dsar-lang-row--body [role="listbox"],
.dsar-lang-row--body ul{
  max-height:120px !important;
  overflow-y:auto !important;
  overflow-x:hidden !important;
  background:#ffffff !important;
  border:1px solid #d0d5dd !important;
  border-radius:8px !important;
  box-shadow:0 12px 24px rgba(17,24,39,.18) !important;
  z-index:999999 !important;
}

/* Form */
.dsar-form{
  display:grid;
  gap:16px;
}

.dsar-grid{
  display:grid;
  grid-template-columns:1fr;
  gap:16px;
}

.dsar-row{
  display:flex;
  flex-direction:column;
  gap:7px;
  min-width:0;
}

.dsar-row.full{
  grid-column:1/-1;
}

.dsar-label{
  font-size:12.5px;
  font-weight:500;
  color:#1f2937;
  line-height:1.35;
}

.dsar-req{
  color:var(--dsar-danger);
  font-weight:600;
}

.dsar-optional{
  color:var(--dsar-muted);
  font-weight:400;
}

/* Inputs */
.dsar-input,
.dsar-textarea,
.dsar-select{
  width:100%;
  border:1px solid var(--dsar-border);
  border-radius:var(--dsar-radius-sm);
  padding:10px 12px;
  min-height:40px;
  font-size:13px;
  font-weight:400;
  line-height:1.4;
  background:#ffffff;
  color:var(--dsar-fg);
  outline:none;
  transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.dsar-input::placeholder,
.dsar-textarea::placeholder{
  color:#98a2b3;
}

.dsar-input:hover,
.dsar-textarea:hover,
.dsar-select:hover{
  border-color:#c7c2df;
}

.dsar-input:focus,
.dsar-textarea:focus,
.dsar-select:focus{
  border-color:var(--dsar-brand);
  box-shadow:0 0 0 4px rgba(43,36,92,.14);
}

.dsar-input[readonly]{
  background:#f8fafc;
  color:#475569;
  border-style:dashed;
}

.dsar-textarea{
  min-height:98px;
  resize:vertical;
}

/* Checkbox group */
.dsar-check-group{
  display:grid;
  gap:9px;
  padding:12px;
  border:1px solid var(--dsar-border);
  border-radius:var(--dsar-radius-md);
  background:#ffffff;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.dsar-check{
  display:flex;
  align-items:flex-start;
  gap:10px;
  font-size:12.5px;
  font-weight:400;
  line-height:1.45;
  color:#344054;
}

.dsar-check input{
  width:15px;
  height:15px;
  margin-top:2px;
  flex:0 0 auto;
  accent-color:var(--dsar-brand);
}

.dsar-check span{
  font-weight:400;
}

/* Trust box */
.dsar-trust{
  padding:12px 14px;
  border:1px solid #e0dcf4;
  border-radius:var(--dsar-radius-md);
  background:var(--dsar-brand-soft);
  font-size:12px;
  font-weight:400;
  line-height:1.5;
  color:#4b5563;
}

/* Actions */
.dsar-actions{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:10px;
  padding-top:8px;
}

.dsar-btn{
  width:fit-content;
  min-width:150px;
  min-height:40px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:10px 24px;
  border:none;
  border-radius:9px;
  background:var(--dsar-brand);
  color:#ffffff;
  font-size:12px;
  font-weight:600;
  line-height:1;
  cursor:pointer;
  white-space:nowrap;
  box-shadow:0 9px 20px rgba(43,36,92,.26);
  transition:background-color .18s ease, transform .12s ease, opacity .18s ease, box-shadow .18s ease;
}

.dsar-btn:hover{
  background:var(--dsar-brand-hover);
  box-shadow:0 12px 24px rgba(43,36,92,.34);
}

.dsar-btn:active{
  transform:translateY(1px);
}

.dsar-btn[disabled]{
  opacity:.65;
  cursor:not-allowed;
  box-shadow:none;
}

/* OTP buttons inline */
#dsar_sendOtpBtn,
#dsar_verifyOtpBtn{
  min-width:130px !important;
  padding:10px 18px !important;
}

/* Help messages */
.dsar-help{
  display:none;
  width:100%;
  font-size:12px;
  font-weight:400;
  line-height:1.45;
  padding:11px 13px;
  border-radius:var(--dsar-radius-sm);
  border:1px solid transparent;
}

.dsar-help.show{
  display:block;
}

.dsar-help.success{
  color:var(--dsar-success);
  background:var(--dsar-success-bg);
  border-color:#bbf7d0;
}

.dsar-help.error{
  color:#991b1b;
  background:var(--dsar-danger-bg);
  border-color:#fecaca;
}

/* Modal */
.dsar-ovl{
  position:fixed;
  inset:0;
  background:rgba(15,23,42,.58);
  backdrop-filter:blur(6px);
  -webkit-backdrop-filter:blur(6px);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:14px;
  z-index:9999;
}

.dsar-panel{
  position:relative;
  width:100%;
  max-width:780px;
  max-height:82vh;
  overflow:hidden;
  border-radius:var(--dsar-radius-lg);
  box-shadow:var(--dsar-shadow);
}

.dsar-head{
  position:absolute;
  top:14px;
  right:14px;
  z-index:10001;
  background:transparent;
  border:0;
  padding:0;
  display:flex;
  align-items:center;
  justify-content:flex-end;
}

.dsar-head-title{
  display:none;
}

.dsar-close{
  width:30px;
  height:30px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.28);
  background:rgba(255,255,255,.14);
  color:#ffffff;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  font-size:20px;
  line-height:1;
  transition:background-color .18s ease, transform .12s ease, border-color .18s ease;
}

.dsar-close:hover{
  background:rgba(255,255,255,.24);
  border-color:rgba(255,255,255,.44);
  transform:translateY(-1px);
}

.dsar-modal-body{
  background:#ffffff;
  border:1px solid var(--dsar-border);
  border-radius:var(--dsar-radius-lg);
  overflow:hidden;
  max-height:82vh;
}

.dsar-modal-body .dsar-card{
  border:0;
  border-radius:0;
  box-shadow:none;
}

/* Clean text weight */
.dsar-title,
.dsar-subtitle,
.dsar-label,
.dsar-check,
.dsar-trust,
.dsar-help,
.dsar-btn,
.dsar-input,
.dsar-select,
.dsar-textarea{
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Responsive */
@media (min-width:640px){
  .dsar-grid.two-col{
    grid-template-columns:1fr 1fr;
    column-gap:16px;
    row-gap:16px;
  }
}

@media (max-width:639px){
  .dsar-ovl{
    align-items:flex-start;
    padding:10px;
  }

  .dsar-panel,
  .dsar-modal-body,
  .dsar-card{
    max-height:90vh;
  }

  .dsar-header{
    padding:16px 18px 15px;
  }

  .dsar-title{
    font-size:17px;
    margin-right:36px;
  }

  .dsar-subtitle{
    font-size:11.5px;
  }

  .dsar-body{
    padding:16px;
    max-height:calc(90vh - 92px);
  }

  .dsar-lang-row--body .grc-lang-select,
  .dsar-lang-row--body .grc-language-select,
  .dsar-lang-row--body select,
  .dsar-lang-row--body .grc-lang-select select,
  .dsar-lang-row--body .grc-language-select select{
    width:100% !important;
    max-width:100% !important;
  }

  .dsar-form{
    gap:14px;
  }

  .dsar-grid{
    gap:14px;
  }

  .dsar-btn,
  .dsar-actions .dsar-btn{
    width:100%;
    min-width:100%;
  }

  #dsar_sendOtpBtn,
  #dsar_verifyOtpBtn{
    width:100% !important;
    min-width:100% !important;
  }

  .dsar-head{
    top:12px;
    right:12px;
  }
}
  /* DSAR CUSTOM SMALL LANGUAGE DROPDOWN */
.dsar-lang-row--body{
  margin:0 0 12px !important;
  padding:8px 10px !important;
  border-radius:9px !important;
  min-height:auto !important;
  position:relative !important;
  z-index:99999 !important;
}

.dsar-custom-lang-wrap{
  width:160px;
  max-width:160px;
  position:relative;
  z-index:999999;
}

.dsar-custom-lang-label{
  display:block;
  margin:0 0 3px 0;
  color:#111827 !important;
  font-size:10.5px !important;
  font-weight:500 !important;
  line-height:1.1;
}

.dsar-custom-lang-button{
  width:100%;
  height:28px;
  min-height:28px;
  border:1px solid #d0d5dd;
  border-radius:7px;
  background:#ffffff;
  color:#111827;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:3px 8px;
  font-size:11px;
  font-weight:400;
  cursor:pointer;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.dsar-custom-lang-button:focus{
  outline:none;
  border-color:#2B245C;
  box-shadow:0 0 0 3px rgba(43,36,92,.12);
}

.dsar-custom-lang-text{
  display:block;
  color:#111827 !important;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
  font-size:11px;
  line-height:1.1;
  font-weight:400;
}

.dsar-custom-lang-icon{
  color:#111827 !important;
  font-size:10px;
  flex:0 0 auto;
}

.dsar-custom-lang-menu{
  position:absolute;
  left:0;
  top:calc(100% + 4px);
  width:100%;
  max-height:85px !important;
  overflow-y:auto !important;
  overflow-x:hidden !important;
  background:#ffffff;
  border:1px solid #d0d5dd;
  border-radius:8px;
  box-shadow:0 12px 24px rgba(17,24,39,.18);
  padding:4px;
  z-index:999999;
}

.dsar-custom-lang-menu[hidden]{
  display:none !important;
}

.dsar-custom-lang-item{
  width:100%;
  min-height:22px;
  border:0;
  border-radius:6px;
  background:#ffffff;
  color:#111827;
  display:flex;
  align-items:center;
  justify-content:flex-start;
  padding:4px 7px;
  font-size:11px;
  font-weight:400;
  line-height:1.1;
  cursor:pointer;
  text-align:left;
}

.dsar-custom-lang-item:hover{
  background:#f1effb;
  color:#2B245C;
}

.dsar-custom-lang-item.active{
  background:#2B245C;
  color:#ffffff;
}

.dsar-custom-lang-menu::-webkit-scrollbar{
  width:6px;
}

.dsar-custom-lang-menu::-webkit-scrollbar-track{
  background:#f1f5f9;
  border-radius:20px;
}

.dsar-custom-lang-menu::-webkit-scrollbar-thumb{
  background:#b8b1d8;
  border-radius:20px;
}

.dsar-custom-lang-menu::-webkit-scrollbar-thumb:hover{
  background:#2B245C;
}

@media(max-width:639px){
  .dsar-custom-lang-wrap{
    width:100%;
    max-width:100%;
  }

  .dsar-custom-lang-menu{
    max-height:80px !important;
  }
}

/* ALIGN CLOSE BUTTON WITH DSAR HEADER */
.dsar-panel{
  position:relative !important;
  overflow:hidden !important;
}

.dsar-modal-body{
  position:relative !important;
  overflow:hidden !important;
}

/* place X button inside purple header */
.dsar-head{
  position:absolute !important;
  top:25px !important;
  right:28px !important;
  z-index:10005 !important;
  background:transparent !important;
  border:0 !important;
  padding:0 !important;
  margin:0 !important;
  width:auto !important;
  height:auto !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
}

.dsar-head-title{
  display:none !important;
}

.dsar-close{
  width:24px !important;
  height:24px !important;
  min-width:24px !important;
  min-height:24px !important;
  padding:0 !important;
  border-radius:999px !important;
  border:1px solid rgba(255,255,255,.36) !important;
  background:rgba(255,255,255,.16) !important;
  color:#ffffff !important;
  font-size:15px !important;
  line-height:1 !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  box-shadow:none !important;
  transform:none !important;
}

.dsar-close:hover{
  background:rgba(255,255,255,.26) !important;
  border-color:rgba(255,255,255,.50) !important;
  transform:none !important;
}

/* mobile */
@media(max-width:639px){
  .dsar-head{
    top:22px !important;
    right:22px !important;
  }

  .dsar-close{
    width:22px !important;
    height:22px !important;
    min-width:22px !important;
    min-height:22px !important;
    font-size:14px !important;
  }
}
  /* DSAR HEADER: TITLE TOP, SUBTITLE BELOW INSIDE BADGE */
.dsar-header{
  display:block !important;
  padding:15px 52px 14px 22px !important;
  min-height:auto !important;
  border-radius:14px !important;
}

.dsar-title{
  display:block !important;
  width:100% !important;
  margin:0 0 5px 0 !important;
  font-size:17px !important;
  font-weight:600 !important;
  line-height:1.25 !important;
  color:#ffffff !important;
  text-align:left !important;
}

.dsar-subtitle{
  display:block !important;
  width:100% !important;
  max-width:520px !important;
  margin:0 !important;
  font-size:11px !important;
  font-weight:400 !important;
  line-height:1.35 !important;
  color:rgba(255,255,255,.92) !important;
  text-align:left !important;
}

/* keep close button aligned with header */
.dsar-head{
  top:23px !important;
  right:24px !important;
}

.dsar-close{
  width:22px !important;
  height:22px !important;
  min-width:22px !important;
  min-height:22px !important;
  font-size:14px !important;
}

@media(max-width:639px){
  .dsar-header{
    padding:14px 44px 13px 18px !important;
  }

  .dsar-title{
    font-size:16px !important;
  }

  .dsar-subtitle{
    font-size:10.5px !important;
    max-width:100% !important;
  }

  .dsar-head{
    top:20px !important;
    right:18px !important;
  }
}
  /* FIX: ALIGN CLOSE BUTTON INSIDE DSAR HEADER */
.dsar-panel{
  position:relative !important;
  overflow:hidden !important;
}

.dsar-head{
  position:absolute !important;
  top:32px !important;
  right:30px !important;
  z-index:10005 !important;
  background:transparent !important;
  border:0 !important;
  padding:0 !important;
  margin:0 !important;
  width:auto !important;
  height:auto !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
}

.dsar-head-title{
  display:none !important;
}

.dsar-close{
  width:22px !important;
  height:22px !important;
  min-width:22px !important;
  min-height:22px !important;
  padding:0 !important;
  border-radius:999px !important;
  border:1px solid rgba(255,255,255,.36) !important;
  background:rgba(255,255,255,.16) !important;
  color:#ffffff !important;
  font-size:14px !important;
  line-height:1 !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  box-shadow:none !important;
  transform:none !important;
}

.dsar-close:hover{
  background:rgba(255,255,255,.26) !important;
  border-color:rgba(255,255,255,.50) !important;
  transform:none !important;
}

@media(max-width:639px){
  .dsar-head{
    top:28px !important;
    right:22px !important;
  }

  .dsar-close{
    width:21px !important;
    height:21px !important;
    min-width:21px !important;
    min-height:21px !important;
    font-size:13px !important;
  }
}
  /* OPTIMIZE REQUEST TYPE SPACE - 2 COLUMN CHECKBOXES */
.dsar-check-group{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:8px 12px !important;
  padding:10px 12px !important;
  min-height:auto !important;
}

.dsar-check{
  display:flex !important;
  align-items:center !important;
  gap:8px !important;
  min-height:22px !important;
  font-size:11.5px !important;
  line-height:1.25 !important;
  margin:0 !important;
}

.dsar-check input{
  width:14px !important;
  height:14px !important;
  margin:0 !important;
  flex:0 0 auto !important;
}

.dsar-check span{
  font-size:11.5px !important;
  line-height:1.25 !important;
  white-space:nowrap !important;
}

/* reduce overall vertical space */
.dsar-form{
  gap:12px !important;
}

.dsar-grid{
  gap:12px 16px !important;
}

.dsar-row{
  gap:5px !important;
}

.dsar-body{
  padding:16px 22px !important;
}

.dsar-input,
.dsar-select{
  min-height:36px !important;
  padding:8px 11px !important;
}

.dsar-textarea{
  min-height:72px !important;
  padding:9px 11px !important;
}

.dsar-trust{
  padding:9px 12px !important;
  font-size:11.5px !important;
}

.dsar-actions{
  padding-top:6px !important;
}

/* request type should stay clean on smaller screens */
@media(max-width:639px){
  .dsar-check-group{
    grid-template-columns:1fr !important;
  }

  .dsar-check span{
    white-space:normal !important;
  }
}
  /* MINIMIZE SPACE AROUND ADDITIONAL INFORMATION */
.dsar-form{
  gap:8px !important;
}

.dsar-grid{
  gap:8px 16px !important;
}

.dsar-row{
  gap:4px !important;
}

/* Reduce gap after Request Type box */
.dsar-check-group{
  margin-bottom:0 !important;
  padding:8px 10px !important;
  gap:6px 10px !important;
}

/* Additional Information textarea compact */
#dsar_notes,
.dsar-textarea{
  min-height:58px !important;
  height:58px !important;
  padding:8px 11px !important;
  font-size:12px !important;
  line-height:1.35 !important;
}

/* Additional Information label closer */
label[for="dsar_notes"]{
  margin-bottom:0 !important;
}

/* Reduce body padding */
.dsar-body{
  padding-top:14px !important;
  padding-bottom:14px !important;
}

/* Reduce OTP section gap below textarea */
#dsar_notes + *{
  margin-top:0 !important;
}

/* POPUP HEADER + TITLE HOVER EFFECT */
.dsar-header{
  transition:
    background-color .22s ease,
    box-shadow .22s ease,
    filter .22s ease !important;
  cursor: default;
}

.dsar-header:hover{
  background:#211b4a !important;
  box-shadow: inset 0 -1px 0 rgba(255,255,255,.14), 0 10px 24px rgba(43,36,92,.22) !important;
  filter: brightness(1.04);
}

.dsar-title{
  display:block !important;
  width:fit-content !important;
  max-width:100% !important;
  transition:
    transform .22s ease,
    color .22s ease,
    text-shadow .22s ease !important;
  cursor: default;
}

.dsar-title:hover{
  transform: translateY(-2px);
  color:#ffffff !important;
  text-shadow:0 8px 20px rgba(255,255,255,.28) !important;
}

.dsar-subtitle{
  display:block !important;
  width:fit-content !important;
  max-width:520px !important;
  transition:
    transform .22s ease,
    color .22s ease,
    text-shadow .22s ease !important;
  cursor: default;
}

.dsar-subtitle:hover{
  transform: translateY(-2px);
  color:#ffffff !important;
  text-shadow:0 8px 18px rgba(255,255,255,.24) !important;
}

/* When hovering whole purple header, title and subtitle also react */
.dsar-header:hover .dsar-title{
  transform: translateY(-1px);
  color:#ffffff !important;
  text-shadow:0 8px 20px rgba(255,255,255,.22) !important;
}

.dsar-header:hover .dsar-subtitle{
  color:#ffffff !important;
}

/* DSAR Request Type Full Width */
.dsar-request-types-row{
  grid-column:1 / -1 !important;
  width:100% !important;
}

.dsar-request-types-row .dsar-check-group{
  width:100% !important;
  max-width:100% !important;
  grid-template-columns:repeat(3, minmax(0, 1fr)) !important;
}

@media(max-width:639px){
  .dsar-request-types-row .dsar-check-group{
    grid-template-columns:1fr !important;
  }
}

/* DSAR DESKTOP COMPACT - REMOVE INTERNAL SCROLLBAR */
@media (min-width:640px) and (min-height:700px){

  .dsar-ovl{
    align-items:center !important;
    padding:8px !important;
  }

  .dsar-panel{
    max-width:780px !important;
    max-height:none !important;
    overflow:visible !important;
  }

  .dsar-modal-body,
  .dsar-modal-body .dsar-card,
  .dsar-card{
    max-height:none !important;
    overflow:visible !important;
  }

  .dsar-header{
    padding:10px 52px 9px 18px !important;
    border-radius:14px !important;
  }

  .dsar-title{
    font-size:16px !important;
    margin:0 0 2px 0 !important;
    line-height:1.15 !important;
  }

  .dsar-subtitle{
    font-size:10.5px !important;
    line-height:1.25 !important;
    max-width:560px !important;
  }

  .dsar-body{
    padding:10px 18px 12px !important;
    max-height:none !important;
    overflow-y:visible !important;
    overflow-x:hidden !important;
  }

  .dsar-lang-row--body{
    padding:6px 8px !important;
    margin:0 0 7px !important;
  }

  .dsar-custom-lang-wrap{
    width:150px !important;
    max-width:150px !important;
  }

  .dsar-custom-lang-button{
    height:26px !important;
    min-height:26px !important;
    font-size:10.5px !important;
  }

  .dsar-form{
    gap:6px !important;
  }

  .dsar-grid{
    gap:6px 14px !important;
  }

  .dsar-row{
    gap:3px !important;
  }

  .dsar-label{
    font-size:11px !important;
    line-height:1.2 !important;
  }

  .dsar-input,
  .dsar-select{
    min-height:32px !important;
    height:32px !important;
    padding:6px 10px !important;
    font-size:12px !important;
  }

  #dsar_notes,
  .dsar-textarea{
    min-height:42px !important;
    height:42px !important;
    padding:6px 10px !important;
    font-size:11.5px !important;
    line-height:1.25 !important;
  }

  .dsar-request-types-row{
    grid-column:1 / -1 !important;
  }

  .dsar-check-group{
    width:100% !important;
    padding:6px 9px !important;
    gap:5px 10px !important;
    grid-template-columns:repeat(3, minmax(0, 1fr)) !important;
  }

  .dsar-check{
    min-height:18px !important;
    gap:7px !important;
    font-size:10.8px !important;
    line-height:1.15 !important;
  }

  .dsar-check input{
    width:13px !important;
    height:13px !important;
  }

  .dsar-check span{
    font-size:10.8px !important;
    line-height:1.15 !important;
  }

  #dsar_sendOtpBtn,
  #dsar_verifyOtpBtn{
    min-width:115px !important;
    min-height:32px !important;
    padding:7px 12px !important;
    font-size:11px !important;
  }

  .dsar-trust{
    padding:7px 10px !important;
    font-size:10.8px !important;
    line-height:1.25 !important;
  }

  .dsar-actions{
    padding-top:4px !important;
    gap:5px !important;
  }

  .dsar-btn{
    min-width:135px !important;
    min-height:34px !important;
    padding:8px 18px !important;
    font-size:11.5px !important;
  }

  .dsar-help{
    padding:6px 9px !important;
    font-size:11px !important;
    line-height:1.25 !important;
  }
}
  /* FIX DSAR HEADER BIG BUBBLE */
.dsar-header{
  overflow:hidden !important;
  position:relative !important;
}

.dsar-header:before{
  top:-38px !important;
  right:-42px !important;
  width:115px !important;
  height:115px !important;
  background:rgba(255,255,255,.08) !important;
}

.dsar-header:after{
  right:-32px !important;
  bottom:-58px !important;
  width:120px !important;
  height:120px !important;
  background:rgba(255,255,255,.06) !important;
}

/* keep title above bubble */
.dsar-title,
.dsar-subtitle{
  position:relative !important;
  z-index:2 !important;
}
`.trim();

    const style = document.createElement('style');
    style.id = 'dsar-styles';
    style.textContent = css;
    document.head.appendChild(style);
    document.body.classList.add('dsar-reset');
  }
  function normalizeDomain(d) {
    if (!d) return '';
    return String(d)
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/.*$/, '')
      .trim();
  }

  function generateCMPUserId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `cmp-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  }

  function getOrCreateCMPUserId() {
    let raw = localStorage.getItem(CMP_USER_ID_STORAGE_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.userId) return parsed.userId;
      } catch {}
    }

    const newId = generateCMPUserId();
    localStorage.setItem(
      CMP_USER_ID_STORAGE_KEY,
      JSON.stringify({ userId: newId, metadata: {} }),
    );

    return newId;
  }

  function getScriptEl() {
    return (
      RUNTIME_SCRIPT ||
      document.currentScript ||
      document.querySelector('script[src*="dsar-runtime.js"]')
    );
  }

  function getApiBase() {
    const el = getScriptEl();
    const attrBase = el?.dataset?.apiBase;
    if (attrBase) return String(attrBase).replace(/\/$/, '');

    if (el?.src) {
      const u = new URL(el.src, location.href);
      const parts = u.pathname.split('/').filter(Boolean);
      parts.pop();
      return u.origin + '/' + parts.join('/');
    }

    return window.location.origin;
  }

  function getDomain() {
    const el = getScriptEl();
    const domainFromAttr = el?.dataset?.domain;
    const cmpDomain = window.CMP?.opts?.domain;
    const autoDomain = window.location.hostname;

    return normalizeDomain(domainFromAttr || cmpDomain || autoDomain);
  }

  async function postSubmission(payload) {
    const base = getApiBase();
    const url = `${base}/dsar`;

    console.log('[dsar-runtime] submit url =', url);
    console.log('[dsar-runtime] submit payload =', payload);

    const resp = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await resp.json().catch(() => ({}));

    console.log('[dsar-runtime] submit status =', resp.status, resp.statusText);
    console.log('[dsar-runtime] submit body =', body);

   if (!resp.ok) {
  // Extract nested DPDP compliance messages first, then fallback to generic
  const msg =
    body?.errors?.message ||        // ← nested DPDP message (priority 1)
    body?.errors?.error ||          // ← nested error title
    body?.message ||                // ← outer message
    body?.error ||
    (Array.isArray(body?.errors) ? body.errors.join(', ') : '') ||
    `${resp.status} ${resp.statusText}`;
  const err = new Error(msg);
  err.status = resp.status;
  err.statusCode = resp.status;
  err.responseBody = body;
  err.errorTitle = body?.errors?.error;  // ← extra: keep title for UI
  err.errorDetails = body?.errors?.details;  // ← extra: keep suggestions
  throw err;
}

    return body;
  }

  function h(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'for') n.htmlFor = v;
      else if (k === 'text') n.textContent = v;
      else if (v !== null && v !== undefined) n.setAttribute(k, v);
    }

    (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .forEach((c) => {
        if (typeof c === 'string') n.appendChild(document.createTextNode(c));
        else n.appendChild(c);
      });

    return n;
  }

  function makeInputRow({
    id,
    label,
    required = false,
    optional = false,
    optionalSuffixText = '(Optional)',
    placeholder = '',
    type = 'text',
    readOnly = false,
    value = '',
  }) {
    const input = h('input', {
      id,
      type,
      class: 'dsar-input',
      placeholder,
      autocomplete: 'off',
      value,
    });

    if (readOnly) {
      input.setAttribute('readonly', 'readonly');
    }

    const optionalSpan =
      optional && optionalSuffixText
        ? h('span', { class: 'dsar-optional' }, ` ${optionalSuffixText}`)
        : null;

    return h('div', { class: 'dsar-row' }, [
      h('label', { for: id, class: 'dsar-label' }, [
        label,
        required ? h('span', { class: 'dsar-req' }, ' *') : null,
        optionalSpan,
      ]),
      input,
    ]);
  }

  // function buildLanguageSelect(config) {
  //   if (!isTranslationEnabled()) return null;

  //   const svc = window.GRCTranslationService;
  //   if (!svc?.createLanguageDropdown) {
  //     console.warn('[dsar-runtime] Language picker skipped: translation service not loaded');
  //     return null;
  //   }

  //   const langs = getLanguageOptions();
  //   const picker = svc.createLanguageDropdown({
  //     languages: langs,
  //     value: langs.some((l) => l.code === activeLanguage)
  //       ? activeLanguage
  //       : SOURCE_LANG,
  //     layout: 'stacked',
  //     label: config.labelLanguage || 'Language',
  //     variant: 'default',
  //     id: 'dsar_ui_lang',
  //     onChange: async function (code) {
  //       translateFormRequestId += 1;
  //       const reqId = translateFormRequestId;
  //       activeLanguage = code || SOURCE_LANG;
  //       persistLanguage(activeLanguage);

  //       const base = mergeFormConfig({ domain: runtimeDomain });
  //       if (!isTranslationEnabled() || activeLanguage === SOURCE_LANG) {
  //         mergedFormConfig = base;
  //       } else {
  //         try {
  //           const payload = buildFormPayload(base);
  //           const cacheKey = `${SOURCE_LANG}|${activeLanguage}|${payload.join('\u241F')}`;
  //           let translated;
  //         if (formTranslationCache[cacheKey]) {
  //           mergedFormConfig = applyFormStringTranslations(
  //             base,
  //             formTranslationCache[cacheKey],
  //           );
  //         } else {
  //           const translated = await translateFormStrings(
  //             payload,
  //             activeLanguage,
  //             SOURCE_LANG,
  //           );
  //           formTranslationCache[cacheKey] = translated;
  //           mergedFormConfig = applyFormStringTranslations(base, translated);
  //         }
  //         } catch (err) {
  //           console.error('[dsar-runtime] Translation failed', err);
  //           mergedFormConfig = base;
  //         }
  //       }

  //       if (reqId !== translateFormRequestId) return;
  //       remountDsarUI();
  //     },
  //   });

  //   if (picker?.select && langs.some((l) => l.code === activeLanguage)) {
  //     picker.select.value = activeLanguage;
  //   }

  //   if (!picker) return null;

  //   const row = h('div', { class: 'dsar-lang-row' });
  //   row.appendChild(picker.wrap);
  //   return row;
  // }
  function buildLanguageSelect(config) {
    if (!isTranslationEnabled()) return null;

    const langs = getLanguageOptions();
    if (!Array.isArray(langs) || langs.length === 0) return null;

    const selectedCode = langs.some((l) => l.code === activeLanguage)
      ? activeLanguage
      : SOURCE_LANG;

    const selectedLang = langs.find((l) => l.code === selectedCode) || langs[0];

    async function handleLanguageChange(code) {
      translateFormRequestId += 1;
      const reqId = translateFormRequestId;

      activeLanguage = code || SOURCE_LANG;
      persistLanguage(activeLanguage);

      const base = mergeFormConfig({ domain: runtimeDomain });

      if (!isTranslationEnabled() || activeLanguage === SOURCE_LANG) {
        mergedFormConfig = base;
      } else {
        try {
          const payload = buildFormPayload(base);
          const cacheKey = `${SOURCE_LANG}|${activeLanguage}|${payload.join('\u241F')}`;

          if (formTranslationCache[cacheKey]) {
            mergedFormConfig = applyFormStringTranslations(
              base,
              formTranslationCache[cacheKey],
            );
          } else {
            const translated = await translateFormStrings(
              payload,
              activeLanguage,
              SOURCE_LANG,
            );

            formTranslationCache[cacheKey] = translated;
            mergedFormConfig = applyFormStringTranslations(base, translated);
          }
        } catch (err) {
          console.error('[dsar-runtime] Translation failed', err);
          mergedFormConfig = base;
        }
      }

      if (reqId !== translateFormRequestId) return;
      remountDsarUI();
    }

    const row = h('div', { class: 'dsar-lang-row' });

    const wrap = h('div', { class: 'dsar-custom-lang-wrap' });

    const label = h(
      'label',
      {
        class: 'dsar-custom-lang-label',
        for: 'dsar_custom_lang_btn',
      },
      config.labelLanguage || 'Language',
    );

    const button = h(
      'button',
      {
        type: 'button',
        id: 'dsar_custom_lang_btn',
        class: 'dsar-custom-lang-button',
        'aria-expanded': 'false',
      },
      [
        h(
          'span',
          { class: 'dsar-custom-lang-text' },
          selectedLang.nativeLabel || selectedLang.label || selectedLang.code,
        ),
        h('span', { class: 'dsar-custom-lang-icon' }, '▾'),
      ],
    );

    const menu = h('div', {
      class: 'dsar-custom-lang-menu',
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
            ? 'dsar-custom-lang-item active'
            : 'dsar-custom-lang-item',
          'data-code': lang.code,
        },
        lang.nativeLabel || lang.label || lang.code,
      );

      item.addEventListener('click', async () => {
        const textEl = button.querySelector('.dsar-custom-lang-text');

        if (textEl) {
          textEl.textContent = lang.nativeLabel || lang.label || lang.code;
        }

        menu.querySelectorAll('.dsar-custom-lang-item').forEach((el) => {
          el.classList.remove('active');
        });

        item.classList.add('active');
        closeMenu();

        await handleLanguageChange(lang.code);
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
    row.appendChild(wrap);

    return row;
  }
  function remountDsarUI() {
    const cfg = mergedFormConfig || mergeFormConfig({ domain: runtimeDomain });
    const trigger = document.getElementById(DSAR_CONTAINER_ID);
    if (trigger && trigger.tagName === 'BUTTON') {
      trigger.textContent = cfg.floatingButtonLabel;
    }

    const ovl = document.querySelector('.dsar-ovl');
    if (ovl) {
      const headTitle = ovl.querySelector('.dsar-head-title');
      if (headTitle) headTitle.textContent = cfg.modalHeadTitle;
      const body = ovl.querySelector('.dsar-modal-body');
      if (body) {
        const oldForm = body.querySelector('.dsar-form');
        const snapshot = snapshotFormValues(oldForm);
        const keepOtpState = !!snapshot;
        if (!keepOtpState) resetOtpFlowState();

        body.innerHTML = '';
        body.appendChild(buildDsarCard(cfg));

        const newForm = body.querySelector('.dsar-form');
        if (snapshot && newForm) restoreFormValues(newForm, snapshot);
      }
      return;
    }

    const host = document.getElementById(DSAR_CONTAINER_ID);
    if (host && cfg.showModal === false) {
      const oldForm = host.querySelector('.dsar-form');
      const snapshot = snapshotFormValues(oldForm);
      const keepOtpState = !!snapshot;
      if (!keepOtpState) resetOtpFlowState();

      host.innerHTML = '';
      host.appendChild(buildDsarCard(cfg));

      const newForm = host.querySelector('.dsar-form');
      if (snapshot && newForm) restoreFormValues(newForm, snapshot);
    }
  }

  function collectValues(formEl, config) {
    const requestTypes = Array.from(
      formEl.querySelectorAll('input[name="requestTypes"]:checked'),
    ).map((el) => el.value);

    const firstName =
      formEl.querySelector('#dsar_firstName')?.value?.trim() || '';

    const lastName =
      formEl.querySelector('#dsar_lastName')?.value?.trim() || '';

    const fullName = `${firstName} ${lastName}`.trim();
    const values = {
      fullName,
      email: formEl.querySelector('#dsar_email')?.value?.trim() || '',
      country: formEl.querySelector('#dsar_country')?.value?.trim() || '',
      requestTypes,
      notes: formEl.querySelector('#dsar_notes')?.value?.trim() || '',
      cmpUserId: formEl.querySelector('#dsar_cmpUserId')?.value?.trim() || '',
      domainName:
        formEl.querySelector('#dsar_domainName')?.value?.trim() ||
        config.domain ||
        '',
      confirmAuth: !!formEl.querySelector('#dsar_confirmAuth')?.checked,
    };

    const missing = [];

    if (!firstName) missing.push(config.labelFirstName || 'First Name');
    if (!lastName) missing.push(config.labelLastName || 'Last Name');

    if (!values.email) missing.push(config.labelEmail);
    else if (!validateEmail(values.email)) missing.push(config.labelValidEmail);

    if (!values.country) missing.push(config.labelCountry);
    if (!values.requestTypes.length) missing.push(config.labelRequestTypes);
    if (!values.confirmAuth) missing.push(config.labelConfirmation);

    return { values, missing };
  }

  function resetForm(formEl, config) {
    formEl.querySelector('#dsar_firstName').value = '';
    formEl.querySelector('#dsar_lastName').value = '';
    formEl.querySelector('#dsar_email').value = '';
    formEl.querySelector('#dsar_country').value = '';
    formEl.querySelector('#dsar_notes').value = '';
    formEl.querySelector('#dsar_cmpUserId').value = getOrCreateCMPUserId();
    // formEl.querySelector('#dsar_domainName').value = config.domain || '';
    formEl.querySelector('#dsar_confirmAuth').checked = false;
    formEl.querySelectorAll('input[name="requestTypes"]').forEach((el) => {
      el.checked = false;
    });
    resetOtpFlowState();

    // OTP UI reset
    const emailInput = formEl.querySelector('#dsar_email');
    const otpInput = formEl.querySelector('#dsar_otp');

    const sendOtpBtn = formEl.querySelector('#dsar_sendOtpBtn');
    const verifyOtpBtn = formEl.querySelector('#dsar_verifyOtpBtn');

    const otpStatus = formEl.querySelector('#dsar_otp_status');

    emailInput.removeAttribute('readonly');

    otpInput.value = '';
    otpInput.disabled = true;

    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = config.sendOtpLabel;

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = config.verifyOtpLabel;

    if (otpStatus) {
      otpStatus.className = 'dsar-help';
      otpStatus.textContent = '';
    }
  }

  function buildDsarCard(config) {
    const card = h('div', { class: 'dsar-card' });

    const header = h('div', { class: 'dsar-header' }, [
      h('h2', { class: 'dsar-title', text: config.title }),
      h('p', { class: 'dsar-subtitle', text: config.subtitle }),
    ]);

    const body = h('div', { class: 'dsar-body' });
    const langRow = buildLanguageSelect(config);
    if (langRow) {
      langRow.classList.add('dsar-lang-row--body');
      body.appendChild(langRow);
    }

    const form = h('form', { class: 'dsar-form' });

    const grid1 = h('div', { class: 'dsar-grid two-col' }, [
      makeInputRow({
        id: 'dsar_firstName',
        label: config.labelFirstName || 'First Name',
        required: true,
        placeholder: config.placeholderFirstName || 'Enter your first name',
      }),
      makeInputRow({
        id: 'dsar_lastName',
        label: config.labelLastName || 'Last Name',
        required: true,
        placeholder: config.placeholderLastName || 'Enter your last name',
      }),
      makeInputRow({
        id: 'dsar_email',
        label: config.labelEmail,
        required: true,
        type: 'email',
        placeholder: config.placeholderEmail,
      }),
      makeInputRow({
        id: 'dsar_country',
        label: config.labelCountry,
        required: true,
        placeholder: config.placeholderCountry,
      }),
      h('div', { class: 'dsar-row full dsar-request-types-row' }, [
        h('label', { class: 'dsar-label' }, [
          config.labelRequestTypes,
          h('span', { class: 'dsar-req' }, ' *'),
        ]),
        h('div', { class: 'dsar-check-group' }, [
          h('label', { class: 'dsar-check' }, [
            h('input', {
              type: 'checkbox',
              name: 'requestTypes',
              value: 'Access My Data',
            }),
            h('span', {}, config.requestTypeAccess),
          ]),
          h('label', { class: 'dsar-check' }, [
            h('input', {
              type: 'checkbox',
              name: 'requestTypes',
              value: 'Delete My Data',
            }),
            h('span', {}, config.requestTypeDelete),
          ]),
          h('label', { class: 'dsar-check' }, [
            h('input', {
              type: 'checkbox',
              name: 'requestTypes',
              value: 'Correct My Data',
            }),
            h('span', {}, config.requestTypeCorrect),
          ]),
          h('label', { class: 'dsar-check' }, [
            h('input', {
              type: 'checkbox',
              name: 'requestTypes',
              value: 'Restrict Processing',
            }),
            h('span', {}, config.requestTypeRestrict),
          ]),
          h('label', { class: 'dsar-check' }, [
            h('input', {
              type: 'checkbox',
              name: 'requestTypes',
              value: 'Opt-Out of Marketing',
            }),
            h('span', {}, config.requestTypeOptOut),
          ]),
        ]),
      ]),
    ]);

    const notesRow = h('div', { class: 'dsar-row full' }, [
      h('label', { for: 'dsar_notes', class: 'dsar-label' }, [
        config.labelNotes,
        h('span', { class: 'dsar-optional' }, ` ${config.optionalSuffix}`),
      ]),
      h('textarea', {
        id: 'dsar_notes',
        class: 'dsar-textarea',
        rows: '5',
        placeholder: config.placeholderNotes,
      }),
    ]);

    // OTP Status Message
    const otpStatus = h('div', {
      id: 'dsar_otp_status',
      class: 'dsar-help',
      'aria-live': 'polite',
    });

    // OTP Input Row
    const otpRow = h('div', { class: 'dsar-row full' }, [
      h('label', { for: 'dsar_otp', class: 'dsar-label' }, [
        config.labelOtp,
        h('span', { class: 'dsar-req' }, ' *'),
      ]),

      h(
        'div',
        {
          style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;',
        },
        [
          h('input', {
            id: 'dsar_otp',
            type: 'text',
            class: 'dsar-input',
            placeholder: config.placeholderOtp,
            style: 'flex:1;',
            disabled: true,
          }),

          h(
            'button',
            {
              type: 'button',
              id: 'dsar_sendOtpBtn',
              class: 'dsar-btn',
              style: 'min-width:140px;',
            },
            config.sendOtpLabel,
          ),

          h(
            'button',
            {
              type: 'button',
              id: 'dsar_verifyOtpBtn',
              class: 'dsar-btn',
              style: 'min-width:140px;',
              disabled: true,
            },
            config.verifyOtpLabel,
          ),
        ],
      ),

      otpStatus,
    ]);

    const grid2 = h('div', { class: 'dsar-grid two-col' }, [
      makeInputRow({
        id: 'dsar_cmpUserId',
        label: config.labelCmpUserId,
        optional: true,
        optionalSuffixText: config.optionalSuffix,
        placeholder: config.placeholderCmpUserId,
        readOnly: true,
        value: getOrCreateCMPUserId(),
      }),
    ]);

    const confirmRow = h('div', { class: 'dsar-row full' }, [
      h('label', { class: 'dsar-check' }, [
        h('input', { id: 'dsar_confirmAuth', type: 'checkbox' }),
        h('span', {}, config.confirmAuthText),
      ]),
    ]);

    const trustNote = h('div', { class: 'dsar-trust' }, [config.trustNote]);

    const help = h('div', {
      id: 'dsar_form_help',
      class: 'dsar-help',
      'aria-live': 'polite',
    });
    const submit = h(
      'button',
      { type: 'button', class: 'dsar-btn' },
      config.submitLabel,
    );

   

    const btnRow = h(
      'div',
      {
        style:
          'display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;',
      },
      [submit],
    );

    const actions = h('div', { class: 'dsar-actions' }, [btnRow, help]);

    form.append(grid1, notesRow, otpRow, grid2, confirmRow, trustNote, actions);

    // OTP UI References
    const emailInput = form.querySelector('#dsar_email');
    const otpInput = form.querySelector('#dsar_otp');

    const sendOtpBtn = form.querySelector('#dsar_sendOtpBtn');
    const verifyOtpBtn = form.querySelector('#dsar_verifyOtpBtn');

    // Reset OTP state whenever email changes
    emailInput.addEventListener('input', () => {
      // stop resend timer
      if (resendInterval) {
        clearInterval(resendInterval);
        resendInterval = null;
      }

      otpVerified = false;
      otpRequested = false;
      resendCooldown = false;

      otpInput.value = '';
      otpInput.disabled = true;

      verifyOtpBtn.disabled = true;
      verifyOtpBtn.textContent = config.verifyOtpLabel;

      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = config.sendOtpLabel;

      emailInput.removeAttribute('readonly');

      otpStatus.className = 'dsar-help';
      otpStatus.textContent = '';
    });

    // OTP Status Helper
    function setOtpStatus(message, type = 'success') {
      otpStatus.className = `dsar-help show ${type}`;
      otpStatus.textContent = message;
    }

    // Send OTP Button Handler
    sendOtpBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();

      // Validate email before OTP request
      if (!validateEmail(email)) {
        setOtpStatus(config.otpInvalidEmail, 'error');
        return;
      }

      // Prevent OTP spam requests
      if (resendCooldown) {
        setOtpStatus(config.otpWaitMsg, 'error');
        return;
      }

      try {
        sendOtpBtn.disabled = true;
        sendOtpBtn.textContent = config.sendingOtpLabel;

        // Request OTP from backend
        await requestOtp(email);

        otpRequested = true;

        // Enable OTP input + verification button
        otpInput.disabled = false;
        verifyOtpBtn.disabled = false;

        setOtpStatus(`${config.otpSentPrefix} ${email}`, 'success');

        // Cooldown logic
        resendCooldown = true;

        let seconds = 30;

        resendInterval = setInterval(() => {
          seconds--;

          sendOtpBtn.textContent = `Resend (${seconds}s)`;

          if (seconds <= 0) {
            clearInterval(resendInterval);
            resendInterval = null;

            resendCooldown = false;

            sendOtpBtn.disabled = false;
            sendOtpBtn.textContent = config.resendOtpLabel;
          }
        }, 1000);
      } catch (err) {
        console.error(err);

        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = config.sendOtpLabel;

        setOtpStatus(err?.message || 'Failed to send OTP.', 'error');
      }
    });

    // Verify OTP Button Handler
    verifyOtpBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      const otp = otpInput.value.trim();

      if (!otp) {
        setOtpStatus(config.otpEnterMsg, 'error');
        return;
      }

      try {
        verifyOtpBtn.disabled = true;
        verifyOtpBtn.textContent = config.verifyingOtpLabel;

        // Validate OTP via backend
        await validateOtp(email, otp);

        otpVerified = true;

        // Lock verified email
        emailInput.setAttribute('readonly', 'readonly');

        otpInput.disabled = true;

        verifyOtpBtn.textContent = config.verifiedOtpLabel;

        setOtpStatus('OTP verified successfully.', 'success');
      } catch (err) {
        console.error(err);

        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = config.verifyOtpLabel;

        setOtpStatus(err?.message || 'Invalid OTP.', 'error');
      }
    });

    submit.addEventListener('click', async function () {
      help.className = 'dsar-help';
      help.textContent = '';

      // Collect form values
      const { values, missing } = collectValues(form, config);

      // Validate required fields
      if (missing.length) {
        help.className = 'dsar-help show error';
        help.textContent = `${config.pleaseFillPrefix}${missing.join(', ')}`;
        return;
      }

      // ===================== OFFLINE SYNC / IDEMPOTENCY =====================
      if (!navigator.onLine) {
        if (!otpVerified) {
          help.className = 'dsar-help show error';
          help.textContent =
            'You are offline. Please verify OTP first (requires internet), then you can submit offline.';
          return;
        }

        try {
          const clientSubmissionId = dsarGenerateUUID();
          const submittedAt = new Date().toISOString();

          const submissionPayload = {
            ...values,
            clientSubmissionId,
            submittedAt,
          };

          await dsarQueueOfflineSubmission({
            clientSubmissionId,
            submittedAt,
            ...submissionPayload,
          });

          help.className = 'dsar-help show success';
          help.textContent =
            "You are offline. Your DSAR request will be submitted automatically when you're back online.";
          resetForm(form, config);
          resetOtpFlowState();

          emailInput.removeAttribute('readonly');
          otpInput.disabled = true;
          otpInput.value = '';
          verifyOtpBtn.disabled = true;
          verifyOtpBtn.textContent = config.verifyOtpLabel;
          sendOtpBtn.disabled = false;
          sendOtpBtn.textContent = config.sendOtpLabel;
          otpStatus.className = 'dsar-help';
          otpStatus.textContent = '';
        } catch (err) {
          help.className = 'dsar-help show error';
          help.textContent =
            err?.message || 'Failed to save offline submission.';
        }

        return;
      }
      // ===================== END =====================

      // Ensure OTP requested
      if (!otpRequested) {
        help.className = 'dsar-help show error';
        help.textContent = config.otpRequestFirst;
        return;
      }

      // Ensure OTP verified
      if (!otpVerified) {
        help.className = 'dsar-help show error';
        help.textContent = config.otpVerifyFirst;
        return;
      }

      submit.disabled = true;
      submit.textContent = config.submittingLabel;

      try {
        const clientSubmissionId = dsarGenerateUUID();
        const submittedAt = new Date().toISOString();

        const submissionPayload = {
          ...values,
          clientSubmissionId,
          submittedAt,
        };

        // Submit DSAR request
        const res = await postSubmission(submissionPayload);

        help.className = 'dsar-help show success';
        help.textContent = res?.message || config.successDefault;

      

        // Reset form after successful submission
        resetForm(form, config);
        resetOtpFlowState();

        emailInput.removeAttribute('readonly');
        otpInput.disabled = true;
        otpInput.value = '';
        verifyOtpBtn.disabled = true;
        verifyOtpBtn.textContent = config.verifyOtpLabel;
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = config.sendOtpLabel;
        otpStatus.className = 'dsar-help';
        otpStatus.textContent = '';
      } catch (err) {
     console.error(err);
  help.className = 'dsar-help show error';
  
  // Show DPDP error clearly without "Submit failed:" prefix if it's a compliance block
  if (err?.errorTitle) {
    help.textContent = err.message;  // Just show the clean DPDP message
  } else {
    help.textContent = `${config.submitFailedPrefix}${err?.message || err}`;
  }
      } finally {
        submit.disabled = false;
        submit.textContent = config.submitLabel;
      }
    });

    body.appendChild(form);
    card.append(header, body);

    return card;
  }

  function openModalWith(card, config) {
    const cfg =
      config || mergedFormConfig || mergeFormConfig({ domain: runtimeDomain });
    const ovl = h('div', { class: 'dsar-ovl' });
    const panel = h('div', { class: 'dsar-panel' });

    const head = h('div', { class: 'dsar-head' }, [
      h('span', { class: 'dsar-head-title', text: cfg.modalHeadTitle }),
      h(
        'button',
        {
          type: 'button',
          class: 'dsar-close',
          'data-close': '1',
          'aria-label': cfg.closeAriaLabel,
        },
        '×',
      ),
    ]);

    const body = h('div', { class: 'dsar-modal-body' }, [card]);

    panel.append(head, body);
    ovl.append(panel);
    document.body.appendChild(ovl);
    document.body.style.overflow = 'hidden';

    function close() {
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
  }

  function ensureTriggerExists(config) {
    let el = document.getElementById(DSAR_CONTAINER_ID);
    if (el) return el;

    injectStyles();

    console.log('Trigger not found');
    return;
    // el = document.createElement('button');
    // el.id = DSAR_CONTAINER_ID;
    // el.type = 'button';
    // el.className = 'dsar-floating-trigger';
    // el.textContent = config.floatingButtonLabel;
    // document.body.appendChild(el);

    // return el;
  }

  function bindModal() {
    const attach = (el) => {
      if (!el || el.__dsarBound) return;

      el.addEventListener('click', function (e) {
        e.preventDefault();
        injectStyles();
        resetOtpFlowState();
        const live =
          mergedFormConfig || mergeFormConfig({ domain: runtimeDomain });
        openModalWith(buildDsarCard(live), live);
      });

      el.__dsarBound = true;
    };

    const el = document.getElementById(DSAR_CONTAINER_ID);
    if (el) attach(el);
  }

  function mountInline(cfg) {
    const host = document.getElementById(DSAR_CONTAINER_ID);
    if (!host) return;
    injectStyles();
    host.innerHTML = '';
    host.appendChild(buildDsarCard(cfg));
  }

  async function initDsarRuntime() {
    try {
      const domain = getDomain();
      if (!domain) {
        console.warn('[dsar-runtime] Could not resolve domain.');
        return;
      }

      runtimeDomain = domain;

      try {
        await ensureSharedTranslationService();
      } catch (loadErr) {
        console.warn('[dsar-runtime] Translation service load failed', loadErr);
      }

      activeLanguage = readStoredLanguage();
      const langs = getLanguageOptions();
      if (!langs.some((l) => l.code === activeLanguage)) {
        activeLanguage = SOURCE_LANG;
      }

      let cfg = mergeFormConfig({ domain });

      if (isTranslationEnabled() && activeLanguage !== SOURCE_LANG) {
        try {
          const payload = buildFormPayload(cfg);
          const cacheKey = `${SOURCE_LANG}|${activeLanguage}|${payload.join('\u241F')}`;
          let translated;
          if (formTranslationCache[cacheKey]) {
            cfg = applyFormStringTranslations(
              mergeFormConfig({ domain }),
              formTranslationCache[cacheKey],
            );
          } else {
            const translated = await translateFormStrings(
              payload,
              activeLanguage,
              SOURCE_LANG,
            );
            formTranslationCache[cacheKey] = translated;
            cfg = applyFormStringTranslations(cfg, translated);
          }
        } catch (e) {
          console.error('[dsar-runtime] Initial translation failed', e);
          cfg = mergeFormConfig({ domain });
        }
      }

      mergedFormConfig = cfg;

      if (cfg.showModal) {
        ensureTriggerExists(cfg);
        bindModal();
      } else {
        mountInline(cfg);
      }
    } catch (err) {
      console.error('[dsar-runtime] Failed to initialize:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDsarRuntime);
  } else {
    initDsarRuntime();
  }
})();

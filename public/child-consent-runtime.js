// /public/child-consent-runtime.js
(function () {
  const CMP_USER_ID_STORAGE_KEY = 'cmp_user';
  const SOURCE_LANG = 'en';
  const CCF_LANG_STORAGE_KEY = 'ccf_ui_lang';
  const SHARED_TRANSLATION_SCRIPT = 'translation-service.js';
  let hostId = '';

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

  const CCF_UI_DEFAULTS = {
    title: 'Child Consent Form',
    subtitle: '',
    submitLabel: 'Submit Consent',
    intro:
      'Please provide the required details. Parent or guardian consent will be required for minors.',
    identityNote:
      'Date of birth is used to determine whether self-consent or parental consent applies.',
    adult:
      'Since the user is 18 or above, self-consent is sufficient and parent/guardian consent is not required.',
    adultCheckbox:
      'I have read and agree to the privacy notice and consent terms.',
    minorNotice:
      'Since the user is below 18, parent or guardian consent is required.',
    guardianDeclaration:
      'I confirm that I am the parent or legal guardian of the child.',
    guardianCheckbox:
      'I consent to the collection and processing of the child’s personal data as described.',
    footerNote:
      'Submission records are logged for audit and compliance purposes.',
    sectionYourDetails: 'Your Details',
    sectionSelfConsent: 'Self Consent',
    sectionParentConsent: 'Parent / Guardian Consent',
    labelFirstName: 'First Name',
    labelLastName: 'Last Name',
    labelFullName: 'Full Name',
    labelEmail: 'Email',
    labelDob: 'Date of Birth',
    labelCmpUserId: 'CMP User ID',
    cmpUserIdHelp: 'Auto-generated and stored for this user.',
    placeholderFirstName: 'Enter first name',
    placeholderLastName: 'Enter last name',
    placeholderFullName: 'Enter full name',
    placeholderEmail: 'Enter email address',
    placeholderGuardianFirstName: 'Enter parent/guardian first name',
    placeholderGuardianLastName: 'Enter parent/guardian last name',
    placeholderGuardianName: 'Enter parent/guardian full name',
    placeholderGuardianEmail: 'Enter parent/guardian email',
    placeholderGuardianPhone: 'Enter phone number',
    labelGuardianFirstName: 'Parent/Guardian First Name',
    labelGuardianLastName: 'Parent/Guardian Last Name',
    labelGuardianName: 'Parent/Guardian Full Name',
    labelGuardianEmail: 'Parent/Guardian Email',
    labelGuardianPhone: 'Parent/Guardian Phone',
    labelRelationship: 'Relationship to Child',
    relationshipPlaceholder: 'Select relationship',
    adultAgeConfirm: 'I confirm that I am 18 years of age or older.',
    sendVerifyLabel: 'Send Verification Code',
    verifyOtpLabel: 'Verify OTP',
    placeholderOtp: 'Enter OTP',
    verifyNotStarted: 'Verification not started.',
    verifyDetailsChanged: 'Details changed. Please send and verify OTP again.',
    verifyRequiredBanner:
      'Parent/guardian verification is required before final submission.',
    verifyOptionalBanner:
      'Parent/guardian verification is optional for this configuration.',
    labelLanguage: 'Language',
    agePending: 'Age-based consent flow will appear here. Threshold: 18+',
    ageAdult:
      'Age determined as {age}. Self-consent flow is applicable. Parent/guardian consent is not required.',
    ageMinor: 'Age determined as {age}. Parent/guardian consent is required.',
    dobHelp: 'Age threshold: 18 years',
    cmpUserIdPlaceholder: 'Auto-generated CMP User ID',
  };

  const CCF_STRING_KEYS = Object.keys(CCF_UI_DEFAULTS);

  let activeLanguage = SOURCE_LANG;
  let formTranslationCache = {};
  let mergedChildConfig = null;
  let translateFormRequestId = 0;

    // ===================== OFFLINE SYNC / IDEMPOTENCY =====================
  const CC_DB_NAME = 'grc_offline_consent_db';
  const CC_STORE_NAME = 'offlineSubmissions';
  const CC_FORM_TYPE = 'childConsent';
  const CC_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  let ccIsSyncing = false;

  function ccOpenDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CC_DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(CC_STORE_NAME)) {
          const store = db.createObjectStore(CC_STORE_NAME, {
            keyPath: 'clientSubmissionId',
          });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function ccGenerateUUID() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  async function ccQueueOfflineSubmission(payload) {
    const db = await ccOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CC_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CC_STORE_NAME);
      const req = store.put({
        clientSubmissionId: payload.clientSubmissionId,
        formType: CC_FORM_TYPE,
        payload,
        createdAt: Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function ccGetAllOfflineSubmissions() {
    const db = await ccOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CC_STORE_NAME, 'readonly');
      const store = tx.objectStore(CC_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = (e) => {
        const all = e.target.result || [];
        resolve(all.filter((r) => r.formType === CC_FORM_TYPE));
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function ccDeleteOfflineSubmission(clientSubmissionId) {
    const db = await ccOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CC_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CC_STORE_NAME);
      const req = store.delete(clientSubmissionId);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function ccCleanupExpired() {
    const db = await ccOpenDb();
    return new Promise((resolve) => {
      const tx = db.transaction(CC_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CC_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = (e) => {
        const now = Date.now();
        (e.target.result || []).forEach((r) => {
          if (r.formType === CC_FORM_TYPE && now - r.createdAt > CC_EXPIRY_MS) {
            store.delete(r.clientSubmissionId);
          }
        });
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

    async function ccSyncOfflineQueue() {
    if (ccIsSyncing) return;
    ccIsSyncing = true;

    try {
      const records = await ccGetAllOfflineSubmissions();
      for (const record of records) {
        try {
          const { payload } = record;

          let submissionId = payload.submissionId;

          // Case 1: Adult offline queue (no submissionId) → call /start first
          if (!submissionId && payload.startPayload) {
            const startRes = await startChildConsentSubmission(
              payload.startPayload,
            );
            submissionId = startRes.submissionId;
          }

          // Case 2: Verified minor offline queue → submissionId already exists,
          //         skip /start (would create new submission without OTP verification)
          if (!submissionId) {
            throw new Error(
              'Queued record missing both submissionId and startPayload',
            );
          }

          // Always call /finalize with submissionId + clientSubmissionId
          const finalizePayload = {
            ...payload.finalizePayload,
            submissionId,
            clientSubmissionId: payload.clientSubmissionId,
            submittedAt: payload.submittedAt,
          };

          await finalizeChildConsentSubmission(finalizePayload);
          await ccDeleteOfflineSubmission(record.clientSubmissionId);

          console.log(
            '[child-consent-runtime] offline sync success:',
            record.clientSubmissionId,
          );
        } catch (err) {
          const status = err?.status || err?.statusCode || 0;
          if (status >= 400 && status < 500) {
            await ccDeleteOfflineSubmission(record.clientSubmissionId);
            console.warn(
              '[child-consent-runtime] offline sync permanent error, removed:',
              record.clientSubmissionId,
              err?.message,
            );
          } else {
            console.warn(
              '[child-consent-runtime] offline sync temp error, will retry:',
              record.clientSubmissionId,
              err?.message,
            );
          }
        }
      }
    } finally {
      ccIsSyncing = false;
    }
  }

  window.addEventListener('online', ccSyncOfflineQueue);
  ccCleanupExpired();
  ccSyncOfflineQueue();
  // ===================== END =====================

  /* ---------------- CSS ---------------- */
  //   function injectStyles(theme = {}) {
  //     if (document.getElementById('ccf-styles')) return;

  //     const primary = theme.primaryColor || '#2b245c';
  //     const primaryHover = theme.primaryHoverColor || '#4338ca';
  //     const danger = theme.dangerColor || '#dc2626';

  //     const css = `
  // :root{
  //   --ccf-bg:#ffffff;
  //   --ccf-page:#f7f9fc;
  //   --ccf-fg:#111827;
  //   --ccf-muted:#6b7280;
  //   --ccf-border:#e5e7eb;
  //   --ccf-brand:${primary};
  //   --ccf-brand-hover:${primaryHover};
  //   --ccf-danger:${danger};
  //   --ccf-success:#065f46;
  //   --ccf-success-bg:#ecfdf5;
  //   --ccf-warning:#92400e;
  //   --ccf-warning-bg:#fffbeb;
  //   --ccf-shadow:0 8px 24px rgba(0,0,0,.08);
  // }
  // .ccf-reset{
  //   font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Helvetica Neue',Arial,'Noto Sans',sans-serif;
  //   color:var(--ccf-fg);
  // }
  // .ccf-card{
  //   background:var(--ccf-bg);
  //   border:1px solid var(--ccf-border);
  //   border-radius:14px;
  //   box-shadow:var(--ccf-shadow);
  //   overflow:hidden;
  // }
  // .ccf-headbar{ padding:18px 18px 0 18px; }
  // .ccf-brand-wrap{ display:flex; align-items:center; gap:12px; margin-bottom:10px; }
  // .ccf-logo{ max-height:40px; max-width:140px; object-fit:contain; }
  // .ccf-title{ font-size:20px; font-weight:700; line-height:1.2; }
  // .ccf-subtitle{ color:var(--ccf-muted); font-size:14px; margin-top:4px; }
  // .ccf-body{ padding:18px; }
  // .ccf-section{
  //   border:1px solid var(--ccf-border);
  //   border-radius:12px;
  //   padding:14px;
  //   margin-bottom:14px;
  // }
  // .ccf-section-title{ font-size:15px; font-weight:700; margin-bottom:10px; }
  // .ccf-section-note{ font-size:13px; color:var(--ccf-muted); margin-bottom:12px; }
  // .ccf-grid{ display:grid; gap:14px; }
  // .ccf-row{ display:flex; flex-direction:column; gap:6px; min-width:0; }
  // .ccf-row.full{ grid-column:1/-1; }
  // .ccf-label{ font-size:14px; font-weight:600; }
  // .ccf-req{ color:var(--ccf-danger); }
  // .ccf-input,.ccf-select,.ccf-textarea{
  //   width:100%;
  //   max-width:100%;
  //   box-sizing:border-box;
  //   border:1px solid var(--ccf-border);
  //   border-radius:10px;
  //   padding:10px 12px;
  //   font-size:14px;
  //   background:#fff;
  //   color:var(--ccf-fg);
  //   outline:none;
  //   transition:border-color .15s, box-shadow .15s;
  // }
  // .ccf-input:focus,.ccf-select:focus,.ccf-textarea:focus{
  //   border-color:var(--ccf-brand);
  //   box-shadow:0 0 0 3px rgba(79,70,229,.15);
  // }
  // .ccf-input[readonly]{
  //   background:#f9fafb;
  //   color:#6b7280;
  // }
  // .ccf-help-inline{ font-size:12px; color:var(--ccf-muted); }
  // .ccf-check{ display:flex; align-items:flex-start; gap:10px; }
  // .ccf-check input{ width:16px; height:16px; margin-top:2px; }
  // .ccf-check label{ font-size:14px; line-height:1.4; }
  // .ccf-banner{
  //   border-radius:10px;
  //   padding:10px 12px;
  //   font-size:13px;
  //   margin-bottom:12px;
  // }
  // .ccf-banner.info{ background:#eef2ff; color:#3730a3; }
  // .ccf-banner.success{ background:var(--ccf-success-bg); color:var(--ccf-success); }
  // .ccf-banner.warning{ background:var(--ccf-warning-bg); color:var(--ccf-warning); }
  // .ccf-banner.error{ background:#fef2f2; color:#991b1b; }
  // .ccf-hidden{ display:none !important; }
  // .ccf-actions{ display:flex; align-items:center; gap:10px; padding-top:8px; flex-wrap:wrap; }
  // .ccf-btn{
  //   display:inline-flex;
  //   align-items:center;
  //   justify-content:center;
  //   padding:10px 14px;
  //   border-radius:10px;
  //   border:1px solid transparent;
  //   background:var(--ccf-brand);
  //   color:#fff;
  //   font-weight:600;
  //   font-size:14px;
  //   cursor:pointer;
  // }
  // .ccf-btn:hover{ background:var(--ccf-brand-hover); }
  // .ccf-btn.secondary{ background:#fff; color:var(--ccf-fg); border-color:var(--ccf-border); }
  // .ccf-btn.secondary:hover{ background:#f9fafb; }
  // .ccf-btn[disabled]{ opacity:.65; cursor:not-allowed; }
  // .ccf-status{ font-size:13px; }
  // .ccf-status.success{ color:var(--ccf-success); }
  // .ccf-status.error{ color:#b91c1c; }
  // .ccf-status.info{ color:var(--ccf-muted); }
  // .ccf-divider{ height:1px; background:var(--ccf-border); margin:14px 0; }
  // .ccf-footnote{ margin-top:10px; font-size:12px; color:var(--ccf-muted); line-height:1.5; }
  // .ccf-ovl{
  //   position:fixed; inset:0; background:rgba(0,0,0,.5);
  //   display:flex; align-items:center; justify-content:center;
  //   padding:16px; z-index:9999;
  // }
  // .ccf-panel{ width:100%; max-width:760px; max-height:90vh; overflow:auto; }
  // .ccf-modal-head{
  //   background:#2b245c; border:1px solid var(--ccf-border); border-bottom:none;
  //   border-radius:14px 14px 0 0; padding:10px 12px;
  //   display:flex; align-items:center; justify-content:space-between;
  // }
  // .ccf-close{
  //   background:#fff; border:1px solid var(--ccf-border); border-radius:8px;
  //   width:36px; height:32px; display:inline-flex; align-items:center; justify-content:center;
  //   cursor:pointer; font-size:18px; line-height:1;
  // }
  // .ccf-close:hover{ background:#f3f4f6; }
  // .ccf-modal-body{
  //   background:#fff; border:1px solid var(--ccf-border); border-top:none;
  //   border-radius:0 0 14px 14px;
  // }
  // @media (min-width:640px){
  //   .ccf-grid.two-col{
  //     grid-template-columns:1fr 1fr;
  //     column-gap:14px;
  //     row-gap:14px;
  //   }
  // }
  // `.trim();

  //     const style = document.createElement('style');
  //     style.id = 'ccf-styles';
  //     style.textContent = css;
  //     document.head.appendChild(style);
  //     document.body.classList.add('ccf-reset');
  //   }
  function injectStyles(theme = {}) {
    if (document.getElementById('ccf-styles')) return;

    const primary = theme.primaryColor || '#2B245C';
    const primaryHover = theme.primaryHoverColor || '#211b4a';
    const danger = theme.dangerColor || '#dc2626';

    const css = `
:root{
  --ccf-bg:#ffffff;
  --ccf-page:#f5f7fb;
  --ccf-fg:#111827;
  --ccf-muted:#667085;
  --ccf-border:#e4e7ec;
  --ccf-border-strong:#d0d5dd;
  --ccf-brand:${primary};
  --ccf-brand-hover:${primaryHover};
  --ccf-danger:${danger};
  --ccf-success:#15803d;
  --ccf-success-bg:#ecfdf5;
  --ccf-warning:#92400e;
  --ccf-warning-bg:#fffbeb;
  --ccf-soft:#f1effb;
  --ccf-shadow:0 22px 60px rgba(17,24,39,.22);
  --ccf-shadow-soft:0 10px 30px rgba(17,24,39,.10);
  --ccf-radius:16px;
}

.ccf-reset,
.ccf-reset *{
  box-sizing:border-box;
  font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Helvetica Neue',Arial,'Noto Sans',sans-serif;
}

.ccf-reset{
  color:var(--ccf-fg);
}

.ccf-card{
  width:100%;
  background:var(--ccf-bg);
  border:1px solid rgba(228,231,236,.95);
  border-radius:var(--ccf-radius);
  box-shadow:var(--ccf-shadow-soft);
  overflow:hidden;
  display:flex;
  flex-direction:column;
  max-height:78vh;
}

/* Header */
.ccf-headbar{
  position:relative;
  background:#2B245C;
  color:#ffffff;
  padding:18px 20px 16px;
  overflow:visible;
  flex:0 0 auto;
}

.ccf-headbar:before{
  content:'';
  position:absolute;
  top:-85px;
  right:-110px;
  width:240px;
  height:240px;
  border-radius:999px;
  background:rgba(255,255,255,.10);
  pointer-events:none;
}

.ccf-headbar:after{
  content:'';
  position:absolute;
  right:-80px;
  bottom:-120px;
  width:220px;
  height:220px;
  border-radius:999px;
  background:rgba(255,255,255,.07);
  pointer-events:none;
}

.ccf-brand-wrap{
  position:relative;
  z-index:1;
  display:flex;
  align-items:center;
  gap:12px;
  margin-bottom:0;
}

.ccf-logo{
  max-height:38px;
  max-width:135px;
  object-fit:contain;
  background:#ffffff;
  border-radius:8px;
  padding:4px;
}

.ccf-title{
  margin:0;
  font-size:18px;
  font-weight:800;
  line-height:1.25;
  letter-spacing:-.02em;
  color:#ffffff;
  text-shadow:0 1px 2px rgba(0,0,0,.25);
}

.ccf-subtitle{
  margin-top:5px;
  max-width:620px;
  color:rgba(255,255,255,.92);
  font-size:12.5px;
  line-height:1.45;
}

/* Language picker */
.ccf-headbar .ccf-row.full{
  position:relative;
  z-index:9999;
  max-width:220px;
  margin-top:12px !important;
  margin-bottom:0 !important;
}

.ccf-headbar label,
.ccf-headbar .grc-lang-label,
.ccf-headbar .grc-language-label{
  color:#ffffff !important;
  font-size:11.5px !important;
  font-weight:800 !important;
  line-height:1.2 !important;
  margin-bottom:5px !important;
}

.ccf-headbar select,
.ccf-headbar .grc-lang-select select,
.ccf-headbar .grc-language-select select{
  width:220px !important;
  max-width:220px !important;
  min-height:34px !important;
  height:34px !important;
  border-radius:8px !important;
  border:1px solid rgba(255,255,255,.35) !important;
  background:#ffffff !important;
  color:#111827 !important;
  font-size:12px !important;
  padding:6px 10px !important;
  outline:none !important;
  box-shadow:0 5px 14px rgba(0,0,0,.14) !important;
}

.ccf-headbar select option,
.ccf-headbar .grc-lang-select select option,
.ccf-headbar .grc-language-select select option{
  background:#ffffff !important;
  color:#111827 !important;
  font-size:12px !important;
}

.ccf-headbar .grc-lang-options,
.ccf-headbar .grc-lang-menu,
.ccf-headbar .grc-language-options,
.ccf-headbar .grc-language-menu,
.ccf-headbar [role="listbox"],
.ccf-headbar ul{
  max-height:125px !important;
  overflow-y:auto !important;
  overflow-x:hidden !important;
  background:#ffffff !important;
  border:1px solid #d0d5dd !important;
  border-radius:9px !important;
  box-shadow:0 14px 28px rgba(17,24,39,.20) !important;
  z-index:999999 !important;
}

/* Body */
.ccf-body{
  padding:18px 20px;
  background:linear-gradient(180deg,#ffffff 0%,#fbfcff 100%);
  overflow-y:auto;
  overflow-x:hidden;
  flex:1 1 auto;
  max-height:calc(78vh - 120px);
}

.ccf-body::-webkit-scrollbar,
.ccf-panel::-webkit-scrollbar{
  width:7px;
}

.ccf-body::-webkit-scrollbar-track,
.ccf-panel::-webkit-scrollbar-track{
  background:#f1f5f9;
  border-radius:20px;
}

.ccf-body::-webkit-scrollbar-thumb,
.ccf-panel::-webkit-scrollbar-thumb{
  background:#b8b1d8;
  border-radius:20px;
}

.ccf-body::-webkit-scrollbar-thumb:hover,
.ccf-panel::-webkit-scrollbar-thumb:hover{
  background:#2B245C;
}

/* Sections */
.ccf-section{
  border:1px solid var(--ccf-border);
  border-radius:14px;
  padding:14px;
  margin-bottom:14px;
  background:#ffffff;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.ccf-section-title{
  font-size:14px;
  font-weight:800;
  color:#111827;
  margin-bottom:8px;
  line-height:1.3;
}

.ccf-section-note{
  font-size:12px;
  color:var(--ccf-muted);
  margin-bottom:12px;
  line-height:1.45;
}

.ccf-grid{
  display:grid;
  gap:13px;
}

.ccf-row{
  display:flex;
  flex-direction:column;
  gap:6px;
  min-width:0;
}

.ccf-row.full{
  grid-column:1/-1;
}

.ccf-label{
  font-size:12px;
  font-weight:700;
  color:#1f2937;
  line-height:1.35;
}

.ccf-req{
  color:var(--ccf-danger);
}

/* Inputs */
.ccf-input,
.ccf-select,
.ccf-textarea{
  width:100%;
  max-width:100%;
  box-sizing:border-box;
  border:1px solid var(--ccf-border);
  border-radius:10px;
  padding:10px 12px;
  min-height:38px;
  font-size:13px;
  line-height:1.35;
  background:#ffffff;
  color:var(--ccf-fg);
  outline:none;
  transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.ccf-input::placeholder,
.ccf-textarea::placeholder{
  color:#98a2b3;
}

.ccf-input:hover,
.ccf-select:hover,
.ccf-textarea:hover{
  border-color:#c7c2df;
}

.ccf-input:focus,
.ccf-select:focus,
.ccf-textarea:focus{
  border-color:var(--ccf-brand);
  box-shadow:0 0 0 4px rgba(43,36,92,.14);
}

.ccf-input[readonly]{
  background:#f8fafc;
  color:#475569;
  border-style:dashed;
}

.ccf-textarea{
  min-height:86px;
  resize:vertical;
}

.ccf-help-inline{
  font-size:11px;
  color:var(--ccf-muted);
  line-height:1.4;
}

/* Checkbox */
.ccf-check{
  display:flex;
  align-items:flex-start;
  gap:10px;
  border:1px solid var(--ccf-border);
  background:#ffffff;
  border-radius:12px;
  padding:10px 12px;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
}

.ccf-check input{
  width:15px;
  height:15px;
  margin-top:1px;
  flex:0 0 auto;
  accent-color:var(--ccf-brand);
}

.ccf-check label{
  font-size:12px;
  font-weight:600;
  line-height:1.4;
  color:#344054;
}

/* Banners */
.ccf-banner{
  border-radius:12px;
  padding:10px 12px;
  font-size:12px;
  line-height:1.45;
  margin-bottom:12px;
  border:1px solid transparent;
}

.ccf-banner.info{
  background:#f1effb;
  color:#2B245C;
  border-color:#e0dcf4;
}

.ccf-banner.success{
  background:var(--ccf-success-bg);
  color:var(--ccf-success);
  border-color:#bbf7d0;
}

.ccf-banner.warning{
  background:var(--ccf-warning-bg);
  color:var(--ccf-warning);
  border-color:#fde68a;
}

.ccf-banner.error{
  background:#fef2f2;
  color:#991b1b;
  border-color:#fecaca;
}

.ccf-hidden{
  display:none !important;
}

/* Buttons and actions */
.ccf-actions{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:10px;
  padding-top:12px;
  flex-wrap:wrap;
}

.ccf-btn{
  width:fit-content;
  min-width:155px;
  min-height:40px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:10px 26px;
  border-radius:9px;
  border:1px solid transparent;
  background:var(--ccf-brand);
  color:#ffffff;
  font-weight:800;
  font-size:12px;
  line-height:1;
  cursor:pointer;
  white-space:nowrap;
  box-shadow:0 9px 20px rgba(43,36,92,.26);
  transition:background-color .18s ease, transform .12s ease, opacity .18s ease, box-shadow .18s ease;
}

.ccf-btn:hover{
  background:var(--ccf-brand-hover);
  box-shadow:0 12px 24px rgba(43,36,92,.34);
}

.ccf-btn:active{
  transform:translateY(1px);
}

.ccf-btn.secondary{
  background:#ffffff;
  color:var(--ccf-brand);
  border-color:var(--ccf-brand);
  box-shadow:none;
}

.ccf-btn.secondary:hover{
  background:var(--ccf-brand);
  color:#ffffff;
  box-shadow:0 8px 18px rgba(43,36,92,.20);
}

.ccf-btn[disabled]{
  opacity:.65;
  cursor:not-allowed;
  box-shadow:none;
}

.ccf-status{
  font-size:12px;
  line-height:1.4;
}

.ccf-status.success{
  color:var(--ccf-success);
}

.ccf-status.error{
  color:#b91c1c;
}

.ccf-status.info{
  color:var(--ccf-muted);
}

.ccf-divider{
  height:1px;
  background:var(--ccf-border);
  margin:14px 0;
}

.ccf-footnote{
  margin-top:10px;
  font-size:11.5px;
  color:var(--ccf-muted);
  line-height:1.5;
  text-align:center;
}

/* OTP row */
.ccf-actions .ccf-input{
  max-width:170px !important;
  min-width:150px;
}

/* Modal */
.ccf-ovl{
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

.ccf-panel{
  width:100%;
  max-width:740px;
  max-height:82vh;
  overflow:hidden;
  border-radius:var(--ccf-radius);
  box-shadow:var(--ccf-shadow);
}

.ccf-modal-head{
  position:absolute;
  top:22px;
  right:24px;
  z-index:10001;
  background:transparent;
  border:0;
  padding:0;
  display:flex;
  align-items:center;
  justify-content:flex-end;
}

.ccf-modal-head span{
  display:none;
}

.ccf-close{
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

.ccf-close:hover{
  background:rgba(255,255,255,.24);
  border-color:rgba(255,255,255,.44);
  transform:translateY(-1px);
}

.ccf-modal-body{
  background:#ffffff;
  border:1px solid var(--ccf-border);
  border-radius:var(--ccf-radius);
  overflow:hidden;
  max-height:82vh;
}

.ccf-modal-body .ccf-card{
  border:0;
  border-radius:0;
  box-shadow:none;
}

/* Responsive */
@media (min-width:640px){
  .ccf-grid.two-col{
    grid-template-columns:1fr 1fr;
    column-gap:16px;
    row-gap:13px;
  }
}

@media (max-width:639px){
  .ccf-ovl{
    align-items:flex-start;
    padding:10px;
  }

  .ccf-panel,
  .ccf-modal-body,
  .ccf-card{
    max-height:90vh;
  }

  .ccf-headbar{
    padding:15px 16px 14px;
  }

  .ccf-title{
    font-size:16px;
    margin-right:36px;
  }

  .ccf-subtitle{
    font-size:11.5px;
  }

  .ccf-body{
    padding:15px;
    max-height:calc(90vh - 112px);
  }

  .ccf-section{
    padding:12px;
  }

  .ccf-headbar .ccf-row.full,
  .ccf-headbar select,
  .ccf-headbar .grc-lang-select select,
  .ccf-headbar .grc-language-select select{
    width:100% !important;
    max-width:100% !important;
  }

  .ccf-actions{
    flex-direction:column;
    align-items:stretch;
  }

  .ccf-actions .ccf-btn,
  .ccf-actions .ccf-input{
    width:100% !important;
    max-width:100% !important;
  }

  .ccf-btn{
    width:100%;
    min-width:100%;
  }

  .ccf-modal-head{
    top:18px;
    right:18px;
  }
}
  /* CHILD CONSENT SMALL LANGUAGE DROPDOWN */
.ccf-headbar{
  overflow:visible !important;
}

.ccf-headbar .ccf-row.full{
  position:relative !important;
  z-index:99999 !important;
  max-width:190px !important;
  margin-top:10px !important;
  margin-bottom:0 !important;
}

.ccf-custom-lang-wrap{
  width:190px;
  max-width:190px;
  position:relative;
  z-index:999999;
}

.ccf-custom-lang-label{
  display:block;
  margin:0 0 5px 0;
  color:#ffffff !important;
  font-size:11px !important;
  font-weight:800 !important;
  line-height:1.2;
}

.ccf-custom-lang-button{
  width:100%;
  height:32px;
  border:1px solid rgba(255,255,255,.35);
  border-radius:8px;
  background:#ffffff !important;
  color:#111827 !important;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:6px 9px;
  font-size:12px;
  font-weight:500;
  cursor:pointer;
  box-shadow:0 5px 14px rgba(0,0,0,.14);
}

.ccf-custom-lang-button:focus{
  outline:none;
  box-shadow:0 0 0 3px rgba(255,255,255,.25);
}

.ccf-custom-lang-text{
  display:block;
  color:#111827 !important;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
  font-size:12px;
  line-height:1.2;
}

.ccf-custom-lang-icon{
  color:#111827 !important;
  font-size:10px;
  flex:0 0 auto;
}

.ccf-custom-lang-menu{
  position:absolute;
  left:0;
  top:calc(100% + 4px);
  width:100%;
  max-height:115px !important;
  overflow-y:auto !important;
  overflow-x:hidden !important;
  background:#ffffff;
  border:1px solid #d0d5dd;
  border-radius:8px;
  box-shadow:0 12px 24px rgba(17,24,39,.22);
  padding:4px;
  z-index:999999;
}

.ccf-custom-lang-menu[hidden]{
  display:none !important;
}

.ccf-custom-lang-item{
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

.ccf-custom-lang-item:hover{
  background:#f1effb;
  color:#2B245C;
}

.ccf-custom-lang-item.active{
  background:#2B245C;
  color:#ffffff;
}

.ccf-custom-lang-menu::-webkit-scrollbar{
  width:6px;
}

.ccf-custom-lang-menu::-webkit-scrollbar-track{
  background:#f1f5f9;
  border-radius:20px;
}

.ccf-custom-lang-menu::-webkit-scrollbar-thumb{
  background:#b8b1d8;
  border-radius:20px;
}

.ccf-custom-lang-menu::-webkit-scrollbar-thumb:hover{
  background:#2B245C;
}

@media(max-width:639px){
  .ccf-headbar .ccf-row.full,
  .ccf-custom-lang-wrap{
    width:100% !important;
    max-width:100% !important;
  }

  .ccf-custom-lang-menu{
    max-height:105px !important;
  }
}
  /* TEXT WEIGHT FIX - LESS BOLD / CLEAN LOOK */

/* Language label/header */
.ccf-headbar label,
.ccf-headbar .grc-lang-label,
.ccf-headbar .grc-language-label,
.ccf-custom-lang-label{
  font-weight:500 !important;
  font-size:11.5px !important;
  letter-spacing:0 !important;
  text-shadow:none !important;
  color:#ffffff !important;
}

/* Main title clean, no blurry shadow */
.ccf-title{
  font-weight:700 !important;
  text-shadow:none !important;
  letter-spacing:0 !important;
}

/* Section title like Your Details */
.ccf-section-title{
  font-weight:600 !important;
  font-size:15px !important;
  letter-spacing:0 !important;
  text-shadow:none !important;
  color:#111827 !important;
}

/* Field labels also slightly softer */
.ccf-label{
  font-weight:600 !important;
  letter-spacing:0 !important;
  text-shadow:none !important;
}

/* Checkbox label clean */
.ccf-check label{
  font-weight:500 !important;
  letter-spacing:0 !important;
  text-shadow:none !important;
}

/* Input text clean */
.ccf-input,
.ccf-select,
.ccf-textarea{
  font-weight:400 !important;
  letter-spacing:0 !important;
}
  /* CHILD CONSENT POPUP HEADER + TITLE HOVER EFFECT */
.ccf-headbar{
  transition:
    background-color .22s ease,
    box-shadow .22s ease,
    filter .22s ease !important;
  cursor: default;
}

.ccf-headbar:hover{
  background:#211b4a !important;
  box-shadow: inset 0 -1px 0 rgba(255,255,255,.14), 0 10px 24px rgba(43,36,92,.22) !important;
  filter: brightness(1.04);
}

.ccf-title{
  display:block !important;
  width:fit-content !important;
  max-width:100% !important;
  transition:
    transform .22s ease,
    color .22s ease,
    text-shadow .22s ease !important;
  cursor: default;
}

.ccf-title:hover{
  transform: translateY(-2px);
  color:#ffffff !important;
  text-shadow:0 8px 20px rgba(255,255,255,.28) !important;
}

.ccf-subtitle{
  display:block !important;
  width:fit-content !important;
  max-width:620px !important;
  transition:
    transform .22s ease,
    color .22s ease,
    text-shadow .22s ease !important;
  cursor: default;
}

.ccf-subtitle:hover{
  transform: translateY(-2px);
  color:#ffffff !important;
  text-shadow:0 8px 18px rgba(255,255,255,.24) !important;
}

/* When hovering full child consent purple header */
.ccf-headbar:hover .ccf-title{
  transform: translateY(-1px);
  color:#ffffff !important;
  text-shadow:0 8px 20px rgba(255,255,255,.22) !important;
}

.ccf-headbar:hover .ccf-subtitle{
  color:#ffffff !important;
}
`.trim();

    const style = document.createElement('style');
    style.id = 'ccf-styles';
    style.textContent = css;
    document.head.appendChild(style);
    document.body.classList.add('ccf-reset');
  }
  /* ---------------- Utils ---------------- */
  function normalizeDomain(domain) {
    if (!domain) return '';
    let d = String(domain).trim().toLowerCase();
    d = d.replace(/^https?:\/\//i, '');
    d = d.split('/')[0];
    d = d.split('?')[0];
    d = d.split('#')[0];
    d = d.replace(/\/+$/, '');
    return d;
  }

  function safeText(v) {
    return v == null ? '' : String(v);
  }

  function calculateAge(dob) {
    if (!dob) return null;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age >= 0 ? age : null;
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

  function h(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'for') n.htmlFor = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
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

  function fieldRow(label, input, opts = {}) {
    const row = h('div', { class: `ccf-row ${opts.full ? 'full' : ''}` });
    const labelEl = h('label', { class: 'ccf-label' }, [
      label,
      opts.required ? h('span', { class: 'ccf-req' }, ' *') : null,
    ]);
    row.appendChild(labelEl);
    row.appendChild(input);
    if (opts.help)
      row.appendChild(h('div', { class: 'ccf-help-inline', text: opts.help }));
    return row;
  }

  function checkboxRow(id, label, required = false) {
    const input = h('input', { id, type: 'checkbox' });
    const labelEl = h('label', { for: id }, [
      label,
      required ? h('span', { class: 'ccf-req' }, ' *') : null,
    ]);
    return h('div', { class: 'ccf-row full' }, [
      h('div', { class: 'ccf-check' }, [input, labelEl]),
    ]);
  }

  function getScriptEl() {
    return (
      document.currentScript ||
      document.querySelector('script[src*="child-consent-runtime.js"]')
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

  function mergeChildConsentConfig(base) {
    const ui = { ...CCF_UI_DEFAULTS };
    if (base?.title) ui.title = safeText(base.title);
    if (base?.subtitle) ui.subtitle = safeText(base.subtitle);
    if (base?.submitLabel) ui.submitLabel = safeText(base.submitLabel);
    const cs = base?.consentStatements || {};
    if (cs.intro) ui.intro = safeText(cs.intro);
    if (cs.identityNote) ui.identityNote = safeText(cs.identityNote);
    if (cs.adult) ui.adult = safeText(cs.adult);
    if (cs.adultCheckbox) ui.adultCheckbox = safeText(cs.adultCheckbox);
    if (cs.minorNotice) ui.minorNotice = safeText(cs.minorNotice);
    if (cs.guardianDeclaration)
      ui.guardianDeclaration = safeText(cs.guardianDeclaration);
    if (cs.guardianCheckbox)
      ui.guardianCheckbox = safeText(cs.guardianCheckbox);
    if (cs.footerNote) ui.footerNote = safeText(cs.footerNote);
    return { ...base, ui };
  }

  function buildChildConsentPayload(cfg) {
    const ui = cfg.ui || CCF_UI_DEFAULTS;
    return CCF_STRING_KEYS.map((k) => (typeof ui[k] === 'string' ? ui[k] : ''));
  }

  function applyChildConsentTranslations(cfg, translatedArr) {
    const ui = { ...(cfg.ui || CCF_UI_DEFAULTS) };
    const svc = window.GRCTranslationService;
    CCF_STRING_KEYS.forEach((k, i) => {
      const orig = ui[k] || '';
      ui[k] = svc?.sanitizeTranslatedText
        ? svc.sanitizeTranslatedText(translatedArr[i], orig)
        : translatedArr[i] || orig;
    });
    return {
      ...cfg,
      title: ui.title,
      subtitle: ui.subtitle,
      submitLabel: ui.submitLabel,
      consentStatements: {
        ...(cfg.consentStatements || {}),
        intro: ui.intro,
        identityNote: ui.identityNote,
        adult: ui.adult,
        adultCheckbox: ui.adultCheckbox,
        minorNotice: ui.minorNotice,
        guardianDeclaration: ui.guardianDeclaration,
        guardianCheckbox: ui.guardianCheckbox,
        footerNote: ui.footerNote,
      },
      ui,
    };
  }

  function isTranslationEnabled() {
    const el = getScriptEl();
    if (el?.dataset?.ccfTranslate === 'false') return false;
    return true;
  }

  function getLanguageOptions() {
    const el = getScriptEl();
    const raw = el?.dataset?.ccfLanguages;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (e) {
        console.warn(
          '[child-consent-runtime] Invalid data-ccf-languages JSON',
          e,
        );
      }
    }
    return (
      window.GRCTranslationService?.DEFAULT_LANGUAGES || FALLBACK_LANGUAGES
    );
  }

  function readStoredLanguage() {
    try {
      const v = localStorage.getItem(CCF_LANG_STORAGE_KEY);
      if (v) return v;
    } catch (e) {
      /* ignore */
    }
    return SOURCE_LANG;
  }

  function persistLanguage(code) {
    try {
      localStorage.setItem(CCF_LANG_STORAGE_KEY, code);
    } catch (e) {
      /* ignore */
    }
  }

  async function translateChildConsentStrings(texts, target, source) {
    return window.GRCTranslationService.translateBatch({
      texts,
      target,
      source,
      googleApiKey: getScriptEl()?.dataset?.googleTranslateApiKey || '',
    });
  }

  function remountChildConsentUI() {
    const cfg = mergedChildConfig;
    if (!cfg || !hostId) return;

    const openModal = document.querySelector('.ccf-ovl');
    if (openModal) {
      const panelBody = openModal.querySelector('.ccf-modal-body');
      if (panelBody) {
        panelBody.innerHTML = '';
        panelBody.appendChild(buildChildConsentCard(cfg));
        return;
      }
    }

    if (!cfg.showModal) {
      mountInline(hostId, cfg);
    }
  }

  function getRuntimeBase() {
    const el = getScriptEl();
    if (!el) return null;
    const u = new URL(el.src, location.href);
    const parts = u.pathname.split('/').filter(Boolean);
    parts.pop();
    return u.origin + '/' + parts.join('/');
  }

  function getDomainFromScript() {
    const el = getScriptEl();
    return normalizeDomain(el?.dataset?.domain || '');
  }

  function getFlowHostIdFromConfig(cfg) {
    return cfg.formId || cfg.hostId || cfg.widgetId || 'child-consent-widget';
  }

  /* ---------------- API ---------------- */
  async function apiFetchJson(url, options = {}) {
    const resp = await fetch(url, {
      credentials: 'omit',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    const body = await resp.json().catch(() => ({}));
        if (!resp.ok) {
      const msg =
        body?.message || body?.error || `${resp.status} ${resp.statusText}`;
      const err = new Error(Array.isArray(msg) ? msg.join(', ') : msg);
      err.status = resp.status;
      err.statusCode = resp.status;
      err.responseBody = body;
      throw err;
    }
    return body;
  }

  async function fetchChildConsentConfigByDomain(domain) {
    const base = getRuntimeBase();
    if (!base)
      throw new Error('Cannot determine runtime base from script src.');
    return apiFetchJson(
      `${base}/child-consent-configs?domain=${encodeURIComponent(domain)}`,
      {
        method: 'GET',
      },
    );
  }

  async function startChildConsentSubmission(payload) {
    const base = getRuntimeBase();
    if (!base)
      throw new Error('Cannot determine runtime base from script src.');
    return apiFetchJson(`${base}/child-consent-submissions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function sendParentVerification(payload) {
    const base = getRuntimeBase();
    if (!base)
      throw new Error('Cannot determine runtime base from script src.');
    return apiFetchJson(
      `${base}/child-consent-submissions/send-parent-verification`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
  }

  async function verifyParentConsent(payload) {
    const base = getRuntimeBase();
    if (!base)
      throw new Error('Cannot determine runtime base from script src.');
    return apiFetchJson(`${base}/child-consent-submissions/verify-parent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function finalizeChildConsentSubmission(payload) {
    const base = getRuntimeBase();
    if (!base)
      throw new Error('Cannot determine runtime base from script src.');
    return apiFetchJson(`${base}/child-consent-submissions/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /* ---------------- Validation ---------------- */
  function validateEmail(v) {
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
  }

  function validateForm(state, els, cfg) {
    const errors = [];
    const threshold = Number(cfg?.settings?.minorAgeThreshold ?? 18);
    const requireRelationship = cfg?.settings?.requireRelationship !== false;
    const requirePhone = cfg?.settings?.requirePhone === true;
    const requireParentVerification =
      cfg?.settings?.requireParentVerification !== false;

    const firstName = safeText(els.firstName.value).trim();
    const lastName = safeText(els.lastName.value).trim();
    const email = safeText(els.email.value).trim();
    const dob = safeText(els.dob.value).trim();

    if (!firstName) errors.push('First name is required');
    if (!lastName) errors.push('Last name is required');
    if (!email) errors.push('Email is required');
    else if (!validateEmail(email)) errors.push('Enter a valid email');
    if (!dob) errors.push('Date of birth is required');

    const age = calculateAge(dob);
    if (age === null) errors.push('Enter a valid date of birth');

    if (age !== null && age >= threshold) {
      if (!els.adultAgeConfirm.checked)
        errors.push('Adult age confirmation is required');
      if (!els.adultConsent.checked) errors.push('Adult consent is required');
    }

    if (age !== null && age < threshold) {
      const guardianFirstName = safeText(els.guardianFirstName.value).trim();
      const guardianLastName = safeText(els.guardianLastName.value).trim();
      const guardianEmail = safeText(els.guardianEmail.value).trim();
      const guardianPhone = safeText(els.guardianPhone.value).trim();
      const relationship = safeText(els.relationship.value).trim();

      if (!guardianFirstName)
        errors.push('Parent/guardian first name is required');
      if (!guardianLastName)
        errors.push('Parent/guardian last name is required');
      if (!guardianEmail) errors.push('Parent/guardian email is required');
      else if (!validateEmail(guardianEmail))
        errors.push('Enter a valid parent/guardian email');
      if (requirePhone && !guardianPhone)
        errors.push('Parent/guardian phone is required');
      if (requireRelationship && !relationship)
        errors.push('Relationship to child is required');
      if (!els.guardianDeclaration.checked)
        errors.push('Parent/guardian declaration is required');
      if (!els.guardianConsent.checked)
        errors.push('Parent/guardian consent is required');

      if (requireParentVerification && !state.parentVerified) {
        errors.push('Parent/guardian verification is required');
      }
    }

    return errors;
  }

  function buildStartPayload(state, els, cfg) {
    console.log('cfg', cfg);

    const firstName = safeText(els.firstName.value).trim();
    const lastName = safeText(els.lastName.value).trim();
    const fullName = `${firstName} ${lastName}`.trim();
    return {
      configId: cfg._id,
      tenantId: cfg.tenantId || null,
      domain: normalizeDomain(cfg.domain || getDomainFromScript()),
      formId: cfg.formId,
      flowType: state.isMinor ? 'minor_consent' : 'adult_consent',
      values: {
        cmpUserId: state.cmpUserId,
        fullName: fullName,

        email: safeText(els.email.value).trim(),
        dob: safeText(els.dob.value).trim(),
        age: calculateAge(els.dob.value),
        adultAgeConfirm: !!els.adultAgeConfirm.checked,
        adultConsent: !!els.adultConsent.checked,
        guardianName:
          `${safeText(els.guardianFirstName.value).trim()} ${safeText(els.guardianLastName.value).trim()}`.trim(),
        guardianEmail: safeText(els.guardianEmail.value).trim(),
        guardianPhone: safeText(els.guardianPhone.value).trim(),
        relationship: safeText(els.relationship.value).trim(),
        guardianDeclaration: !!els.guardianDeclaration.checked,
        guardianConsent: !!els.guardianConsent.checked,
      },
      meta: {
        sourceUrl: location.href,
        locale: navigator.language || 'en',
        ageCategory: state.isMinor ? 'minor' : 'adult',
        cmpUserId: state.cmpUserId,
      },
    };
  }

  function buildFinalizePayload(state, els) {
    const isMinor = !!state.isMinor;

    const firstName = safeText(els.firstName.value).trim();
    const lastName = safeText(els.lastName.value).trim();
    const fullName = `${firstName} ${lastName}`.trim();

    const values = {
      cmpUserId: state.cmpUserId,
      fullName: fullName,

      email: safeText(els.email.value).trim(),
      dob: safeText(els.dob.value).trim(),
      age: calculateAge(els.dob.value),
    };

    if (isMinor) {
      const guardianFirstName = safeText(els.guardianFirstName.value).trim();
      const guardianLastName = safeText(els.guardianLastName.value).trim();
      const guardianName = `${guardianFirstName} ${guardianLastName}`.trim();
      const guardianEmail = safeText(els.guardianEmail.value).trim();
      const guardianPhone = safeText(els.guardianPhone.value).trim();
      const relationship = safeText(els.relationship.value).trim();

      if (guardianName) values.guardianName = guardianName;
      if (guardianEmail) values.guardianEmail = guardianEmail;
      if (guardianPhone) values.guardianPhone = guardianPhone;
      if (relationship) values.relationship = relationship;

      values.guardianDeclaration = !!els.guardianDeclaration.checked;
      values.guardianConsent = !!els.guardianConsent.checked;
      values.parentVerified = !!state.parentVerified;
    } else {
      values.adultAgeConfirm = !!els.adultAgeConfirm.checked;
      values.adultConsent = !!els.adultConsent.checked;
    }

 return {
      submissionId: state.submissionId,
      flowType: isMinor ? 'minor_consent' : 'adult_consent',
      values,
      clientSubmissionId: state.clientSubmissionId || undefined,
      submittedAt: state.submittedAt || undefined,
    };
  }

  // function buildLanguageSelect(cfg, onLanguageChange) {
  //   if (!isTranslationEnabled()) return null;

  //   const svc = window.GRCTranslationService;
  //   if (!svc?.createLanguageDropdown) {
  //     console.warn(
  //       '[child-consent-runtime] Language picker skipped: translation service not loaded',
  //     );
  //     return null;
  //   }

  //   const langs = getLanguageOptions();
  //   const picker = svc.createLanguageDropdown({
  //     languages: langs,
  //     value: langs.some((l) => l.code === activeLanguage)
  //       ? activeLanguage
  //       : SOURCE_LANG,
  //     layout: 'stacked',
  //     label: cfg.ui?.labelLanguage || 'Language',
  //     id: 'ccf_ui_lang',
  //     onChange: (code) => onLanguageChange({ target: { value: code } }),
  //   });
  //   if (!picker) return null;
  //   const row = h('div', { class: 'ccf-row full', style: 'margin-bottom:10px;' });
  //   row.appendChild(picker.wrap);
  //   return row;
  // }
  function buildLanguageSelect(cfg, onLanguageChange) {
    if (!isTranslationEnabled()) return null;

    const langs = getLanguageOptions();
    if (!Array.isArray(langs) || langs.length === 0) return null;

    const currentCode = langs.some((l) => l.code === activeLanguage)
      ? activeLanguage
      : SOURCE_LANG;

    const currentLang = langs.find((l) => l.code === currentCode) || langs[0];

    const row = h('div', {
      class: 'ccf-row full',
      style: 'margin-bottom:10px;',
    });

    const wrap = h('div', { class: 'ccf-custom-lang-wrap' });

    const label = h(
      'label',
      {
        class: 'ccf-custom-lang-label',
        for: 'ccf_custom_lang_btn',
      },
      cfg.ui?.labelLanguage || 'Language',
    );

    const button = h(
      'button',
      {
        type: 'button',
        id: 'ccf_custom_lang_btn',
        class: 'ccf-custom-lang-button',
        'aria-expanded': 'false',
      },
      [
        h(
          'span',
          { class: 'ccf-custom-lang-text' },
          currentLang.nativeLabel || currentLang.label || currentLang.code,
        ),
        h('span', { class: 'ccf-custom-lang-icon' }, '▾'),
      ],
    );

    const menu = h('div', {
      class: 'ccf-custom-lang-menu',
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
      const isActive = lang.code === currentCode;

      const item = h(
        'button',
        {
          type: 'button',
          class: isActive
            ? 'ccf-custom-lang-item active'
            : 'ccf-custom-lang-item',
          'data-code': lang.code,
        },
        lang.nativeLabel || lang.label || lang.code,
      );

      item.addEventListener('click', () => {
        const textEl = button.querySelector('.ccf-custom-lang-text');
        if (textEl) {
          textEl.textContent = lang.nativeLabel || lang.label || lang.code;
        }

        menu.querySelectorAll('.ccf-custom-lang-item').forEach((el) => {
          el.classList.remove('active');
        });

        item.classList.add('active');
        closeMenu();

        if (typeof onLanguageChange === 'function') {
          onLanguageChange({ target: { value: lang.code } });
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
    row.appendChild(wrap);
    return row;
  }
  /* ---------------- Renderer ---------------- */
  function buildChildConsentCard(cfg) {
    injectStyles(cfg.theme || {});
    const ui = cfg.ui || CCF_UI_DEFAULTS;

    const threshold = Number(cfg?.settings?.minorAgeThreshold ?? 18);
    const requireParentVerification =
      cfg?.settings?.requireParentVerification !== false;
    const relationshipOptions = Array.isArray(
      cfg?.settings?.relationshipOptions,
    )
      ? cfg.settings.relationshipOptions
      : ['Mother', 'Father', 'Legal Guardian', 'Other'];

        const state = {
      age: null,
      isMinor: null,
      submissionId: null,
      parentVerified: false,
      verificationStatus: 'not_started',
      cmpUserId: getOrCreateCMPUserId(),
      clientSubmissionId: null,
      submittedAt: null,
    };

    const card = h('div', { class: 'ccf-card' });
    const headbar = h('div', { class: 'ccf-headbar' });
    const brandWrap = h('div', { class: 'ccf-brand-wrap' });

    if (cfg?.branding?.logoUrl) {
      brandWrap.appendChild(
        h('img', {
          class: 'ccf-logo',
          src: cfg.branding.logoUrl,
          alt: safeText(
            cfg?.branding?.logoAlt || cfg?.branding?.name || 'Logo',
          ),
        }),
      );
    }

    const titleWrap = h('div');
    titleWrap.appendChild(
      h('div', { class: 'ccf-title', text: safeText(ui.title) }),
    );
    if (ui.subtitle) {
      titleWrap.appendChild(
        h('div', { class: 'ccf-subtitle', text: safeText(ui.subtitle) }),
      );
    }
    brandWrap.appendChild(titleWrap);
    headbar.appendChild(brandWrap);

    const langSelect = buildLanguageSelect(cfg, async function (e) {
      const code = e.target.value || SOURCE_LANG;
      translateFormRequestId += 1;
      const reqId = translateFormRequestId;
      activeLanguage = code;
      persistLanguage(code);
      const base = mergeChildConsentConfig(mergedChildConfig || cfg);
      if (!isTranslationEnabled() || code === SOURCE_LANG) {
        mergedChildConfig = base;
      } else {
        try {
          const payload = buildChildConsentPayload(base);
          const cacheKey = `${SOURCE_LANG}|${code}|${payload.join('\u241F')}`;
          let translated;
          if (formTranslationCache[cacheKey]) {
            translated = formTranslationCache[cacheKey];
          } else {
            translated = await translateChildConsentStrings(
              payload,
              code,
              SOURCE_LANG,
            );
            formTranslationCache[cacheKey] = translated;
          }
          mergedChildConfig = applyChildConsentTranslations(base, translated);
        } catch (err) {
          console.error('[child-consent-runtime] Translation failed', err);
          mergedChildConfig = base;
        }
      }
      if (reqId !== translateFormRequestId) return;
      remountChildConsentUI();
    });
    if (langSelect) {
      const langWrap = h('div', { style: 'width:100%;margin-top:12px;' });
      langWrap.appendChild(langSelect);
      headbar.appendChild(langWrap);
    }

    const body = h('div', { class: 'ccf-body' });
    const topNotice = h('div', {
      class: 'ccf-banner info',
      text: safeText(ui.intro),
    });

    /* Common section */
    const commonSection = h('div', { class: 'ccf-section' });
    commonSection.appendChild(
      h('div', { class: 'ccf-section-title', text: ui.sectionYourDetails }),
    );
    commonSection.appendChild(
      h('div', {
        class: 'ccf-section-note',
        text: safeText(ui.identityNote),
      }),
    );

    const commonGrid = h('div', { class: 'ccf-grid two-col' });
    const firstName = h('input', {
      id: 'ccf_firstName',
      type: 'text',
      class: 'ccf-input',
      placeholder: ui.placeholderFirstName || 'Enter first name',
    });

    const lastName = h('input', {
      id: 'ccf_lastName',
      type: 'text',
      class: 'ccf-input',
      placeholder: ui.placeholderLastName || 'Enter last name',
    });
    const email = h('input', {
      id: 'ccf_email',
      type: 'email',
      class: 'ccf-input',
      placeholder: ui.placeholderEmail,
    });
       // Calculate max DOB (today) and min DOB (18 years ago + 1 day)
    // so only ages 0-17 (below 18) can be selected
    const today = new Date();
    const maxDobDate = today.toISOString().split('T')[0];
    const minDob = new Date(today);
    minDob.setFullYear(minDob.getFullYear() - threshold);
    minDob.setDate(minDob.getDate() + 1);
    const minDobDate = minDob.toISOString().split('T')[0];

    const dob = h('input', {
      id: 'ccf_dob',
      type: 'date',
      class: 'ccf-input',
      max: maxDobDate,
      min: minDobDate,
    });
    const cmpUserIdInput = h('input', {
      id: 'ccf_cmpUserId',
      type: 'text',
      class: 'ccf-input',
      value: state.cmpUserId,
      readonly: 'readonly',
      placeholder: ui.cmpUserIdPlaceholder,
    });

    const ageStatus = h('div', {
      class: 'ccf-banner info full',
      text: ui.agePending.replace('18', String(threshold)),
    });

    commonGrid.appendChild(
      fieldRow(ui.labelFirstName || 'First Name', firstName, {
        required: true,
      }),
    );
    commonGrid.appendChild(
      fieldRow(ui.labelLastName || 'Last Name', lastName, { required: true }),
    );
    commonGrid.appendChild(fieldRow(ui.labelEmail, email, { required: true }));
    commonGrid.appendChild(
      fieldRow(ui.labelDob, dob, {
        required: true,
        help: ui.dobHelp.replace('18', String(threshold)),
      }),
    );
    commonGrid.appendChild(
      fieldRow(ui.labelCmpUserId, cmpUserIdInput, {
        help: ui.cmpUserIdHelp,
      }),
    );
    commonGrid.appendChild(ageStatus);
    commonSection.appendChild(commonGrid);

    /* Adult section */
    const adultSection = h('div', { class: 'ccf-section ccf-hidden' });
    adultSection.appendChild(
      h('div', { class: 'ccf-section-title', text: ui.sectionSelfConsent }),
    );
    adultSection.appendChild(
      h('div', {
        class: 'ccf-section-note',
        text: safeText(ui.adult),
      }),
    );

    const adultGrid = h('div', { class: 'ccf-grid' });
    const adultAgeConfirmWrap = checkboxRow(
      'ccf_adultAgeConfirm',
      ui.adultAgeConfirm.replace('18', String(threshold)),
      true,
    );
    const adultConsentWrap = checkboxRow(
      'ccf_adultConsent',
      safeText(ui.adultCheckbox),
      true,
    );
    const adultAgeConfirm = adultAgeConfirmWrap.querySelector('input');
    const adultConsent = adultConsentWrap.querySelector('input');
    adultGrid.appendChild(adultAgeConfirmWrap);
    adultGrid.appendChild(adultConsentWrap);
    adultSection.appendChild(adultGrid);

    /* Minor section */
    const minorSection = h('div', { class: 'ccf-section ccf-hidden' });
    minorSection.appendChild(
      h('div', { class: 'ccf-section-title', text: ui.sectionParentConsent }),
    );
    minorSection.appendChild(
      h('div', {
        class: 'ccf-section-note',
        text: safeText(ui.minorNotice),
      }),
    );

    const minorGrid = h('div', { class: 'ccf-grid two-col' });
    const guardianFirstName = h('input', {
      id: 'ccf_guardianFirstName',
      type: 'text',
      class: 'ccf-input',
      placeholder:
        ui.placeholderGuardianFirstName || 'Enter parent/guardian first name',
    });

    const guardianLastName = h('input', {
      id: 'ccf_guardianLastName',
      type: 'text',
      class: 'ccf-input',
      placeholder:
        ui.placeholderGuardianLastName || 'Enter parent/guardian last name',
    });
    const guardianEmail = h('input', {
      id: 'ccf_guardianEmail',
      type: 'email',
      class: 'ccf-input',
      placeholder: ui.placeholderGuardianEmail,
    });
    const guardianPhone = h('input', {
      id: 'ccf_guardianPhone',
      type: 'text',
      class: 'ccf-input',
      placeholder: ui.placeholderGuardianPhone,
    });
    const relationship = h(
      'select',
      { id: 'ccf_relationship', class: 'ccf-select' },
      [
        h('option', { value: '' }, ui.relationshipPlaceholder),
        ...relationshipOptions.map((opt) => h('option', { value: opt }, opt)),
      ],
    );

    minorGrid.appendChild(
      fieldRow(
        ui.labelGuardianFirstName || 'Parent/Guardian First Name',
        guardianFirstName,
        { required: true },
      ),
    );

    minorGrid.appendChild(
      fieldRow(
        ui.labelGuardianLastName || 'Parent/Guardian Last Name',
        guardianLastName,
        { required: true },
      ),
    );
    minorGrid.appendChild(
      fieldRow(ui.labelGuardianEmail, guardianEmail, { required: true }),
    );
    minorGrid.appendChild(
      fieldRow(ui.labelGuardianPhone, guardianPhone, {
        required: cfg?.settings?.requirePhone === true,
      }),
    );
    minorGrid.appendChild(
      fieldRow(ui.labelRelationship, relationship, {
        required: cfg?.settings?.requireRelationship !== false,
      }),
    );

    const guardianDeclarationWrap = checkboxRow(
      'ccf_guardianDeclaration',
      safeText(ui.guardianDeclaration),
      true,
    );
    const guardianConsentWrap = checkboxRow(
      'ccf_guardianConsent',
      safeText(ui.guardianCheckbox),
      true,
    );
    const guardianDeclaration = guardianDeclarationWrap.querySelector('input');
    const guardianConsent = guardianConsentWrap.querySelector('input');

    const verifyWrap = h('div', { class: 'ccf-row full' });
    const verifyBanner = h('div', {
      class: `ccf-banner ${requireParentVerification ? 'warning' : 'info'}`,
      text: requireParentVerification
        ? ui.verifyRequiredBanner
        : ui.verifyOptionalBanner,
    });

    const verifyActions = h('div', { class: 'ccf-actions' });
    const sendVerifyBtn = h(
      'button',
      { type: 'button', class: 'ccf-btn secondary' },
      ui.sendVerifyLabel,
    );
    const otpInput = h('input', {
      type: 'text',
      class: 'ccf-input',
      placeholder: ui.placeholderOtp,
      style: 'max-width:180px;',
    });
    const verifyOtpBtn = h(
      'button',
      { type: 'button', class: 'ccf-btn secondary' },
      ui.verifyOtpLabel,
    );
    const verifyStatus = h('div', {
      class: 'ccf-status info',
      text: ui.verifyNotStarted,
    });

    verifyActions.appendChild(sendVerifyBtn);
    verifyActions.appendChild(otpInput);
    verifyActions.appendChild(verifyOtpBtn);
    verifyActions.appendChild(verifyStatus);
    verifyWrap.appendChild(verifyBanner);
    verifyWrap.appendChild(verifyActions);

    minorGrid.appendChild(guardianDeclarationWrap);
    minorGrid.appendChild(guardianConsentWrap);
    minorGrid.appendChild(verifyWrap);
    minorSection.appendChild(minorGrid);

    /* Footer */
    const message = h('div', { class: 'ccf-status info' });
    const submitBtn = h(
      'button',
      { type: 'button', class: 'ccf-btn' },
      safeText(ui.submitLabel),
    );

    const footerNote = h('div', {
      class: 'ccf-footnote',
      text: safeText(ui.footerNote),
    });

    function resetVerificationState() {
      state.submissionId = null;
      state.parentVerified = false;
      state.verificationStatus = 'not_started';
      otpInput.value = '';
      verifyStatus.className = 'ccf-status info';
      verifyStatus.textContent = ui.verifyNotStarted;
      sendVerifyBtn.textContent = ui.sendVerifyLabel;
    }

    function invalidateMinorVerification() {
      if (!state.isMinor) return;
      if (
        !state.submissionId &&
        !state.parentVerified &&
        state.verificationStatus === 'not_started'
      )
        return;

      state.submissionId = null;
      state.parentVerified = false;
      state.verificationStatus = 'not_started';
      otpInput.value = '';
      verifyStatus.className = 'ccf-status info';
      verifyStatus.textContent = ui.verifyDetailsChanged;
      sendVerifyBtn.textContent = ui.sendVerifyLabel;
    }

    function clearAdultState() {
      adultAgeConfirm.checked = false;
      adultConsent.checked = false;
    }

    function clearMinorState() {
      guardianFirstName.value = '';
      guardianLastName.value = '';
      guardianEmail.value = '';
      guardianPhone.value = '';
      relationship.value = '';
      guardianDeclaration.checked = false;
      guardianConsent.checked = false;
      resetVerificationState();
    }

    function updateBranch() {
      const age = calculateAge(dob.value);
      const prevIsMinor = state.isMinor;
      state.age = age;

      if (age === null) {
        state.isMinor = null;
        adultSection.classList.add('ccf-hidden');
        minorSection.classList.add('ccf-hidden');
        ageStatus.className = 'ccf-banner info full';
        ageStatus.textContent = ui.agePending.replace('18', String(threshold));
        resetVerificationState();
        clearAdultState();
        return;
      }

      if (age >= threshold) {
        state.isMinor = false;
        adultSection.classList.remove('ccf-hidden');
        minorSection.classList.add('ccf-hidden');
        ageStatus.className = 'ccf-banner success full';
        ageStatus.textContent = ui.ageAdult.replace('{age}', String(age));

        if (prevIsMinor !== false) {
          clearMinorState();
        }
      } else {
        state.isMinor = true;
        adultSection.classList.add('ccf-hidden');
        minorSection.classList.remove('ccf-hidden');
        ageStatus.className = 'ccf-banner warning full';
        ageStatus.textContent = ui.ageMinor.replace('{age}', String(age));

        if (prevIsMinor !== true) {
          clearAdultState();
          resetVerificationState();
        }
      }
    }

    function clearMessage() {
      message.className = 'ccf-status info';
      message.textContent = '';
    }

    function getEls() {
      return {
        firstName,
        lastName,
        email,
        dob,
        cmpUserIdInput,
        adultAgeConfirm,
        adultConsent,
        guardianFirstName,
        guardianLastName,
        guardianEmail,
        guardianPhone,
        relationship,
        guardianDeclaration,
        guardianConsent,
      };
    }

    dob.addEventListener('change', () => {
      clearMessage();
      updateBranch();
    });

    [firstName, lastName, email].forEach((el) => {
      el.addEventListener('input', () => {
        if (state.isMinor) invalidateMinorVerification();
      });
      el.addEventListener('change', () => {
        if (state.isMinor) invalidateMinorVerification();
      });
    });

    [
      guardianFirstName,
      guardianLastName,
      guardianEmail,
      guardianPhone,
      relationship,
    ].forEach((el) => {
      el.addEventListener('input', invalidateMinorVerification);
      el.addEventListener('change', invalidateMinorVerification);
    });

    [guardianDeclaration, guardianConsent].forEach((el) => {
      el.addEventListener('change', invalidateMinorVerification);
    });

    sendVerifyBtn.addEventListener('click', async () => {
      clearMessage();
      updateBranch();

      if (!state.isMinor) {
        verifyStatus.className = 'ccf-status error';
        verifyStatus.textContent =
          'Verification is only required for users below 18.';
        return;
      }

      const gEmail = safeText(guardianEmail.value).trim();
      if (!gEmail || !validateEmail(gEmail)) {
        verifyStatus.className = 'ccf-status error';
        verifyStatus.textContent = 'Enter a valid parent/guardian email first.';
        return;
      }

      try {
        sendVerifyBtn.disabled = true;
        verifyStatus.className = 'ccf-status info';
        verifyStatus.textContent =
          'Creating submission and sending verification code...';

        if (!state.submissionId) {
          const errors = validateForm(
            { ...state, parentVerified: !requireParentVerification },
            getEls(),
            {
              ...cfg,
              settings: {
                ...(cfg.settings || {}),
                requireParentVerification: false,
              },
            },
          );

          if (errors.length) {
            verifyStatus.className = 'ccf-status error';
            verifyStatus.textContent = errors.join(' | ');
            return;
          }

          const startPayload = buildStartPayload(state, getEls(), cfg);
          const startRes = await startChildConsentSubmission(startPayload);
          state.submissionId = startRes.submissionId;
        }

        const sendRes = await sendParentVerification({
          submissionId: state.submissionId,
          guardianEmail: gEmail,
          cmpUserId: state.cmpUserId,
        });

        state.parentVerified = false;
        state.verificationStatus = 'sent';
        verifyStatus.className = 'ccf-status success';
        verifyStatus.textContent =
          sendRes.message || 'Verification code sent successfully.';
        sendVerifyBtn.textContent = 'Resend Verification Code';
      } catch (err) {
        verifyStatus.className = 'ccf-status error';
        verifyStatus.textContent =
          err?.message || 'Failed to send verification code.';
      } finally {
        sendVerifyBtn.disabled = false;
      }
    });

    verifyOtpBtn.addEventListener('click', async () => {
      clearMessage();

      if (!state.isMinor) {
        verifyStatus.className = 'ccf-status error';
        verifyStatus.textContent =
          'OTP verification is only for minor consent flow.';
        return;
      }

      if (!state.submissionId) {
        verifyStatus.className = 'ccf-status error';
        verifyStatus.textContent = 'Send verification code first.';
        return;
      }

      const otp = safeText(otpInput.value).trim();
      if (!otp) {
        verifyStatus.className = 'ccf-status error';
        verifyStatus.textContent = 'Enter OTP.';
        return;
      }

      try {
        verifyOtpBtn.disabled = true;
        verifyStatus.className = 'ccf-status info';
        verifyStatus.textContent = 'Verifying OTP...';

        const res = await verifyParentConsent({
          submissionId: state.submissionId,
          otp,
          cmpUserId: state.cmpUserId,
        });

        state.parentVerified = true;
        state.verificationStatus = 'verified';
        verifyStatus.className = 'ccf-status success';
        verifyStatus.textContent =
          res.message || 'Parent/guardian verified successfully.';
      } catch (err) {
        state.parentVerified = false;
        state.verificationStatus = 'sent';
        verifyStatus.className = 'ccf-status error';
        verifyStatus.textContent = err?.message || 'OTP verification failed.';
      } finally {
        verifyOtpBtn.disabled = false;
      }
    });

       submitBtn.addEventListener('click', async () => {
      clearMessage();
      updateBranch();

      const els = getEls();
      const errors = validateForm(state, els, cfg);
      if (errors.length) {
        message.className = 'ccf-status error';
        message.textContent = errors.join(' | ');
        return;
      }

      if (!state.clientSubmissionId) {
        state.clientSubmissionId = ccGenerateUUID();
      }
      if (!state.submittedAt) {
        state.submittedAt = new Date().toISOString();
      }

           if (!navigator.onLine) {
        // Minor + OTP not yet verified → cannot proceed offline
        if (
          state.isMinor &&
          requireParentVerification &&
          !state.parentVerified
        ) {
          message.className = 'ccf-status error';
          message.textContent =
            'You are offline. Please verify parent OTP first (requires internet), then you can submit offline.';
          return;
        }

        try {
          const finalizePayload = buildFinalizePayload(state, els);

          // For verified minors: submissionId already exists (from /start + /verify-parent)
          // For adults: no submissionId yet, need to call /start during sync
          const queueRecord = {
            clientSubmissionId: state.clientSubmissionId,
            submittedAt: state.submittedAt,
            finalizePayload,
          };

          if (state.submissionId) {
            // Already-started submission (verified minor case)
            queueRecord.submissionId = state.submissionId;
          } else {
            // Not-yet-started submission (adult offline case)
            queueRecord.startPayload = buildStartPayload(state, els, cfg);
          }

          await ccQueueOfflineSubmission(queueRecord);

          message.className = 'ccf-status success';
          message.textContent =
            'You are offline. Your consent will be submitted automatically when you\'re back online.';

          firstName.value = '';
          lastName.value = '';
          email.value = '';
          dob.value = '';
          clearAdultState();
          clearMinorState();
          state.clientSubmissionId = null;
          state.submittedAt = null;
          state.submissionId = null;
          state.parentVerified = false;
          updateBranch();
        } catch (err) {
          message.className = 'ccf-status error';
          message.textContent =
            err?.message || 'Failed to save offline submission.';
        }

        return;
      }

      submitBtn.disabled = true;
      message.className = 'ccf-status info';
      message.textContent = 'Submitting...';

      try {
        if (!state.submissionId) {
          const startPayload = buildStartPayload(state, els, cfg);
          const startRes = await startChildConsentSubmission(startPayload);
          state.submissionId = startRes.submissionId;
        }

        if (
          state.isMinor &&
          !state.parentVerified &&
          requireParentVerification
        ) {
          message.className = 'ccf-status error';
          message.textContent =
            'Parent/guardian verification is required before final submission.';
          return;
        }

        const finalizePayload = buildFinalizePayload(state, els);
        const finalizeRes =
          await finalizeChildConsentSubmission(finalizePayload);

        window.dispatchEvent(
          new CustomEvent('childConsentCompleted', {
            detail: {
              submissionId: state.submissionId,
              cmpUserId: state.cmpUserId,
              isMinor: state.isMinor,
            },
          }),
        );

        message.className = 'ccf-status success';
        message.textContent =
          finalizeRes.message ||
          (state.isMinor
            ? 'Minor consent submitted successfully.'
            : 'Adult self-consent submitted successfully.');


 

        firstName.value = '';
        lastName.value = '';
        email.value = '';
        dob.value = '';
        clearAdultState();
        clearMinorState();
        state.clientSubmissionId = null;
        state.submittedAt = null;
        updateBranch();
      } catch (err) {
        message.className = 'ccf-status error';
        message.textContent = `Submit failed: ${err?.message || err}`;
      } finally {
        submitBtn.disabled = false;
      }
    });

    body.appendChild(topNotice);
    body.appendChild(commonSection);
    body.appendChild(adultSection);
    body.appendChild(minorSection);
    body.appendChild(h('div', { class: 'ccf-divider' }));
   
  

const btnRow = h('div', { style: 'display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;' }, [submitBtn,]);

body.appendChild(h('div', { class: 'ccf-actions' }, [btnRow, message]));
    body.appendChild(footerNote);

    card.appendChild(headbar);
    card.appendChild(body);
    return card;
  }

  /* ---------------- Modal ---------------- */
  function openModalWith(card) {
    const ovl = h('div', { class: 'ccf-ovl' });
    const panel = h('div', { class: 'ccf-panel' });
    const head = h('div', { class: 'ccf-modal-head' }, [
      h('span'),
      h(
        'button',
        {
          type: 'button',
          class: 'ccf-close',
          'data-close': '1',
          'aria-label': 'Close',
        },
        '×',
      ),
    ]);
    const body = h('div', { class: 'ccf-modal-body' }, [card]);

    panel.append(head, body);
    ovl.append(panel);
    document.body.appendChild(ovl);
    document.body.style.overflow = 'hidden';

    function close() {
      document.body.style.overflow = '';
      ovl.remove();
      console.log('close', hostId);
      const trigger = document.getElementById(hostId);
      if (trigger) trigger.__ccfHandled = false;
    }

    ovl.addEventListener('click', (e) => {
      const target = e.target;
      if (target === ovl || target?.dataset?.close === '1') close();
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
    }, 0);
  }

  /* ---------------- Mount / Bind ---------------- */
  function mountInline(hostId, cfg) {
    const tryMount = () => {
      const host = document.getElementById(hostId);
      if (!host) return false;

      console.log('[child-consent-runtime] ✅ host found:', host);

      host.innerHTML = '';
      host.appendChild(buildChildConsentCard(cfg));
      return true;
    };

    // Try immediately
    if (tryMount()) return;

    console.warn('[child-consent-runtime] ⏳ host not found, waiting...');

    // Watch for DOM changes
    const mo = new MutationObserver(() => {
      if (tryMount()) {
        console.log('[child-consent-runtime] 🎉 mounted after DOM update');
        mo.disconnect();
      }
    });

    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function bindModalById(hostId, cfg) {
    // ✅ 1. Delegation (always works)
    document.addEventListener('click', (e) => {
      const el = e.target.closest(`#${hostId}`);
      if (!el) return;

      // prevent double handling
      if (el.__ccfHandled) return;
      el.__ccfHandled = true;

      e.preventDefault();
      const live = mergedChildConfig || cfg;
      openModalWith(buildChildConsentCard(live));
    });

    window.addEventListener('childConsentCompleted', (e) => {
      const trigger = document.getElementById(hostId);

      if (!trigger) return;

      // ✅ if it's a checkbox → tick it
      if (trigger.type === 'checkbox') {
        trigger.checked = true;
        trigger.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // ✅ if it's NOT checkbox → mark completed
      else {
        trigger.setAttribute('data-consent-completed', 'true');
      }
    });

    // ✅ 2. Direct binding (optional optimization)
    const attach = (el) => {
      if (!el || el.__ccfBound) return;

      el.addEventListener('click', (e) => {
        if (el.__ccfHandled) return;
        el.__ccfHandled = true;

        e.preventDefault();
        const live = mergedChildConfig || cfg;
        openModalWith(buildChildConsentCard(live));
      });

      el.__ccfBound = true;
    };

    const tryAttach = () => {
      const el = document.getElementById(hostId);
      if (el) {
        attach(el);
        return true;
      }
      return false;
    };

    // try immediately
    if (tryAttach()) return;

    // fallback: observe DOM
    const mo = new MutationObserver(() => {
      if (tryAttach()) {
        mo.disconnect();
      }
    });

    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  /* ---------------- Boot ---------------- */
  async function bootChildConsentRuntime() {
    try {
      console.log('[child-consent-runtime] boot start');

      const domain = getDomainFromScript();
      console.log('[child-consent-runtime] domain from script:', domain);

      if (!domain) {
        console.warn(
          '[child-consent-runtime] No data-domain provided on script tag.',
        );
        return;
      }

      const fetched = await fetchChildConsentConfigByDomain(domain);
      console.log('[child-consent-runtime] fetched config:', fetched);

      if (!fetched || !fetched._id) {
        console.warn('[child-consent-runtime] No valid config found');
        return;
      }

      try {
        await ensureSharedTranslationService();
      } catch (loadErr) {
        console.warn(
          '[child-consent-runtime] Translation service load failed',
          loadErr,
        );
      }

      activeLanguage = readStoredLanguage();
      const langs = getLanguageOptions();
      if (!langs.some((l) => l.code === activeLanguage)) {
        activeLanguage = SOURCE_LANG;
      }

      let cfg = mergeChildConsentConfig(fetched);

      if (isTranslationEnabled() && activeLanguage !== SOURCE_LANG) {
        try {
          const payload = buildChildConsentPayload(cfg);
          const cacheKey = `${SOURCE_LANG}|${activeLanguage}|${payload.join('\u241F')}`;
          let translated;
          if (formTranslationCache[cacheKey]) {
            translated = formTranslationCache[cacheKey];
          } else {
            translated = await translateChildConsentStrings(
              payload,
              activeLanguage,
              SOURCE_LANG,
            );
            formTranslationCache[cacheKey] = translated;
          }
          cfg = applyChildConsentTranslations(cfg, translated);
        } catch (e) {
          console.error(
            '[child-consent-runtime] Initial translation failed',
            e,
          );
        }
      }

      mergedChildConfig = cfg;
      hostId = getFlowHostIdFromConfig(cfg);
      console.log('[child-consent-runtime] hostId:', hostId);

      if (cfg.showModal) bindModalById(hostId, cfg);
      else mountInline(hostId, cfg);
    } catch (err) {
      console.error('[child-consent-runtime] Failed to initialize:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootChildConsentRuntime);
  } else {
    bootChildConsentRuntime();
  }
})();

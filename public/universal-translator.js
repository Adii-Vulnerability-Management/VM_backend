(function (window, document) {
  const BASE_LANGUAGE = 'en';
  const STORAGE_KEY = 'grc3_selected_language';

  const script =
    document.currentScript ||
    document.querySelector('script[src*="universal-translator"]');

  const apiUrl =
    script?.dataset.apiUrl ||
    window.UNIVERSAL_TRANSLATOR_API_URL ||
    '/translate';

  const defaultLanguage =
    localStorage.getItem(STORAGE_KEY) ||
    script?.dataset.defaultLanguage ||
    'en';

  let currentLanguage = defaultLanguage;

  const showLanguageSelect = script?.dataset.showLanguageSelect !== 'false';

  let rootSelectors = parseSelectorList(
    script?.dataset.rootSelectors ||
      '#cmp-banner,#cmp-floating-btn,#cmp-preferences-overlay,#f_child_consent_widget,[data-universal-translate],[data-translate-root]',
  );

  let dropdownTargets = parseSelectorList(
    script?.dataset.dropdownTargets ||
      '#cmp-banner,#f_child_consent_widget,[data-universal-language-target]',
  );

  const originalTextMap = new WeakMap();
  const translationCache = new Map();

  let observer = null;
  let isTranslating = false;

  const defaultLanguages = [
    { value: 'en', label: 'EN' },
    { value: 'hi', label: 'HI' },
    { value: 'fr', label: 'FR' },
    { value: 'es', label: 'ES' },
    { value: 'ta', label: 'TA' },
  ];

  function parseSelectorList(value) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function getElementsFromSelectors(selectors) {
    const elements = [];

    selectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (!elements.includes(element)) {
            elements.push(element);
          }
        });
      } catch (error) {
        console.warn('Invalid translator selector:', selector);
      }
    });

    return elements;
  }

  function getRoots() {
    return getElementsFromSelectors(rootSelectors);
  }

  function getDropdownTargets() {
    return getElementsFromSelectors(dropdownTargets);
  }

  function getTextNodes(rootElement) {
    const textNodes = [];

    if (!rootElement) return textNodes;

    const walker = document.createTreeWalker(
      rootElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.nodeValue.trim();

          if (!text) {
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;

          if (!parent) {
            return NodeFilter.FILTER_REJECT;
          }

          if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (
            parent.closest(
              '[data-no-translate], [data-translate-ignore], [data-grc3-language-wrapper]',
            )
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    return textNodes;
  }

  function restoreOriginalSpacing(originalText, translatedText) {
    const leadingSpace = originalText.match(/^\s*/)?.[0] || '';
    const trailingSpace = originalText.match(/\s*$/)?.[0] || '';

    return leadingSpace + String(translatedText || '').trim() + trailingSpace;
  }

  function cleanTranslation(text, targetLang) {
    let cleaned = String(text || '');

    if (targetLang === 'hi') {
      cleaned = cleaned.replace(/।\s*\./g, '।');
      cleaned = cleaned.replace(/\n\s*\./g, '');
    }

    return cleaned;
  }

  async function translateTexts(texts, targetLang) {
    const cacheKey = targetLang + '::' + JSON.stringify(texts);

    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        texts,
        targetLang,
      }),
    });

    if (!response.ok) {
      throw new Error('Universal translation failed');
    }

    const data = await response.json();

    const translatedTexts = Array.isArray(data.translatedTexts)
      ? data.translatedTexts
      : [];

    translationCache.set(cacheKey, translatedTexts);

    return translatedTexts;
  }

  async function translateElement(rootElement, targetLang) {
    if (!rootElement) return;

    const textNodes = getTextNodes(rootElement);

    textNodes.forEach((node) => {
      if (!originalTextMap.has(node)) {
        originalTextMap.set(node, node.nodeValue);
      }
    });

    if (targetLang === BASE_LANGUAGE) {
      textNodes.forEach((node) => {
        const originalText = originalTextMap.get(node);

        if (originalText !== undefined) {
          node.nodeValue = originalText;
        }
      });

      return;
    }

    const originalTexts = [];

    textNodes.forEach((node) => {
      const originalText = originalTextMap.get(node);

      if (originalText && originalText.trim()) {
        originalTexts.push(originalText.trim());
      }
    });

    if (!originalTexts.length) return;

    const translatedTexts = await translateTexts(originalTexts, targetLang);

    let translatedIndex = 0;

    textNodes.forEach((node) => {
      const originalText = originalTextMap.get(node);

      if (!originalText || !originalText.trim()) return;

      const translatedText = cleanTranslation(
        translatedTexts[translatedIndex],
        targetLang,
      );

      node.nodeValue = restoreOriginalSpacing(originalText, translatedText);

      translatedIndex += 1;
    });
  }

  async function translateAll(targetLang = currentLanguage) {
    if (isTranslating) return;

    currentLanguage = targetLang || BASE_LANGUAGE;
    localStorage.setItem(STORAGE_KEY, currentLanguage);

    syncDropdowns();

    isTranslating = true;

    try {
      const roots = getRoots();

      for (const root of roots) {
        await translateElement(root, currentLanguage);
      }
    } catch (error) {
      console.warn('Universal translator error:', error);
    } finally {
      isTranslating = false;
    }
  }

  // function createLanguageDropdown() {
  //   const wrapper = document.createElement('div');
  //   wrapper.setAttribute('data-grc3-language-wrapper', 'true');
  //   wrapper.setAttribute('data-no-translate', 'true');

  //   Object.assign(wrapper.style, {
  //     display: 'inline-flex',
  //     alignItems: 'center',
  //     gap: '2px',
  //     margin: '4px',
  //   });

  //   const select = document.createElement('select');
  //   select.setAttribute('data-grc3-language-select', 'true');

  //   defaultLanguages.forEach((lang) => {
  //     const option = document.createElement('option');
  //     option.value = lang.value;
  //     option.textContent = lang.label;
  //     select.appendChild(option);
  //   });

  //   select.id = 'data-grc3-language-select';
  //   select.value = currentLanguage;

  //   select.style.width = 'auto';
  //   select.style.minWidth = 'unset';

  //   Object.assign(select.style, {
  //     padding: '0px',
  //     borderRadius: '2px',
  //     // border: '1px solid #d1d5db',
  //     background: '#ffffff',
  //     color: '#111827',
  //     fontSize: '12px',
  //     cursor: 'pointer',
  //   });

  //   select.addEventListener('change', function () {
  //     translateAll(this.value);
  //   });

  //   wrapper.appendChild(select);

  //   return wrapper;
  // }

  function createLanguageDropdown() {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-grc3-language-wrapper', 'true');

    Object.assign(wrapper.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 6px',
      borderRadius: '9999px',
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      lineHeight: '1',
    });

    const icon = document.createElement('span');
    icon.textContent = '🌐';

    Object.assign(icon.style, {
      fontSize: '12px',
      userSelect: 'none',
      lineHeight: '1',
    });

    const select = document.createElement('select');
    select.setAttribute('data-grc3-language-select', 'true');

    defaultLanguages.forEach((lang) => {
      const option = document.createElement('option');
      option.value = lang.value;
      option.textContent = lang.label; // keep short like EN / FR
      select.appendChild(option);
    });

    select.value = currentLanguage;

    Object.assign(select.style, {
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontSize: '12px',
      color: '#111827',
      cursor: 'pointer',
      padding: '0',
      height: '20px',
      appearance: 'none',
      WebkitAppearance: 'none',
      MozAppearance: 'none',
      maxWidth: '60px',
      textAlign: 'center',
    });

    select.addEventListener('change', function () {
      translateAll(this.value);
    });

    wrapper.appendChild(icon);
    wrapper.appendChild(select);

    return wrapper;
  }

  //   function mountDropdowns() {
  //     if (!showLanguageSelect) return;

  //     const targets = getDropdownTargets();

  //     targets.forEach((target) => {
  //       if (!target) return;

  //       if (target.querySelector('[data-grc3-language-wrapper]')) {
  //         return;
  //       }

  //       const dropdown = createLanguageDropdown();

  //       target.prepend(dropdown);
  //     });

  //     syncDropdowns();
  //   }

  function mountDropdowns() {
    if (!showLanguageSelect) return;

    const targets = getDropdownTargets();
    const placement = script?.dataset.dropdownPlacement || 'append';

    targets.forEach((target) => {
      if (!target) return;

      if (target.querySelector('[data-grc3-language-wrapper]')) {
        return;
      }

      const dropdown = createLanguageDropdown();

      if (placement === 'replace') {
        target.innerHTML = '';
        target.appendChild(dropdown);
        return;
      }

      if (placement === 'prepend') {
        target.prepend(dropdown);
        return;
      }

      target.appendChild(dropdown);
    });

    syncDropdowns();
  }

  function syncDropdowns() {
    document
      .querySelectorAll('[data-grc3-language-select]')
      .forEach((select) => {
        select.value = currentLanguage;
      });
  }

  function debounce(fn, delay) {
    let timer = null;

    return function () {
      clearTimeout(timer);

      timer = setTimeout(() => {
        fn();
      }, delay);
    };
  }

  const reapply = debounce(() => {
    mountDropdowns();

    if (currentLanguage !== BASE_LANGUAGE) {
      translateAll(currentLanguage);
    }
  }, 400);

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      if (!isTranslating) {
        reapply();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function init() {
    mountDropdowns();
    startObserver();

    setTimeout(() => {
      mountDropdowns();
      translateAll(currentLanguage);
    }, 700);
  }

  window.UniversalTranslator = {
    translate: translateAll,

    setLanguage(lang) {
      return translateAll(lang);
    },

    getLanguage() {
      return currentLanguage;
    },

    addRootSelector(selector) {
      if (!rootSelectors.includes(selector)) {
        rootSelectors.push(selector);
      }

      return translateAll(currentLanguage);
    },

    addDropdownTarget(selector) {
      if (!dropdownTargets.includes(selector)) {
        dropdownTargets.push(selector);
      }

      mountDropdowns();

      return translateAll(currentLanguage);
    },

    refresh() {
      mountDropdowns();
      return translateAll(currentLanguage);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);

// Correct. Until DSAR/login/email verification, the user is only **anonymous/pseudonymous** in your system.

// Your current CMP ID is basically:

// ```txt
// cmpUserId = anonymous browser identity
// ```

// It can disappear if cookies/localStorage are cleared, and the same human in another browser will get another `cmpUserId`. Your CMP SDK is doing that with a locally stored random `userId` under `cmp_user`.

// So the model should become **two-layer identity**:

// ```txt
// Layer 1: Anonymous browser identity
// cmpUserId = browser/device/localStorage identity

// Layer 2: Known legal identity
// dataSubjectId = verified person identity, usually after DSAR email verification/login
// ```

// When user submits DSAR with email, do **not immediately trust only the typed email**. First verify it, usually by email OTP / magic link. GDPR allows asking for additional information where there is reasonable doubt about identity, and controllers must facilitate rights unless they can demonstrate they cannot identify the person. ([GDPR][1])

// After email verification, create or find:

// ```js
// DataSubject {
//   dataSubjectId: "subject_123",
//   tenantId: "abc.com",
//   emailHash: "hash(normalized_email)",
//   verifiedEmail: true,
//   createdAt: "..."
// }
// ```

// Then link the current browser’s CMP user:

// ```js
// IdentityLink {
//   dataSubjectId: "subject_123",
//   cmpUserId: "cmp_browser_A",
//   tenantId: "abc.com",
//   linkType: "dsar_email_verified_in_current_browser",
//   confidence: "verified",
//   linkedAt: "..."
// }
// ```

// Now your graph is:

// ```txt
// dataSubjectId: subject_123
//   ├── cmpUserId: browser_A
//   ├── cmpUserId: browser_B, only if later verified/login-linked
//   └── consent history rows from each linked cmpUserId
// ```

// For Browser B, you **cannot automatically know** it is the same human unless something links it:

// ```txt
// Browser B is same person only if:
//   - user logs in with same account/email, or
//   - user submits DSAR and verifies same email, or
//   - backend has a reliable first-party account/session mapping
// ```

// Do **not** silently merge Browser B based only on fingerprinting/IP/user-agent. That is risky and privacy-hostile. GDPR Article 11 also says if your processing purpose does not require identifying the data subject, you are not obliged to collect extra data just to identify them. ([GDPR][2])

// So your consent logic should be:

// ```txt
// Browser A:
//   cmpUserId = cmp_A
//   user gives consent
//   consentId = consent_1
//   later submits DSAR with verified email
//   link cmp_A → dataSubjectId

// Browser B:
//   cmpUserId = cmp_B
//   unknown at first
//   show CMP banner normally
//   if user verifies same email/login later
//   link cmp_B → same dataSubjectId
// ```

// Important distinction:

// ```txt
// Cookie consent is usually browser/device scoped.

// DSAR identity is person scoped.
// ```

// So if the user withdraws consent through DSAR, you update the **known person profile** and all **linked CMP IDs**:

// ```js
// ConsentWithdrawal {
//   dataSubjectId: "subject_123",
//   linkedCmpUserIds: ["cmp_A"],
//   action: "withdraw_consent",
//   appliesTo: ["analytics", "marketing"],
//   createdAt: "..."
// }
// ```

// But for unknown Browser B, you cannot update the local cookie state until Browser B becomes known or visits again. On next visit, Browser B should either:

// ```txt
// 1. show CMP banner again because cmp_B is unknown, or
// 2. if logged in / verified, fetch subject-level withdrawal and apply it.
// ```

// Best product architecture:

// ```js
// CMPUser {
//   cmpUserId: "cmp_A",
//   tenantId: "abc.com",
//   anonymous: true,
//   createdAt: "..."
// }
// ```

// ```js
// ConsentHistory {
//   consentId: "consent_001",
//   cmpUserId: "cmp_A",
//   dataSubjectId: "subject_123", // nullable until known
//   tenantId: "abc.com",
//   choices: {
//     necessary: true,
//     analytics: true,
//     marketing: false
//   },
//   createdAt: "..."
// }
// ```

// ```js
// DataSubject {
//   dataSubjectId: "subject_123",
//   tenantId: "abc.com",
//   emailHash: "hashed_email",
//   verifiedAt: "..."
// }
// ```

// ```js
// IdentityLink {
//   dataSubjectId: "subject_123",
//   cmpUserId: "cmp_A",
//   tenantId: "abc.com",
//   evidence: "verified_dsar_email_current_browser",
//   confidence: "verified",
//   linkedAt: "..."
// }
// ```

// ```js
// DSARRequest {
//   dsarId: "dsar_001",
//   dataSubjectId: "subject_123",
//   tenantId: "abc.com",
//   requestType: "access",
//   status: "verified",
//   linkedCmpUserIds: ["cmp_A"],
//   submittedAt: "..."
// }
// ```

// For GDPR/DPDPA, DSAR should cover data you can reasonably identify as belonging to that person. Under GDPR, the user has rights such as access and erasure, and under DPDPA the Data Principal has rights including withdrawal of consent, access/correction/erasure-style controls, and grievance mechanisms depending on the request type. DPDPA also says withdrawal of consent should be as easy as giving consent. ([GDPR][3])

// So the correct answer is:

// ```txt
// Before DSAR:
//   You only know cmpUserId.

// After verified DSAR:
//   You know dataSubjectId.

// Then:
//   Link current cmpUserId to dataSubjectId.

// Other browsers:
//   Keep separate until verified or login-linked.

// DSAR response:
//   Include all records linked to dataSubjectId and linked cmpUserIds.
//   If some browser IDs are not linkable, do not guess.
// ```

// This is the safest design:

// ```txt
// anonymous CMP identity
// + verified DSAR identity
// + explicit identity-link table
// + no blind merging
// ```

// [1]: https://gdpr-info.eu/art-12-gdpr/?utm_source=chatgpt.com "Art. 12 GDPR – Transparent information, communication ..."
// [2]: https://gdpr-info.eu/art-11-gdpr/?utm_source=chatgpt.com "Art. 11 GDPR – Processing which does not require ..."
// [3]: https://gdpr-info.eu/art-15-gdpr/?utm_source=chatgpt.com "Art. 15 GDPR – Right of access by the data subject"

// yes thats this but sometime the cmp user remain always anonous as they clear cookie or incognito mode right so what to do of that cmpusrs and thenn we also fill the webform consent and the child what about that

// Yes — some `cmpUserId`s will **always remain anonymous**. That is normal and you should design for it.

// Cleared cookies, incognito mode, another browser, another device — all of these can create a new anonymous CMP identity:

// ```txt id="y3gpw2"
// Browser A normal mode  → cmpUserId_A
// Browser A incognito    → cmpUserId_B
// Browser B              → cmpUserId_C
// Mobile browser         → cmpUserId_D
// ```

// You should **not try to force-merge** them unless the user gives you a reliable identity link, such as verified email, login, or verified DSAR. GDPR specifically recognizes cases where processing does not require identification, and if the controller cannot identify the data subject, rights like access/erasure apply only when the user provides additional information enabling identification. ([gdpr-info.eu][1])

// So keep three identity levels:

// ```txt id="y9fi89"
// 1. Anonymous CMP identity
//    cmpUserId

// 2. Known person identity
//    dataSubjectId

// 3. Form-specific/legal-flow identity
//    formSubmissionId / childConsentId / dsarId
// ```

// Recommended model:

// ```txt id="enppch"
// Anonymous CMP consent
//   belongs to cmpUserId only

// Webform consent
//   belongs to formSubmissionId
//   may also belong to dataSubjectId if email/phone is verified

// Child consent
//   belongs to childConsentId
//   should link parent/guardian identity after verification

// DSAR
//   belongs to dsarId
//   should link to dataSubjectId after email/identity verification
// ```

// So if CMP user remains anonymous forever, keep it as:

// ```js id="jlu53t"
// CMPUser {
//   cmpUserId: "cmp_anon_123",
//   tenantId: "abc.com",
//   domain: "abc.com",
//   status: "anonymous",
//   createdAt: "...",
//   lastSeenAt: "..."
// }
// ```

// Consent history:

// ```js id="jovy7l"
// ConsentHistory {
//   consentId: "consent_001",
//   cmpUserId: "cmp_anon_123",
//   dataSubjectId: null,
//   source: "cmp",
//   choices: {
//     necessary: true,
//     analytics: false,
//     marketing: true
//   },
//   createdAt: "..."
// }
// ```

// That is fine. You do **not** need to know the person behind every CMP record. In fact, under GDPR data minimisation, you generally should not collect extra identity data just to identify an anonymous visitor if your purpose does not require it. GDPR Recital 26 distinguishes anonymous data from identifiable/pseudonymous personal data, and Article 11 supports not collecting extra identifying information where identification is not required. ([gdpr-info.eu][2])

// For **webform consent**, treat it separately from cookie CMP consent.

// Example:

// ```js id="w7vlq3"
// WebformConsent {
//   formConsentId: "form_consent_001",
//   formSubmissionId: "submission_001",
//   tenantId: "abc.com",
//   cmpUserId: "cmp_anon_123",        // optional, if available in same browser
//   dataSubjectId: "subject_123",     // only after email/login verification
//   emailHash: "hash(email@example.com)",
//   purpose: "data_processing_for_form_submission",
//   consentTextVersion: "v2",
//   accepted: true,
//   submittedAt: "..."
// }
// ```

// For **child consent**, do not mix it with normal CMP consent. It is a separate legal flow.

// Example:

// ```js id="b2wu62"
// ChildConsent {
//   childConsentId: "child_consent_001",
//   tenantId: "abc.com",
//   childProfileId: "child_001",
//   parentDataSubjectId: "subject_parent_123",
//   childDataSubjectId: "subject_child_456",
//   cmpUserId: "cmp_anon_123",          // optional technical link
//   parentEmailHash: "hash(parent@example.com)",
//   verificationStatus: "verified",
//   consentStatus: "granted",
//   consentTextVersion: "v1",
//   submittedAt: "..."
// }
// ```

// Under DPDPA, child consent is more sensitive because a child’s personal data requires handling through the Data Fiduciary/Data Principal framework, and consent/withdrawal rights are central. The Act also says consent withdrawal should be available, and withdrawal should be comparable in ease to giving consent. ([MeitY][3])

// The practical rule:

// ```txt id="c4xw03"
// CMP consent:
//   browser/device scoped

// Webform consent:
//   submission/purpose scoped

// Child consent:
//   child + parent/guardian scoped

// DSAR:
//   person/data-subject scoped
// ```

// So your linking logic should be:

// ```txt id="wsbwke"
// If cmpUserId exists during webform submit:
//   attach cmpUserId to formSubmissionId

// If form has verified email:
//   create/find dataSubjectId
//   link cmpUserId → dataSubjectId

// If child consent has verified parent email:
//   create/find parentDataSubjectId
//   link cmpUserId → parentDataSubjectId
//   create child profile/childDataSubjectId if needed

// If DSAR has verified email:
//   create/find dataSubjectId
//   link current cmpUserId → dataSubjectId
//   search all records by verified email hash/dataSubjectId
// ```

// But if the user clears cookies:

// ```txt id="f1uw2v"
// Old cmpUserId becomes unreachable from browser.
// Keep it in audit history.
// Do not delete it immediately unless retention policy/DSAR requires it.
// New visit gets new cmpUserId.
// If later verified by email/login, link new cmpUserId to same dataSubjectId.
// ```

// Your DB can have an identity-link table:

// ```js id="fg1utq"
// IdentityLink {
//   tenantId: "abc.com",
//   dataSubjectId: "subject_123",
//   linkedIdType: "cmpUserId",
//   linkedIdValue: "cmp_anon_123",
//   evidence: "verified_form_email",
//   confidence: "verified",
//   linkedAt: "..."
// }
// ```

// Another example:

// ```js id="eskf56"
// IdentityLink {
//   tenantId: "abc.com",
//   dataSubjectId: "subject_parent_123",
//   linkedIdType: "childConsentId",
//   linkedIdValue: "child_consent_001",
//   evidence: "verified_parent_email",
//   confidence: "verified",
//   linkedAt: "..."
// }
// ```

// Then DSAR export/access should gather:

// ```txt id="8s3v3k"
// All records directly under dataSubjectId
// + all records linked through verified IdentityLink
// + all form submissions with matching verified email hash
// + all child consent records where requester is verified parent/guardian
// + all CMP consent records from linked cmpUserIds
// ```

// But not:

// ```txt id="7jyzm6"
// Unverified same IP
// Same browser fingerprint
// Similar user agent
// Guessed identity
// ```

// Those should not be merged automatically.

// So the final answer is:

// ```txt id="a7l4hz"
// Anonymous CMP users stay anonymous until linked.

// Webform consent can identify the user if it collects and verifies email.

// Child consent should identify/verify the parent or guardian, and optionally the child profile.

// DSAR identifies the person only after verification.

// Once verified, use IdentityLink to connect current cmpUserId, webform consent, child consent, and DSAR to one dataSubjectId.

// Do not blindly merge old/incognito/other-browser CMP IDs.
// ```

// This gives you a clean, safe architecture:

// ```txt id="xewq4q"
// cmpUserId        = technical browser consent trail
// consentId        = one CMP consent event
// formConsentId    = webform consent event
// childConsentId   = parent/guardian child consent event
// dsarId           = legal rights request
// dataSubjectId    = verified real-world person
// identityLink     = evidence-based connection between them
// ```

// [1]: https://gdpr-info.eu/art-11-gdpr/?utm_source=chatgpt.com "Art. 11 GDPR – Processing which does not require ..."
// [2]: https://gdpr-info.eu/recitals/no-26/?utm_source=chatgpt.com "Recital 26 - Not Applicable to Anonymous Data"
// [3]: https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf?utm_source=chatgpt.com "THE DIGITAL PERSONAL DATA PROTECTION ACT, 2023 ..."

// now the question of mine is how do i link to use login or the session or any tech used for this

// Yes — the best way to link anonymous `cmpUserId` to a real user is through a **verified first-party identity event**.

// Do **not** use browser fingerprinting. Use one of these:

// ```txt id="i0d57z"
// 1. Website login/session
// 2. Verified email from DSAR
// 3. Verified email from webform
// 4. Verified parent/guardian email from child consent
// ```

// The clean architecture is:

// ```txt id="pul2uw"
// cmpUserId
// = anonymous browser ID created by CMP SDK

// externalUserId
// = customer website's logged-in user ID

// dataSubjectId
// = your internal GRC3 person identity

// IdentityLink
// = proof that cmpUserId belongs to dataSubjectId
// ```

// Your CMP SDK already creates an anonymous browser user and stores it in localStorage as `cmp_user`; that is your starting `cmpUserId`.

// ## Best technical method: signed identity token

// When the user is logged in on `abc.com`, the website backend should create a signed token and give it to your SDK.

// Example from customer website backend:

// ```js id="w2i9uj"
// // generated server-side by abc.com backend
// const grc3IdentityToken = signJwt({
//   websiteId: "6879f56a2e6221ee1ad491c8",
//   domain: "abc.com",

//   // customer-side stable user id
//   externalUserId: "user_789",

//   // optional but useful
//   emailHash: hmacSha256(normalizeEmail("user@example.com")),
//   emailVerified: true,

//   iat: now,
//   exp: now + 10 * 60
// });
// ```

// Then in Next.js:

// ```jsx id="wj3kif"
// <Script
//   strategy="afterInteractive"
//   src="https://dev.grc3.io/priv/banner-loader4u.js"
//   data-website-id="6879f56a2e6221ee1ad491c8"
//   data-identity-token={grc3IdentityToken}
// />
// ```

// Or after login:

// ```js id="qhlzkf"
// window.GRC3?.identify({
//   identityToken: grc3IdentityToken
// });
// ```

// Then your SDK sends:

// ```js id="rkxpl8"
// POST /identity/link

// {
//   websiteId: "6879f56a2e6221ee1ad491c8",
//   domain: "abc.com",
//   cmpUserId: "cmp_browser_abc",
//   identityToken: "signed.jwt.here",
//   source: "login_session"
// }
// ```

// Your GRC3 backend verifies the token and creates:

// ```js id="q1mav9"
// DataSubject {
//   dataSubjectId: "subject_123",
//   tenantId: "abc.com",
//   externalUserId: "user_789",
//   emailHash: "hashed_email",
//   emailVerified: true
// }
// ```

// Then:

// ```js id="d8yquu"
// IdentityLink {
//   dataSubjectId: "subject_123",
//   cmpUserId: "cmp_browser_abc",
//   websiteId: "6879f56a2e6221ee1ad491c8",
//   domain: "abc.com",
//   evidence: "login_session",
//   confidence: "verified",
//   linkedAt: "..."
// }
// ```

// That is the core solution.

// ## Why signed token, not plain email?

// Because frontend JS can be modified. If you allow this:

// ```js id="z6906o"
// window.GRC3.identify({
//   email: "someone@example.com"
// });
// ```

// anyone could claim any email.

// So use:

// ```txt id="rbyqpi"
// Frontend says: here is signed identity proof

// Backend verifies:
//   - token signature
//   - websiteId/domain
//   - expiry
//   - externalUserId/emailHash
// ```

// Then linking is trusted.

// ## Three ways to get login/session identity

// ### Option A: server-rendered identity token

// Best for Next.js if user is logged in server-side:

// ```jsx id="u9euvm"
// <Script
//   src="https://dev.grc3.io/priv/banner-loader4u.js"
//   data-website-id="6879f56a2e6221ee1ad491c8"
//   data-identity-token={identityToken}
// />
// ```

// ### Option B: SDK calls customer `/me` endpoint

// Use this if customer has a same-origin authenticated session:

// ```js id="gc4y9q"
// const res = await fetch("/api/grc3/me", {
//   credentials: "include"
// });

// const data = await res.json();

// if (data.identityToken) {
//   window.GRC3.identify({
//     identityToken: data.identityToken
//   });
// }
// ```

// Important: normal login session cookies are often `HttpOnly`, so your JS cannot read them directly. That is good. The browser sends them to `/api/grc3/me`, and the backend returns a signed GRC3 identity token.

// ### Option C: customer calls your backend directly

// When the user logs in, customer backend directly calls:

// ```txt id="ytyv5k"
// POST https://api.grc3.io/identity/link
// ```

// This is strongest, but it requires backend integration from the customer.

// ## How this solves Browser A / Browser B

// Browser A:

// ```txt id="whz1yw"
// cmpUserId = cmp_A
// user logs in as user_789
// identity token verifies user_789
// link cmp_A → subject_123
// ```

// Browser B:

// ```txt id="pwox33"
// cmpUserId = cmp_B
// same user logs in as user_789
// identity token verifies user_789
// link cmp_B → subject_123
// ```

// Now your backend knows:

// ```txt id="sixk1e"
// subject_123
//   ├── cmp_A
//   └── cmp_B
// ```

// So DSAR/export can include consent records from both browsers **only after both were linked through login/session/verification**.

// ## What about webform consent?

// When user submits a form, include both:

// ```js id="wj4a5a"
// {
//   formSubmissionId: "submission_001",
//   cmpUserId: "cmp_A",
//   identityToken: "signed.jwt.if.logged.in",
//   email: "user@example.com" // only if form collects it
// }
// ```

// Backend rule:

// ```txt id="84ri9p"
// If identityToken exists:
//   link form consent to dataSubjectId

// Else if email exists:
//   send OTP / verification email
//   after verified, create/link dataSubjectId

// Else:
//   keep form consent linked only to formSubmissionId + cmpUserId
// ```

// ## What about child consent?

// For child consent, link through the **verified parent/guardian**, not just the anonymous CMP user.

// ```js id="e3dzkq"
// ChildConsent {
//   childConsentId: "child_consent_001",
//   cmpUserId: "cmp_A",
//   parentDataSubjectId: "subject_parent_123",
//   childDataSubjectId: "subject_child_456",
//   parentEmailVerified: true,
//   status: "granted"
// }
// ```

// If the parent is logged in:

// ```txt id="maowgi"
// login/session token → parentDataSubjectId
// ```

// If not logged in:

// ```txt id="m98o33"
// parent email OTP → parentDataSubjectId
// ```

// ## What about DSAR?

// DSAR should use verification:

// ```txt id="5nxuvy"
// User enters email
//   ↓
// Send OTP / magic link
//   ↓
// After verification
//   ↓
// Create/find dataSubjectId
//   ↓
// Link current cmpUserId to dataSubjectId
// ```

// GDPR supports not collecting extra identification where the processing purpose does not require it, but if the user provides extra information to identify themselves, the controller should use that to support the rights request. GDPR also allows requesting additional information where there are reasonable doubts about the requester’s identity. ([gdpr-info.eu][1])

// DPDPA also centers the Data Principal’s ability to give, manage, review, and withdraw consent, including through a Consent Manager. ([MeitY][2])

// ## Final architecture I would implement

// ```txt id="cy0bm0"
// GRC3Identity SDK
//   - reads cmpUserId from CMP storage
//   - accepts identityToken
//   - calls /identity/link
//   - exposes current identity state
// ```

// Example browser API:

// ```js id="scwj9x"
// window.GRC3Identity = {
//   identify({ identityToken }) {
//     return fetch("https://dev.grc3.io/identity/link", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json"
//       },
//       credentials: "include",
//       body: JSON.stringify({
//         cmpUserId: window.CMP?.userId,
//         identityToken,
//         source: "login_session"
//       })
//     });
//   }
// };
// ```

// Then each module uses it:

// ```txt id="xzz9yh"
// CMP SDK
//   creates cmpUserId
//   saves consentId under cmpUserId

// Login/session bridge
//   links cmpUserId → dataSubjectId

// Webform runtime
//   submits formConsentId + cmpUserId + identityToken/email verification

// Child consent runtime
//   submits childConsentId + parent identity verification

// DSAR runtime
//   verifies email/login and creates dsarId under dataSubjectId
// ```

// The most important table is:

// ```js id="o6gw26"
// IdentityLink {
//   id: "link_001",
//   tenantId: "abc.com",
//   websiteId: "6879f56a2e6221ee1ad491c8",

//   dataSubjectId: "subject_123",

//   linkedIdType: "cmpUserId",
//   linkedIdValue: "cmp_A",

//   evidence: "login_session",
//   confidence: "verified",

//   createdAt: "..."
// }
// ```

// So the answer is:

// ```txt id="s27lc8"
// Use login/session by passing a signed identity token from the customer backend to your SDK.

// Use DSAR/webform/child consent email only after OTP or magic-link verification.

// Then link everything through dataSubjectId + IdentityLink.

// Never merge browsers/devices only by IP, user-agent, or fingerprinting.
// ```

// [1]: https://gdpr-info.eu/art-11-gdpr/?utm_source=chatgpt.com "Art. 11 GDPR – Processing which does not require ..."
// [2]: https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf?utm_source=chatgpt.com "THE DIGITAL PERSONAL DATA PROTECTION ACT, 2023 ..."

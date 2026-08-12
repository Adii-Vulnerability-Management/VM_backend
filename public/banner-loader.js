console.log('[CMP] Consent blocker initializing');

(function () {
  const blockedPatterns = [
    /googletagmanager\.com/,
    /google-analytics\.com/,
    /gtag\/js/,
    /analytics\.js/,
    /gtm\.js/,
    /GTM-/,
    /G-[A-Z0-9]+/,
    /_ga/,
    /_gid/,
  ];

  // 1. Wipe analytics functions if already defined
  if (typeof window.gtag === 'function') {
    window.gtag = function () {
      console.warn('[CMP] Blocked preloaded gtag call:', arguments);
    };
  }

  if (window.dataLayer && Array.isArray(window.dataLayer)) {
    window.dataLayer.length = 0;
    window.dataLayer.push = function () {
      console.warn('[CMP] Blocked dataLayer push:', arguments);
      return 0;
    };
  }

  // 2. Remove matching <script> tags already in DOM
  document.querySelectorAll('script').forEach((script) => {
    const src = script.src || '';
    if (blockedPatterns.some((pat) => pat.test(src))) {
      console.warn('[CMP] Removing analytics script:', src);
      script.type = 'javascript/blocked';
      script.remove();
    }
  });

  // 3. Intercept future <script> injections
  const originalCreateElement = document.createElement;
  document.createElement = function (tagName) {
    const element = originalCreateElement.call(document, tagName);
    if (tagName.toLowerCase() === 'script') {
      Object.defineProperty(element, 'src', {
        set(value) {
          if (blockedPatterns.some((pat) => pat.test(value))) {
            console.warn('[CMP] Prevented loading of script:', value);
          } else {
            element.setAttribute('src', value);
          }
        },
        get() {
          return element.getAttribute('src');
        },
      });
    }
    return element;
  };

  // 4. Block setting GA cookies
  const originalCookieSetter =
    document.__lookupSetter__('cookie') ||
    Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')?.set;

  Object.defineProperty(document, 'cookie', {
    configurable: true,
    set: function (value) {
      if (/_ga|_gid|_gat/.test(value)) {
        console.warn('[CMP] Blocked cookie:', value);
        return;
      }
      originalCookieSetter.call(document, value);
    },
  });

  // 5. Delete already set analytics cookies
  function deleteCookie(name) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    console.warn(`[CMP] Deleted cookie: ${name}`);
  }

  function clearAnalyticsCookies() {
    const cookies = document.cookie.split(';').map(c => c.trim());
    cookies.forEach((cookie) => {
      const name = cookie.split('=')[0];
      if (/_ga|_gid|_gat/.test(name)) {
        deleteCookie(name);
      }
    });
  }

  clearAnalyticsCookies();

  console.log('[CMP] Analytics blocker fully initialized');
})();

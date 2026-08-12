// selectorWatcher.js

(function () {
  console.log('selectorWatcher script started');

  // --- constants ---
  // const RUN_SUMMARY_API = `https://dev.grc3.io/priv/cmp/selector-config-run-summaries`;
  // const apiBase = `https://dev.grc3.io/priv/cmp/selector-configs`;

  let apiBase = null;
  let RUN_SUMMARY_API = null;
  const RULE_WAIT_TIMEOUT_MS = 3000;
  const RULE_WAIT_INTERVAL_MS = 200;
  const TRIGGER_THROTTLE_MS = 500; // avoid double-posts from ultra-fast repeated clicks

  // --- state ---
  let domain = null;
  let lastPathname = location.pathname;
  const lastTriggerTime = new Map(); // configId -> timestamp
  const attachedTriggerListeners = new WeakMap(); // element -> Set of keys

  // --- helpers ---
  function buildRunSummaryPayload(captureOutput) {
    let cmp_user_id = JSON.parse(
      localStorage.getItem('cmp_user') || '{}',
    )?.userId;
    console.log('cmp_user', localStorage.getItem('cmp_user'));

    console.log('cmp_user_id', cmp_user_id);

    return {
      configId: captureOutput.configId,
      cmp_user_id,
      ruleResults: (captureOutput.ruleResults || []).map((r) => ({
        rule_id: r._id || r.ruleId,
        fragment: r.fragment,
        values: r.values,
      })),
    };
  }

  async function sendRunSummary(payload) {
    try {
      console.log('selectorWatcher: sending run summary payload:', payload);
      const resp = await fetch(RUN_SUMMARY_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.warn(
          'selectorWatcher: failed to persist run summary:',
          resp.status,
          resp.statusText,
          text,
        );
        return;
      }
      const body = await resp.json();
      console.log('selectorWatcher: run summary saved:', body);
    } catch (err) {
      console.error('selectorWatcher: error sending run summary:', err);
    }
  }

  function readValue(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      if (el.type === 'checkbox' || el.type === 'radio') {
        return el.checked;
      }
      return el.value;
    }
    if (tag === 'select' || tag === 'textarea') {
      return el.value;
    }
    return el.textContent.trim();
  }

  function buildFragment(rule) {
    const { tag, customTag, attribute, value } = rule;
    const v = (value || '').trim();
    if (!v) return '';
    let frag = '';
    if (tag === 'checkbox') frag = 'input[type="checkbox"]';
    else if (tag === 'radio') frag = 'input[type="radio"]';
    else if (tag === 'custom') frag = (customTag || '').trim();
    else frag = tag || '';
    switch (attribute) {
      case 'id':
        frag += `#${v}`;
        break;
      case 'class':
        frag += `.${v.split(' ').join('.')}`;
        break;
      case 'name':
        frag += `[name="${v}"]`;
        break;
      case 'tag':
        frag = v;
        break;
      case 'data':
        frag += `[data-${v}]`;
        break;
    }
    return frag;
  }

  // wait for all rule fragments to have at least one element or timeout
  function waitForRuleElements(
    cfg,
    timeout = RULE_WAIT_TIMEOUT_MS,
    interval = RULE_WAIT_INTERVAL_MS,
  ) {
    return new Promise((resolve) => {
      const start = Date.now();
      function check() {
        const missing = (cfg.rules || []).some((rule) => {
          const frag = buildFragment(rule);
          if (!frag) return true;
          return !document.querySelector(frag);
        });
        if (!missing) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeout) {
          resolve(false); // proceed anyway
          return;
        }
        setTimeout(check, interval);
      }
      check();
    });
  }

  // safe attach to avoid duplicate listener
  function safeAddListener(el, key, event, handler) {
    let set = attachedTriggerListeners.get(el);
    if (!set) {
      set = new Set();
      attachedTriggerListeners.set(el, set);
    }
    if (set.has(key)) return;
    el.addEventListener(event, handler);
    set.add(key);
  }

  // capture & send once for a config
  async function captureConfig(cfg) {
    try {
      const configId = cfg._id || cfg.id || null;
      console.group(
        `selectorWatcher: Capture for config ${configId || '(no id)'}`,
      );

      const results = (cfg.rules || []).map((rule) => {
        const frag = buildFragment(rule);
        const els = frag ? document.querySelectorAll(frag) : [];
        const values = Array.from(els).map(readValue);
        console.log(`Rule ${rule.id} [${frag}] →`, values);
        return {
          _id: rule._id || null,
          ruleId: rule.id,
          configId,
          fragment: frag,
          attribute: rule.attribute,
          description: rule.description || '',
          values,
        };
      });

      const output = {
        configId,
        domain: cfg.domain,
        route: cfg.route,
        trigger: cfg.trigger || null,
        ruleResults: results,
      };
      const payload = buildRunSummaryPayload(output);
      await sendRunSummary(payload);
      window.selectorConfigValues = output;
      console.groupEnd();
    } catch (e) {
      console.error('selectorWatcher: error in captureConfig:', e);
    }
  }

  // Attach trigger listener for the config (only POST on trigger)
  function attachTriggerForConfig(cfg) {
    if (!cfg || !cfg.trigger || !cfg.trigger.selector || !cfg.trigger.event) {
      console.warn(
        `selectorWatcher: config ${
          cfg._id || cfg.id
        } missing trigger definition.`,
        cfg.trigger,
      );
      return;
    }
    const configId = cfg._id || cfg.id || null;
    const trig = cfg.trigger;
    const key = `${configId}:${trig.event}:${trig.selector}`;

    function scanAndBind() {
      const triggerEls = document.querySelectorAll(trig.selector);
      if (!triggerEls.length) return;
      triggerEls.forEach((el) => {
        safeAddListener(el, key, trig.event, async (e) => {
          const now = Date.now();
          const last = lastTriggerTime.get(configId) || 0;
          if (now - last < TRIGGER_THROTTLE_MS) {
            console.log(
              'selectorWatcher: trigger throttled for config',
              configId,
            );
            return;
          }
          lastTriggerTime.set(configId, now);
          console.log(
            `selectorWatcher: trigger "${trig.event}" fired for config ${configId} on`,
            el,
          );
          // Wait briefly for rule elements to appear (best effort)
          await waitForRuleElements(cfg);
          await captureConfig(cfg);
        });
        console.log(
          `selectorWatcher: listening for "${trig.event}" on "${trig.selector}" for config ${configId}.`,
        );
      });
    }

    scanAndBind(); // initial attempt

    // observe DOM for late-appearing trigger element
    const mo = new MutationObserver(() => {
      scanAndBind();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // filter configs by route
  function getActiveConfigs(configs) {
    // below code if we want to run configuration as per route

    // return (configs || []).filter(cfg => {
    //   if (!cfg.route) return true;
    //   return location.pathname === cfg.route || location.pathname.startsWith(cfg.route);
    // });

    // this is if want to go without route
    return configs || [];
  }

  // load configurations from backend
  async function loadConfigs() {
    console.log('domain from 261', domain);

    try {
      const fetchUrl = `${apiBase}?domain=${domain}`;
      console.log('selectorWatcher: fetching config from', fetchUrl);
      const resp = await fetch(fetchUrl, {
        method: 'GET',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
        },
      });
      if (!resp.ok) {
        console.warn(
          'selectorWatcher: failed to fetch selector config, status:',
          resp.status,
          resp.statusText,
        );
        return [];
      }
      const body = await resp.json();
      let configs = [];
      if (Array.isArray(body.data)) {
        configs = body.data;
      } else if (body.data && typeof body.data === 'object') {
        configs = [body.data];
      } else {
        console.warn('selectorWatcher: unexpected response shape:', body);
      }
      console.log('selectorWatcher: loaded configs:', configs);
      return configs;
    } catch (err) {
      console.error('selectorWatcher: error loading configs:', err);
      return [];
    }
  }

  // refresh & reattach triggers (only triggers cause POSTs)
  async function refreshConfigsAndTriggers() {
    const allConfigs = await loadConfigs();
    const active = getActiveConfigs(allConfigs);
    if (!active.length) {
      console.warn(
        'selectorWatcher: no active selector configurations for this route.',
      );
    }
    active.forEach((cfg) => {
      attachTriggerForConfig(cfg);
    });
  }

  // route change detection
  function onRouteChange() {
    if (location.pathname === lastPathname) return;
    console.log(
      'selectorWatcher: detected route change:',
      lastPathname,
      '→',
      location.pathname,
    );
    lastPathname = location.pathname;
    refreshConfigsAndTriggers();
  }

  function patchHistoryApis() {
    const origPush = history.pushState;
    history.pushState = function (...args) {
      const res = origPush.apply(this, args);
      setTimeout(onRouteChange, 0);
      return res;
    };
    const origReplace = history.replaceState;
    history.replaceState = function (...args) {
      const res = origReplace.apply(this, args);
      setTimeout(onRouteChange, 0);
      return res;
    };
    window.addEventListener('popstate', onRouteChange);
    // fallback polling
    setInterval(() => {
      if (location.pathname !== lastPathname) {
        onRouteChange();
      }
    }, 1000);
  }

  // init
  async function init() {
    const scriptEl =
      document.currentScript ||
      document.querySelector('script[src$="selectorWatcher.js"]');
    domain = scriptEl?.dataset.domain?.trim();
    console.log('domain:', domain ?? 'no data-domain found');
    if (!domain) {
      console.warn(
        'selectorWatcher: no data-domain provided on script tag; aborting.',
      );
      return;
    }
    console.log('selectorWatcher: domain from script tag:', domain);
    // derive initUrl by stripping off /selectorWatcher.js
    const src = scriptEl.getAttribute('src') || '';
    initUrl = src.replace(/\/selectorWatcher\.js.*$/, ''); // keep everything before filename

    // build API urls dynamically (no hardcoded "priv")
    apiBase = `${initUrl}/cmp/selector-configs`;
    RUN_SUMMARY_API = `${initUrl}/cmp/selector-config-run-summaries`;
    console.log('selectorWatcher: using initUrl:', initUrl);
    console.log('selectorWatcher: apiBase:', apiBase);
    console.log('selectorWatcher: runSummaryApi:', RUN_SUMMARY_API);

    patchHistoryApis();
    await refreshConfigsAndTriggers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

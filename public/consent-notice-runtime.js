/*
 * Consent Notice Runtime
 * ------------------------------------------------------------
 * Browser-side runtime for rendering published consent notice HTML based on
 * backend runtime resolution and ConsentNoticeAttachment display/trigger settings.
 *
 * Expected backend endpoints:
 *   POST /consent-notices/resolve
 *   POST /consent-notices/acceptance
 *   POST /consent-notices/form-acceptance (after the host form succeeds)
 *
 * Attach a surface using data attributes:
 *
 * <form
 *   data-consent-notice
 *   data-target-type="internal_webform"
 *   data-target-id="newsletter_form"
 *   data-target-field-id="privacy_checkbox"
 *   data-environment="production"
 *   data-region="IN"
 *   data-regulation="DPDPA"
 *   data-locale="en-IN"
 * >
 *   <label>
 *     <input type="checkbox" data-consent-checkbox />
 *     I agree to the <button type="button" data-consent-open>Privacy Policy</button>
 *   </label>
 * </form>
 *
 * The backend attachment controls displayMode and triggerMode. DOM attributes can
 * override them with data-display-mode and data-trigger-mode when needed.
 */
(function consentNoticeRuntimeFactory(window, document) {
  "use strict";

  if (!window || !document) return;

  var DEFAULTS = {
    apiBaseUrl: "",
    resolvePath: "/consent-notices/resolve",
    acceptancePath: "/consent-notices/acceptance",
    formAcceptancePath: "/consent-notices/form-acceptance",
    tenantId: "",
    environment: "production",
    domain: window.location ? window.location.hostname : "",
    appId: "",
    region: "global",
    regulation: "custom",
    locale: "en-IN",
    defaultLocale: "en-IN",
    cmpUserId: "",
    recordAcceptance: true,
    autoBind: true,
    selector: "[data-consent-notice]",
    headers: {},
    credentials: "same-origin",
    debug: false
  };

  var state = extend({}, DEFAULTS);
  var activeLayer = null;
  var previousActiveElement = null;
  var styleInjected = false;

  function extend(target) {
    target = target || {};
    for (var i = 1; i < arguments.length; i += 1) {
      var source = arguments[i] || {};
      Object.keys(source).forEach(function copy(key) {
        if (source[key] !== undefined) target[key] = source[key];
      });
    }
    return target;
  }

  function log() {
    if (!state.debug || !window.console) return;
    window.console.log.apply(window.console, ["[ConsentNoticeRuntime]"].concat([].slice.call(arguments)));
  }

  function warn() {
    if (!window.console) return;
    window.console.warn.apply(window.console, ["[ConsentNoticeRuntime]"].concat([].slice.call(arguments)));
  }

  function dataValue(el, name, fallback) {
    if (!el) return fallback;
    var value = el.getAttribute("data-" + name.replace(/[A-Z]/g, function toKebab(match) {
      return "-" + match.toLowerCase();
    }));
    return value === null || value === "" ? fallback : value;
  }

  function boolValue(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    return !["false", "0", "no", "off"].includes(String(value).toLowerCase());
  }

  function toUrl(path) {
    var base = String(state.apiBaseUrl || "").replace(/\/$/, "");
    var cleanPath = String(path || "").charAt(0) === "/" ? path : "/" + path;
    return base + cleanPath;
  }

  function postJson(path, body) {
    if (!window.fetch) {
      return Promise.reject(new Error("fetch is not available in this browser"));
    }

    var headers = extend({ "Content-Type": "application/json" }, state.headers || {});
    if (state.tenantId && !headers["x-tenant-id"]) headers["x-tenant-id"] = state.tenantId;

    return window.fetch(toUrl(path), {
      method: "POST",
      credentials: state.credentials,
      headers: headers,
      body: JSON.stringify(body || {})
    }).then(function handleResponse(response) {
      return response.text().then(function parse(text) {
        var payload = text ? JSON.parse(text) : {};
        if (!response.ok) {
          var message = payload && payload.message ? payload.message : "Consent notice request failed";
          throw new Error(Array.isArray(message) ? message.join(", ") : message);
        }
        return payload;
      });
    });
  }

  function getCmpUserId() {
    if (state.cmpUserId) return state.cmpUserId;

    try {
      var storageKey = "cnm_cmp_user_id";
      var existing = window.localStorage && window.localStorage.getItem(storageKey);
      if (existing) return existing;

      var created = "cmp_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      if (window.localStorage) window.localStorage.setItem(storageKey, created);
      state.cmpUserId = created;
      return created;
    } catch (error) {
      return "cmp_" + Math.random().toString(36).slice(2);
    }
  }

  function normalizeResolved(payload) {
    var root = payload || {};
    var notice = root.consentNotice || root.consent_notice || root;
    var attachment = root.attachment || {};
    var publishConfig = root.publishConfig || root.publish_config || {};

    return {
      raw: root,
      notice: notice,
      attachment: attachment,
      publishConfig: publishConfig,
      templateId: notice.templateId || notice.template_id || root.templateId || root.template_id,
      versionId: notice.versionId || notice.version_id || root.versionId || root.version_id,
      version: notice.version || root.version,
      title: notice.title || root.title || "Consent Notice",
      locale: notice.locale || root.locale,
      htmlContent: notice.htmlContent || notice.html_content || root.htmlContent || root.html_content || "",
      plainTextContent: notice.plainTextContent || notice.plain_text_content || root.plainTextContent || root.plain_text_content || "",
      displayMode: attachment.displayMode || attachment.display_mode,
      triggerMode: attachment.triggerMode || attachment.trigger_mode,
      required: attachment.required
    };
  }

  function buildContext(surface, overrides) {
    var context = extend({
      tenantId: state.tenantId,
      targetType: dataValue(surface, "targetType", undefined),
      targetId: dataValue(surface, "targetId", undefined),
      targetFieldId: dataValue(surface, "targetFieldId", undefined),
      noticeTemplateId: dataValue(surface, "noticeTemplateId", undefined),
      environment: dataValue(surface, "environment", state.environment),
      domain: dataValue(surface, "domain", state.domain),
      appId: dataValue(surface, "appId", state.appId),
      region: dataValue(surface, "region", state.region),
      regulation: dataValue(surface, "regulation", state.regulation),
      locale: dataValue(surface, "locale", state.locale),
      defaultLocale: dataValue(surface, "defaultLocale", state.defaultLocale)
    }, overrides || {});

    Object.keys(context).forEach(function removeEmpty(key) {
      if (context[key] === undefined || context[key] === null || context[key] === "") delete context[key];
    });

    return context;
  }

  function resolveNotice(context) {
    return postJson(state.resolvePath, context || {});
  }

  function buildAcceptancePayload(resolvedPayload, surface, accepted, extra) {
    var normalized = normalizeResolved(resolvedPayload);
    var context = resolvedPayload.__cnmContext || buildContext(surface);
    var fieldId = dataValue(surface, "fieldId", context.targetFieldId);

    return extend({
      tenantId: context.tenantId || state.tenantId,
      cmpUserId: dataValue(surface, "cmpUserId", getCmpUserId()),
      domain: context.domain || state.domain,
      environment: context.environment || state.environment,
      appId: context.appId || state.appId,
      defaultLocale: context.defaultLocale || state.defaultLocale,
      targetType: context.targetType,
      targetId: context.targetId,
      fieldId: fieldId,
      noticeTemplateId: normalized.templateId,
      noticeVersionId: normalized.versionId,
      noticeVersion: normalized.version,
      locale: normalized.locale || context.locale || state.locale,
      region: context.region || state.region,
      regulation: context.regulation || state.regulation,
      accepted: accepted !== false,
      acceptedAt: accepted === false ? undefined : new Date().toISOString(),
      withdrawnAt: accepted === false ? new Date().toISOString() : undefined,
      submittedDataRef: dataValue(surface, "submittedDataRef", undefined)
    }, extra || {});
  }

  function recordAcceptance(resolvedPayload, surface, accepted, extra) {
    var payload = buildAcceptancePayload(resolvedPayload, surface, accepted, extra);

    if (!payload.targetType || !payload.targetId || !payload.noticeTemplateId || !payload.noticeVersionId || !payload.noticeVersion) {
      return Promise.reject(new Error("Acceptance payload is missing target or notice metadata"));
    }

    return postJson(state.acceptancePath, payload);
  }

  function acceptedNoticeForSurface(surface) {
    var resolvedPayload = surface && surface.__cnmResolvedNotice;
    if (!resolvedPayload) return null;

    var checkbox = findCheckbox(surface);
    if (checkbox && !checkbox.checked) return null;

    var payload = buildAcceptancePayload(resolvedPayload, surface, true, {});
    return {
      targetType: payload.targetType,
      targetId: payload.targetId,
      fieldId: payload.fieldId,
      noticeTemplateId: payload.noticeTemplateId,
      noticeVersionId: payload.noticeVersionId,
      accepted: true,
      environment: payload.environment,
      appId: payload.appId,
      defaultLocale: payload.defaultLocale,
      locale: payload.locale,
      region: payload.region,
      regulation: payload.regulation
    };
  }

  function formSurfaces(form) {
    if (!form) return [];
    var surfaces = [];
    if (form.matches && form.matches(state.selector)) surfaces.push(form);
    Array.prototype.forEach.call(form.querySelectorAll(state.selector), function add(surface) {
      if (surfaces.indexOf(surface) < 0) surfaces.push(surface);
    });
    return surfaces;
  }

  function syncAcceptedNoticesInput(form) {
    if (!form) return [];
    var acceptedNotices = formSurfaces(form)
      .map(acceptedNoticeForSurface)
      .filter(Boolean);
    var input = form.querySelector('input[data-consent-accepted-notices]');

    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "acceptedNotices";
      input.setAttribute("data-consent-accepted-notices", "true");
      form.appendChild(input);
    }

    input.value = JSON.stringify(acceptedNotices);
    form.__cnmAcceptedNotices = acceptedNotices;
    return acceptedNotices;
  }

  function recordFormAcceptance(form, extra) {
    var details = extra || {};
    var acceptedNotices = syncAcceptedNoticesInput(form);
    var firstSurface = formSurfaces(form)[0];
    var firstContext = firstSurface && firstSurface.__cnmResolvedNotice
      ? firstSurface.__cnmResolvedNotice.__cnmContext || buildContext(firstSurface)
      : {};
    var submittedDataRef = details.submittedDataRef || details.submitted_data_ref || dataValue(form, "submittedDataRef", undefined);

    if (!submittedDataRef) {
      return Promise.reject(new Error("submittedDataRef is required after successful form submission"));
    }
    if (!acceptedNotices.length) {
      return Promise.resolve({ message: "No accepted consent notices to record", count: 0, logs: [] });
    }

    // The host application calls this only after its form/submission API succeeds.
    // This avoids creating acceptance evidence for abandoned or failed submissions.
    return postJson(state.formAcceptancePath, extend({
      tenantId: firstContext.tenantId || state.tenantId,
      cmpUserId: details.cmpUserId || details.cmp_user_id || getCmpUserId(),
      domain: firstContext.domain || state.domain,
      environment: firstContext.environment || state.environment,
      appId: firstContext.appId || state.appId,
      defaultLocale: firstContext.defaultLocale || state.defaultLocale,
      locale: firstContext.locale || state.locale,
      region: firstContext.region || state.region,
      regulation: firstContext.regulation || state.regulation,
      submittedDataRef: submittedDataRef,
      submissionSucceeded: true,
      acceptedNotices: acceptedNotices
    }, details));
  }

  function sanitizeHtml(html) {
    var value = String(html || "");

    if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
      return window.DOMPurify.sanitize(value, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["target", "rel", "aria-label"]
      });
    }

    var template = document.createElement("template");
    template.innerHTML = value;

    var blocked = template.content.querySelectorAll("script, style, iframe, object, embed, link, meta");
    Array.prototype.forEach.call(blocked, function remove(node) {
      node.parentNode && node.parentNode.removeChild(node);
    });

    var nodes = template.content.querySelectorAll("*");
    Array.prototype.forEach.call(nodes, function clean(node) {
      Array.prototype.slice.call(node.attributes).forEach(function cleanAttr(attr) {
        var attrName = attr.name.toLowerCase();
        var attrValue = String(attr.value || "").trim().toLowerCase();

        if (attrName.indexOf("on") === 0) node.removeAttribute(attr.name);
        if ((attrName === "href" || attrName === "src") && attrValue.indexOf("javascript:") === 0) {
          node.removeAttribute(attr.name);
        }
        if (attrName === "target" && node.getAttribute("target") === "_blank") {
          node.setAttribute("rel", "noopener noreferrer");
        }
      });
    });

    return template.innerHTML;
  }

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;

    var style = document.createElement("style");
    style.setAttribute("data-consent-notice-runtime-style", "true");
    style.textContent = [
      ".cnm-runtime-lock{overflow:hidden!important}",
      ".cnm-runtime-layer{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.48);display:flex;padding:20px;box-sizing:border-box}",
      ".cnm-runtime-layer[data-mode='popup']{align-items:center;justify-content:center}",
      ".cnm-runtime-layer[data-mode='drawer']{align-items:stretch;justify-content:flex-end;padding:0}",
      ".cnm-runtime-panel{background:#fff;color:#0f172a;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.28);display:flex;flex-direction:column;max-height:calc(100vh - 40px);width:min(760px,100%);overflow:hidden}",
      ".cnm-runtime-layer[data-mode='drawer'] .cnm-runtime-panel{height:100vh;max-height:100vh;border-radius:0;width:min(620px,100%)}",
      ".cnm-runtime-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid #e2e8f0}",
      ".cnm-runtime-eyebrow{font:700 11px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#2563eb;margin:0 0 4px}",
      ".cnm-runtime-title{font:700 20px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;margin:0;color:#0f172a}",
      ".cnm-runtime-meta{font:500 12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#64748b;margin:6px 0 0}",
      ".cnm-runtime-close{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px 11px;cursor:pointer;font:700 13px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#334155}",
      ".cnm-runtime-close:hover{background:#f8fafc}",
      ".cnm-runtime-body{padding:20px;overflow:auto;font:400 15px/1.65 system-ui,-apple-system,Segoe UI,sans-serif;color:#334155}",
      ".cnm-runtime-body h1,.cnm-runtime-body h2,.cnm-runtime-body h3{color:#0f172a;line-height:1.25;margin:1em 0 .45em}",
      ".cnm-runtime-body p{margin:.7em 0}",
      ".cnm-runtime-body a{color:#2563eb;text-decoration:underline}",
      ".cnm-runtime-inline{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:16px;margin:12px 0;color:#334155}",
      ".cnm-runtime-accordion{border:1px solid #e2e8f0;border-radius:14px;margin:12px 0;overflow:hidden;background:#fff}",
      ".cnm-runtime-accordion-btn{width:100%;background:#f8fafc;border:0;padding:14px 16px;text-align:left;font:700 14px system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;cursor:pointer}",
      ".cnm-runtime-accordion-panel{display:none;padding:16px;border-top:1px solid #e2e8f0;color:#334155}",
      ".cnm-runtime-accordion[data-open='true'] .cnm-runtime-accordion-panel{display:block}",
      ".cnm-runtime-link{border:0;background:transparent;color:#2563eb;text-decoration:underline;cursor:pointer;padding:0;font:inherit;font-weight:700}"
    ].join("\n");

    document.head.appendChild(style);
  }

  function htmlForNotice(normalized) {
    var html = normalized.htmlContent || "";
    if (!html && normalized.plainTextContent) {
      html = "<p>" + String(normalized.plainTextContent).replace(/\n/g, "<br />") + "</p>";
    }
    return sanitizeHtml(html || "<p>No consent notice content available.</p>");
  }

  function closeLayer() {
    if (activeLayer && activeLayer.parentNode) activeLayer.parentNode.removeChild(activeLayer);
    activeLayer = null;
    document.documentElement.classList.remove("cnm-runtime-lock");
    if (previousActiveElement && typeof previousActiveElement.focus === "function") {
      try { previousActiveElement.focus(); } catch (error) { /* noop */ }
    }
  }

  function onEscape(event) {
    if (event.key === "Escape") closeLayer();
  }

  function renderOverlay(resolvedPayload, mode) {
    injectStyles();
    closeLayer();

    var normalized = normalizeResolved(resolvedPayload);
    previousActiveElement = document.activeElement;

    var layer = document.createElement("div");
    layer.className = "cnm-runtime-layer";
    layer.setAttribute("data-mode", mode === "drawer" ? "drawer" : "popup");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");

    var panel = document.createElement("div");
    panel.className = "cnm-runtime-panel";

    var header = document.createElement("div");
    header.className = "cnm-runtime-header";
    header.innerHTML = [
      "<div>",
      "<p class='cnm-runtime-eyebrow'>Consent Notice</p>",
      "<h2 class='cnm-runtime-title'></h2>",
      "<p class='cnm-runtime-meta'></p>",
      "</div>"
    ].join("");

    header.querySelector(".cnm-runtime-title").textContent = normalized.title;
    header.querySelector(".cnm-runtime-meta").textContent = [
      normalized.version ? "Version " + normalized.version : "",
      normalized.locale || ""
    ].filter(Boolean).join(" • ");

    var close = document.createElement("button");
    close.type = "button";
    close.className = "cnm-runtime-close";
    close.textContent = "Close";
    close.addEventListener("click", closeLayer);
    header.appendChild(close);

    var body = document.createElement("div");
    body.className = "cnm-runtime-body";
    body.innerHTML = htmlForNotice(normalized);

    panel.appendChild(header);
    panel.appendChild(body);
    layer.appendChild(panel);
    layer.addEventListener("click", function closeOnBackdrop(event) {
      if (event.target === layer) closeLayer();
    });

    document.body.appendChild(layer);
    document.documentElement.classList.add("cnm-runtime-lock");
    document.addEventListener("keydown", onEscape, { once: true });
    close.focus();
    activeLayer = layer;
    return layer;
  }

  function findInlineTarget(surface, options) {
    var selector = options && options.inlineTarget;
    selector = selector || dataValue(surface, "inlineTarget", undefined);
    if (selector) return document.querySelector(selector);
    return surface || document.body;
  }

  function renderInline(resolvedPayload, surface, options) {
    injectStyles();
    var normalized = normalizeResolved(resolvedPayload);
    var target = findInlineTarget(surface, options || {});
    var node = document.createElement("div");
    node.className = "cnm-runtime-inline";
    node.innerHTML = htmlForNotice(normalized);

    if (target === surface) {
      target.appendChild(node);
    } else if (target) {
      target.innerHTML = "";
      target.appendChild(node);
    }

    return node;
  }

  function renderAccordion(resolvedPayload, surface, options) {
    injectStyles();
    var normalized = normalizeResolved(resolvedPayload);
    var target = findInlineTarget(surface, options || {});
    var wrap = document.createElement("div");
    wrap.className = "cnm-runtime-accordion";
    wrap.setAttribute("data-open", "false");

    var button = document.createElement("button");
    button.type = "button";
    button.className = "cnm-runtime-accordion-btn";
    button.textContent = normalized.title || "View consent notice";

    var panel = document.createElement("div");
    panel.className = "cnm-runtime-accordion-panel";
    panel.innerHTML = htmlForNotice(normalized);

    button.addEventListener("click", function toggle() {
      wrap.setAttribute("data-open", wrap.getAttribute("data-open") === "true" ? "false" : "true");
    });

    wrap.appendChild(button);
    wrap.appendChild(panel);

    if (target === surface) {
      target.appendChild(wrap);
    } else if (target) {
      target.innerHTML = "";
      target.appendChild(wrap);
    }

    return wrap;
  }

  function renderFullPage(resolvedPayload) {
    var normalized = normalizeResolved(resolvedPayload);
    var page = window.open("", "_blank", "noopener,noreferrer");

    if (!page) {
      return renderOverlay(resolvedPayload, "popup");
    }

    page.document.open();
    page.document.write("<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title></title><style>body{font:400 16px/1.7 system-ui,-apple-system,Segoe UI,sans-serif;color:#334155;max-width:860px;margin:0 auto;padding:32px 20px}h1,h2,h3{color:#0f172a;line-height:1.25}a{color:#2563eb}</style></head><body><main></main></body></html>");
    page.document.title = normalized.title;
    page.document.querySelector("main").innerHTML = "<h1></h1>" + htmlForNotice(normalized);
    page.document.querySelector("h1").textContent = normalized.title;
    page.document.close();
    return page;
  }

  function renderLinkOnly(resolvedPayload, surface, options) {
    injectStyles();
    var normalized = normalizeResolved(resolvedPayload);
    var link = options && options.linkElement;
    link = link || findOpenElement(surface);

    if (!link) {
      link = document.createElement("button");
      link.type = "button";
      link.className = "cnm-runtime-link";
      link.textContent = normalized.title || "View consent notice";
      (surface || document.body).appendChild(link);
    }

    link.addEventListener("click", function openFullPage(event) {
      event.preventDefault();
      renderFullPage(resolvedPayload);
    });

    return link;
  }

  function renderNotice(resolvedPayload, options) {
    var opts = options || {};
    var surface = opts.surface;
    var normalized = normalizeResolved(resolvedPayload);
    var mode = opts.displayMode || opts.mode || dataValue(surface, "displayMode", undefined) || normalized.displayMode || "popup";

    if (mode === "drawer") return renderOverlay(resolvedPayload, "drawer");
    if (mode === "inline") return renderInline(resolvedPayload, surface, opts);
    if (mode === "accordion") return renderAccordion(resolvedPayload, surface, opts);
    if (mode === "full_page") return renderFullPage(resolvedPayload);
    if (mode === "link_only") return renderLinkOnly(resolvedPayload, surface, opts);
    return renderOverlay(resolvedPayload, "popup");
  }

  function openNotice(input, options) {
    var opts = options || {};
    var surface = opts.surface || null;
    var context = input && (input.consentNotice || input.consent_notice || input.htmlContent || input.html_content)
      ? null
      : extend(buildContext(surface), input || {});

    var promise = context ? resolveNotice(context) : Promise.resolve(input);

    return promise.then(function render(resolvedPayload) {
      if (context) resolvedPayload.__cnmContext = context;
      return renderNotice(resolvedPayload, opts);
    });
  }

  function findOpenElement(surface) {
    if (!surface) return null;
    var selector = dataValue(surface, "labelLinkSelector", undefined) || "[data-consent-open]";
    if (surface.matches && surface.matches("a,button,[role='button']")) return surface;
    return surface.querySelector(selector) || surface.querySelector("a,button,[role='button']");
  }

  function findCheckbox(surface) {
    if (!surface) return null;
    var selector = dataValue(surface, "checkboxSelector", undefined) || "[data-consent-checkbox]";
    return surface.querySelector(selector) || surface.querySelector("input[type='checkbox']");
  }

  function findForm(surface) {
    if (!surface) return null;
    var selector = dataValue(surface, "formSelector", undefined);
    if (selector) return document.querySelector(selector);
    if (surface.tagName && surface.tagName.toLowerCase() === "form") return surface;
    return surface.closest ? surface.closest("form") : null;
  }

  function shouldAutoRecord(surface) {
    var attr = dataValue(surface, "recordAcceptance", undefined);
    if (attr !== undefined) return boolValue(attr, true);
    return !!state.recordAcceptance;
  }

  function recordOnce(surface, resolvedPayload, accepted, extra) {
    if (!shouldAutoRecord(surface)) return Promise.resolve(null);

    var normalized = normalizeResolved(resolvedPayload);
    var key = normalized.versionId + ":" + (accepted === false ? "withdrawn" : "accepted");
    if (surface.__cnmRecordedKey === key) return Promise.resolve(null);

    surface.__cnmRecordedKey = key;
    return recordAcceptance(resolvedPayload, surface, accepted, extra).catch(function handle(error) {
      surface.__cnmRecordedKey = "";
      warn(error.message || error);
      throw error;
    });
  }

  function bindTrigger(surface, resolvedPayload) {
    if (!surface || surface.__cnmTriggerBound) return;

    var normalized = normalizeResolved(resolvedPayload);
    var triggerMode = dataValue(surface, "triggerMode", undefined) || normalized.triggerMode || "link_click";
    var openElement = findOpenElement(surface);
    var checkbox = findCheckbox(surface);
    var form = findForm(surface);

    surface.__cnmTriggerBound = true;
    surface.__cnmResolvedNotice = resolvedPayload;

    function open(event) {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      return renderNotice(resolvedPayload, { surface: surface });
    }

    surface.__cnmOpen = open;

    if (triggerMode === "form_load") {
      open();
    }

    if (triggerMode === "banner_open") {
      surface.addEventListener("consent:banner_open", open);
      if (dataValue(surface, "openOnLoad", "false") === "true") open();
    }

    if (triggerMode === "checkbox_check" && checkbox) {
      checkbox.addEventListener("change", function onCheckboxChange(event) {
        if (event.target.checked) open(event);
        if (form) syncAcceptedNoticesInput(form);
      });
    }

    if (form && checkbox && triggerMode !== "checkbox_check") {
      checkbox.addEventListener("change", function syncFormEvidence() {
        syncAcceptedNoticesInput(form);
      });
    }

    if (form && !form.__cnmBeforeSubmitBound) {
      form.__cnmBeforeSubmitBound = true;
      form.addEventListener("submit", function onSubmit(event) {
        var requiredSurfaces = formSurfaces(form);
        var invalidSurface = requiredSurfaces.find(function findInvalid(item) {
          var itemNotice = item.__cnmResolvedNotice;
          var itemNormalized = normalizeResolved(itemNotice || {});
          var itemCheckbox = findCheckbox(item);
          var itemRequired = boolValue(dataValue(item, "required", itemNormalized.required), true);
          return itemRequired && itemCheckbox && !itemCheckbox.checked;
        });

        if (invalidSurface) {
          event.preventDefault();
          invalidSurface.__cnmOpen && invalidSurface.__cnmOpen(event);
          var invalidCheckbox = findCheckbox(invalidSurface);
          invalidCheckbox && invalidCheckbox.focus();
          return;
        }

        // Include exact notice IDs in the submitted form payload. The form backend can
        // call NoticeAcceptanceService only after its primary submission is committed.
        syncAcceptedNoticesInput(form);
      });

      form.addEventListener("consent:form_submitted", function onFormSubmitted(event) {
        recordFormAcceptance(form, event.detail || {}).catch(function handle(error) {
          warn(error.message || error);
        });
      });
    }

    if (triggerMode === "link_click" || triggerMode === "link_only") {
      if (openElement) {
        openElement.addEventListener("click", open);
      } else {
        renderLinkOnly(resolvedPayload, surface, {});
      }
    }

    if (["inline", "accordion", "link_only"].indexOf(normalized.displayMode) >= 0) {
      renderNotice(resolvedPayload, { surface: surface });
    }
  }

  function mountSurface(surface, overrides) {
    var context = extend(buildContext(surface), overrides || {});

    return resolveNotice(context)
      .then(function resolved(payload) {
        payload.__cnmContext = context;
        bindTrigger(surface, payload);
        return payload;
      })
      .catch(function handle(error) {
        surface.__cnmError = error;
        warn("Could not resolve consent notice for surface", surface, error.message || error);
        throw error;
      });
  }

  function bindAll(root) {
    var scope = root || document;
    var surfaces = scope.querySelectorAll(state.selector || DEFAULTS.selector);
    var promises = [];

    Array.prototype.forEach.call(surfaces, function each(surface) {
      if (surface.__cnmMounted) return;
      surface.__cnmMounted = true;
      promises.push(mountSurface(surface));
    });

    return Promise.allSettled ? Promise.allSettled(promises) : Promise.all(promises.map(function settle(promise) {
      return promise.then(function ok(value) { return { status: "fulfilled", value: value }; }, function fail(reason) { return { status: "rejected", reason: reason }; });
    }));
  }

  function init(options) {
    state = extend({}, state, options || {});
    injectStyles();
    if (state.autoBind) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function onReady() { bindAll(document); });
      } else {
        bindAll(document);
      }
    }
    return api;
  }

  var api = {
    init: init,
    bindAll: bindAll,
    mountSurface: mountSurface,
    resolveNotice: resolveNotice,
    openNotice: openNotice,
    renderNotice: renderNotice,
    recordAcceptance: recordAcceptance,
    recordFormAcceptance: recordFormAcceptance,
    syncAcceptedNoticesInput: syncAcceptedNoticesInput,
    close: closeLayer,
    sanitizeHtml: sanitizeHtml,
    normalizeResolved: normalizeResolved,
    getState: function getState() { return extend({}, state); }
  };

  window.ConsentNoticeRuntime = api;
})(window, document);

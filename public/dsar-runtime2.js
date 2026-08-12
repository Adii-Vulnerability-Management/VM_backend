// /public/dsar-runtime.js
(function () {
  console.log('[dsar-runtime] upgraded file evaluated');

  const DSAR_CONTAINER_ID = 'dsar-widget';
  const CMP_USER_ID_STORAGE_KEY = 'cmp_user';

  const RUNTIME_SCRIPT =
    document.currentScript ||
    document.querySelector('script[src*="dsar-runtime.js"]');

  const DEFAULT_CONFIG = {
    showModal: true,
    title: 'Data Privacy Request',
    subtitle:
      'We respect your privacy rights. Submit a request to access, delete, correct, or manage your personal data.',
    submitLabel: 'Submit Request',
    successTitle: 'Request Submitted Successfully',
    successMessage:
      'Your request has been received. Our team will review it and get back to you shortly.',
    floatingButtonLabel: 'Manage Your Data',
  };

  function injectStyles() {
    if (document.getElementById('dsar-styles')) return;

    const css = `
:root{
  --dsar-bg:#f8fafc;
  --dsar-surface:#ffffff;
  --dsar-fg:#0f172a;
  --dsar-muted:#64748b;
  --dsar-border:#e2e8f0;
  --dsar-brand:#2563eb;
  --dsar-brand-hover:#1d4ed8;
  --dsar-brand-soft:#eff6ff;
  --dsar-success:#065f46;
  --dsar-success-bg:#ecfdf5;
  --dsar-danger:#dc2626;
  --dsar-danger-bg:#fef2f2;
  --dsar-shadow:0 20px 50px rgba(2,6,23,.12);
  --dsar-shadow-soft:0 10px 25px rgba(15,23,42,.08);
  --dsar-radius-lg:20px;
  --dsar-radius-md:14px;
  --dsar-radius-sm:10px;
}

.dsar-reset,
.dsar-reset *{
  box-sizing:border-box;
}

.dsar-reset{
  font-family:'Roboto', sans-serif;
  color:var(--dsar-fg);
}

.dsar-card{
  width:100%;
  background:var(--dsar-surface);
  border:1px solid var(--dsar-border);
  border-radius:var(--dsar-radius-lg);
  box-shadow:var(--dsar-shadow);
  overflow:hidden;
}

.dsar-header{
  background:linear-gradient(135deg,#0f172a 0%, #1e3a8a 55%, #2563eb 100%);
  color:#fff;
  padding:28px 28px 22px;
}

.dsar-badge{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:8px 12px;
  border:1px solid rgba(255,255,255,.18);
  border-radius:999px;
  background:rgba(255,255,255,.08);
  font-size:12px;
  font-weight:700;
  letter-spacing:.02em;
  margin-bottom:14px;
}

.dsar-title{
  margin:0;
  font-size:28px;
  line-height:1.2;
  font-weight:800;
}

.dsar-subtitle{
  margin:10px 0 0;
  font-size:14px;
  line-height:1.6;
  color:rgba(255,255,255,.92);
  max-width:720px;
}

.dsar-body{
  padding:28px;
  background:
    radial-gradient(circle at top right, rgba(37,99,235,.06), transparent 18%),
    var(--dsar-surface);
}

.dsar-progress-wrap{
  margin-bottom:24px;
  padding:18px;
  border:1px solid var(--dsar-border);
  border-radius:16px;
  background:#f8fbff;
}

.dsar-progress-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:14px;
}

.dsar-step-label{
  font-size:13px;
  font-weight:700;
  color:var(--dsar-brand);
}

.dsar-step-title{
  font-size:14px;
  font-weight:700;
  color:var(--dsar-fg);
}

.dsar-progress-track{
  width:100%;
  height:10px;
  border-radius:999px;
  background:#dbeafe;
  overflow:hidden;
}

.dsar-progress-fill{
  height:100%;
  width:25%;
  border-radius:999px;
  background:linear-gradient(90deg, #2563eb, #60a5fa);
  transition:width .25s ease;
}

.dsar-step-dots{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:10px;
  margin-top:14px;
}

.dsar-step-dot{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
  color:var(--dsar-muted);
  font-size:12px;
  font-weight:600;
}

.dsar-step-dot-bullet{
  width:22px;
  height:22px;
  min-width:22px;
  border-radius:999px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border:1px solid var(--dsar-border);
  background:#fff;
  color:var(--dsar-muted);
  font-size:12px;
  font-weight:800;
}

.dsar-step-dot.active{
  color:var(--dsar-brand);
}

.dsar-step-dot.active .dsar-step-dot-bullet{
  border-color:var(--dsar-brand);
  background:var(--dsar-brand);
  color:#fff;
}

.dsar-step-dot.done .dsar-step-dot-bullet{
  border-color:var(--dsar-brand);
  background:var(--dsar-brand-soft);
  color:var(--dsar-brand);
}

.dsar-form{
  display:grid;
  gap:22px;
}

.dsar-grid{
  display:grid;
  grid-template-columns:1fr;
  gap:18px;
}

.dsar-grid.two-col{
  grid-template-columns:1fr;
}

.dsar-row{
  display:flex;
  flex-direction:column;
  gap:8px;
  min-width:0;
}

.dsar-row.full{
  grid-column:1/-1;
}

.dsar-label{
  font-size:14px;
  font-weight:700;
  color:var(--dsar-fg);
}

.dsar-req{
  color:var(--dsar-danger);
}

.dsar-optional{
  color:var(--dsar-muted);
  font-weight:500;
}

.dsar-input-wrap,
.dsar-textarea-wrap{
  position:relative;
}

.dsar-input-icon{
  position:absolute;
  top:50%;
  left:12px;
  transform:translateY(-50%);
  font-size:16px;
  pointer-events:none;
  opacity:.75;
}

.dsar-input,
.dsar-textarea{
  width:100%;
  border:1px solid var(--dsar-border);
  border-radius:12px;
  padding:13px 14px;
  font-size:14px;
  background:#fff;
  color:var(--dsar-fg);
  outline:none;
  transition:border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}

.dsar-input.with-icon{
  padding-left:42px;
}

.dsar-input[readonly]{
  background:#f8fafc;
  color:var(--dsar-muted);
}

.dsar-textarea{
  min-height:132px;
  resize:vertical;
}

.dsar-input:focus,
.dsar-textarea:focus{
  border-color:var(--dsar-brand);
  box-shadow:0 0 0 4px rgba(37,99,235,.12);
}

.dsar-step-panel{
  display:none;
  animation:dsarFade .2s ease;
}

.dsar-step-panel.active{
  display:block;
}

@keyframes dsarFade{
  from{opacity:.4; transform:translateY(6px);}
  to{opacity:1; transform:translateY(0);}
}

.dsar-section-head{
  margin-bottom:4px;
}

.dsar-section-title{
  margin:0 0 6px;
  font-size:18px;
  font-weight:800;
  color:var(--dsar-fg);
}

.dsar-section-text{
  margin:0;
  font-size:14px;
  line-height:1.6;
  color:var(--dsar-muted);
}

.dsar-request-grid{
  display:grid;
  grid-template-columns:1fr;
  gap:14px;
}

.dsar-request-card{
  border:1px solid var(--dsar-border);
  border-radius:16px;
  padding:16px;
  background:#fff;
  cursor:pointer;
  transition:all .18s ease;
  position:relative;
  user-select:none;
}

.dsar-request-card:hover{
  border-color:#bfdbfe;
  box-shadow:var(--dsar-shadow-soft);
  transform:translateY(-1px);
}

.dsar-request-card.active{
  border-color:var(--dsar-brand);
  background:var(--dsar-brand-soft);
  box-shadow:0 0 0 3px rgba(37,99,235,.10);
}

.dsar-request-card input{
  position:absolute;
  opacity:0;
  pointer-events:none;
}

.dsar-request-top{
  display:flex;
  align-items:flex-start;
  gap:12px;
}

.dsar-request-icon{
  width:42px;
  height:42px;
  border-radius:12px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  background:#eff6ff;
  font-size:20px;
  flex-shrink:0;
}

.dsar-request-card.active .dsar-request-icon{
  background:#dbeafe;
}

.dsar-request-title{
  font-size:15px;
  font-weight:800;
  color:var(--dsar-fg);
  margin:0 0 4px;
}

.dsar-request-desc{
  font-size:13px;
  line-height:1.55;
  color:var(--dsar-muted);
  margin:0;
}

.dsar-confirm-box{
  display:flex;
  gap:12px;
  align-items:flex-start;
  padding:16px;
  border:1px solid var(--dsar-border);
  border-radius:16px;
  background:#fff;
}

.dsar-confirm-box input{
  width:18px;
  height:18px;
  margin-top:2px;
  accent-color:var(--dsar-brand);
}

.dsar-confirm-text{
  font-size:14px;
  line-height:1.6;
  color:var(--dsar-fg);
}

.dsar-trust{
  margin-top:4px;
  display:flex;
  gap:12px;
  align-items:flex-start;
  padding:16px;
  border:1px solid #dbeafe;
  border-radius:16px;
  background:#f8fbff;
}

.dsar-trust-icon{
  width:36px;
  height:36px;
  min-width:36px;
  border-radius:10px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  background:#dbeafe;
  font-size:18px;
}

.dsar-trust-title{
  margin:0 0 4px;
  font-size:14px;
  font-weight:800;
  color:var(--dsar-fg);
}

.dsar-trust-text{
  margin:0;
  font-size:13px;
  line-height:1.6;
  color:var(--dsar-muted);
}

.dsar-help{
  font-size:13px;
  line-height:1.5;
  padding:12px 14px;
  border-radius:12px;
  border:1px solid transparent;
  display:none;
}

.dsar-help.show{
  display:block;
}

.dsar-help.success{
  color:var(--dsar-success);
  background:var(--dsar-success-bg);
  border-color:#a7f3d0;
}

.dsar-help.error{
  color:#991b1b;
  background:var(--dsar-danger-bg);
  border-color:#fecaca;
}

.dsar-nav{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  margin-top:8px;
  flex-wrap:wrap;
}

.dsar-nav-left,
.dsar-nav-right{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}

.dsar-btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  min-height:46px;
  padding:12px 18px;
  border-radius:12px;
  border:1px solid transparent;
  font-size:14px;
  font-weight:800;
  cursor:pointer;
  transition:all .18s ease;
}

.dsar-btn:disabled{
  opacity:.7;
  cursor:not-allowed;
}

.dsar-btn-primary{
  background:var(--dsar-brand);
  color:#fff;
  box-shadow:0 8px 20px rgba(37,99,235,.18);
}

.dsar-btn-primary:hover{
  background:var(--dsar-brand-hover);
}

.dsar-btn-secondary{
  background:#fff;
  color:var(--dsar-fg);
  border-color:var(--dsar-border);
}

.dsar-btn-secondary:hover{
  border-color:#cbd5e1;
  background:#f8fafc;
}

.dsar-success-screen{
  display:none;
  text-align:center;
  padding:14px 0 6px;
}

.dsar-success-screen.active{
  display:block;
}

.dsar-success-badge{
  width:72px;
  height:72px;
  margin:0 auto 16px;
  border-radius:999px;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#ecfdf5;
  border:1px solid #a7f3d0;
  font-size:34px;
}

.dsar-success-title{
  margin:0 0 10px;
  font-size:24px;
  font-weight:800;
  color:var(--dsar-fg);
}

.dsar-success-text{
  margin:0 auto;
  max-width:540px;
  font-size:14px;
  line-height:1.7;
  color:var(--dsar-muted);
}

.dsar-ovl{
  position:fixed;
  inset:0;
  background:rgba(2,6,23,.50);
  backdrop-filter:blur(6px);
  -webkit-backdrop-filter:blur(6px);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:18px;
  z-index:9999;
}

.dsar-panel{
  width:100%;
  max-width:980px;
  max-height:calc(100vh - 36px);
  overflow:auto;
  border-radius:24px;
  animation:dsarModalIn .22s ease;
}

@keyframes dsarModalIn{
  from{opacity:0; transform:translateY(10px) scale(.985);}
  to{opacity:1; transform:translateY(0) scale(1);}
}

.dsar-head{
  background:#fff;
  border:1px solid var(--dsar-border);
  border-bottom:none;
  border-radius:24px 24px 0 0;
  padding:12px 14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
}

.dsar-head-left{
  display:flex;
  align-items:center;
  gap:10px;
  font-size:13px;
  font-weight:700;
  color:var(--dsar-muted);
}

.dsar-head-dot{
  width:10px;
  height:10px;
  border-radius:999px;
  background:#22c55e;
  box-shadow:0 0 0 4px rgba(34,197,94,.14);
}

.dsar-close{
  background:#fff;
  border:1px solid var(--dsar-border);
  border-radius:12px;
  width:40px;
  height:36px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  font-size:20px;
  line-height:1;
  color:#334155;
}

.dsar-close:hover{
  background:#f8fafc;
}

.dsar-modal-body{
  background:#fff;
  border:1px solid var(--dsar-border);
  border-top:none;
  border-radius:0 0 24px 24px;
}

.dsar-floating-trigger{
  position:fixed;
  right:20px;
  bottom:20px;
  z-index:9998;
  display:inline-flex;
  align-items:center;
  gap:10px;
  border:none;
  border-radius:999px;
  padding:14px 18px;
  background:linear-gradient(135deg,#0f172a,#2563eb);
  color:#fff;
  font-size:14px;
  font-weight:800;
  cursor:pointer;
  box-shadow:0 14px 30px rgba(15,23,42,.24);
}

.dsar-floating-trigger:hover{
  transform:translateY(-1px);
}

.dsar-floating-icon{
  width:26px;
  height:26px;
  border-radius:999px;
  background:rgba(255,255,255,.16);
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-size:14px;
}

@media (min-width:640px){
  .dsar-grid.two-col{
    grid-template-columns:1fr 1fr;
  }

  .dsar-request-grid{
    grid-template-columns:1fr 1fr;
  }
}

@media (max-width:639px){
  .dsar-header{
    padding:22px 20px 18px;
  }

  .dsar-body{
    padding:20px;
  }

  .dsar-title{
    font-size:24px;
  }

  .dsar-step-dots{
    grid-template-columns:1fr 1fr;
  }

  .dsar-floating-trigger{
    right:14px;
    bottom:14px;
    padding:13px 16px;
  }
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

  function generateCMPUser() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `cmp-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  }

  function getOrCreateCMPUser() {
    let cmpUser = localStorage.getItem(CMP_USER_ID_STORAGE_KEY);
    if (!cmpUser) {
      cmpUser = generateCMPUser();
      localStorage.setItem(CMP_USER_ID_STORAGE_KEY, cmpUser);
    }
    return cmpUser;
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
      return u.origin + '/dev2';
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
      const msg =
        body?.message ||
        body?.error ||
        (Array.isArray(body?.errors) ? body.errors.join(', ') : '') ||
        `${resp.status} ${resp.statusText}`;
      throw new Error(msg);
    }

    return body;
  }

  function h(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'for') n.htmlFor = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'checked') n.checked = !!v;
      else if (k === 'value') n.value = v;
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
    placeholder = '',
    type = 'text',
    icon = '•',
    value = '',
    readOnly = false,
  }) {
    const input = h('input', {
      id,
      type,
      class: 'dsar-input with-icon',
      placeholder,
      autocomplete: 'off',
      value,
    });

    if (readOnly) {
      input.setAttribute('readonly', 'readonly');
    }

    return h('div', { class: 'dsar-row' }, [
      h('label', { for: id, class: 'dsar-label' }, [
        label,
        required ? h('span', { class: 'dsar-req' }, ' *') : null,
        optional ? h('span', { class: 'dsar-optional' }, ' (Optional)') : null,
      ]),
      h('div', { class: 'dsar-input-wrap' }, [
        h('span', { class: 'dsar-input-icon', text: icon }),
        input,
      ]),
    ]);
  }

  function createRequestCard({ value, title, desc, icon }) {
    const input = h('input', {
      type: 'checkbox',
      name: 'requestTypes',
      value,
    });

    const card = h('label', { class: 'dsar-request-card' }, [
      input,
      h('div', { class: 'dsar-request-top' }, [
        h('div', { class: 'dsar-request-icon', text: icon }),
        h('div', {}, [
          h('div', { class: 'dsar-request-title', text: title }),
          h('p', { class: 'dsar-request-desc', text: desc }),
        ]),
      ]),
    ]);

    function sync() {
      if (input.checked) card.classList.add('active');
      else card.classList.remove('active');
    }

    card.addEventListener('click', function () {
      setTimeout(sync, 0);
    });

    input.addEventListener('change', sync);

    return card;
  }

  function collectValues(formEl, config) {
    const requestTypes = Array.from(
      formEl.querySelectorAll('input[name="requestTypes"]:checked')
    ).map((el) => el.value);

    const values = {
      fullName: formEl.querySelector('#dsar_fullName')?.value?.trim() || '',
      email: formEl.querySelector('#dsar_email')?.value?.trim() || '',
      country: formEl.querySelector('#dsar_country')?.value?.trim() || '',
      requestTypes,
      notes: formEl.querySelector('#dsar_notes')?.value?.trim() || '',
      cmpUser:
        formEl.querySelector('#dsar_cmpUser')?.value?.trim() ||
        getOrCreateCMPUser(),
      domainName:
        formEl.querySelector('#dsar_domainName')?.value?.trim() ||
        config.domain ||
        '',
      confirmAuth: !!formEl.querySelector('#dsar_confirmAuth')?.checked,
    };

    return values;
  }

  function validateStep(step, values) {
    const errors = [];

    if (step === 1) {
      if (!values.fullName) errors.push('Full Name');
      if (!values.email) errors.push('Email Address');
      if (!values.country) errors.push('Country');

      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        errors.push('Valid Email Address');
      }
    }

    if (step === 2) {
      if (!values.requestTypes.length) errors.push('Request Type');
    }

    if (step === 4) {
      if (!values.confirmAuth) errors.push('Confirmation');
    }

    return errors;
  }

  function buildProgress() {
    const wrap = h('div', { class: 'dsar-progress-wrap' });
    const top = h('div', { class: 'dsar-progress-top' }, [
      h('div', { class: 'dsar-step-label', text: 'Step 1 of 4' }),
      h('div', { class: 'dsar-step-title', text: 'Identity Details' }),
    ]);

    const track = h('div', { class: 'dsar-progress-track' }, [
      h('div', { class: 'dsar-progress-fill' }),
    ]);

    const dots = h('div', { class: 'dsar-step-dots' }, [
      h('div', { class: 'dsar-step-dot active', 'data-step-dot': '1' }, [
        h('span', { class: 'dsar-step-dot-bullet', text: '1' }),
        h('span', { text: 'Identity' }),
      ]),
      h('div', { class: 'dsar-step-dot', 'data-step-dot': '2' }, [
        h('span', { class: 'dsar-step-dot-bullet', text: '2' }),
        h('span', { text: 'Request Type' }),
      ]),
      h('div', { class: 'dsar-step-dot', 'data-step-dot': '3' }, [
        h('span', { class: 'dsar-step-dot-bullet', text: '3' }),
        h('span', { text: 'Additional Info' }),
      ]),
      h('div', { class: 'dsar-step-dot', 'data-step-dot': '4' }, [
        h('span', { class: 'dsar-step-dot-bullet', text: '4' }),
        h('span', { text: 'Confirm' }),
      ]),
    ]);

    wrap.append(top, track, dots);
    return wrap;
  }

  function resetFormState(form, config) {
    const fieldIds = [
      'dsar_fullName',
      'dsar_email',
      'dsar_country',
      'dsar_notes',
    ];

    fieldIds.forEach((id) => {
      const el = form.querySelector(`#${id}`);
      if (el) el.value = '';
    });

    const cmpUserInput = form.querySelector('#dsar_cmpUser');
    if (cmpUserInput) {
      cmpUserInput.value = getOrCreateCMPUser();
    }

    const domainInput = form.querySelector('#dsar_domainName');
    if (domainInput) {
      domainInput.value = config.domain || '';
    }

    const confirm = form.querySelector('#dsar_confirmAuth');
    if (confirm) confirm.checked = false;

    form.querySelectorAll('input[name="requestTypes"]').forEach((el) => {
      el.checked = false;
    });

    form.querySelectorAll('.dsar-request-card').forEach((card) => {
      card.classList.remove('active');
    });
  }

  function buildDsarCard(config) {
    const card = h('div', { class: 'dsar-card' });

    const header = h('div', { class: 'dsar-header' }, [
      h('div', { class: 'dsar-badge' }, ['🔐', ' Privacy Rights Request']),
      h('h2', { class: 'dsar-title', text: config.title }),
      h('p', { class: 'dsar-subtitle', text: config.subtitle }),
    ]);

    const body = h('div', { class: 'dsar-body' });
    const progress = buildProgress();
    const form = h('form', { class: 'dsar-form' });

    const help = h('div', { class: 'dsar-help', 'aria-live': 'polite' });

    const successScreen = h('div', { class: 'dsar-success-screen' }, [
      h('div', { class: 'dsar-success-badge', text: '✅' }),
      h('h3', { class: 'dsar-success-title', text: config.successTitle }),
      h('p', { class: 'dsar-success-text', text: config.successMessage }),
    ]);

    const step1 = h('div', { class: 'dsar-step-panel active', 'data-step': '1' }, [
      h('div', { class: 'dsar-section-head' }, [
        h('h3', { class: 'dsar-section-title', text: 'Tell us who you are' }),
        h('p', {
          class: 'dsar-section-text',
          text: 'Please share the basic details we need to verify and process your request.',
        }),
      ]),
      h('div', { class: 'dsar-grid two-col' }, [
        makeInputRow({
          id: 'dsar_fullName',
          label: 'Full Name',
          required: true,
          placeholder: 'Enter your full name',
          icon: '👤',
        }),
        makeInputRow({
          id: 'dsar_email',
          label: 'Email Address',
          required: true,
          type: 'email',
          placeholder: 'you@example.com',
          icon: '📧',
        }),
        makeInputRow({
          id: 'dsar_country',
          label: 'Country',
          required: true,
          placeholder: 'Enter your country',
          icon: '🌍',
        }),
      ]),
    ]);

    const step2 = h('div', { class: 'dsar-step-panel', 'data-step': '2' }, [
      h('div', { class: 'dsar-section-head' }, [
        h('h3', { class: 'dsar-section-title', text: 'Select your request type' }),
        h('p', {
          class: 'dsar-section-text',
          text: 'Choose one or more options so we can understand how you want us to handle your data.',
        }),
      ]),
      h('div', { class: 'dsar-request-grid' }, [
        createRequestCard({
          value: 'Access My Data',
          title: 'Access My Data',
          desc: 'Request a copy of the personal data we hold about you.',
          icon: '📄',
        }),
        createRequestCard({
          value: 'Delete My Data',
          title: 'Delete My Data',
          desc: 'Ask us to erase your personal data, where applicable.',
          icon: '🗑️',
        }),
        createRequestCard({
          value: 'Correct My Data',
          title: 'Correct My Data',
          desc: 'Update inaccurate or incomplete personal information.',
          icon: '✏️',
        }),
        createRequestCard({
          value: 'Restrict Processing',
          title: 'Restrict Processing',
          desc: 'Limit how your personal data is processed in certain cases.',
          icon: '⛔',
        }),
        createRequestCard({
          value: 'Opt-Out of Marketing',
          title: 'Opt-Out of Marketing',
          desc: 'Stop receiving marketing communication from us.',
          icon: '📩',
        }),
      ]),
    ]);

    const step3 = h('div', { class: 'dsar-step-panel', 'data-step': '3' }, [
      h('div', { class: 'dsar-section-head' }, [
        h('h3', { class: 'dsar-section-title', text: 'Add supporting details' }),
        h('p', {
          class: 'dsar-section-text',
          text: 'This information helps us identify the relevant records faster.',
        }),
      ]),
      h('div', { class: 'dsar-row full' }, [
        h('label', { for: 'dsar_notes', class: 'dsar-label' }, [
          'Additional Information',
          h('span', { class: 'dsar-optional' }, ' (Optional)'),
        ]),
        h('div', { class: 'dsar-textarea-wrap' }, [
          h('textarea', {
            id: 'dsar_notes',
            class: 'dsar-textarea',
            rows: '6',
            placeholder:
              'Provide any details that may help us identify your records or process this request more accurately.',
          }),
        ]),
      ]),
      h('div', { class: 'dsar-grid two-col' }, [
        makeInputRow({
          id: 'dsar_cmpUser',
          label: 'CMP User ID',
          optional: true,
          placeholder: 'Auto-generated CMP user ID',
          icon: '🆔',
          value: getOrCreateCMPUser(),
          readOnly: true,
        }),
        makeInputRow({
          id: 'dsar_domainName',
          label: 'Domain Name',
          optional: true,
          placeholder: 'e.g. clientdomain.com',
          icon: '🌐',
          value: config.domain || '',
        }),
      ]),
    ]);

    const step4 = h('div', { class: 'dsar-step-panel', 'data-step': '4' }, [
      h('div', { class: 'dsar-section-head' }, [
        h('h3', { class: 'dsar-section-title', text: 'Confirm and submit' }),
        h('p', {
          class: 'dsar-section-text',
          text: 'Please confirm that you are authorized to make this request before submitting.',
        }),
      ]),
      h('div', { class: 'dsar-confirm-box' }, [
        h('input', { id: 'dsar_confirmAuth', type: 'checkbox' }),
        h('div', { class: 'dsar-confirm-text' }, [
          'I confirm that I am the data subject or an authorized agent submitting this request.',
        ]),
      ]),
      h('div', { class: 'dsar-trust' }, [
        h('div', { class: 'dsar-trust-icon', text: '🔒' }),
        h('div', {}, [
          h('h4', { class: 'dsar-trust-title', text: 'Your privacy matters' }),
          h('p', {
            class: 'dsar-trust-text',
            text: 'Your information is securely processed and used only for handling this request in accordance with applicable privacy laws.',
          }),
        ]),
      ]),
    ]);

    const prevBtn = h('button', {
      type: 'button',
      class: 'dsar-btn dsar-btn-secondary',
      text: '← Back',
    });

    const nextBtn = h('button', {
      type: 'button',
      class: 'dsar-btn dsar-btn-primary',
      text: 'Continue →',
    });

    const submitBtn = h('button', {
      type: 'button',
      class: 'dsar-btn dsar-btn-primary',
      text: config.submitLabel,
      style: 'display:none;',
    });

    const nav = h('div', { class: 'dsar-nav' }, [
      h('div', { class: 'dsar-nav-left' }, [prevBtn]),
      h('div', { class: 'dsar-nav-right' }, [nextBtn, submitBtn]),
    ]);

    form.append(step1, step2, step3, step4, help, nav, successScreen);
    body.append(progress, form);
    card.append(header, body);

    const domainInput = form.querySelector('#dsar_domainName');
    if (domainInput && !domainInput.value) {
      domainInput.value = config.domain || '';
    }

    const cmpUserInput = form.querySelector('#dsar_cmpUser');
    if (cmpUserInput && !cmpUserInput.value) {
      cmpUserInput.value = getOrCreateCMPUser();
    }

    let currentStep = 1;

    const stepMeta = {
      1: 'Identity Details',
      2: 'Request Type',
      3: 'Additional Information',
      4: 'Confirmation',
    };

    function showHelp(type, text) {
      help.className = `dsar-help show ${type}`;
      help.textContent = text;
    }

    function clearHelp() {
      help.className = 'dsar-help';
      help.textContent = '';
    }

    function updateStepUi() {
      form.querySelectorAll('.dsar-step-panel').forEach((panel) => {
        panel.classList.toggle(
          'active',
          Number(panel.getAttribute('data-step')) === currentStep
        );
      });

      const fill = progress.querySelector('.dsar-progress-fill');
      const stepLabel = progress.querySelector('.dsar-step-label');
      const stepTitle = progress.querySelector('.dsar-step-title');

      fill.style.width = `${(currentStep / 4) * 100}%`;
      stepLabel.textContent = `Step ${currentStep} of 4`;
      stepTitle.textContent = stepMeta[currentStep];

      progress.querySelectorAll('[data-step-dot]').forEach((dot) => {
        const dotStep = Number(dot.getAttribute('data-step-dot'));
        dot.classList.remove('active', 'done');

        if (dotStep === currentStep) dot.classList.add('active');
        if (dotStep < currentStep) dot.classList.add('done');
      });

      prevBtn.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
      nextBtn.style.display = currentStep === 4 ? 'none' : 'inline-flex';
      submitBtn.style.display = currentStep === 4 ? 'inline-flex' : 'none';

      clearHelp();
    }

    prevBtn.addEventListener('click', function () {
      if (currentStep > 1) {
        currentStep -= 1;
        updateStepUi();
      }
    });

    nextBtn.addEventListener('click', function () {
      const values = collectValues(form, config);
      const errors = validateStep(currentStep, values);

      if (errors.length) {
        showHelp('error', `Please complete: ${errors.join(', ')}`);
        return;
      }

      if (currentStep < 4) {
        currentStep += 1;
        updateStepUi();
      }
    });

    submitBtn.addEventListener('click', async function () {
      clearHelp();

      const values = collectValues(form, config);
      const errors = validateStep(4, values);

      if (errors.length) {
        showHelp('error', `Please complete: ${errors.join(', ')}`);
        return;
      }

      submitBtn.disabled = true;
      prevBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        const res = await postSubmission(values);
        clearHelp();

        form.querySelectorAll('.dsar-step-panel').forEach((panel) => {
          panel.style.display = 'none';
        });

        progress.style.display = 'none';
        nav.style.display = 'none';

        successScreen.classList.add('active');
        const successText = successScreen.querySelector('.dsar-success-text');
        successText.textContent =
          res?.message || config.successMessage;

        resetFormState(form, config);
      } catch (err) {
        showHelp('error', `Submit failed: ${err?.message || err}`);
      } finally {
        submitBtn.disabled = false;
        prevBtn.disabled = false;
        submitBtn.textContent = config.submitLabel;
      }
    });

    updateStepUi();
    return card;
  }

  function openModalWith(card, config) {
    const ovl = h('div', { class: 'dsar-ovl' });
    const panel = h('div', { class: 'dsar-panel' });

    const head = h('div', { class: 'dsar-head' }, [
      h('div', { class: 'dsar-head-left' }, [
        h('span', { class: 'dsar-head-dot' }),
        h('span', { text: 'Secure privacy request form' }),
      ]),
      h('button', {
        type: 'button',
        class: 'dsar-close',
        'data-close': '1',
        'aria-label': 'Close',
      }, '×'),
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

  function mountInline(config) {
    const host = document.getElementById(DSAR_CONTAINER_ID);
    if (!host) return;
    injectStyles();
    host.innerHTML = '';
    host.appendChild(buildDsarCard(config));
  }

  function ensureTriggerExists(config) {
    let el = document.getElementById(DSAR_CONTAINER_ID);
    if (el) return el;

    injectStyles();

    el = document.createElement('button');
    el.id = DSAR_CONTAINER_ID;
    el.type = 'button';
    el.className = 'dsar-floating-trigger';
    el.innerHTML = `
      <span class="dsar-floating-icon">🔐</span>
      <span>${config.floatingButtonLabel}</span>
    `;
    document.body.appendChild(el);

    return el;
  }

  function bindModal(config) {
    const attach = (el) => {
      if (!el || el.__dsarBound) return;

      el.addEventListener('click', function (e) {
        e.preventDefault();
        injectStyles();
        openModalWith(buildDsarCard(config), config);
      });

      el.__dsarBound = true;
    };

    const el = document.getElementById(DSAR_CONTAINER_ID);
    if (el) attach(el);
  }

  async function initDsarRuntime() {
    try {
      const domain = getDomain();
      if (!domain) {
        console.warn('[dsar-runtime] Could not resolve domain.');
        return;
      }

      const cfg = {
        ...DEFAULT_CONFIG,
        domain,
      };

      if (cfg.showModal) {
        ensureTriggerExists(cfg);
        bindModal(cfg);
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
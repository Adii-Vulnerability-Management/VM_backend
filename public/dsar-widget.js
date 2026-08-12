(function () {
  console.log('[dsar-dashboard] DSAR Dashboard Script Initialized');

  const DSAR_CONTAINER_ID = 'dsar-widget1';
  const DSAR_SLA_DAYS = 30;
  const BASE_URL = 'https://dev.grc3.io/dev2';

  let requests = [];
  let filteredRequests = [];
  let currentUser = null;
  let loading = true;
  let error = '';
  let selectedRequest = null;
  let searchTerm = '';
  let statusFilter = 'All';

  const DEFAULT_CONFIG = {
    title: 'DSAR',
    subtitle:
      'Submit and track requests to access, delete, correct, or manage your personal data.',
    floatingButtonLabel: 'Privacy Request',
  };

  function getContainer() {
    return document.getElementById(DSAR_CONTAINER_ID);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getUser() {
    try {
      const raw = localStorage.getItem('cmp_user');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error('Failed to parse cmp_user from localStorage:', err);
      return null;
    }
  }

  function getRequestType(req) {
    const raw =
      req?.type ||
      req?.requestType ||
      req?.request_type ||
      req?.requestCategory ||
      req?.dsarType ||
      req?.privacyRight ||
      req?.requestName ||
      req?.category ||
      req?.request_kind ||
      req?.requestTypes;

    if (Array.isArray(raw)) {
      return raw.filter(Boolean).join(', ');
    }

    return raw || null;
  }

  function computeDueDate(req) {
    if (req?.dueDate) return req.dueDate;
    if (!req?.createdAt) return null;

    const created = new Date(req.createdAt);
    if (Number.isNaN(created.getTime())) return null;

    created.setDate(created.getDate() + DSAR_SLA_DAYS);
    return created.toISOString();
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getDueInfo(dueDateStr, status) {
    if (!dueDateStr) {
      return {
        label: 'No due date',
        days: null,
        className: 'dsar-badge dsar-badge-muted',
      };
    }

    const dueDate = new Date(dueDateStr);
    if (Number.isNaN(dueDate.getTime())) {
      return {
        label: 'Invalid due date',
        days: null,
        className: 'dsar-badge dsar-badge-muted',
      };
    }

    const closedStatuses = ['Completed', 'Rejected', 'Canceled', 'Cancelled'];
    if (closedStatuses.includes(status)) {
      return {
        label: 'Closed',
        days: 99999,
        className: 'dsar-badge dsar-badge-neutral',
      };
    }

    const today = new Date();
    dueDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return {
        label: 'Due today',
        days: 0,
        className: 'dsar-badge dsar-badge-warning',
      };
    }

    if (diffDays > 0) {
      return {
        label: `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
        days: diffDays,
        className: 'dsar-badge dsar-badge-info',
      };
    }

    return {
      label: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`,
      days: diffDays,
      className: 'dsar-badge dsar-badge-danger',
    };
  }

  function getStatusClass(status) {
    const normalized = String(status || '').toLowerCase();

    if (['completed'].includes(normalized))
      return 'dsar-badge dsar-badge-success';
    if (['rejected', 'cancelled', 'canceled'].includes(normalized))
      return 'dsar-badge dsar-badge-neutral';
    if (['in progress', 'under review', 'processing'].includes(normalized))
      return 'dsar-badge dsar-badge-info';
    if (['new', 'open', 'pending'].includes(normalized))
      return 'dsar-badge dsar-badge-warning';

    return 'dsar-badge dsar-badge-muted';
  }

  function renderAssignee(assignTo) {
    if (!assignTo) return '<span class="dsar-text-muted">Unassigned</span>';
    return `<span>${escapeHtml(assignTo.name || assignTo.email || assignTo)}</span>`;
  }

  function setError(message) {
    error = message;
    loading = false;
    renderDashboard();
  }

  function injectStyles() {
    const existingStyles = document.getElementById('dsar-dashboard-styles');
    if (existingStyles) existingStyles.remove();

    const style = document.createElement('style');
    style.id = 'dsar-dashboard-styles';
    style.textContent = `
      #${DSAR_CONTAINER_ID} {
        font-family: 'Roboto', sans-serif;
        color: #0f172a;
        width: 100%;
        max-width: 100%;
      }

      #${DSAR_CONTAINER_ID} * {
        box-sizing: border-box;
      }

      .dsar-shell {
        width: 100%;
        max-width: 100%;
        background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        padding: 24px;
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.06);
        overflow: hidden;
      }
#${DSAR_CONTAINER_ID} .dsar-header {
  display: flex;
  align-items: flex-start;
  margin-bottom: 20px;
  background: #2B245C !important;
  border-radius: 18px;
  padding: 22px 430px 22px 20px;
  position: relative;
  overflow: hidden;
  min-height: 134px;
}
#${DSAR_CONTAINER_ID} .dsar-header > div:first-child {
  min-width: 0;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

#${DSAR_CONTAINER_ID} .dsar-header h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
  color: #ffffff !important;
  text-decoration: none !important;
  word-break: break-word;
  display: block;
  width: fit-content;
  max-width: 100%;
  transition: transform 0.22s ease, color 0.22s ease, text-shadow 0.22s ease;
  cursor: default;
}

#${DSAR_CONTAINER_ID} .dsar-header h1:hover {
  transform: translateY(-2px);
  color: #f1effb !important;
  text-shadow: 0 8px 20px rgba(255, 255, 255, 0.28);
}

#${DSAR_CONTAINER_ID} .dsar-header p {
  margin: 0;
  color: rgba(255, 255, 255, 0.88) !important;
  max-width: 760px;
  word-break: break-word;
  display: block;
  width: fit-content;
  transition: transform 0.22s ease, color 0.22s ease, text-shadow 0.22s ease;
  cursor: default;
}

#${DSAR_CONTAINER_ID} .dsar-header p:hover {
  transform: translateY(-2px);
  color: #ffffff !important;
  text-shadow: 0 8px 18px rgba(255, 255, 255, 0.25);
}
#${DSAR_CONTAINER_ID} .dsar-user-pill {
  position: absolute;
  top: 22px;
  right: 22px;
  z-index: 5;

  background: rgba(255, 255, 255, 0.95);
  color: #2B245C;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;

  max-width: 370px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  transition: transform 0.22s ease, box-shadow 0.22s ease, background-color 0.22s ease, color 0.22s ease, border-color 0.22s ease;
  cursor: pointer;
}

#${DSAR_CONTAINER_ID} .dsar-user-pill:hover {
  transform: translateY(-2px);
  background: #ffffff;
  color: #211b4a;
  border-color: rgba(255, 255, 255, 0.95);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.22);
}
      .dsar-alert {
        padding: 14px 16px;
        border-radius: 14px;
        margin-bottom: 16px;
        font-size: 14px;
      }

      .dsar-alert-error {
        background: #fef2f2;
        color: #b91c1c;
        border: 1px solid #fecaca;
      }

      .dsar-input,
      .dsar-select {
        height: 42px;
        min-height: 42px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        border-radius: 12px;
        padding: 0 14px;
        font-size: 14px;
        color: #0f172a;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        width: 100%;
        min-width: 0;
      }

      .dsar-input:focus,
      .dsar-select:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
      }

      .dsar-button {
        height: 42px;
        min-height: 42px;
        border: 0;
        border-radius: 12px;
        padding: 0 16px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        max-width: 100%;
      }

      .dsar-button:hover {
        transform: translateY(-1px);
      }

      .dsar-button-secondary {
        background: #e2e8f0;
        color: #0f172a;
      }

      .dsar-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 20px;
        width: 100%;
      }

      .dsar-stat-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 100px;
        min-width: 0;
      }

      .dsar-stat-label {
        display: block;
        font-size: 13px;
        color: #64748b;
        margin-bottom: 10px;
      }

      .dsar-stat-value {
        font-size: 28px;
        line-height: 1;
        font-weight: 700;
      }
      #${DSAR_CONTAINER_ID} .dsar-panel {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        display: block !important;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        overflow: hidden;
        position: relative;
      }

      #${DSAR_CONTAINER_ID} .dsar-shell > .dsar-panel,
      #${DSAR_CONTAINER_ID} .dsar-shell section.dsar-panel {
        width: 100% !important;
        max-width: 100% !important;
      }

      .dsar-panel-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 18px 18px 8px;
        flex-wrap: wrap;
      }

      .dsar-panel-head h2 {
        margin: 0;
        font-size: 18px;
      }

      .dsar-panel-head p {
        margin: 4px 0 0;
        color: #64748b;
        font-size: 14px;
      }

        #${DSAR_CONTAINER_ID} .dsar-panel-body {
        padding: 0 18px 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }

      .dsar-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
        gap: 16px;
        width: 100%;
      }

      .dsar-toolbar-left {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 180px;
        gap: 12px;
        min-width: 0;
        align-items: end;
      }

      .dsar-toolbar-right {
        display: flex;
        align-items: end;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
      }

      #${DSAR_CONTAINER_ID} .dsar-table-wrap {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        border-radius: 14px;
      }
         #${DSAR_CONTAINER_ID} .dsar-table {
        width: 100% !important;
        min-width: 820px;
        border-collapse: collapse;
      }

      .dsar-table th,
      .dsar-table td {
        padding: 14px 16px;
        text-align: left;
        border-top: 1px solid #f1f5f9;
        vertical-align: middle;
        font-size: 14px;
      }

      .dsar-table th {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #64748b;
        background: #f8fafc;
        border-top: 0;
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .dsar-table tr:hover td {
        background: #f8fbff;
      }

      .dsar-table td:last-child {
        text-align: right;
      }

      .dsar-id {
        font-weight: 700;
        color: #0f172a;
        word-break: break-word;
      }

      .dsar-text-muted {
        color: #94a3b8;
      }

      .dsar-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        white-space: nowrap;
        vertical-align: middle;
      }

      .dsar-badge-success { background: #dcfce7; color: #166534; }
      .dsar-badge-info { background: #dbeafe; color: #1d4ed8; }
      .dsar-badge-warning { background: #fef3c7; color: #92400e; }
      .dsar-badge-danger { background: #fee2e2; color: #b91c1c; }
      .dsar-badge-neutral { background: #e2e8f0; color: #334155; }
      .dsar-badge-muted { background: #f1f5f9; color: #64748b; }

      .dsar-empty,
      .dsar-loading {
        padding: 36px 18px;
        text-align: center;
        color: #64748b;
      }

      .dsar-modal {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.58);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 99999;
      }

      .dsar-modal-card {
        width: 100%;
        max-width: 720px;
        max-height: calc(100vh - 48px);
        overflow: auto;
        margin: auto;
        background: #ffffff;
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.28);
      }

      .dsar-modal-head,
      .dsar-modal-body,
      .dsar-modal-foot {
        padding: 20px 22px;
      }

      .dsar-modal-head {
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }

      .dsar-modal-head h3 {
        margin: 0 0 4px;
        font-size: 22px;
      }

      .dsar-modal-head p {
        margin: 0;
        color: #64748b;
      }

      .dsar-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .dsar-detail-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 14px;
        min-width: 0;
      }

      .dsar-detail-card span {
        display: block;
        color: #64748b;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 8px;
      }

      .dsar-detail-card strong,
      .dsar-detail-card div {
        font-size: 14px;
        color: #0f172a;
        word-break: break-word;
      }

      .dsar-modal-foot {
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      @media (max-width: 1199px) {
        .dsar-stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .dsar-toolbar {
          grid-template-columns: 1fr;
          align-items: stretch;
        }

        .dsar-toolbar-left {
          grid-template-columns: minmax(0, 1fr) 180px;
        }

        .dsar-toolbar-right {
          justify-content: flex-start;
        }
      }

 @media (max-width: 767px) {
  .dsar-shell {
    padding: 18px;
    border-radius: 18px;
  }

  #${DSAR_CONTAINER_ID} .dsar-header {
    padding: 18px 16px;
    min-height: auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  #${DSAR_CONTAINER_ID} .dsar-header h1 {
    font-size: 24px;
  }

  #${DSAR_CONTAINER_ID} .dsar-user-pill {
    position: static;
    margin-top: 12px;
    max-width: 100%;
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
    align-self: flex-start;
  }

  .dsar-stats {
    grid-template-columns: 1fr;
  }

  .dsar-panel-head {
    padding: 16px 16px 8px;
  }

  .dsar-panel-body {
    padding: 0 16px 16px;
  }

  .dsar-toolbar-left {
    grid-template-columns: 1fr;
  }

  .dsar-toolbar-right {
    width: 100%;
    display: flex;
    justify-content: flex-start;
  }

  .dsar-table {
    min-width: 760px;
  }

  .dsar-detail-grid {
    grid-template-columns: 1fr;
  }

  .dsar-modal {
    padding: 16px;
  }

  .dsar-modal-card {
    max-height: calc(100vh - 32px);
  }

  .dsar-modal-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .dsar-modal-foot {
    flex-direction: column;
  }

  .dsar-modal-foot .dsar-button {
    width: 100%;
  }
}

@media (max-width: 479px) {
  .dsar-shell {
    padding: 14px;
    border-radius: 16px;
  }

  #${DSAR_CONTAINER_ID} .dsar-header {
    padding: 16px 14px;
    border-radius: 16px;
  }

  #${DSAR_CONTAINER_ID} .dsar-header h1 {
    font-size: 21px;
  }

  #${DSAR_CONTAINER_ID} .dsar-header p {
    font-size: 14px;
  }

  #${DSAR_CONTAINER_ID} .dsar-user-pill {
    width: 100%;
    border-radius: 14px;
    padding: 10px 12px;
  }

  .dsar-stat-card {
    padding: 16px;
    min-height: 88px;
  }

  .dsar-stat-value {
    font-size: 24px;
  }

  .dsar-panel-head {
    padding: 14px 14px 8px;
  }

  .dsar-panel-body {
    padding: 0 14px 14px;
  }

  .dsar-toolbar {
    gap: 12px;
  }

  .dsar-toolbar-right {
    width: 100%;
  }

  .dsar-toolbar-right .dsar-button {
    width: 100%;
  }

  .dsar-input,
  .dsar-select,
  .dsar-button {
    height: 44px;
  }

  .dsar-table {
    min-width: 680px;
  }

  .dsar-table th,
  .dsar-table td {
    padding: 12px 14px;
    font-size: 13px;
  }

  .dsar-badge {
    font-size: 11px;
    padding: 6px 8px;
  }

  .dsar-modal-head,
  .dsar-modal-body,
  .dsar-modal-foot {
    padding: 16px;
  }

  .dsar-modal-head h3 {
    font-size: 20px;
  }
}
    `;

    document.head.appendChild(style);
  }

  async function fetchDSARs() {
    loading = true;
    error = '';
    renderDashboard();

    try {
      currentUser = getUser();
      if (!currentUser || !currentUser.userId) {
        throw new Error('User not found. Please sign in again.');
      }

      const response = await fetch(
        `${BASE_URL}/dsar?cmpUserId=${encodeURIComponent(currentUser.userId)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch DSAR requests (${response.status})`);
      }

      const data = await response.json();
      requests = Array.isArray(data)
        ? data
            .filter((req) => req.cmpUserId === currentUser.userId)
            .map((req) => ({
              ...req,
              dueDate: computeDueDate(req),
            }))
        : [];

      applyFilters();
    } catch (err) {
      console.error('Error fetching DSARs:', err);
      requests = [];
      filteredRequests = [];
      setError(err.message || 'Failed to fetch DSAR requests.');
      return;
    }

    loading = false;
    renderDashboard();
  }

  function applyFilters() {
    const term = searchTerm.trim().toLowerCase();

    filteredRequests = requests.filter((req) => {
      const matchesStatus =
        statusFilter === 'All' || String(req.status || '') === statusFilter;
      const matchesSearch =
        !term ||
        [
          req.requestID,
          req.status,
          getRequestType(req),
          req.assignTo?.name,
          req.assignTo?.email,
          req.assignTo,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));

      return matchesStatus && matchesSearch;
    });
  }

  function getStatusOptions() {
    const uniqueStatuses = [
      ...new Set(requests.map((req) => req.status).filter(Boolean)),
    ];
    return ['All', ...uniqueStatuses];
  }

  function getSummaryStats() {
    const openStatuses = [
      'new',
      'open',
      'pending',
      'in progress',
      'under review',
      'processing',
    ];

    const total = requests.length;
    const open = requests.filter((req) =>
      openStatuses.includes(String(req.status || '').toLowerCase()),
    ).length;
    const completed = requests.filter(
      (req) => String(req.status || '').toLowerCase() === 'completed',
    ).length;
    const overdue = requests.filter((req) => {
      const dueInfo = getDueInfo(req.dueDate, req.status);
      return typeof dueInfo.days === 'number' && dueInfo.days < 0;
    }).length;

    return { total, open, completed, overdue };
  }

  function renderStats() {
    const stats = getSummaryStats();

    return `
      <section class="dsar-stats" aria-label="Request summary">
        <div class="dsar-stat-card">
          <span class="dsar-stat-label">Total requests</span>
          <strong class="dsar-stat-value">${stats.total}</strong>
        </div>
        <div class="dsar-stat-card">
          <span class="dsar-stat-label">Open requests</span>
          <strong class="dsar-stat-value">${stats.open}</strong>
        </div>
        <div class="dsar-stat-card">
          <span class="dsar-stat-label">Completed</span>
          <strong class="dsar-stat-value">${stats.completed}</strong>
        </div>
        <div class="dsar-stat-card">
          <span class="dsar-stat-label">Overdue</span>
          <strong class="dsar-stat-value">${stats.overdue}</strong>
        </div>
      </section>
    `;
  }

  function renderToolbar() {
    const statusOptions = getStatusOptions()
      .map(
        (status) =>
          `<option value="${escapeHtml(status)}" ${status === statusFilter ? 'selected' : ''}>${escapeHtml(status)}</option>`,
      )
      .join('');

    return `
      <div class="dsar-toolbar">
        <div class="dsar-toolbar-left">
          <input
            id="dsar-search"
            class="dsar-input"
            type="search"
            placeholder="Search by request ID, status, type, or assignee"
            value="${escapeHtml(searchTerm)}"
            aria-label="Search requests"
          />
          <select id="dsar-status-filter" class="dsar-select" aria-label="Filter by status">
            ${statusOptions}
          </select>
        </div>

        <div class="dsar-toolbar-right">
          <button id="dsar-refresh" class="dsar-button dsar-button-secondary" type="button">Refresh</button>
        </div>
      </div>
    `;
  }

  function renderRequestTable() {
    if (loading) {
      return '<div class="dsar-loading">Loading your privacy requests...</div>';
    }

    if (!requests.length) {
      return `
        <div class="dsar-empty">
          <strong>No requests found.</strong><br />
          Your submitted privacy requests will appear here once available.
        </div>
      `;
    }

    if (!filteredRequests.length) {
      return `
        <div class="dsar-empty">
          <strong>No matching requests.</strong><br />
          Try adjusting the search term or status filter.
        </div>
      `;
    }

    const rows = filteredRequests
      .map((req) => {
        const dueInfo = getDueInfo(req.dueDate, req.status);
        return `
        <tr>
          <td><span class="dsar-id">${escapeHtml(req.requestID || '-')}</span></td>
          <td><span class="${getStatusClass(req.status)}">${escapeHtml(req.status || 'Unknown')}</span></td>
          <td>${formatDate(req.createdAt)}</td>
          <td><span class="${dueInfo.className}">${escapeHtml(dueInfo.label)}</span></td>
          <td>${renderAssignee(req.assignTo)}</td>
          <td>
            <button class="dsar-button dsar-button-secondary dsar-view-button" type="button" data-request-id="${escapeHtml(req.requestID || '')}">
              View details
            </button>
          </td>
        </tr>
      `;
      })
      .join('');

    return `
      <div class="dsar-table-wrap">
        <table class="dsar-table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Due</th>
              <th>Assignee</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderModal() {
    const existingModal = document.getElementById('dsar-modal-root');
    if (existingModal) existingModal.remove();

    if (!selectedRequest) return;

    const dueInfo = getDueInfo(selectedRequest.dueDate, selectedRequest.status);
    const modal = document.createElement('div');
    modal.id = 'dsar-modal-root';
    modal.innerHTML = `
      <div class="dsar-modal" role="dialog" aria-modal="true" aria-labelledby="dsar-modal-title">
        <div class="dsar-modal-card">
          <div class="dsar-modal-head">
            <div>
              <h3 id="dsar-modal-title">Request ${escapeHtml(selectedRequest.requestID || '')}</h3>
              <p>Privacy request details and timeline</p>
            </div>
            <button id="dsar-modal-close-top" class="dsar-button dsar-button-secondary" type="button" aria-label="Close details modal">Close</button>
          </div>
          <div class="dsar-modal-body">
            <div class="dsar-detail-grid">
              <div class="dsar-detail-card">
                <span>Status</span>
                <div><span class="${getStatusClass(selectedRequest.status)}">${escapeHtml(selectedRequest.status || 'Unknown')}</span></div>
              </div>
              <div class="dsar-detail-card">
                <span>Due</span>
                <div><span class="${dueInfo.className}">${escapeHtml(dueInfo.label)}</span></div>
              </div>
              <div class="dsar-detail-card">
                <span>Submitted</span>
                <strong>${formatDate(selectedRequest.createdAt)}</strong>
              </div>
              <div class="dsar-detail-card">
                <span>Due date</span>
                <strong>${formatDate(selectedRequest.dueDate)}</strong>
              </div>
              <div class="dsar-detail-card">
                <span>Assignee</span>
                <strong>${escapeHtml(selectedRequest.assignTo?.name || selectedRequest.assignTo?.email || selectedRequest.assignTo || 'Unassigned')}</strong>
              </div>
              <div class="dsar-detail-card">
                <span>Request type</span>
                <strong>${escapeHtml(getRequestType(selectedRequest) || 'Not specified')}</strong>
              </div>
              <div class="dsar-detail-card">
                <span>User ID</span>
                <strong>${escapeHtml(selectedRequest.cmpUserId || currentUser?.userId || '-')}</strong>
              </div>
              <div class="dsar-detail-card">
                <span>Reference</span>
                <strong>${escapeHtml(selectedRequest.referenceId || selectedRequest.requestID || '-')}</strong>
              </div>
            </div>
          </div>
          <div class="dsar-modal-foot">
            <button id="dsar-modal-close-bottom" class="dsar-button dsar-button-secondary" type="button">Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.dsar-modal').addEventListener('click', (event) => {
      if (event.target.classList.contains('dsar-modal')) {
        closeModal();
      }
    });

    modal
      .querySelector('#dsar-modal-close-top')
      .addEventListener('click', closeModal);
    modal
      .querySelector('#dsar-modal-close-bottom')
      .addEventListener('click', closeModal);
  }

  function openModalById(requestId) {
    selectedRequest =
      requests.find((req) => String(req.requestID) === String(requestId)) ||
      null;
    renderModal();
  }

  function closeModal() {
    selectedRequest = null;
    renderModal();
  }

  function attachEvents() {
    const container = getContainer();
    if (!container) return;

    const searchInput = container.querySelector('#dsar-search');
    const statusSelect = container.querySelector('#dsar-status-filter');
    const refreshButton = container.querySelector('#dsar-refresh');

    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        searchTerm = event.target.value;
        applyFilters();
        renderDashboard();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', (event) => {
        statusFilter = event.target.value;
        applyFilters();
        renderDashboard();
      });
    }

    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        fetchDSARs();
      });
    }

    container.querySelectorAll('.dsar-view-button').forEach((button) => {
      button.addEventListener('click', () => {
        openModalById(button.getAttribute('data-request-id'));
      });
    });
  }

  function renderDashboard() {
    injectStyles();

    const container = getContainer();
    if (!container) {
      console.error(`Container #${DSAR_CONTAINER_ID} not found.`);
      return;
    }

    const userLabel =
      currentUser?.email || currentUser?.name || currentUser?.userId || 'Guest';

    container.innerHTML = `
      <section class="dsar-shell" aria-live="polite">
        <header class="dsar-header">
          <div>
            <h1>${escapeHtml(DEFAULT_CONFIG.title)}</h1>
            <p>${escapeHtml(DEFAULT_CONFIG.subtitle)}</p>
          </div>
          <div class="dsar-user-pill">Signed in as ${escapeHtml(userLabel)}</div>
        </header>

        ${error ? `<div class="dsar-alert dsar-alert-error">${escapeHtml(error)}</div>` : ''}

        ${renderStats()}

        <section class="dsar-panel">
          <div class="dsar-panel-head">
            <div>
              <h2>Request history</h2>
              <p>Track status, review deadlines, and open request details.</p>
            </div>
          </div>

          <div class="dsar-panel-body">
            ${renderToolbar()}
            ${renderRequestTable()}
          </div>
        </section>
      </section>
    `;

    attachEvents();
    renderModal();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectedRequest) {
      closeModal();
    }
  });

  (async function init() {
    renderDashboard();
    await fetchDSARs();
  })();
})();

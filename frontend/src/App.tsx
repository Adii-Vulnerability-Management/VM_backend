import { useEffect, useMemo, useState } from 'react';

type Summary = {
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  assets: number;
  overdueRemediations: number;
  scans: number;
};

type Finding = {
  id: string;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Risk Accepted';
  asset: string;
  source: string;
  discoveredAt: string;
  remediation: string;
  priority: 'P1' | 'P2' | 'P3';
};

type SummaryResponse = Record<string, unknown>;
type FindingsResponse = { items?: unknown[] } | unknown[];

const fallbackSummary: Summary = {
  totalFindings: 42,
  critical: 5,
  high: 11,
  medium: 18,
  low: 8,
  assets: 124,
  overdueRemediations: 7,
  scans: 6,
};

const fallbackFindings: Finding[] = [
  {
    id: 'VULN-1042',
    title: 'Log4Shell vulnerable logging library',
    severity: 'Critical',
    status: 'Open',
    asset: 'payments-api-prod',
    source: 'Dependency Scan',
    discoveredAt: '2h ago',
    remediation: 'Upgrade log4j to 2.17.2+',
    priority: 'P1',
  },
  {
    id: 'VULN-1037',
    title: 'Outdated TLS configuration on admin portal',
    severity: 'High',
    status: 'In Progress',
    asset: 'admin-portal',
    source: 'Configuration Scan',
    discoveredAt: '6h ago',
    remediation: 'Disable weak ciphers and rotate certificates',
    priority: 'P1',
  },
  {
    id: 'VULN-1018',
    title: 'Unpatched OS package in web tier',
    severity: 'Medium',
    status: 'Open',
    asset: 'web-tier-01',
    source: 'Host Scan',
    discoveredAt: '1d ago',
    remediation: 'Apply latest security patch baseline',
    priority: 'P2',
  },
  {
    id: 'VULN-1009',
    title: 'Exposed S3 bucket policy',
    severity: 'High',
    status: 'Risk Accepted',
    asset: 'data-lake',
    source: 'Cloud Scan',
    discoveredAt: '2d ago',
    remediation: 'Restrict public access and verify ownership',
    priority: 'P2',
  },
];

function App() {
  const [summary, setSummary] = useState<Summary>(fallbackSummary);
  const [findings, setFindings] = useState<Finding[]>(fallbackFindings);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'api' | 'mock'>('mock');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryResponse, findingsResponse] = await Promise.all([
          fetch('/priv/vulnerability-management/dashboard/summary'),
          fetch('/priv/vulnerability-management/findings?limit=6'),
        ]);

        if (!summaryResponse.ok || !findingsResponse.ok) {
          throw new Error('Backend endpoints unavailable');
        }

        const summaryPayload = (await summaryResponse.json()) as SummaryResponse;
        const findingsPayload = (await findingsResponse.json()) as FindingsResponse;

        const normalizedSummary = normalizeSummary(summaryPayload);
        const normalizedFindings = normalizeFindings(findingsPayload);

        setSummary(normalizedSummary);
        setFindings(normalizedFindings.length ? normalizedFindings : fallbackFindings);
        setSource('api');
      } catch {
        setSummary(fallbackSummary);
        setFindings(fallbackFindings);
        setSource('mock');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const severityBreakdown = useMemo(
    () => [
      { label: 'Critical', value: summary.critical, color: '#ef4444' },
      { label: 'High', value: summary.high, color: '#f59e0b' },
      { label: 'Medium', value: summary.medium, color: '#3b82f6' },
      { label: 'Low', value: summary.low, color: '#10b981' },
    ],
    [summary],
  );

  return (
    <main className="app-shell">
      <section className="dashboard">
        <header className="hero">
          <div>
            <p className="eyebrow">Vulnerability Management</p>
            <h1>Security posture overview</h1>
            <p className="hero-copy">
              Track findings, prioritize remediation, and monitor asset exposure across your environment.
            </p>
          </div>
          <div className="hero-actions">
            <button type="button" onClick={() => window.location.reload()}>Refresh</button>
            <button type="button" className="secondary">Run scan</button>
          </div>
        </header>

        <div className="status-row">
          <span className={`pill ${source === 'api' ? 'live' : 'mock'}`}>
            {loading ? 'Loading data...' : source === 'api' ? 'Live backend data' : 'Sample data'}
          </span>
          <span className="pill">Last scan: 12 min ago</span>
          <span className="pill">Coverage: 124 assets</span>
        </div>

        <section className="metrics-grid">
          <article className="metric-card highlight">
            <span className="metric-label">Open findings</span>
            <strong>{summary.totalFindings}</strong>
            <small>{summary.critical} critical / {summary.high} high</small>
          </article>
          <article className="metric-card">
            <span className="metric-label">Overdue remediation</span>
            <strong>{summary.overdueRemediations}</strong>
            <small>Requires immediate attention</small>
          </article>
          <article className="metric-card">
            <span className="metric-label">Assets monitored</span>
            <strong>{summary.assets}</strong>
            <small>Across cloud and on-prem</small>
          </article>
          <article className="metric-card">
            <span className="metric-label">Scans this month</span>
            <strong>{summary.scans}</strong>
            <small>Automated and manual</small>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-header">
              <h2>Severity breakdown</h2>
              <span className="panel-link">Trend</span>
            </div>
            <div className="bar-list">
              {severityBreakdown.map((item) => (
                <div className="bar-row" key={item.label}>
                  <div className="bar-labels">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(12, item.value * 2)}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Remediation queue</h2>
              <span className="panel-link">7 due soon</span>
            </div>
            <ul className="task-list">
              <li>
                <span>Patch web tier</span>
                <em>Today</em>
              </li>
              <li>
                <span>Rotate expired certificates</span>
                <em>Tomorrow</em>
              </li>
              <li>
                <span>Review public cloud policies</span>
                <em>3 days</em>
              </li>
            </ul>
          </article>
        </section>

        <section className="panel findings-panel">
          <div className="panel-header">
            <h2>Latest findings</h2>
            <span className="panel-link">Filtered by severity</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Finding</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Asset</th>
                  <th>Remediation</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((finding) => (
                  <tr key={finding.id}>
                    <td>{finding.id}</td>
                    <td>
                      <div className="finding-title">{finding.title}</div>
                      <div className="finding-meta">{finding.source} • {finding.discoveredAt}</div>
                    </td>
                    <td>
                      <span className={`badge ${finding.severity.toLowerCase()}`}>{formatSeverity(finding.severity)}</span>
                    </td>
                    <td>{formatStatus(finding.status)}</td>
                    <td>{finding.asset}</td>
                    <td>{finding.remediation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function normalizeSummary(payload: SummaryResponse): Summary {
  return {
    totalFindings: Number(payload.totalFindings ?? payload.total ?? 0),
    critical: Number(payload.critical ?? 0),
    high: Number(payload.high ?? 0),
    medium: Number(payload.medium ?? 0),
    low: Number(payload.low ?? 0),
    assets: Number(payload.assets ?? 0),
    overdueRemediations: Number(payload.overdueRemediations ?? 0),
    scans: Number(payload.scans ?? 0),
  };
}

function normalizeFindings(payload: FindingsResponse): Finding[] {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];

  return items.map((item: any, index: number) => ({
    id: item?.id ?? item?._id ?? `VULN-${1000 + index}`,
    title: item?.title ?? item?.name ?? 'Unspecified finding',
    severity: normalizeSeverity(item?.severity ?? item?.severityLevel ?? 'medium'),
    status: normalizeStatus(item?.status ?? item?.state ?? 'open'),
    asset: item?.asset ?? item?.assetName ?? 'Unknown asset',
    source: item?.source ?? 'Manual',
    discoveredAt: item?.discoveredAt ?? item?.createdAt ?? 'Recently detected',
    remediation: item?.remediation ?? 'Review and remediate',
    priority: item?.priority ?? 'P2',
  }));
}

function normalizeSeverity(value: string): Finding['severity'] {
  const normalized = String(value).trim().toLowerCase();

  switch (normalized) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'low':
      return 'Low';
    default:
      return 'Medium';
  }
}

function normalizeStatus(value: string): Finding['status'] {
  const normalized = String(value).trim().toLowerCase();

  switch (normalized) {
    case 'open':
      return 'Open';
    case 'in_progress':
    case 'in progress':
      return 'In Progress';
    case 'risk_accepted':
    case 'risk accepted':
      return 'Risk Accepted';
    case 'resolved':
      return 'Resolved';
    default:
      return 'Open';
  }
}

function formatSeverity(severity: string) {
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
}

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default App;

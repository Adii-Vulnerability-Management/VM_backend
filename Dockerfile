# syntax=docker/dockerfile:1

# ---------- Stage 1: install deps + build TypeScript ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# build-essential + python3 needed to compile bcrypt's native addon
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx nest build

# ---------- Stage 2: runtime, with scanner binaries ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    DEBIAN_FRONTEND=noninteractive

# Base tooling + scanner runtime prerequisites (git for cloning scan
# targets, Java for Dependency-Check, Python/pipx for Semgrep, nmap for
# host scans). Cloud-account scanners (Checkov/Prowler/ScoutSuite) and the
# Docker-based ZAP scanner are intentionally left out -- Fargate tasks can't
# run Docker-in-Docker, and cloud-account scanning isn't used by this app's
# current asset types.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates unzip tar \
    python3 python3-pip pipx \
    openjdk-17-jre-headless \
    nmap \
    build-essential python3-dev \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/local/bin:/root/.local/bin:${PATH}"

# ---- Gitleaks ----
RUN curl -fsSL -o /tmp/gitleaks.tar.gz \
    https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz \
    && tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks \
    && rm /tmp/gitleaks.tar.gz

# ---- OSV-Scanner ----
RUN curl -fsSL -o /usr/local/bin/osv-scanner \
    https://github.com/google/osv-scanner/releases/download/v2.4.0/osv-scanner_linux_amd64 \
    && chmod +x /usr/local/bin/osv-scanner

# ---- Trivy ----
RUN curl -fsSL -o /tmp/trivy.tar.gz \
    https://github.com/aquasecurity/trivy/releases/download/v0.72.0/trivy_0.72.0_Linux-64bit.tar.gz \
    && tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy \
    && rm /tmp/trivy.tar.gz

# ---- OWASP Dependency-Check ----
RUN curl -fsSL -o /tmp/dc.zip \
    https://github.com/dependency-check/DependencyCheck/releases/download/v12.2.2/dependency-check-12.2.2-release.zip \
    && unzip -q /tmp/dc.zip -d /opt \
    && rm /tmp/dc.zip \
    && ln -s /opt/dependency-check/bin/dependency-check.sh /usr/local/bin/dependency-check.sh

# ---- Semgrep (isolated via pipx so it doesn't fight the system Python) ----
RUN pipx install semgrep==1.171.0 && pipx ensurepath

# App files
COPY package.json package-lock.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY --from=build /app/dist ./dist
COPY email-templates ./email-templates
COPY public ./public

# Persistent-ish scratch space for scanner data (Trivy/Dependency-Check DBs
# download here on first use -- ephemeral per Fargate task unless you mount
# an EFS volume at this path).
RUN mkdir -p /var/lib/vm-scanners /var/lib/vm-scanners/dependency-check \
    && useradd -m -s /bin/bash appuser \
    && chown -R appuser:appuser /app /var/lib/vm-scanners

USER appuser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "require('http').get('http://127.0.0.1:3000/priv/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main"]
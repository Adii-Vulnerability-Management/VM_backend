# syntax=docker/dockerfile:1
#
# ASSUMPTIONS (I can't see the actual backend source — the uploaded zip's
# backend/ folder only contains a stub package-lock.json):
#   - Standard NestJS layout: `npm run build` -> dist/main.js
#   - App listens on port 3000, global prefix /priv (per prior session notes)
#   - package.json has "build" and "start:prod" scripts
# Verify/adjust these against the real repo before this ever builds cleanly.
#
# KNOWN TRADE-OFF BAKED INTO THIS FILE (see chat): this image runs alongside
# a docker.sock bind-mount at deploy time so it can spawn ZAP containers
# locally, matching the current design. That mount effectively grants the
# container root on the host EC2 instance. Accepted per your call — not
# something this Dockerfile can fix.

# ---------- build ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Drop dev dependencies for the runtime stage
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# --- system deps for the scanner toolchain ---
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg lsb-release \
      python3 python3-venv python3-pip \
      openjdk-17-jre-headless \
      nmap \
      unzip \
    && rm -rf /var/lib/apt/lists/*

# --- Docker CLI only (no daemon) — talks to the host daemon via the
# docker.sock bind-mounted into this container at deploy time ---
RUN curl -fsSL https://download.docker.com/linux/debian/gpg -o /tmp/docker.gpg \
    && gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg /tmp/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/* /tmp/docker.gpg

# --- Python-based scanners, isolated in their own venvs to limit
# cross-tool dependency collisions ---
RUN python3 -m venv /opt/venvs/semgrep && /opt/venvs/semgrep/bin/pip install --no-cache-dir semgrep
RUN python3 -m venv /opt/venvs/checkov && /opt/venvs/checkov/bin/pip install --no-cache-dir checkov
RUN python3 -m venv /opt/venvs/prowler && /opt/venvs/prowler/bin/pip install --no-cache-dir prowler
RUN python3 -m venv /opt/venvs/scoutsuite && /opt/venvs/scoutsuite/bin/pip install --no-cache-dir scoutsuite
ENV PATH="/opt/venvs/semgrep/bin:/opt/venvs/checkov/bin:/opt/venvs/prowler/bin:/opt/venvs/scoutsuite/bin:${PATH}"

# --- Go/binary-release scanners ---
ARG GITLEAKS_VERSION=8.21.2
ARG OSV_SCANNER_VERSION=1.9.2
ARG TRIVY_VERSION=0.74.0
ARG DEP_CHECK_VERSION=12.1.0

RUN curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
      | tar -xz -C /usr/local/bin gitleaks

RUN curl -fsSL "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_amd64" \
      -o /usr/local/bin/osv-scanner && chmod +x /usr/local/bin/osv-scanner

RUN curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
      | tar -xz -C /usr/local/bin trivy

RUN curl -fsSL "https://github.com/dependency-check/DependencyCheck/releases/download/v${DEP_CHECK_VERSION}/dependency-check-${DEP_CHECK_VERSION}-release.zip" \
      -o /tmp/dc.zip \
    && unzip -q /tmp/dc.zip -d /opt \
    && ln -s /opt/dependency-check/bin/dependency-check.sh /usr/local/bin/dependency-check \
    && rm /tmp/dc.zip

# --- app user with docker-group membership so it can talk to the mounted
# socket without running the whole process as root ---
ARG DOCKER_HOST_GID=999
RUN groupadd -g ${DOCKER_HOST_GID} dockerhost \
    && useradd -m -s /bin/bash -G dockerhost appuser

COPY --from=build --chown=appuser:appuser /app/dist ./dist
COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/package.json ./package.json

USER appuser

EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "require('http').get('http://127.0.0.1:3000/priv/health', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
# Vulnerable IaC Test Project

This folder contains intentionally insecure Terraform for testing Checkov and Trivy scanning only.

Do not run:

```bash
terraform apply
```

Recommended test:

```bash
./grc_unified_scan.sh \
  --cloud none \
  --tools checkov,trivy \
  --iac-path ./test-iac-vulnerable \
  --repo-path ./test-iac-vulnerable
```

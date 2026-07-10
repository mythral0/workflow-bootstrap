# Workflow Bootstrap

Generate a consistent, test-gated GitHub Actions and GitOps delivery pattern
from an existing repository.

## Install from GitHub

Client servers do not need an npm account or npm package installation. They
need Node.js 20 or newer to run the standalone executable.

```bash
git clone --depth 1 https://github.com/mythral0/workflow-bootstrap.git /opt/workflow-bootstrap
sudo /opt/workflow-bootstrap/scripts/install.sh
workflow-bootstrap --version
```

The installer copies the bundled executable to
`/usr/local/bin/workflow-bootstrap`. The executable includes its YAML runtime
dependency and does not use `node_modules` after installation.

To update an installation:

```bash
cd /opt/workflow-bootstrap
git pull --ff-only
sudo ./scripts/install.sh
```

Release assets can also be installed without cloning the repository:

```bash
mkdir -p /tmp/workflow-bootstrap-install
cd /tmp/workflow-bootstrap-install
curl -fsSLO https://github.com/mythral0/workflow-bootstrap/releases/latest/download/workflow-bootstrap.cjs
curl -fsSLO https://github.com/mythral0/workflow-bootstrap/releases/latest/download/workflow-bootstrap.cjs.sha256
sha256sum --check workflow-bootstrap.cjs.sha256
sudo install -m 0755 workflow-bootstrap.cjs /usr/local/bin/workflow-bootstrap.cjs
sudo ln -sfn workflow-bootstrap.cjs /usr/local/bin/workflow-bootstrap
```

## Commands

Run these commands from the repository being configured:

```bash
# Detect the project and generate its configuration and workflows
workflow-bootstrap init

# Non-interactive initialization
workflow-bootstrap init --yes

# Regenerate after editing the manifest
workflow-bootstrap sync

# Validate the manifest and generated files
workflow-bootstrap check
```

`init` detects the project runtime, package manager, available checks, Docker
build targets, Helm charts, and staging/production values files. It writes a
committed `.workflow-bootstrap.yml` and thin project workflows that call
`mythral0/platform-workflows`.

`init` does not overwrite conflicting files unless `--force` is supplied.
`sync` intentionally rewrites generated files from the committed manifest.

## Supported detection

- Node.js with npm, pnpm, or Yarn
- Python projects
- Go modules
- .NET solutions and projects
- Generic Makefile checks
- One or many Dockerfiles and terminal multi-stage targets
- Helm `values-staging.yaml` and `values-live.yaml` image tag paths

Detection creates a starting point; the manifest is the source of truth. Edit
it when a repository has custom commands or non-standard deployment paths.

## Delivery behavior

- Pull requests run quality checks.
- Merges to `main` rerun checks before building images.
- Staging pipelines are serialized and cannot overlap.
- A stale build cannot promote after `main` advances.
- GitOps values are committed only after successful image builds.
- GitHub Releases build immutable versioned images.
- Production promotion remains a separate manual workflow.
- Deployment controllers reconcile Git; Actions do not connect to clusters.

## Development

npm is used only as the development build tool in this repository. It is not
used to distribute or install the executable on client servers.

```bash
npm ci
npm run check
```

Pushing a version tag such as `v0.2.0` creates a GitHub Release containing the
standalone executable and checksum. The tag must match the version in
`package.json` and `src/version.ts`.

## License

MIT

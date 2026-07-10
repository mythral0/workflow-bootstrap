# Workflow Bootstrap

Generate a consistent, test-gated GitHub Actions and GitOps delivery pattern
from an existing repository.

## Install from GitHub

Client servers do not need npm, an npm account, or package installation. The
installer is system-wide and version-aware:

1. It downloads only the small release version file first.
2. It exits without changing anything when that version is already installed.
3. It refuses to replace a newer installed version with an older one.
4. When Node.js 20+ already exists, it installs the approximately 285 KB
   portable JavaScript executable.
5. Otherwise, it detects `x86_64` Debian or `aarch64` Raspbian and installs the
   matching native executable with its runtime included.

```bash
git clone --depth 1 https://github.com/mythral0/workflow-bootstrap.git /opt/workflow-bootstrap
sudo /opt/workflow-bootstrap/scripts/install.sh
workflow-bootstrap --version
```

Every downloaded executable is verified against its release checksum and
installed at `/usr/local/bin/workflow-bootstrap`. Multiple application
repositories therefore share one installation and can safely run the installer
without repeatedly downloading or replacing it.

To update an installation:

```bash
cd /opt/workflow-bootstrap
git pull --ff-only
sudo ./scripts/install.sh
```

The installer can also be downloaded without cloning the repository. Review it
before running it as root:

```bash
curl -fsSL https://raw.githubusercontent.com/mythral0/workflow-bootstrap/main/scripts/install.sh \
  -o /tmp/install-workflow-bootstrap.sh
less /tmp/install-workflow-bootstrap.sh
sudo bash /tmp/install-workflow-bootstrap.sh
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

Node.js 26 or newer is required only when maintainers build native executables
locally. Pushing a version tag such as `v0.4.0` builds and tests native x64 and
ARM64 executables on matching GitHub-hosted runners, then creates a GitHub
Release containing both executables and their checksums. The tag must match the
version in `package.json` and `src/version.ts`.

Supported release assets:

- `workflow-bootstrap-linux-x64` for 64-bit Debian on `x86_64`
- `workflow-bootstrap-linux-arm64` for 64-bit Raspbian on `aarch64`
- `workflow-bootstrap.cjs` for environments that already have Node.js 20+

## License

MIT

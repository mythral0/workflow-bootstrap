# Workflow Bootstrap

Generate a consistent, test-gated GitHub Actions and GitOps delivery pattern
from an existing repository.

```bash
npx @mythral0/workflow-bootstrap init
```

The command detects the project runtime, package manager, available checks,
Docker build targets, Helm charts, and staging/production values files. It then
writes a committed `.workflow-bootstrap.yml` and thin project workflows that
call `mythral0/platform-workflows`.

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

## Commands

```bash
# Detect and initialize the current repository
npx @mythral0/workflow-bootstrap init

# Non-interactive initialization
npx @mythral0/workflow-bootstrap init --yes

# Regenerate after editing the manifest
npx @mythral0/workflow-bootstrap sync

# Validate the manifest and generated files
npx @mythral0/workflow-bootstrap check
```

`init` does not overwrite conflicting files unless `--force` is supplied.
`sync` intentionally rewrites generated files from the committed manifest.

## Delivery behavior

- Pull requests run quality checks.
- Merges to `main` rerun checks before building images.
- Staging pipelines are serialized and cannot overlap.
- A stale build cannot promote after `main` advances.
- GitOps values are committed only after successful image builds.
- GitHub Releases build immutable versioned images.
- Production promotion remains a separate manual workflow.
- Deployment controllers reconcile Git; Actions do not connect to clusters.

## Configuration

The generated `.workflow-bootstrap.yml` contains all detected CI commands,
container components, registries, and GitOps update expressions. Repositories
with different component layouts receive different build matrices.

## Requirements

- Node.js 20 or newer for the bootstrap command
- GitHub Actions for generated workflows
- GHCR for the initial `0.x` container workflow
- A GitOps controller watching the configured branch for deployment

## Package releases

The `release.yml` GitHub Actions workflow publishes npm releases through npm
trusted publishing with short-lived OIDC credentials. It requires the trusted
publisher to match `mythral0/workflow-bootstrap`, workflow `release.yml`, and
GitHub environment `npm`. No npm token is stored in GitHub.

## License

MIT

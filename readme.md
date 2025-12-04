# Azure App Service Build & Deploy (Node.js)

GitHub Action to **build** a Node.js app and **deploy** it to **Azure App Service** slots with a simple, opinionated flow.

It supports two modes:

- `mode: non-prod`
  - Runs semver **dry-run** via `mathieudutour/github-tag-action`
  - Sets `APP_VERSION = <version>-rc` (suffix configurable)
  - Deploys to a given slot (e.g. `test`)
  - Runs an HTTP health check against the slot URL

- `mode: prod`
  - Runs semver **dry-run** via `mathieudutour/github-tag-action`
  - Sets `APP_VERSION = <version>` (no suffix by default)
  - Deploys to a staging-like slot (e.g. `staging`)
  - Health-checks the staging slot
  - Swaps the slot with a target slot (usually `production`)
  - Health-checks the production URL
  - Optionally bumps version, pushes a Git tag and creates a GitHub Release

> Designed for **Node.js apps running on Azure App Service (code)** in a “non-prod → prod” slot deployment model.

---

## Features

- ✅ Optional tests & build
- ✅ Opinionated semantic versioning (dry-run)
- ✅ `APP_VERSION` app setting managed for you
- ✅ Deploy to any App Service slot (code)
- ✅ Built-in HTTP health checks via [`jtalk/url-health-check-action`](https://github.com/jtalk/url-health-check-action)
- ✅ Slot swap + post-swap health check in `prod` mode
- ✅ Optional tag + GitHub Release in `prod` mode

---

## Requirements

In the **calling repo**:

- A Node.js project (this action assumes `npm` commands).
- A **service principal** with permission to deploy to the App Service.
- Secrets:
  - `AZURE_CREDENTIALS` (or similar) – JSON for `azure/login`
  - `GITHUB_TOKEN` – the built-in token is usually enough

No extra healthcheck scripts are required; HTTP checks are handled inside this action.

---

## Usage

```yaml
steps:
  - name: Build & Deploy
    uses: mharikmert/azure-app-service-build-deploy@v1
    with:
      mode: non-prod
      github_token: ${{ secrets.GITHUB_TOKEN }}
      azure_credentials: ${{ secrets.AZURE_CREDENTIALS }}
      resource_group: ${{ secrets.RESOURCE_GROUP }}
      webapp_name: ${{ secrets.WEBAPP_NAME }}
      slot_name: ${{ secrets.SLOT_NAME }}
      slot_healthcheck_url: ${{ secrets.SLOT_HEALTHCHECK_URL }}
```
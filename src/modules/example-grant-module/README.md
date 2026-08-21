# Example grant module

This minimal module proves the registry workflow without changing core application
behavior. Its lifecycle records installation and version upgrades in memory. A
real module would use these hooks for idempotent setup and data migrations.

Start the API, then register the example:

```bash
npm run start:dev
npm run module:example:register
```

If the API requires authentication, set `MODULE_REGISTRY_TOKEN` to a valid bearer
token. Override the endpoint with `MODULE_REGISTRY_URL` when the server is not at
`http://localhost:3001/api/v1/modules`.

Submitting a manifest with a version newer than `0.1.0` to the same endpoint calls
`onUpgrade(fromVersion, toVersion)`. The lifecycle is intentionally small so the
registry's e2e test can exercise install and upgrade behavior directly.

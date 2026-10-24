# Deploy (Azure App Service, Linux container)

```bash
# one-time
az group create -n keepcovered -l westus2
az acr create -g keepcovered -n keepcoveredacr --sku Basic --admin-enabled true
az appservice plan create -g keepcovered -n keepcovered-plan --is-linux --sku B2
# build + push
az acr build -r keepcoveredacr -t keepcovered:latest .
az webapp create -g keepcovered -p keepcovered-plan -n keepcovered-app -i keepcoveredacr.azurecr.io/keepcovered:latest
az webapp config appsettings set -g keepcovered -n keepcovered-app --settings \
  WEBSITES_PORT=8080 ANTHROPIC_FOUNDRY_API_KEY=... ANTHROPIC_FOUNDRY_RESOURCE=... ANTHROPIC_API_KEY=... \
  VOYAGE_API_KEY=... NESSIE_API_KEY=... APPLICATIONINSIGHTS_CONNECTION_STRING=...
```

- Runtime Claude calls go to Microsoft Foundry when `ANTHROPIC_FOUNDRY_*` is set; Message Batches (evals) and the portal agent's browser toolset need the first-party key.
- Sessions live in memory with a 1-hour TTL (single instance). Set `CONVEX_URL` to mirror session metadata to Convex; documents never leave memory.
- Traces go to Application Insights through OpenTelemetry with a redacting span processor.

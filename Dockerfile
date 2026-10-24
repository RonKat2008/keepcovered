# KeepCovered on Azure App Service (Linux container). The Playwright base image ships Chromium
# for the portal agent; Next runs in standalone mode.
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx next build

FROM base AS run
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data
COPY --from=build /app/fixtures/drivers/demo-maria ./fixtures/drivers/demo-maria
COPY --from=build /app/prompts ./prompts
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 8080
CMD ["npx", "next", "start", "-p", "8080"]

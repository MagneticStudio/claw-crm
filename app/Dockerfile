# Claw CRM — single-image build for self-hosting.
# Schema is pushed idempotently at container start (drizzle-kit push),
# so a fresh Postgres works out of the box; boot-migrations handle the rest.
#
# Railway NOTE: Railway auto-detects this Dockerfile, but production must NOT
# run drizzle-kit push on boot — schema changes there go through
# boot-migrations only. railway.json overrides startCommand to skip the push.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx drizzle-kit push --force && node dist/index.js"]

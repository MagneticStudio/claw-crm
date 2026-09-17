# Claw CRM — single-image build for self-hosting.
# A fresh database receives the base schema once at startup. Existing databases
# skip schema push and rely on the app's idempotent boot migrations.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
# Container ingress needs a non-loopback listener. Compose restricts the host port.
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["npm", "start"]

# syntax=docker/dockerfile:1
FROM node:20-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/ai-service/package.json services/ai-service/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY services/ai-service services/ai-service
COPY scripts scripts
WORKDIR /repo/services/ai-service
EXPOSE 4004
CMD ["sh", "-c", "npm run db:migrate && npm start"]

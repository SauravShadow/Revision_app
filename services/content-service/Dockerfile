# syntax=docker/dockerfile:1
FROM node:20-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/content-service/package.json services/content-service/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY services/content-service services/content-service
WORKDIR /repo/services/content-service
EXPOSE 4002
CMD ["npm", "start"]

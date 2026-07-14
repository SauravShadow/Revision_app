# syntax=docker/dockerfile:1
FROM node:20-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/files-service/package.json services/files-service/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY services/files-service services/files-service
WORKDIR /repo/services/files-service
EXPOSE 4003
CMD ["npm", "start"]

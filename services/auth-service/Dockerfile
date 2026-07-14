# syntax=docker/dockerfile:1
FROM node:20-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/auth-service/package.json services/auth-service/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY services/auth-service services/auth-service
WORKDIR /repo/services/auth-service
EXPOSE 4001
CMD ["npm", "start"]

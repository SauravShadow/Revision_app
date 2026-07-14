# syntax=docker/dockerfile:1

FROM node:20-slim AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci
COPY apps/frontend apps/frontend
WORKDIR /repo/apps/frontend
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /repo/apps/frontend/.next apps/frontend/.next
COPY --from=builder /repo/apps/frontend/public apps/frontend/public
COPY --from=builder /repo/apps/frontend/next.config.mjs apps/frontend/next.config.mjs
WORKDIR /repo/apps/frontend
EXPOSE 3000
CMD ["npm", "start"]

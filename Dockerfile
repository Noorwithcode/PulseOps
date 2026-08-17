# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
ENV PORT=8000

WORKDIR /app

COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev \
  && npm cache clean --force

COPY --chown=node:node backend/ ./backend/
COPY --chown=node:node --from=frontend-builder \
  /app/frontend/dist ./frontend/dist

USER node

EXPOSE 8000

CMD ["npm", "--prefix", "backend", "start"]

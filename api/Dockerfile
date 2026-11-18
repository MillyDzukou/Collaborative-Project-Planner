# --- dev: hot reload via tsx, source mounted as a volume by docker-compose.yml ---
FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# --- build: compile TypeScript to JS ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- prod: minimal runtime image. Keep this the LAST stage: hosts that don't select a build
#     target use the final stage. Migrations ship in the image so they can run as a release step:
#     `npm run migrate:up` (node-pg-migrate is a production dependency for that reason). ---
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]

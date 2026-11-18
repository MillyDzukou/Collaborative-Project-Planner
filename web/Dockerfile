# --- dev: Vite dev server with HMR, source mounted as a volume by docker-compose.yml ---
FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- build: static production bundle ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# "/api" = same-origin API behind nginx (see nginx/default.conf.template). Override only if the API
# lives on another origin (then CORS and a cookie-compatible domain are required).
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- prod: serve the static bundle and proxy /api to the API. Keep this the LAST stage:
#     hosts that don't select a build target use the final stage. ---
FROM nginx:alpine AS prod
# API_UPSTREAM (host:port of the API) is required at runtime; the nginx entrypoint renders the template.
ENV API_UPSTREAM=api:4000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

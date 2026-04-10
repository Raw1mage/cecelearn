FROM node:20-alpine AS build
WORKDIR /app
COPY webapp/frontend/package.json ./package.json
RUN npm install
COPY webapp/frontend ./
RUN npm run build

FROM nginx:1.27-alpine
COPY BUILD/gateway/frontend.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

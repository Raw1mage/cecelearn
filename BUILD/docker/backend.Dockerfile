FROM node:20-alpine AS build
WORKDIR /app
COPY webapp/backend/package.json ./package.json
COPY webapp/backend/tsconfig.json ./tsconfig.json
RUN npm install
COPY webapp/backend/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 3014
CMD ["node", "dist/server.js"]

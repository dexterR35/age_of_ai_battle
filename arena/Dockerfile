FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/dist/client ./dist/client
RUN mkdir runtime && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/app/runtime
EXPOSE 8787
VOLUME ["/app/runtime"]
CMD ["node", "src/server.mjs"]

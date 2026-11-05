FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production PORT=8080

COPY --chown=node:node package.json server.js index.html style.css script.js ai-log.html favicon.svg ./
COPY --chown=node:node images/ ./images/

USER node
EXPOSE 8080
CMD ["npm", "start"]

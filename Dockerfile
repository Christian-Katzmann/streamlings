# The private-artwork boundary: assets/frames is built locally by `npm run build`
# (ffmpeg + the private clip library) and rides ONLY this image — Fly's registry is
# private; the public repo never carries the art. Run the build before `fly deploy`.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server/ server/
COPY assets/ assets/

EXPOSE 8787
CMD ["node", "server/index.js"]

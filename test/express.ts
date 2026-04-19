import express from "express";
import type { Server } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const __dirname = dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const app = express();
let server: Server | null = null;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/video.m3u8", (req, res) => {
  res.send(`
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
#EXT-X-ENDLIST`);
});

app.get("/multi/master.m3u8", (req, res) => {
  res.send(`
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
level1/index.m3u8
`);
});

app.get("/multi/level1/index.m3u8", (req, res) => {
  res.send(`
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720
../media/video.m3u8
`);
});

app.get("/multi/media/video.m3u8", (req, res) => {
  res.send(`
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
../../segment0.ts
#EXTINF:10.0,
../../segment1.ts
#EXT-X-ENDLIST`);
});

app.get("/fallback/master.m3u8", (req, res) => {
  res.send(`
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
broken/1080.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720
valid/720.m3u8
`);
});

app.get("/fallback/broken/1080.m3u8", (req, res) => {
  res.status(404).send("missing");
});

app.get("/fallback/valid/720.m3u8", (req, res) => {
  res.send(`
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
../../segment0.ts
#EXTINF:10.0,
../../segment1.ts
#EXT-X-ENDLIST`);
});

app.get("/head/video.m3u8", (req, res) => {
  res.send(req.headers);
});

/**
 * test for error m3u8
 */
app.get("/test.m3u8", (req, res) => {
  res.send(`
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment2.ts
#EXT-X-ENDLIST`);
});
app.get("/head/video.m3u8", (req, res) => {
  res.send(req.headers);
});

// 返回assets目录下的文件
app.get("/:file", async (req, res) => {
  // if has delay header, delay the response
  if (req.headers.delay) {
    await sleep(Number(req.headers.delay));
  }
  res.sendFile(__dirname + "/assets/" + req.params.file);
});

export const serverStart = () => {
  if (server) {
    return server;
  }

  server = app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });

  return server;
};

// serverStart();

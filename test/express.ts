import express from "express";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

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
app.get("/:file", (req, res) => {
  res.sendFile(__dirname + "/assets/" + req.params.file);
});

export const serverStart = () => {
  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
};

// serverStart();

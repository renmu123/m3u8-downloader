import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import axios from "axios";
import { expect, describe, it, vi } from "vitest";

import M3U8Downloader from "../src/index.js";
import { serverStart } from "./express.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const uuid = () => Math.random().toString(36).slice(2);
const safeRm = (path: string) => {
  if (fs.existsSync(path)) {
    fs.removeSync(path);
  }
};

describe("M3U8Downloader", () => {
  const m3u8Url = "http://127.0.0.1:3000/video.m3u8";
  const output = "/path/to/output.mp4";
  const segmentsDir = path.join(os.tmpdir(), "m3u8-downloader");
  if (!fs.existsSync(segmentsDir)) {
    fs.mkdirSync(segmentsDir);
  }
  serverStart();
  it("should express return", async () => {
    const data = await axios.get("http://localhost:3000");
    expect(data.data).toEqual("Hello World!");
  });
  describe.concurrent("getM3U8", () => {
    it("should get the m3u8 content", async () => {
      const downloader = new M3U8Downloader(m3u8Url, output) as any;
      const data = await axios.get(m3u8Url);
      const data2 = await downloader.getM3U8();
      expect(data.data).toEqual(data2);
    });
    it("should set the custom header", async () => {
      const m3u8Url = "http://127.0.0.1:3000/head/video.m3u8";
      const downloader = new M3U8Downloader(m3u8Url, output, {
        headers: {
          "custom-header": "custom-value",
          "user-agent": "axios",
        },
      }) as any;
      const data = await downloader.getM3U8();
      expect(data["custom-header"]).toEqual("custom-value");
      expect(data["user-agent"]).toEqual("axios");
    });
  });

  describe.concurrent("download", () => {
    it("should download success", async ({ onTestFinished }) => {
      const segmentsDir = path.join(os.tmpdir(), "m3u8-downloader", uuid());
      const output = path.join(segmentsDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        segmentsDir,
        // clean: false,
      }) as any;

      await downloader.download();
      await sleep(100);

      expect(fs.existsSync(output)).toBeTruthy();
      expect(fs.readFileSync(output).length).toEqual(8868524);

      onTestFinished(() => {
        // clean
        safeRm(output);
        safeRm(segmentsDir);
      });
    });
    it("should download segment failure", async ({ onTestFinished }) => {
      const m3u8Url = "http://127.0.0.1:3000/test.m3u8";
      const segmentsDir = path.join(os.tmpdir(), "m3u8-downloader", uuid());
      const output = path.join(segmentsDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        segmentsDir,
      }) as any;

      await downloader.download();
      await sleep(100);

      expect(downloader.status).toEqual("error");
      expect(fs.existsSync(output)).toBeFalsy();
      expect(fs.existsSync(path.join(segmentsDir, "segment0.ts"))).toBeFalsy();
      expect(fs.existsSync(path.join(segmentsDir, "segment1.ts"))).toBeFalsy();

      onTestFinished(() => {
        safeRm(segmentsDir);
      });
    });
    it("should not merge when mergeSegments is false", async ({
      onTestFinished,
    }) => {
      const m3u8Url = "http://127.0.0.1:3000/video.m3u8";
      const segmentsDir = path.join(os.tmpdir(), "m3u8-downloader", uuid());
      const output = path.join(segmentsDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        mergeSegments: false,
        segmentsDir,
      }) as any;

      await downloader.download();
      await sleep(100);

      expect(downloader.status).toEqual("completed");
      expect(fs.existsSync(output)).toBeFalsy();
      expect(fs.existsSync(path.join(segmentsDir, "segment0.ts"))).toBeTruthy();
      expect(fs.existsSync(path.join(segmentsDir, "segment1.ts"))).toBeTruthy();

      onTestFinished(() => {
        // clean
        safeRm(path.join(segmentsDir, "segment0.ts"));
        safeRm(path.join(segmentsDir, "segment1.ts"));
        safeRm(segmentsDir);
      });
    });
  });
  describe.concurrent("pause", () => {
    it("should pause the download", async ({ onTestFinished }) => {
      const segmentsDir = path.join(os.tmpdir(), "m3u8-downloader", uuid());
      const output = path.join(segmentsDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        segmentsDir,
        headers: {
          delay: 500,
        },
        concurrency: 1,
      }) as any;

      downloader.download();
      await sleep(400);
      downloader.pause();
      expect(downloader.status).toEqual("paused");
      await sleep(200);
      expect(downloader.downloadedFiles.length).toEqual(1);

      onTestFinished(() => {
        // clean
        safeRm(path.join(segmentsDir, "segment0.ts"));
        safeRm(path.join(segmentsDir, "segment1.ts"));
        safeRm(segmentsDir);
      });
    });
    it("should pause the download and resume", async ({ onTestFinished }) => {
      const segmentsDir = path.join(os.tmpdir(), "m3u8-downloader", uuid());
      const output = path.join(segmentsDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        segmentsDir,
        headers: {
          delay: 500,
        },
        concurrency: 1,
        mergeSegments: false,
        clean: false,
      }) as any;
      let hasPaused = false;
      downloader.on("paused", () => {
        hasPaused = true;
      });
      let hasResumed = false;
      downloader.on("resumed", () => {
        hasResumed = true;
      });

      const d = downloader.download();
      await sleep(300);
      downloader.pause();
      expect(downloader.status).toEqual("paused");

      await sleep(300);
      downloader.resume();
      expect(downloader.status).toEqual("running");

      await d;
      expect(downloader.downloadedFiles.length).toEqual(2);
      expect(downloader.status).toEqual("completed");
      expect(hasPaused).toBeTruthy();
      expect(hasResumed).toBeTruthy();

      expect(fs.existsSync(path.join(segmentsDir, "segment0.ts"))).toBeTruthy();
      expect(fs.existsSync(path.join(segmentsDir, "segment1.ts"))).toBeTruthy();

      onTestFinished(() => {
        // clean
        safeRm(path.join(segmentsDir, "segment0.ts"));
        safeRm(path.join(segmentsDir, "segment1.ts"));
        safeRm(segmentsDir);
      });
    });
  });
  describe.concurrent("cancel", () => {
    it("should cancel the download", async ({ onTestFinished }) => {
      const segmentsDir = path.join(os.tmpdir(), "m3u8-downloader", uuid());
      const output = path.join(segmentsDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        segmentsDir,
        headers: {
          delay: 500,
        },
        clean: true,
        concurrency: 1,
      }) as any;

      downloader.download();
      await sleep(400);
      downloader.cancel();
      expect(downloader.status).toEqual("canceled");
      await sleep(200);
      expect(downloader.downloadedFiles.length).toEqual(1);
      // has been auto clean
      expect(fs.existsSync(path.join(segmentsDir, "segment0.ts"))).toBeFalsy();
      expect(fs.existsSync(path.join(segmentsDir, "segment1.ts"))).toBeFalsy();

      onTestFinished(() => {
        // clean
        safeRm(segmentsDir);
      });
    });
    it("should not clean when cancel the download", async ({
      onTestFinished,
    }) => {
      const segmentsDir = path.join(os.tmpdir(), "m3u8-downloader", uuid());
      const output = path.join(segmentsDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        segmentsDir,
        headers: {
          delay: 500,
        },
        clean: false,
        concurrency: 1,
      }) as any;

      downloader.download();
      await sleep(400);
      downloader.cancel();
      expect(downloader.status).toEqual("canceled");
      await sleep(200);
      expect(downloader.downloadedFiles.length).toEqual(1);
      // has been auto clean
      expect(fs.existsSync(path.join(segmentsDir, "segment0.ts"))).toBeTruthy();
      expect(fs.existsSync(path.join(segmentsDir, "segment1.ts"))).toBeFalsy();

      onTestFinished(() => {
        // clean
        safeRm(path.join(segmentsDir, "segment0.ts"));
        safeRm(path.join(segmentsDir, "segment1.ts"));
        safeRm(segmentsDir);
      });
    });
  });

  describe("parseM3U8", () => {
    it("should parse the M3U8 file and return an array of URLs", () => {
      const downloader = new M3U8Downloader(m3u8Url, output) as any;
      downloader.status = "running";
      const m3u8Content = `
      #EXTM3U
      #EXT-X-VERSION:3
      #EXT-X-TARGETDURATION:2
      #EXT-X-MEDIA-SEQUENCE:0
      #EXTINF:2.000000,
      segment0.ts
      #EXTINF:2.000000,
      segment1.ts
      `;

      const tsUrls = downloader.parseM3U8(m3u8Content);
      expect(tsUrls).toEqual([
        "http://127.0.0.1:3000/segment0.ts",
        "http://127.0.0.1:3000/segment1.ts",
      ]);
    });

    it("should parse the M3U8 file ", () => {
      const downloader = new M3U8Downloader(m3u8Url, output) as any;
      downloader.status = "running";
      const m3u8Content = `
      #EXTM3U
      #EXT-X-VERSION:3
      #EXT-X-TARGETDURATION:2
      #EXT-X-MEDIA-SEQUENCE:0
      #EXTINF:2.000000,
      transcode_live-93589rLwddnkoZwx--20240727132643_1446619_0000000.ts?cdn=tx&ct=web&d=d6122a55e9f2d9ff39d9092800001701&exper=0&nlimit=5&pt=2&sign=3e40bc9366e5fbce6cb07c7bfc008c7d&tlink=66a4c6bb&tplay=66a5535b&u=0&us=d6122a55e9f2d9ff39d9092800001701&vid=41710087
      #EXTINF:2.000000,
      transcode_live-93589rLwddnkoZwx--20240727132643_1446619_0000001.ts?cdn=tx&ct=web&d=d6122a55e9f2d9ff39d9092800001701&exper=0&nlimit=5&pt=2&sign=3e40bc9366e5fbce6cb07c7bfc008c7d&tlink=66a4c6bb&tplay=66a5535b&u=0&us=d6122a55e9f2d9ff39d9092800001701&vid=41710087
      #EXTINF:2.000000,
      `;

      const tsUrls = downloader.parseM3U8(m3u8Content);
      expect(tsUrls).toEqual([
        "http://127.0.0.1:3000/transcode_live-93589rLwddnkoZwx--20240727132643_1446619_0000000.ts?cdn=tx&ct=web&d=d6122a55e9f2d9ff39d9092800001701&exper=0&nlimit=5&pt=2&sign=3e40bc9366e5fbce6cb07c7bfc008c7d&tlink=66a4c6bb&tplay=66a5535b&u=0&us=d6122a55e9f2d9ff39d9092800001701&vid=41710087",
        "http://127.0.0.1:3000/transcode_live-93589rLwddnkoZwx--20240727132643_1446619_0000001.ts?cdn=tx&ct=web&d=d6122a55e9f2d9ff39d9092800001701&exper=0&nlimit=5&pt=2&sign=3e40bc9366e5fbce6cb07c7bfc008c7d&tlink=66a4c6bb&tplay=66a5535b&u=0&us=d6122a55e9f2d9ff39d9092800001701&vid=41710087",
      ]);
    });
  });

  it("should download the TS segments", async ({ onTestFinished }) => {
    const downloader = new M3U8Downloader(m3u8Url, output, {
      segmentsDir,
    }) as any;
    downloader.status = "running";
    const tsUrls = [
      "http://127.0.0.1:3000/segment0.ts",
      "http://127.0.0.1:3000/segment1.ts",
    ];

    let downloadSegment = 0;
    downloader.on("progress", () => {
      downloadSegment += 1;
    });
    await downloader.downloadTsSegments(tsUrls);
    expect(downloadSegment).toEqual(tsUrls.length);
    expect(fs.existsSync(path.join(segmentsDir, "segment0.ts"))).toBeTruthy();
    expect(fs.existsSync(path.join(segmentsDir, "segment1.ts"))).toBeTruthy();

    onTestFinished(() => {
      // clean
      safeRm(path.join(segmentsDir, "segment0.ts"));
      safeRm(path.join(segmentsDir, "segment1.ts"));
    });
  });

  it("should merge the TS segments into a single file", async ({
    onTestFinished,
  }) => {
    const segmentsDir = path.join(__dirname, "assets");
    const output = path.join(segmentsDir, "output.ts");

    const downloader = new M3U8Downloader(m3u8Url, output, {
      segmentsDir,
    }) as any;
    downloader.status = "running";

    const mergedFilePath = await downloader.mergeTsSegments(2, false);
    expect(mergedFilePath).toEqual(output);
    await sleep(50);
    expect(fs.existsSync(output)).toBeTruthy();
    expect(fs.readFileSync(output).length).toEqual(8868524);

    onTestFinished(() => {
      // clean
      safeRm(output);
    });
  });

  it("should convert the merged TS file to MP4", () => {
    const downloader = new M3U8Downloader(m3u8Url, output) as any;
    const tsMediaPath = "/path/to/segmentsDir/output.ts";

    vi.spyOn(downloader, "convertToMp4").mockImplementation(() => {
      // Simulate converting to MP4
    });

    downloader.convertToMp4(tsMediaPath);

    expect(downloader.convertToMp4).toHaveBeenCalled();
    expect(downloader.convertToMp4).toHaveBeenCalledWith(tsMediaPath);
  });
});

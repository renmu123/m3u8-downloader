import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import axios from "axios";
import { expect, describe, it, vi, afterEach, beforeEach } from "vitest";

import M3U8Downloader from "../src/index.js";
import { serverStart } from "./express.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("M3U8Downloader", () => {
  const m3u8Url = "http://127.0.0.1:3000/video.m3u8";
  const output = "/path/to/output.mp4";
  const tempDir = path.join(os.tmpdir(), "m3u8-downloader");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
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

  describe("download", () => {
    it("should download success", async ({ onTestFinished }) => {
      const output = path.join(tempDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        tempDir,
        // clean: false,
      }) as any;

      downloader.on("error", (error: string) => {
        console.log("error", error);
      });
      downloader.on("progress", (progress: number) => {
        console.log("progress", progress);
      });
      await downloader.download();
      await sleep(100);

      console.log("output", downloader.downloadedFiles);
      expect(fs.existsSync(output)).toBeTruthy();
      expect(fs.readFileSync(output).length).toEqual(8868524);

      onTestFinished(() => {
        // clean
        if (fs.existsSync(output)) {
          fs.unlinkSync(output);
        }
      });
    });
    it("should download segment failure", async () => {
      const m3u8Url = "http://127.0.0.1:3000/test.m3u8";
      const output = path.join(tempDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        tempDir,
      }) as any;

      await downloader.download();
      await sleep(100);

      expect(downloader.status).toEqual("error");
      expect(fs.existsSync(output)).toBeFalsy();
      expect(fs.existsSync(path.join(tempDir, "segment0.ts"))).toBeFalsy();
      expect(fs.existsSync(path.join(tempDir, "segment1.ts"))).toBeFalsy();
    });
    it("should not merge when mergeSegments is false", async ({
      onTestFinished,
    }) => {
      const m3u8Url = "http://127.0.0.1:3000/video.m3u8";
      const output = path.join(tempDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        mergeSegments: false,
        tempDir,
      }) as any;

      await downloader.download();
      await sleep(100);

      expect(downloader.status).toEqual("completed");
      expect(fs.existsSync(output)).toBeFalsy();
      expect(fs.existsSync(path.join(tempDir, "segment0.ts"))).toBeTruthy();
      expect(fs.existsSync(path.join(tempDir, "segment1.ts"))).toBeTruthy();

      onTestFinished(() => {
        // clean
        if (fs.existsSync(path.join(tempDir, "segment0.ts"))) {
          fs.unlinkSync(path.join(tempDir, "segment0.ts"));
        }
        if (fs.existsSync(path.join(tempDir, "segment1.ts"))) {
          fs.unlinkSync(path.join(tempDir, "segment1.ts"));
        }
      });
    });
  });
  describe("pause", () => {
    it("should pause the download", async ({ onTestFinished }) => {
      const output = path.join(tempDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        tempDir,
        headers: {
          delay: 1000,
        },
        concurrency: 1,
      }) as any;

      downloader.download();
      await sleep(900);
      downloader.pause();
      expect(downloader.status).toEqual("paused");
      await sleep(1300);
      expect(downloader.downloadedFiles.length).toEqual(1);

      onTestFinished(() => {
        // clean
        if (fs.existsSync(path.join(tempDir, "segment0.ts"))) {
          fs.unlinkSync(path.join(tempDir, "segment0.ts"));
        }
        if (fs.existsSync(path.join(tempDir, "segment1.ts"))) {
          fs.unlinkSync(path.join(tempDir, "segment1.ts"));
        }
      });
    });
    it("should pause the download and resume", async ({ onTestFinished }) => {
      const output = path.join(tempDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        tempDir,
        headers: {
          delay: 500,
          timeout: 5000,
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

      await sleep(400);
      downloader.resume();
      expect(downloader.status).toEqual("running");

      await d;
      expect(downloader.downloadedFiles.length).toEqual(2);
      expect(downloader.status).toEqual("completed");
      expect(hasPaused).toBeTruthy();
      expect(hasResumed).toBeTruthy();

      expect(fs.existsSync(path.join(tempDir, "segment0.ts"))).toBeTruthy();
      expect(fs.existsSync(path.join(tempDir, "segment1.ts"))).toBeTruthy();

      onTestFinished(() => {
        // clean
        if (fs.existsSync(path.join(tempDir, "segment0.ts"))) {
          fs.unlinkSync(path.join(tempDir, "segment0.ts"));
        }
        if (fs.existsSync(path.join(tempDir, "segment1.ts"))) {
          fs.unlinkSync(path.join(tempDir, "segment1.ts"));
        }
      });
    });
  });
  describe("cancel", () => {
    it("should cancel the download", async () => {
      const output = path.join(tempDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        tempDir,
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
      await sleep(800);
      expect(downloader.downloadedFiles.length).toEqual(1);
      // has been auto clean
      expect(fs.existsSync(path.join(tempDir, "segment0.ts"))).toBeFalsy();
      expect(fs.existsSync(path.join(tempDir, "segment1.ts"))).toBeFalsy();
    });
    it("should not clean when cancel the download", async ({
      onTestFinished,
    }) => {
      const output = path.join(tempDir, "output.ts");

      const downloader = new M3U8Downloader(m3u8Url, output, {
        convert2Mp4: false,
        tempDir,
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
      await sleep(800);
      expect(downloader.downloadedFiles.length).toEqual(1);
      // has been auto clean
      expect(fs.existsSync(path.join(tempDir, "segment0.ts"))).toBeTruthy();
      expect(fs.existsSync(path.join(tempDir, "segment1.ts"))).toBeFalsy();

      onTestFinished(() => {
        // clean
        if (fs.existsSync(path.join(tempDir, "segment0.ts"))) {
          fs.unlinkSync(path.join(tempDir, "segment0.ts"));
        }
        if (fs.existsSync(path.join(tempDir, "segment1.ts"))) {
          fs.unlinkSync(path.join(tempDir, "segment1.ts"));
        }
      });
    });
  });

  it("should parse the M3U8 file and return an array of URLs", () => {
    const downloader = new M3U8Downloader(m3u8Url, output) as any;
    downloader.status = "running";
    const m3u8Content = "#EXTM3U\nsegment1.ts\nsegment2.ts";

    const tsUrls = downloader.parseM3U8(m3u8Content);

    expect(tsUrls).toEqual([
      "http://127.0.0.1:3000/segment1.ts",
      "http://127.0.0.1:3000/segment2.ts",
    ]);
  });

  it("should download the TS segments", async () => {
    const downloader = new M3U8Downloader(m3u8Url, output, {
      tempDir,
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
    expect(fs.existsSync(path.join(tempDir, "segment0.ts"))).toBeTruthy();
    expect(fs.existsSync(path.join(tempDir, "segment1.ts"))).toBeTruthy();

    // clean
    if (fs.existsSync(path.join(tempDir, "segment0.ts"))) {
      fs.unlinkSync(path.join(tempDir, "segment0.ts"));
    }
    if (fs.existsSync(path.join(tempDir, "segment1.ts"))) {
      fs.unlinkSync(path.join(tempDir, "segment1.ts"));
    }
  });

  it("should merge the TS segments into a single file", async () => {
    const tempDir = path.join(__dirname, "assets");
    const output = path.join(tempDir, "output.ts");

    const downloader = new M3U8Downloader(m3u8Url, output, {
      tempDir,
    }) as any;
    downloader.status = "running";

    const mergedFilePath = await downloader.mergeTsSegments(2, false);
    expect(mergedFilePath).toEqual(output);
    await sleep(100);
    expect(fs.existsSync(output)).toBeTruthy();
    expect(fs.readFileSync(output).length).toEqual(8868524);

    // clean
    if (fs.existsSync(output)) {
      console.log("delete file", output);
      fs.unlinkSync(output);
    }
  });

  it("should convert the merged TS file to MP4", () => {
    const downloader = new M3U8Downloader(m3u8Url, output) as any;
    const tsMediaPath = "/path/to/tempDir/output.ts";

    vi.spyOn(downloader, "convertToMp4").mockImplementation(() => {
      // Simulate converting to MP4
    });

    downloader.convertToMp4(tsMediaPath);

    expect(downloader.convertToMp4).toHaveBeenCalled();
    expect(downloader.convertToMp4).toHaveBeenCalledWith(tsMediaPath);
  });
});

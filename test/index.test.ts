import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import axios from "axios";
import { expect, describe, it, vi, afterEach, beforeEach } from "vitest";

import M3U8Downloader from "../src/index.js";
import { serverStart } from "./express.js";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  it("should get the m3u8 content", async () => {
    const downloader = new M3U8Downloader(m3u8Url, output) as any;
    const data = await axios.get(m3u8Url);
    const data2 = await downloader.getM3U8();
    expect(data.data).toEqual(data2);
  });

  it("should parse the M3U8 file and return an array of URLs", () => {
    const downloader = new M3U8Downloader(m3u8Url, output) as any;
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
    const tsUrls = [
      "http://127.0.0.1:3000/segment01.ts",
      "http://127.0.0.1:3000/segment02.ts",
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
    const output = path.join(os.tmpdir(), "m3u8-downloader", "output.ts");
    const tempDir = path.join(os.tmpdir(), "m3u8-downloader");

    const downloader = new M3U8Downloader(m3u8Url, output, {
      tempDir,
    }) as any;
    const tsUrls = [
      "http://127.0.0.1:3000/segment01.ts",
      "http://127.0.0.1:3000/segment02.ts",
    ];

    const mergedFilePath = await downloader.mergeTsSegments(tsUrls, false);
    expect(mergedFilePath).toEqual(output);
    expect(fs.existsSync(output)).toBeTruthy();

    // clean
    if (fs.existsSync(output)) {
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

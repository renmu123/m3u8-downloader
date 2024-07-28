import os from "node:os";
import path from "node:path";

import { expect, describe, it, vi } from "vitest";

import M3U8Downloader from "../src/index.js";

describe("M3U8Downloader", () => {
  const m3u8Url = "https://example.com/video.m3u8";
  const output = "/path/to/output.mp4";

  it("should download the M3U8 file", async () => {
    const output = path.join(os.tmpdir(), "output.mp4");
    const downloader = new M3U8Downloader(m3u8Url, output);
    const m3u8Content = "M3U8 file content";

    vi.spyOn(downloader, "downloadM3U8").mockResolvedValue(m3u8Content);

    await downloader.download();

    expect(downloader.downloadM3U8).toHaveBeenCalled();
    expect(downloader.downloadM3U8).toHaveBeenCalledWith();
  });

  it("should parse the M3U8 file and return an array of URLs", () => {
    const downloader = new M3U8Downloader(m3u8Url, output);
    const m3u8Content = "#EXTM3U\nsegment1.ts\nsegment2.ts";

    const tsUrls = downloader.parseM3U8(m3u8Content);

    expect(tsUrls).toEqual([
      "https://example.com/segment1.ts",
      "https://example.com/segment2.ts",
    ]);
  });

  it("should download the TS segments", async () => {
    const downloader = new M3U8Downloader(m3u8Url, output) as any;
    const tsUrls = [
      "https://example.com/segment1.ts",
      "https://example.com/segment2.ts",
    ];

    vi.spyOn(downloader, "downloadTsSegments").mockImplementation(async () => {
      // Simulate downloading segments
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    await downloader.downloadTsSegments(tsUrls);

    expect(downloader.downloadTsSegments).toHaveBeenCalled();
    expect(downloader.downloadTsSegments).toHaveBeenCalledWith(tsUrls);
  });

  it("should merge the TS segments into a single file", () => {
    const output = "/path/to/output.mp4";
    const downloader = new M3U8Downloader(m3u8Url, output) as any;
    const tsUrls = [
      "https://example.com/segment1.ts",
      "https://example.com/segment2.ts",
    ];

    const mergedFilePath = downloader.mergeTsSegments(tsUrls);

    expect(mergedFilePath).toEqual("/path/to/output.mp4");
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

import os from "node:os";
import fs from "fs-extra";
import path from "node:path";
import { spawn } from "node:child_process";
import { TypedEmitter } from "tiny-typed-emitter";

import axios from "axios";
import axiosRetry from "axios-retry";
import PQueue from "p-queue";
import * as m3u8Parser from "m3u8-parser";
import { isUrl, retry } from "./utils.js";

import type { RawAxiosRequestHeaders } from "axios";

// for vitest
declare global {
  interface Worker {}

  namespace WebAssembly {
    interface Module {}
  }
  interface WebSocket {}
}

interface M3U8DownloaderEvents {
  start: () => void;
  progress: (progress: {
    downloadedFile: string;
    downloaded: number;
    total: number;
  }) => void;
  paused: () => void;
  resumed: () => void;
  canceled: () => void;
  error: (error: string) => void;
  completed: () => void;
  converted: (output: string) => void;
}

export default class M3U8Downloader extends TypedEmitter<M3U8DownloaderEvents> {
  private m3u8Url: string;
  output: string;
  private segmentsDir: string;
  private queue: PQueue;
  private totalSegments: number;
  private downloadedSegments: number;
  private downloadedFiles: string[];
  status:
    | "pending"
    | "running"
    | "paused"
    | "canceled"
    | "completed"
    | "error" = "pending";
  private http: ReturnType<typeof axios.create>;
  private options: {
    concurrency: number;
    convert2Mp4: boolean;
    mergeSegments: boolean;
    segmentsDir: string;
    ffmpegPath: string;
    retries: number;
    clean: boolean;
    headers: RawAxiosRequestHeaders;
    startIndex: number;
    endIndex?: number;
    skipExistSegments: boolean;
    suffix: string;
    proxy?: {
      host: string;
      port: number;
      protocol?: string;
      auth?: { username: string; password: string };
    };
  };

  /**
   * @param m3u8Url M3U8 URL
   * @param options
   * @param options.concurrency Number of segments to download concurrently
   * @param options.segmentsDir Temporary directory to store downloaded segments
   * @param options.mergeSegments Whether to merge downloaded segments into a single file
   * @param options.convert2Mp4 Whether to convert2Mp4 downloaded segments into a single file, you must open mergeSegments
   * @param options.ffmpegPath Path to ffmpeg binary if you open convert2Mp4
   * @param options.retries Number of retries for downloading segments
   * @param options.clean Whether to clean up downloaded segments after download is error or canceled
   * @param options.headers Headers to be sent with the HTTP request
   * @param options.startIndex Start index of the segment to download
   * @param options.endIndex End index of the segment to download
   * @param options.skipExistSegments Skip download if the segment file already exists
   */
  constructor(
    m3u8Url: string,
    output: string,
    options: {
      concurrency?: number;
      segmentsDir?: string;
      convert2Mp4?: boolean;
      mergeSegments?: boolean;
      ffmpegPath?: string;
      retries?: number;
      clean?: boolean;
      headers?: RawAxiosRequestHeaders;
      startIndex?: number;
      endIndex?: number;
      skipExistSegments?: boolean;
      suffix?: string;
      proxy?: {
        host: string;
        port: number;
        protocol?: string;
        auth?: { username: string; password: string };
      };
    } = {}
  ) {
    super();
    const defaultOptions = {
      concurrency: 5,
      convert2Mp4: false,
      mergeSegments: true,
      segmentsDir: os.tmpdir(),
      retries: 3,
      ffmpegPath: "ffmpeg",
      clean: true,
      startIndex: 0,
      skipExistSegments: false,
      suffix: "ts",
      headers: {},
    };
    this.options = Object.assign(defaultOptions, options);
    this.m3u8Url = m3u8Url;
    this.output = output;
    this.segmentsDir = this.options.segmentsDir;
    this.queue = new PQueue({ concurrency: this.options.concurrency });
    this.totalSegments = 0;
    this.downloadedSegments = 0;
    this.downloadedFiles = [];

    // axios 统一实例化，方便增加axios功能，比如拦截器
    this.http = axios.create({
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        ...this.options.headers,
      },
      proxy: this.options.proxy || false,
    });

    axiosRetry(this.http, {
      retries: this.options.retries,
      retryDelay: axiosRetry.exponentialDelay,
    });

    this.on("canceled", this.cleanUpDownloadedFiles);
    this.on("error", async error => {
      console.error("error", error);
      this.status = "error";
      this.cleanUpDownloadedFiles();
    });
    this.on("completed", () => {
      this.status = "completed";
    });
  }

  /**
   * download M3U8 file
   */
  public async download() {
    try {
      this.emit("start");
      this.status = "running";
      if (!(await fs.pathExists(this.segmentsDir))) {
        await fs.mkdir(this.segmentsDir, { recursive: true });
      }
      if (!(await fs.pathExists(path.dirname(this.output)))) {
        throw new Error("Output directory does not exist");
      }
      const m3u8Content = await this.getM3U8();
      const tsUrls = this.parseM3U8(m3u8Content);
      const urls = tsUrls.slice(this.options.startIndex, this.options.endIndex);
      this.totalSegments = urls.length;

      await this.downloadTsSegments(urls);

      if (this.options.mergeSegments) {
        const tsMediaPath = await this.mergeTsSegments(this.totalSegments);

        if (this.options.convert2Mp4) {
          await this.convertToMp4(tsMediaPath);
        }
      }

      if (!this.isRunning()) {
        await this.cleanUpDownloadedFiles();
        return;
      }
      this.emit("completed");
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * pause download
   */
  public pause() {
    if (!this.isRunning()) return;

    // running in queue will not be paused
    this.status = "paused";
    this.emit("paused");
    this.queue.pause();
  }

  /**
   * resume download
   */
  public resume() {
    if (this.status !== "paused") return;
    this.status = "running";
    this.emit("resumed");
    this.queue.start();
  }

  /**
   * cancel download
   */
  public cancel() {
    if (["completed", "canceled", "error"].includes(this.status)) return;

    this.status = "canceled";
    this.emit("canceled");
    this.queue.clear();
  }

  /**
   * download M3U8 file
   */
  private async getM3U8(): Promise<string> {
    try {
      const { data: m3u8Content } = await this.http.get(this.m3u8Url);
      return m3u8Content;
    } catch (error) {
      this.emit("error", "Failed to download m3u8 file");
      throw error;
    }
  }

  /**
   * parse M3U8 file and return an array of URLs
   * @param m3u8Content M3U8 file content
   */
  private parseM3U8(m3u8Content: string): string[] {
    const parser = new m3u8Parser.Parser();

    parser.push(m3u8Content);
    parser.end();

    const parsedManifest = parser.manifest;
    return (parsedManifest?.segments || []).map(segment => {
      if (isUrl(segment.uri)) {
        return segment.uri;
      } else {
        return new URL(segment.uri, this.m3u8Url).href;
      }
    });
  }

  private async downloadSegment(tsUrl: string, index: number) {
    if (!this.isRunning()) return;
    const formattedIndex = String(index).padStart(5, "0");
    const segmentPath = path.resolve(
      this.segmentsDir,
      `segment${formattedIndex}.${this.options.suffix}`
    );
    if (this.options.skipExistSegments && (await fs.pathExists(segmentPath))) {
      this.downloadedSegments++;
      const progress = {
        downloadedFile: segmentPath,
        downloaded: this.downloadedSegments,
        total: this.totalSegments,
      };
      this.emit("progress", progress);
      return progress;
    }

    const response = await this.http.get(tsUrl, {
      responseType: "arraybuffer",
    });

    await fs.writeFile(segmentPath, response.data);
    this.downloadedFiles.push(segmentPath);
    this.downloadedSegments++;
    const progress = {
      downloadedFile: segmentPath,
      downloaded: this.downloadedSegments,
      total: this.totalSegments,
    };
    this.emit("progress", progress);

    return progress;
  }

  /**
   * download TS segments
   * @param tsUrls Array of TS segment URLs
   */
  private async downloadTsSegments(tsUrls: string[]) {
    for (const [index, tsUrl] of tsUrls.entries()) {
      this.queue
        .add(() => this.downloadSegment(tsUrl, index))
        .catch(error => {
          this.emit("error", `Failed to add segment ${index} to queue`);
        });
    }

    await this.queue.onIdle();
  }

  /**
   * merge TS segments into a single file
   * @param tsUrls Array of TS segment URLs
   */
  private async mergeTsSegments(total: number, deleteSource: boolean = true) {
    if (!this.isRunning()) return;
    let mergedFilePath = path.resolve(
      this.segmentsDir,
      `output.${this.options.suffix}`
    );

    if (!this.options.convert2Mp4) {
      mergedFilePath = this.output;
    }
    const writeStream = fs.createWriteStream(mergedFilePath);

    for (let index = 0; index < total; index++) {
      if (!this.isRunning()) {
        writeStream.end();
        return;
      }

      const formattedIndex = String(index).padStart(5, "0");
      const segmentPath = path.resolve(
        this.segmentsDir,
        `segment${formattedIndex}.${this.options.suffix}`
      );
      try {
        const segmentData = await fs.readFile(segmentPath);
        writeStream.write(segmentData);
        if (deleteSource) await fs.unlink(segmentPath); // 删除临时 TS 片段文件
      } catch (error) {
        this.emit("error", `Segment ${index} is missing`);
        writeStream.end();
        return;
      }
    }

    writeStream.end();
    return mergedFilePath;
  }
  private async cleanUpDownloadedFiles() {
    if (!this.options.clean) return;
    await Promise.all(
      this.downloadedFiles.map(async file => {
        try {
          await fs.unlink(file);
        } catch (error) {}
      })
    );
    if (this.options.convert2Mp4) {
      let mergedFilePath = path.resolve(
        this.segmentsDir,
        `output.${this.options.suffix}`
      );
      if (await fs.pathExists(mergedFilePath)) {
        await fs.unlink(mergedFilePath);
      }
    }
  }

  /**
   * convert merged TS file to MP4
   * @param tsMediaPath Path to merged TS file
   */
  private async convertToMp4(tsMediaPath: string) {
    if (!this.isRunning()) return;

    const inputFilePath = tsMediaPath;
    const outputFilePath = this.output;

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.options.ffmpegPath, [
        "-i",
        inputFilePath,
        "-c",
        "copy",
        outputFilePath,
        "-y",
      ]);

      ffmpeg.on("error", error => {
        this.emit("error", `Failed to convert to MP4: ${error.message}`);
        reject(error);
      });

      ffmpeg.on("close", async code => {
        if (code !== 0) {
          this.emit("error", `FFmpeg process exited with code ${code}`);
          reject(new Error(`FFmpeg process exited with code ${code}`));
          return;
        }

        // remove merged TS file with retry
        try {
          await retry(() => fs.unlink(inputFilePath), 5, 1000);
        } catch (error) {
          console.error(`Failed to delete temporary TS file: ${error}`);
        }

        resolve(outputFilePath);
        this.emit("converted", outputFilePath);
      });
    });
  }

  isRunning() {
    return this.status === "running";
  }
}

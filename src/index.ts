import os from "node:os";
import fs from "fs-extra";
import path from "node:path";
import { spawn } from "node:child_process";
import { TypedEmitter } from "tiny-typed-emitter";

import axios from "axios";
import axiosRetry from "axios-retry";
import PQueue from "p-queue";
import * as m3u8Parser from "m3u8-parser";
import { isUrl, retry, uuid } from "./utils.js";

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
    startTime?: number;
    endTime?: number;
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
   * @param options.startTime Start time in seconds
   * @param options.endTime End time in seconds
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
      startTime?: number;
      endTime?: number;
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
      segmentsDir: path.join(os.tmpdir(), "m3u8-downloader", uuid()),
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
    fs.ensureDirSync(this.segmentsDir);
    console.log("Temporary segments directory:", this.segmentsDir);

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

    this.on("canceled", () => this.cleanUpDownloadedFiles());
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
      const m3u8= await this.getM3U8();
      const urls = this.parseM3U8(m3u8.content, m3u8.url);

      this.totalSegments = urls.length;

      await this.downloadTsSegments(urls);

      if (this.options.mergeSegments) {
        const tsMediaPath = await this.mergeTsSegments(this.totalSegments);
        if (!tsMediaPath) {
          throw new Error("Failed to merge TS segments");
        }
        if (this.options.convert2Mp4) {
          await this.convertToMp4(tsMediaPath);
        }
      }

      if (!this.isRunning()) {
        await this.cleanUpDownloadedFiles();
        return;
      }
      this.emit("completed");
    } catch (error: any) {
      this.emit("error", error?.message ?? String(error));
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
   * Resolve a master playlist into the concrete media playlist that contains
   */
  private async getM3U8(
    maxDepth = 5
  ): Promise<{ content: string; url: string }> {
    const visited = new Set<string>();

    const walk = async (
      currentUrl: string,
      depth: number
    ): Promise<{ content: string; url: string }> => {
      if (!currentUrl) {
        throw new Error("Playlist URL is empty");
      }
      if (depth > maxDepth) {
        throw new Error(`Playlist depth exceeded maxDepth=${maxDepth}`);
      }
      if (visited.has(currentUrl)) {
        throw new Error(`Playlist loop detected: ${currentUrl}`);
      }

      visited.add(currentUrl);

      const { data } = await this.http.get<string>(currentUrl, {
        responseType: "text",
      });
      const text = String(data ?? "").trim();
      if (!text) {
        throw new Error(`Playlist response is empty: ${currentUrl}`);
      }

      const parser = new m3u8Parser.Parser();
      parser.push(text);
      parser.end();

      const manifest = parser.manifest as {
        segments?: Array<{ uri: string; duration: number }>;
        playlists?: Array<{
          uri?: string;
          attributes?: { BANDWIDTH?: number };
        }>;
        media?: Array<{ uri?: string }>;
      };

      if ((manifest.segments?.length ?? 0) > 0) {
        return { content: text, url: currentUrl };
      }

      const nextUrl = this.pickNextPlaylistUrl(currentUrl, manifest);
      if (!nextUrl) {
        throw new Error(`No nested media playlist found: ${currentUrl}`);
      }

      return walk(nextUrl, depth + 1);
    };

    return walk(this.m3u8Url, 0);
  }

  private pickNextPlaylistUrl(
    baseUrl: string,
    manifest: {
      playlists?: Array<{
        uri?: string;
        attributes?: { BANDWIDTH?: number };
      }>;
      media?: Array<{ uri?: string }>;
    }
  ): string {
    const streamCandidates = (manifest.playlists ?? [])
      .map(playlist => ({
        bandwidth: Number(playlist.attributes?.BANDWIDTH ?? 0),
        url: this.resolvePlaylistUrl(baseUrl, playlist.uri),
      }))
      .filter(
        (candidate): candidate is { bandwidth: number; url: string } =>
          candidate.url.length > 0
      );

    if (streamCandidates.length > 0) {
      streamCandidates.sort((a, b) => b.bandwidth - a.bandwidth);
      return streamCandidates[0].url;
    }

    const mediaCandidates = (manifest.media ?? [])
      .map(media => this.resolvePlaylistUrl(baseUrl, media.uri))
      .filter((url): url is string => url.length > 0);

    return mediaCandidates[0] ?? "";
  }

  private resolvePlaylistUrl(baseUrl: string, childUrl?: string): string {
    if (!childUrl) {
      return "";
    }

    try {
      return new URL(childUrl, baseUrl).toString();
    } catch {
      return "";
    }
  }

  /**
   * parse M3U8 file and return an array of URLs
   * @param m3u8Content M3U8 file content
   */
  private parseM3U8(
    m3u8Content: string,
    baseUrl: string = this.m3u8Url
  ): string[] {
    const parser = new m3u8Parser.Parser();

    parser.push(m3u8Content);
    parser.end();

    const parsedManifest = parser.manifest;
    let segments = parsedManifest?.segments || [];

    // Handle time-based filtering
    if (
      this.options.startTime !== undefined ||
      this.options.endTime !== undefined
    ) {
      let currentTime = 0;
      const startTime = this.options.startTime ?? 0;
      const endTime = this.options.endTime ?? Infinity;
      if (startTime >= endTime) {
        this.emit("error", "startTime must be less than endTime");
        throw new Error("startTime must be less than endTime");
      }

      segments = segments.filter(segment => {
        const segmentStart = currentTime;
        const segmentEnd = currentTime + segment.duration;
        currentTime = segmentEnd;

        return segmentEnd > startTime && segmentStart < endTime;
      });
    }

    // Handle index-based filtering
    if (
      this.options.startIndex !== undefined ||
      this.options.endIndex !== undefined
    ) {
      if (this.options.startIndex! >= this.options.endIndex!) {
        this.emit("error", "startIndex must be less than endIndex");
        throw new Error("startIndex must be less than endIndex");
      }
      segments = segments.slice(this.options.startIndex, this.options.endIndex);
    }

    return segments.map(segment => {
      if (isUrl(segment.uri)) {
        return segment.uri;
      }
      return new URL(segment.uri, baseUrl).href;
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
    const writeStream = fs.createWriteStream(mergedFilePath, {
      highWaterMark: 1024 * 1024,
    });
    writeStream.on("error", error => {
      this.emit("error", `Failed to write merged file: ${error.message}`);
      throw error;
    });

    // 辅助函数：处理背压（Backpressure）的写入
    const safeWrite = (data: Buffer) => {
      return new Promise<void>((resolve, reject) => {
        const canWrite = writeStream.write(data, err => {
          if (err) {
            this.emit("error", `Failed to write segment data: ${err.message}`);
            reject(err);
          }
        });
        if (canWrite) {
          resolve();
        } else {
          writeStream.once("drain", resolve);
        }
      });
    };

    try {
      for (let index = 0; index < total; index++) {
        if (!this.isRunning()) throw new Error("Stopped by user");

        const formattedIndex = String(index).padStart(5, "0");
        const segmentPath = path.resolve(
          this.segmentsDir,
          `segment${formattedIndex}.${this.options.suffix}`
        );

        // 读取并安全写入
        const segmentData = await fs.promises.readFile(segmentPath);
        await safeWrite(segmentData);

        if (deleteSource) await fs.promises.unlink(segmentPath);
      }

      // 关键：等待流完全关闭
      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.end();
      });

      return mergedFilePath;
    } catch (error) {
      writeStream.destroy(); // 发生错误时销毁流
      this.emit("error", error.message);
      return null;
    }
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


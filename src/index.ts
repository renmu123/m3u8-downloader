import os from "node:os";
import fs from "fs-extra";
import path from "node:path";
import { exec } from "node:child_process";
import { TypedEmitter } from "tiny-typed-emitter";

import axios from "axios";
import axiosRetry from "axios-retry";
import PQueue from "p-queue";

import type { RawAxiosRequestHeaders } from "axios";

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
  private options: {
    concurrency: number;
    convert2Mp4: boolean;
    mergeSegments: boolean;
    segmentsDir: string;
    ffmpegPath: string;
    retries: number;
    clean: boolean;
    headers: RawAxiosRequestHeaders;
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

    axiosRetry(axios, {
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
      this.totalSegments = tsUrls.length;

      await this.downloadTsSegments(tsUrls);

      if (this.options.mergeSegments) {
        const tsMediaPath = this.mergeTsSegments(this.totalSegments);

        if (this.options.convert2Mp4) {
          this.convertToMp4(tsMediaPath);
        }
      }

      if (!this.isRunning()) {
        this.cleanUpDownloadedFiles();
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
    this.queue.pause();
    this.status = "paused";
    this.emit("paused");
  }

  /**
   * resume download
   */
  public resume() {
    if (this.status !== "paused") return;
    this.status = "running";
    this.queue.start();
    this.emit("resumed");
  }

  /**
   * cancel download
   */
  public cancel() {
    if (["completed", "canceled", "error"].includes(this.status)) return;

    this.status = "canceled";
    this.queue.clear();
    this.emit("canceled");
  }

  /**
   * download M3U8 file
   */
  private async getM3U8(): Promise<string> {
    try {
      const { data: m3u8Content } = await axios.get(this.m3u8Url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
          ...this.options.headers,
        },
      });
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
    const baseUrl = this.m3u8Url.substring(
      0,
      this.m3u8Url.lastIndexOf("/") + 1
    );
    return m3u8Content
      .split("\n")
      .filter(line => line && !line.startsWith("#"))
      .map(line => (line.startsWith("http") ? line : baseUrl + line));
  }

  private async downloadSegment(tsUrl: string, index: number) {
    if (!this.isRunning()) return;

    const response = await axios.get(tsUrl, {
      responseType: "arraybuffer",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        ...this.options.headers,
      },
    });
    const segmentPath = path.resolve(this.segmentsDir, `segment${index}.ts`);
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
  private mergeTsSegments(total: number, deleteSource: boolean = true) {
    if (!this.isRunning()) return;
    let mergedFilePath = path.resolve(this.segmentsDir, "output.ts");

    if (!this.options.convert2Mp4) {
      mergedFilePath = this.output;
    }
    const writeStream = fs.createWriteStream(mergedFilePath);

    for (let index = 0; index < total; index++) {
      if (!this.isRunning()) return;

      const segmentPath = path.resolve(this.segmentsDir, `segment${index}.ts`);
      if (fs.existsSync(segmentPath)) {
        const segmentData = fs.readFileSync(segmentPath);
        writeStream.write(segmentData);
        if (deleteSource) fs.unlinkSync(segmentPath); // 删除临时 TS 片段文件
      } else {
        this.emit("error", `Segment ${index} is missing`);
      }
    }

    writeStream.end();
    return mergedFilePath;
  }
  private async cleanUpDownloadedFiles() {
    if (!this.options.clean) return;
    await Promise.all(
      this.downloadedFiles.map(async file => {
        if (await fs.pathExists(file)) {
          await fs.unlink(file);
        }
      })
    );
    if (this.options.convert2Mp4) {
      let mergedFilePath = path.resolve(this.segmentsDir, "output.ts");
      if (await fs.pathExists(mergedFilePath)) {
        await fs.unlink(mergedFilePath);
      }
    }
  }

  /**
   * convert merged TS file to MP4
   * @param tsMediaPath Path to merged TS file
   */
  private convertToMp4(tsMediaPath: string) {
    if (!this.isRunning()) return;

    const inputFilePath = tsMediaPath;
    const outputFilePath = this.output;

    exec(
      `"${this.options.ffmpegPath}" -i "${inputFilePath}" -c copy "${outputFilePath}"`,
      (error, stdout, stderr) => {
        if (error) {
          this.emit("error", `Failed to convert to MP4: ${stderr}`);
          return;
        }
        fs.unlinkSync(inputFilePath); // remove merged TS file
        this.emit("converted", outputFilePath);
      }
    );
  }

  isRunning() {
    return this.status === "running";
  }
}

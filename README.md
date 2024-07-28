renmu123: 生成一个项目 readme

GitHub Copilot: ## 项目名称

M3U8Downloader

## 项目简介

M3U8Downloader 是一个用于下载和合并 M3U8 视频片段的工具。它支持并发下载、重试机制，并且可以将下载的 TS 片段合并为一个文件，甚至可以转换为 MP4 格式。

## 功能特性

- 并发下载 M3U8 视频片段
- 下载失败自动重试
- 支持暂停和恢复下载
- 支持取消下载并清理已下载的片段
- 合并 TS 片段为一个文件
- 可选将 TS 文件转换为 MP4 格式

## 安装

使用 npm 安装：

```bash
npm install
```

## 使用方法

### 初始化

```typescript
import M3U8Downloader from "./path/to/M3U8Downloader";

const downloader = new M3U8Downloader(
  "https://example.com/path/to/playlist.m3u8",
  "output.mp4",
  {
    concurrency: 5,
    tempDir: "./temp",
    convert2Mp4: true,
    ffmpegPath: "/usr/local/bin/ffmpeg",
    retries: 3,
  }
);
```

### 开始下载

```typescript
downloader.download();
```

### 暂停下载

```typescript
downloader.pause();
```

### 恢复下载

```typescript
downloader.resume();
```

### 取消下载

```typescript
downloader.cancel();
```

## 事件监听

M3U8Downloader 继承自 [`EventEmitter`](command:_github.copilot.openSymbolFromReferences?%5B%7B%22%24mid%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fd%253A%2Fm3u8-downloader%2Fnode_modules%2F.pnpm%2F%2540types%252Bnode%254020.10.0%2Fnode_modules%2F%2540types%2Fnode%2Fevents.d.ts%22%2C%22path%22%3A%22%2FD%3A%2Fm3u8-downloader%2Fnode_modules%2F.pnpm%2F%40types%2Bnode%4020.10.0%2Fnode_modules%2F%40types%2Fnode%2Fevents.d.ts%22%2C%22scheme%22%3A%22file%22%7D%2C%7B%22line%22%3A94%2C%22character%22%3A4%7D%5D "node_modules/.pnpm/@types+node@20.10.0/node_modules/@types/node/events.d.ts")，你可以监听以下事件：

- [`start`](command:_github.copilot.openSymbolFromReferences?%5B%7B%22%24mid%22%3A1%2C%22path%22%3A%22%2FD%3A%2Fm3u8-downloader%2Fnode_modules%2F.pnpm%2Fp-queue%408.0.1%2Fnode_modules%2Fp-queue%2Fdist%2Findex.d.ts%22%2C%22scheme%22%3A%22file%22%7D%2C%7B%22line%22%3A39%2C%22character%22%3A4%7D%5D "node_modules/.pnpm/p-queue@8.0.1/node_modules/p-queue/dist/index.d.ts") - 下载开始
- `progress` - 下载进度
- `segmentDownloaded` - 单个片段下载完成
- `paused` - 下载暂停
- `resumed` - 下载恢复
- `canceled` - 下载取消
- `completed` - 下载完成
- `converted` - 转换完成
- [`error`](command:_github.copilot.openSymbolFromReferences?%5B%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22d%3A%5C%5Cm3u8-downloader%5C%5Csrc%5C%5Cindex.ts%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fd%253A%2Fm3u8-downloader%2Fsrc%2Findex.ts%22%2C%22path%22%3A%22%2Fd%3A%2Fm3u8-downloader%2Fsrc%2Findex.ts%22%2C%22scheme%22%3A%22file%22%7D%2C%7B%22line%22%3A99%2C%22character%22%3A13%7D%5D "src/index.ts") - 发生错误

示例：

```typescript
downloader.on("progress", progress => {
  console.log(`下载进度: ${progress.downloaded}/${progress.total}`);
});

downloader.on("completed", () => {
  console.log("下载完成");
});

downloader.on("error", error => {
  console.error("发生错误:", error);
});
```

## 依赖

- `axios`
- `axios-retry`
- `p-queue`
- `fs-extra`
- `node:os`
- `node:path`
- `node:child_process`
- `node:events`

## 许可证

MIT License

---

通过以上步骤，你可以轻松地使用 M3U8Downloader 下载和处理 M3U8 视频片段。

renmu123: 使用英文生成

GitHub Copilot: ## Project Name

M3U8Downloader

## Project Description

M3U8Downloader is a tool for downloading and merging M3U8 video segments. It supports concurrent downloads, retry mechanisms, and can merge downloaded TS segments into a single file, with an option to convert to MP4 format.

## Features

- Concurrent downloading of M3U8 video segments
- Automatic retry on download failure
- Support for pausing and resuming downloads
- Support for canceling downloads and cleaning up downloaded segments
- Merging TS segments into a single file
- Optional conversion of TS files to MP4 format

## Installation

Install using npm:

```bash
npm install
```

## Usage

### Initialization

```typescript
import M3U8Downloader from "./path/to/M3U8Downloader";

const downloader = new M3U8Downloader(
  "https://example.com/path/to/playlist.m3u8",
  "output.mp4",
  {
    concurrency: 5,
    tempDir: os.tmpdir(),
    convert2Mp4: true,
    ffmpegPath: "/usr/local/bin/ffmpeg",
    retries: 3,
  }
);
```

### Start Download

```typescript
downloader.download();
```

### Pause Download

```typescript
downloader.pause();
```

### Resume Download

```typescript
downloader.resume();
```

### Cancel Download

```typescript
downloader.cancel();
```

## Event Listeners

M3U8Downloader extends from `EventEmitter`, and you can listen to the following events:

- `start` - Download started
- `progress` - Download progress
- `segmentDownloaded` - Single segment downloaded
- `paused` - Download paused
- `resumed` - Download resumed
- `canceled` - Download canceled
- `completed` - Download completed
- `converted` - Conversion completed
- `error` - Error occurred

Example:

```typescript
downloader.on("progress", progress => {
  console.log(`Download progress: ${progress.downloaded}/${progress.total}`);
});

downloader.on("completed", () => {
  console.log("Download completed");
});

downloader.on("error", error => {
  console.error("Error occurred:", error);
});
```

## Dependencies

- `axios`
- `axios-retry`
- `p-queue`
- `fs-extra`
- `m3u8-parser`
- `node:os`
- `node:path`
- `node:child_process`
- `node:events`

## License

MIT License

---

With these steps, you can easily use M3U8Downloader to download and process M3U8 video segments.

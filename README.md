# M3U8Downloader

M3U8Downloader is a tool for downloading and merging M3U8 video segments. It supports concurrent downloads, retry mechanisms, and can merge downloaded TS segments into a single file, with an option to convert to MP4 format.

<p >
  <a href="https://codecov.io/github/renmu123/m3u8-downloader" ><img src="https://codecov.io/github/renmu123/m3u8-downloader/graph/badge.svg?token=08MBSCPIMF"/></a>
</p>

## Features

- Concurrent downloading of M3U8 video segments
- Automatic retry on download failure
- Support for stop, resume, cancel function
- Merging TS segments into a single file
- Optional conversion of TS files to MP4 format

## Installation

Install using npm:

```bash
npm install @renmu/m3u8-downloader
```

## Usage

### Initialization

```typescript
import M3U8Downloader from "@renmu/m3u8-downloader";

// download ts segments and convert to single ts file
const downloader = new M3U8Downloader(
  "https://example.com/path/to/playlist.m3u8",
  "/path/output.ts", // ts ext
  {
    convert2Mp4: false,
  }
);

// download ts segments and convert to single mp4 file
const downloader = new M3U8Downloader(
  "https://example.com/path/to/playlist.m3u8",
  "/path/output.mp4", // mp4 ext
  {
    convert2Mp4: true,
    ffmpegPath: "/usr/local/bin/ffmpeg",
  }
);

// download ts segments
const downloader = new M3U8Downloader(
  "https://example.com/path/to/playlist.m3u8",
  "anything",
  {
    mergeSegments: false,
    segmentsDir: outputDir, // the directory to store downloaded segments
  }
);
```

### Options

```js
/**
 * @param m3u8Url M3U8 URL
 * @param options
 * @param options.concurrency Number of segments to download concurrently
 * @param options.segmentsDir directory to store downloaded segments,default: system temp dir
 * @param options.mergeSegments Whether to merge downloaded segments into a single file
 * @param options.convert2Mp4 Whether to convert2Mp4 downloaded segments into a single file, you must open mergeSegments
 * @param options.ffmpegPath Path to ffmpeg binary if you open convert2Mp4
 * @param options.retries Number of retries for downloading segments
 * @param options.clean Whether to clean up downloaded segments after download is error or canceled
 * @param options.headers Axios headers to be sent with the HTTP request
 * */
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

## License

MIT License

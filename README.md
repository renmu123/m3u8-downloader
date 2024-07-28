## Project Name

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
  "output.mp4", // mp4 ext
  {
    convert2Mp4: true,
    ffmpegPath: "/usr/local/bin/ffmpeg",
  }
);

// no convert
const downloader = new M3U8Downloader(
  "https://example.com/path/to/playlist.m3u8",
  "output.ts", // ts ext
  {
    convert2Mp4: false,
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

## License

MIT License

---

With these steps, you can easily use M3U8Downloader to download and process M3U8 video segments.

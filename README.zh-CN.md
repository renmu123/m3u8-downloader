<p><a href="README.md">English</a> | 中文</p>


# 📥 M3U8Downloader

`M3U8Downloader` 是一个用于下载并合并 **M3U8 视频分片**的工具。
支持 **并发下载、失败重试、暂停/恢复/取消**，并可将 TS 分片合并为单一文件，支持可选 **MP4 转换**（依赖 `ffmpeg`）。

<p>
  <a href="https://codecov.io/github/renmu123/m3u8-downloader" ><img src="https://codecov.io/github/renmu123/m3u8-downloader/graph/badge.svg?token=08MBSCPIMF"/></a>
</p>


## ✨ 功能特性

* 🚀 **并发下载** M3U8 分片
* 🔄 **自动重试** 下载失败的分片
* ⏸️ **暂停 / 恢复 / 取消下载**
* 📦 **合并 TS 分片**为单一文件
* 🎞️ **可选 MP4 转换**（需安装 `ffmpeg`）


## 📦 安装

```bash
npm install @renmu/m3u8-downloader
```


## 🚀 使用示例

```ts
import M3U8Downloader from "@renmu/m3u8-downloader";

// 下载分片并合并为单一 TS 文件
const downloader = new M3U8Downloader(
  "https://example.com/path/to/playlist.m3u8",
  "/path/output.ts",
  { convert2Mp4: false }
);

// 下载分片并合并为 MP4 文件
const downloader = new M3U8Downloader(
  "https://example.com/path/to/playlist.m3u8",
  "/path/output.mp4",
  {
    convert2Mp4: true,
    ffmpegPath: "/usr/local/bin/ffmpeg",
  }
);

// 仅下载分片，不进行合并
const downloader = new M3U8Downloader(
  "https://example.com/path/to/playlist.m3u8",
  "anything",
  {
    mergeSegments: false,
    segmentsDir: "./output", // 指定分片保存目录
  }
);
```


## ⚙️ 配置参数(options)

```
M3U8Downloader(m3u8Url, output, options)
```

| 参数                          | 类型                       | 默认值        | 说明                                     |
| --------------------------- | ------------------------ | ---------- | -------------------------------------- |
| `m3u8Url`                   | `string`                 | -          | M3U8 文件地址                              |
| `output`                    | `string`                 | -          | 输出文件路径（TS 或 MP4）                       |
| `options.concurrency`       | `number`                 | `5`        | 并发下载的分片数                               |
| `options.segmentsDir`       | `string`                 | 系统临时目录     | 分片存放目录                                 |
| `options.mergeSegments`     | `boolean`                | `true`     | 是否合并分片                                 |
| `options.convert2Mp4`       | `boolean`                | `false`    | 是否转为 MP4（需开启 `mergeSegments`）          |
| `options.ffmpegPath`        | `string`                 | `"ffmpeg"` | ffmpeg 执行路径                            |
| `options.retries`           | `number`                 | `3`        | 下载失败的重试次数                              |
| `options.clean`             | `boolean`                | `true`     | 下载失败/取消时清理分片                           |
| `options.headers`           | `object`                 | `{}`       | 自定义 HTTP 请求头                           |
| `options.proxy`             | `object \| false`        | `false`    | Axios 代理配置                             |
| └ `host`                    | `string`                 | -          | 代理服务器地址                                |
| └ `port`                    | `number`                 | -          | 代理端口                                   |
| └ `protocol`                | `string`                 | 可选         | 协议，如 `"http"` / `"https"` / `"socks5"` |
| └ `auth`                    | `{ username, password }` | 可选         | 认证信息                                   |
| `options.startIndex`        | `number`                 | `0`        | 下载起始分片索引                               |
| `options.endIndex`          | `number`                 | 末尾         | 下载结束分片索引                               |
| `options.skipExistSegments` | `boolean`                | `false`    | 是否跳过已存在的分片                             |
| `options.suffix`            | `string`                 | `"ts"`     | 分片文件后缀名                                |


## ▶️ 方法

```ts
downloader.download(); // 开始下载
downloader.pause();    // 暂停下载
downloader.resume();   // 恢复下载
downloader.cancel();   // 取消下载
```

## 📡 事件监听

`M3U8Downloader` 继承自 `EventEmitter`，支持以下事件：

| 事件名         | 说明    | 回调参数                                                            |
| ----------- | ----- | --------------------------------------------------------------- |
| `start`     | 下载开始  | -                                                               |
| `progress`  | 下载进度  | `{ downloadedFile: string, downloaded: number, total: number }` |
| `paused`    | 下载已暂停 | -                                                               |
| `resumed`   | 下载已恢复 | -                                                               |
| `canceled`  | 下载已取消 | -                                                               |
| `completed` | 下载完成  | -                                                               |
| `converted` | 转换完成  | `string` (MP4 文件路径)                                             |
| `error`     | 下载出错  | `Error`                                                         |

示例：

```ts
downloader.on("progress", p => {
  console.log(`进度: ${p.downloaded}/${p.total} -> ${p.downloadedFile}`);
});

downloader.on("completed", () => {
  console.log("下载完成 ✅");
});

downloader.on("error", err => {
  console.error("下载出错:", err);
});
```

## ❓ 常见问题 (FAQ)

### 1. `ffmpeg not found` 或 `Error: spawn ffmpeg ENOENT`

* 说明：未安装或未正确配置 `ffmpeg`。
* 解决办法：

  * 确认系统已安装 [ffmpeg](https://ffmpeg.org/download.html)
  * 将 `ffmpeg` 加入到环境变量 `PATH`，或在 `options.ffmpegPath` 中指定完整路径：

    ```ts
    new M3U8Downloader(url, "output.mp4", { convert2Mp4: true, ffmpegPath: "/usr/local/bin/ffmpeg" });
    ```

### 2. 下载速度很慢？

* 可能原因：

  * M3U8 分片本身带宽受限
  * 网络延迟或被限速
* 优化建议：

  * 调高 `options.concurrency`（默认 `5`）来增加并发数
  * 使用代理加速：

    ```ts
    new M3U8Downloader(url, "output.ts", {
      proxy: { host: "127.0.0.1", port: 7890, protocol: "http" }
    });
    ```


### 3. 如何只下载部分分片（断点续传）？

* 使用 `startIndex` 和 `endIndex` 控制分片区间：

  ```ts
  new M3U8Downloader(url, "output.ts", { startIndex: 100, endIndex: 200 });
  ```
* 已下载过的分片可以通过 `skipExistSegments: true` 跳过，无需重复下载。


### 4. 下载中途失败了，如何处理？

* 工具内置自动重试（默认 `3` 次），可通过 `options.retries` 修改。
* 如果仍失败：

  * 检查网络或源地址是否可用
  * 调整并发数（过高可能被服务器限流）
  * 使用代理绕过地区限制


### 5. 下载完成后分片文件还在，怎么自动清理？

* 默认会在 **下载出错或取消**时清理分片（`clean: true`）。
* 如果希望下载完成后也清理：

  * 可以在 `completed` 事件里手动删除 `segmentsDir` 目录。


## 📑 License

MIT License


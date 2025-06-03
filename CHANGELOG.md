# 0.4.0

1. add `startIndex` and `endIndex` param
2. add `skipExistSegments` param
3. add `suffix` param
4. fix: use spawn replace exec

# 0.3.1

1. fix: If file has existed, the ffmpeg convert task will not be finished

# 0.3.0

1. fix: Optimize performance for merging TS segments
2. chore: update download segment name from `segment1.ts` to `segment00001.ts`

# 0.2.1

1. fix: await convertToMp4 and cleanUpDownloadedFiles in M3U8Downloader
2. chore: Fix bug in M3U8Downloader when segments are missing

# 0.2.0

1. add unit test
2. add mergeSegments option
3. add clean option
4. add headers option
5. set default userAgent as "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
6. fix some bugs

## Breaking Change

1. remove `segmentDownloaded` event
2. change `tempDir` options to `segmentsDir`

# 0.1.0

init

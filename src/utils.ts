export function isUrl(uri: string): boolean {
  return /^https?:\/\//.test(uri);
}

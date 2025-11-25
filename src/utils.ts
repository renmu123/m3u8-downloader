export function isUrl(uri: string): boolean {
  return /^https?:\/\//.test(uri);
}

/**
 * Retry a synchronous function with delay between retries
 * @param fn Function to retry
 * @param retries Number of retries
 * @param delay Delay in milliseconds between retries
 * @returns Promise that resolves when function succeeds or rejects after all retries fail
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) {
      throw err;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay);
  }
}

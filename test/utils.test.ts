import { isUrl } from "../src/utils.js";
import { expect, describe, it } from "vitest";

describe("isUrl", () => {
  it("should return true for valid HTTP URL", () => {
    const url = "http://example.com";
    expect(isUrl(url)).toBe(true);
  });

  it("should return true for valid HTTPS URL", () => {
    const url = "https://example.com";
    expect(isUrl(url)).toBe(true);
  });

  it("should return false for invalid URL", () => {
    const url = "example.com";
    expect(isUrl(url)).toBe(false);
  });

  it("should return false for non-HTTP/HTTPS URL", () => {
    const url = "ftp://example.com";
    expect(isUrl(url)).toBe(false);
  });
});

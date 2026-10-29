/** Validate byte signatures, not just the caller's filename/MIME claim. */
export function decodeMedia(base64: string, mimeType: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw Object.assign(new Error("The uploaded file is not valid base64."), { statusCode: 400 });
  }
  const bytes = Buffer.from(base64, "base64");
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const valid = mimeType === "image/png" ? starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    : mimeType === "image/jpeg" ? starts(0xff, 0xd8, 0xff)
      : mimeType === "image/webp" ? bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
        : mimeType === "audio/wav" ? bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE"
          : mimeType === "audio/mp4" || mimeType === "audio/m4a" ? bytes.toString("ascii", 4, 8) === "ftyp"
            : mimeType === "audio/webm" ? starts(0x1a, 0x45, 0xdf, 0xa3)
              : mimeType === "audio/mpeg" ? bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
                : false;
  if (!valid) throw Object.assign(new Error("The file contents do not match a supported audio or image format."), { statusCode: 400 });
  return bytes;
}

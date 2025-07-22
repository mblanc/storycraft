"use server";

import { uploadCustomImage } from "./upload-custom-image";

export async function uploadCustomStyle(
  base64: string,
  filename: string,
  sessionId: string
): Promise<string | null> {
  // Use the generalized upload function with 'custom-styles' subfolder
  return uploadCustomImage(base64, filename, sessionId, "custom-styles");
}

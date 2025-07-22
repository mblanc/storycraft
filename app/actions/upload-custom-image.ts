"use server";

import { uploadImage } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";

export async function uploadCustomImage(
  base64: string,
  filename: string,
  sessionId: string,
  subfolder: "custom-styles" | "character-images" = "custom-styles"
): Promise<string | null> {
  try {
    // Generate unique filename with session folder
    const uuid = uuidv4();
    const extension = filename.split(".").pop() || "png";
    const gcsPath = `${sessionId}/${subfolder}/${uuid}.${extension}`;

    // Upload to GCS
    const gcsUri = await uploadImage(base64, gcsPath);

    if (!gcsUri) {
      throw new Error("Failed to upload image to GCS");
    }

    console.log(`Custom image uploaded to ${subfolder}: ${gcsUri}`);
    return gcsUri;
  } catch (error) {
    console.error("Error uploading custom image:", error);
    return null;
  }
}

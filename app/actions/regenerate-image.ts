"use server";

import { generateImageRest } from "@/lib/imagen";

export async function regenerateImage(prompt: string, style?: string) {
  try {
    // Apply style prefix if provided, matching the pattern used in generate-scenes.ts
    const styledPrompt = style ? `${style}: ${prompt}` : prompt;
    console.log("Regenerating image with styled prompt:", styledPrompt);

    const resultJson = await generateImageRest(styledPrompt);
    if (resultJson.predictions[0].raiFilteredReason) {
      throw new Error(resultJson.predictions[0].raiFilteredReason);
    } else {
      console.log("Generated image:", resultJson.predictions[0].gcsUri);
      return { imageGcsUri: resultJson.predictions[0].gcsUri };
    }
  } catch (error) {
    console.error("Error generating image:", error);
    return { imageGcsUri: undefined };
  }
}

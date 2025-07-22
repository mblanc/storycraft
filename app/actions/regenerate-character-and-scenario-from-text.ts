"use server";

import { generateText } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { z } from "zod";
import { generateImageRest } from "@/lib/imagen";

// Zod schema for the scenario update response
const ScenarioUpdateSchema = z.object({
  updatedScenario: z.string(),
});

async function getVertexClient() {
  try {
    const client = createVertex({
      project: process.env.PROJECT_ID,
      location: process.env.LOCATION,
    });
    return client;
  } catch (e) {
    console.error("Error creating Vertex client:", e);
    throw new Error("Could not create Vertex client.");
  }
}

export async function regenerateCharacterAndScenarioFromText(
  currentScenario: string,
  oldCharacterName: string,
  newCharacterName: string,
  newCharacterDescription: string,
  style: string
): Promise<{
  updatedScenario: string;
  newImageGcsUri: string;
}> {
  const vertex = await getVertexClient();

  try {
    // Step 1: Generate new character image
    const imageResult = await generateImageRest(
      `${style}: ${newCharacterDescription}`,
      "1:1"
    );

    if (imageResult.predictions[0].raiFilteredReason) {
      throw new Error(
        `Image generation failed: ${imageResult.predictions[0].raiFilteredReason}`
      );
    }

    const newImageGcsUri = imageResult.predictions[0].gcsUri;

    // Step 2: Update scenario text to reflect character changes
    const { text } = await generateText({
      model: vertex(process.env.LLM_MODEL || "gemini-2.5-pro"),
      prompt: `Update the following scenario to reflect character changes. The character previously named "${oldCharacterName}" is now named "${newCharacterName}" with the following updated description: "${newCharacterDescription}".

CURRENT SCENARIO:
"${currentScenario}"

INSTRUCTIONS:
1. Replace all references to "${oldCharacterName}" with "${newCharacterName}" (if the name changed)
2. Update any character descriptions in the scenario to match the new character description
3. Ensure the story flow and narrative remain coherent
4. Maintain the same tone and style as the original scenario
5. Keep the scenario length similar to the original

Return ONLY the updated scenario text, no additional formatting or explanations.`,
    });

    return {
      updatedScenario: text.trim(),
      newImageGcsUri,
    };
  } catch (error) {
    console.error("Error in regenerateCharacterAndScenarioFromText:", error);
    throw new Error(
      `Failed to regenerate character and scenario: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

"use server";

import { generateText } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";

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

export async function regenerateScenarioFromSetting(
  currentScenario: string,
  oldSettingName: string,
  newSettingName: string,
  newSettingDescription: string
): Promise<{
  updatedScenario: string;
}> {
  const vertex = await getVertexClient();

  try {
    // Update scenario text to reflect setting changes
    const { text } = await generateText({
      model: vertex(process.env.LLM_MODEL || "gemini-2.5-pro"),
      prompt: `Update the following scenario to reflect setting changes. The setting previously named "${oldSettingName}" is now named "${newSettingName}" with the following updated description: "${newSettingDescription}".

CURRENT SCENARIO:
"${currentScenario}"

INSTRUCTIONS:
1. Replace all references to "${oldSettingName}" with "${newSettingName}" (if the name changed)
2. Update any setting descriptions in the scenario to match the new setting description
3. Ensure the story flow and narrative remain coherent with the new setting
4. Maintain the same tone and style as the original scenario
5. Keep the scenario length similar to the original

Return ONLY the updated scenario text, no additional formatting or explanations.`,
    });

    return {
      updatedScenario: text.trim(),
    };
  } catch (error) {
    console.error("Error in regenerateScenarioFromSetting:", error);
    throw new Error(
      `Failed to regenerate scenario: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

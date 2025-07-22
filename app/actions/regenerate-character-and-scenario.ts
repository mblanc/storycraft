"use server";

import { generateObject } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { z } from "zod";

// Zod schema for the response structure
const CharacterScenarioUpdateSchema = z.object({
  updatedScenario: z.string(),
  updatedCharacter: z.object({
    name: z.string(),
    description: z.string(),
  }),
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

export async function regenerateCharacterAndScenario(
  currentScenario: string,
  characterName: string,
  currentCharacterDescription: string,
  imageBase64: string,
  allCharacters: Array<{
    name: string;
    description: string;
    imageGcsUri?: string;
  }>
): Promise<{
  updatedScenario: string;
  updatedCharacter: {
    name: string;
    description: string;
  };
}> {
  const vertex = await getVertexClient();

  try {
    // Create the character list for the prompt
    const characterListText = allCharacters
      .map((char) => `- ${char.name}: ${char.description}`)
      .join("\n");

    const { object } = await generateObject({
      model: vertex(process.env.LLM_MODEL || "gemini-2.5-pro"),
      schema: CharacterScenarioUpdateSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze the provided image and update both the character description and scenario text to match the visual characteristics shown.

CURRENT SCENARIO:
"${currentScenario}"

ALL CHARACTERS IN THE STORY:
${characterListText}

CHARACTER TO UPDATE (${characterName}):
"${currentCharacterDescription}"

INSTRUCTIONS:
1. Examine the uploaded image carefully
2. Update ONLY the description of ${characterName} to accurately reflect what you see in the image (appearance, clothing, features, etc.)
3. Update any references to ${characterName} in the scenario text to maintain consistency with the new appearance
4. PRESERVE ALL OTHER CHARACTERS - do not remove or modify descriptions of other characters
5. Keep the story as a multi-character narrative - maintain all character interactions and plot elements
6. Preserve the story narrative and flow, but ensure all descriptions of ${characterName} match the visual characteristics
7. Keep the same tone and style as the original text

Return both the updated scenario (maintaining all characters) and the updated description for ${characterName}.`,
            },
            {
              type: "image",
              image: imageBase64,
            },
          ],
        },
      ],
    });

    return object;
  } catch (error) {
    console.error("Error in regenerateCharacterAndScenario:", error);
    throw new Error(
      `Failed to regenerate character and scenario: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

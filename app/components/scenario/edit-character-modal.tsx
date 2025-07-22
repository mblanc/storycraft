"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GcsImage } from "../ui/gcs-image";
import { regenerateCharacterAndScenarioFromText } from "@/app/actions/regenerate-character-and-scenario-from-text";
import { ProgressIndicator } from "../ui/progress-indicator";

interface Character {
  id: string;
  name: string;
  description: string;
  imageGcsUri?: string;
}

interface EditCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  character: Character;
  currentScenario: string;
  style: string;
  onUpdate: (updatedScenario: string, updatedCharacter: Character) => void;
}

export function EditCharacterModal({
  isOpen,
  onClose,
  character,
  currentScenario,
  style,
  onUpdate,
}: EditCharacterModalProps) {
  const [editedCharacter, setEditedCharacter] = useState(character);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setEditedCharacter(character);
  }, [character]);

  const handleSave = async () => {
    // Check if we need to regenerate
    const nameChanged = character.name !== editedCharacter.name;
    const descriptionChanged =
      character.description !== editedCharacter.description;

    if (!nameChanged && !descriptionChanged) {
      onClose();
      return;
    }

    setIsProcessing(true);
    setIsRegenerating(true);

    try {
      // Regenerate character image and update scenario
      const result = await regenerateCharacterAndScenarioFromText(
        currentScenario,
        character.name,
        editedCharacter.name,
        editedCharacter.description,
        style
      );

      // Update character with new image
      const updatedCharacter = {
        ...editedCharacter,
        imageGcsUri: result.newImageGcsUri,
      };

      // Call parent update with new scenario and character
      onUpdate(result.updatedScenario, updatedCharacter);
      onClose();
    } catch (error) {
      console.error("Error updating character:", error);
    } finally {
      setIsProcessing(false);
      setIsRegenerating(false);
    }
  };

  const handleCancel = () => {
    setEditedCharacter(character); // Reset changes
    setIsProcessing(false);
    setIsRegenerating(false);
    onClose();
  };

  const isWorking = isProcessing || isRegenerating;

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Character</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-4 py-4">
            {/* Character Image */}
            <div className="flex justify-center">
              <div className="w-48 h-48 relative">
                <GcsImage
                  gcsUri={character.imageGcsUri || null}
                  alt={`Character ${character.name}`}
                  className="object-cover rounded-lg shadow-md"
                  sizes="200px"
                />
              </div>
            </div>

            {/* Character Name */}
            <div className="grid gap-2">
              <label htmlFor="characterName" className="text-sm font-medium">
                Character Name
              </label>
              <Input
                id="characterName"
                value={editedCharacter.name}
                onChange={(e) =>
                  setEditedCharacter({
                    ...editedCharacter,
                    name: e.target.value,
                  })
                }
                placeholder="Enter character name..."
              />
            </div>

            {/* Character Description */}
            <div className="grid gap-2">
              <label
                htmlFor="characterDescription"
                className="text-sm font-medium"
              >
                Character Description
              </label>
              <Textarea
                id="characterDescription"
                value={editedCharacter.description}
                onChange={(e) =>
                  setEditedCharacter({
                    ...editedCharacter,
                    description: e.target.value,
                  })
                }
                placeholder="Describe the character's appearance, personality, etc..."
                rows={6}
              />
            </div>

            <ProgressIndicator
              isVisible={isWorking}
              message={
                isRegenerating
                  ? "🤖 Generating new image and updating scenario..."
                  : "🔄 Processing changes..."
              }
              progress={isRegenerating ? 100 : 50}
            />
          </div>
        </div>
        <div className="flex justify-end space-x-2 pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={handleCancel} disabled={isWorking}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isWorking}>
            {isWorking ? "Processing..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

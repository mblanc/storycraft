"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { CustomImageUpload } from "../ui/custom-image-upload";
import { uploadCustomImage } from "@/app/actions/upload-custom-image";
import { regenerateCharacterAndScenario } from "@/app/actions/regenerate-character-and-scenario";
import { ProgressIndicator } from "../ui/progress-indicator";

interface CustomCharacterImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageUpload: (imageGcsUri: string) => Promise<void>;
  onCharacterAndScenarioUpdate: (
    updatedScenario: string,
    updatedCharacter: { name: string; description: string },
    imageGcsUri: string
  ) => Promise<void>;
  characterName: string;
  characterDescription: string;
  currentScenario: string;
  allCharacters: Array<{
    name: string;
    description: string;
    imageGcsUri?: string;
  }>;
  sessionId: string;
}

export function CustomCharacterImageModal({
  isOpen,
  onClose,
  onImageUpload,
  onCharacterAndScenarioUpdate,
  characterName,
  characterDescription,
  currentScenario,
  allCharacters,
  sessionId,
}: CustomCharacterImageModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = async (base64Data: string, filename: string) => {
    setIsUploading(true);
    setError(null);

    try {
      // Step 1: Upload image to GCS
      const gcsUri = await uploadCustomImage(
        base64Data,
        filename,
        sessionId,
        "character-images"
      );

      if (!gcsUri) {
        throw new Error("Failed to upload image");
      }

      // Call the parent's upload handler to update image state
      await onImageUpload(gcsUri);

      // Step 2: Regenerate character and scenario descriptions
      setIsUploading(false);
      setIsRegenerating(true);

      const result = await regenerateCharacterAndScenario(
        currentScenario,
        characterName,
        characterDescription,
        base64Data,
        allCharacters
      );

      // Step 3: Update parent state with new descriptions
      await onCharacterAndScenarioUpdate(
        result.updatedScenario,
        result.updatedCharacter,
        gcsUri
      );

      // Close modal on success
      handleClose();
    } catch (error) {
      console.error("Error in upload/regeneration process:", error);
      setError(
        error instanceof Error ? error.message : "Failed to process image"
      );
    } finally {
      setIsUploading(false);
      setIsRegenerating(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setIsUploading(false);
    setIsRegenerating(false);
    onClose();
  };

  const isProcessing = isUploading || isRegenerating;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Custom Image</DialogTitle>
          <DialogDescription>
            Upload a custom image for {characterName}. This will update the
            character description and scenario to match the new appearance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Character Image *</label>
            <CustomImageUpload
              onImageUpload={handleImageUpload}
              isUploading={isProcessing}
              error={error}
              acceptedTypes="image/*"
              maxSizeMB={10}
              previewSize="w-48"
            />
          </div>

          <ProgressIndicator
            isVisible={isProcessing}
            message={
              isUploading
                ? "📤 Uploading image..."
                : "🤖 Analyzing image and updating descriptions..."
            }
            progress={isUploading ? 50 : 100}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

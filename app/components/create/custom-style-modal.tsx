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
import { uploadCustomStyle } from "../../actions/upload-custom-style";
import { CustomImageUpload } from "../ui/custom-image-upload";
import { CustomMetadata, type MetadataField } from "../ui/custom-metadata";

interface CustomStyleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStyleAdd: (style: { name: string; image: string }) => void;
  sessionId: string;
}

export function CustomStyleModal({
  isOpen,
  onClose,
  onStyleAdd,
  sessionId,
}: CustomStyleModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadataValues, setMetadataValues] = useState<Record<string, string>>(
    {}
  );

  const metadataFields: MetadataField[] = [
    {
      name: "styleName",
      label: "Style Name",
      placeholder: "e.g., Watercolor, Oil Painting, Sketch",
      required: true,
      type: "text",
    },
  ];

  const handleImageUpload = async (base64Data: string, filename: string) => {
    const styleName = metadataValues.styleName?.trim();

    if (!styleName) {
      setError("Please provide a style name");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Upload to GCS
      const gcsUri = await uploadCustomStyle(base64Data, filename, sessionId);

      if (!gcsUri) {
        throw new Error("Failed to upload image");
      }

      // Add the new style
      onStyleAdd({
        name: styleName,
        image: gcsUri,
      });

      // Reset form and close modal
      handleClose();
    } catch (error) {
      console.error("Error uploading custom style:", error);
      setError(
        error instanceof Error ? error.message : "Failed to upload image"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setMetadataValues({});
    setError(null);
    setIsUploading(false);
    onClose();
  };

  const handleMetadataChange = (fieldName: string, value: string) => {
    setMetadataValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Style</DialogTitle>
          <DialogDescription>
            Upload a reference image and give your custom style a name. This
            will be used to generate images in your chosen style.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Style Name Input */}
          <CustomMetadata
            fields={metadataFields}
            values={metadataValues}
            onChange={handleMetadataChange}
            disabled={isUploading}
          />

          {/* File Upload Area */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Reference Image *</label>
            <CustomImageUpload
              onImageUpload={handleImageUpload}
              isUploading={isUploading}
              error={error}
              acceptedTypes="image/*"
              maxSizeMB={10}
              previewSize="w-32"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

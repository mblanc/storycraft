"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

interface CustomImageUploadProps {
  onImageUpload: (base64Data: string, filename: string) => Promise<void>;
  isUploading: boolean;
  error: string | null;
  acceptedTypes?: string;
  maxSizeMB?: number;
  previewSize?: string;
}

export function CustomImageUpload({
  onImageUpload,
  isUploading,
  error,
  acceptedTypes = "image/*",
  maxSizeMB = 10,
  previewSize = "w-32",
}: CustomImageUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        return; // Let parent handle error display
      }

      // Validate file size
      if (file.size > maxSizeMB * 1024 * 1024) {
        return; // Let parent handle error display
      }

      setSelectedFile(file);

      // Create preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64String = e.target?.result as string;
        const base64Data = base64String.split(",")[1]; // Remove data URL prefix
        await onImageUpload(base64Data, selectedFile.name);
        handleReset();
      };
      reader.onerror = () => {
        throw new Error("Failed to read image file");
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      console.error("Error in handleUpload:", error);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = () => {
    handleReset();
  };

  return (
    <div className="space-y-4">
      {!previewUrl ? (
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">Click to upload an image</p>
          <p className="text-xs text-gray-500 mt-1">
            PNG, JPG up to {maxSizeMB}MB
          </p>
        </div>
      ) : (
        <div className={`relative aspect-square ${previewSize} mx-auto`}>
          <Image
            src={previewUrl}
            alt="Image preview"
            fill
            className="rounded-lg object-cover"
            sizes="128px"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6"
            onClick={handleRemoveImage}
            disabled={isUploading}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes}
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      {selectedFile && (
        <div className="flex justify-center">
          <Button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload Image"
            )}
          </Button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
    </div>
  );
}

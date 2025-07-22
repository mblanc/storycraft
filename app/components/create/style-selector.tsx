"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { GcsImage } from "../ui/gcs-image";
import { type Style } from "@/lib/projectStorage";

interface StyleSelectorProps {
  styles: Style[];
  customStyles: Style[];
  onSelect: (style: string) => void;
  onAddCustomStyle: () => void;
  onRemoveCustomStyle: (styleName: string) => void;
  selectedStyle?: string;
}

export function StyleSelector({
  styles,
  customStyles,
  onSelect,
  onAddCustomStyle,
  onRemoveCustomStyle,
  selectedStyle,
}: StyleSelectorProps) {
  const allStyles = [...styles, ...customStyles];

  const handleSelect = (style: Style) => {
    onSelect(style.name);
  };

  const handleRemoveCustomStyle = (e: React.MouseEvent, styleName: string) => {
    e.stopPropagation();
    if (confirm(`Remove "${styleName}" style?`)) {
      onRemoveCustomStyle(styleName);
    }
  };

  const isCustomStyle = (styleName: string) => {
    return customStyles.some((style) => style.name === styleName);
  };

  const isGcsUri = (image: string) => {
    return image.startsWith("gs://");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Choose a Style:</label>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddCustomStyle}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Custom Style
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {allStyles.map((style) => (
          <div
            key={style.name}
            onClick={() => handleSelect(style)}
            className={`relative aspect-square rounded-lg overflow-hidden transition-all duration-200 group cursor-pointer ${
              selectedStyle === style.name
                ? "ring-4 ring-primary ring-offset-2"
                : "hover:ring-2 hover:ring-primary/50"
            }`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelect(style);
              }
            }}
          >
            {isGcsUri(style.image) ? (
              <GcsImage
                gcsUri={style.image}
                alt={style.name}
                className="rounded-lg object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            ) : (
              <Image
                src={style.image || "/placeholder.svg"}
                alt={style.name}
                fill
                className="rounded-lg object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            )}

            <div className="absolute inset-0 bg-black bg-opacity-40 flex items-end justify-center p-2">
              <span className="text-white text-sm font-medium">
                {style.name}
              </span>
            </div>

            {/* Remove button for custom styles */}
            {isCustomStyle(style.name) && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleRemoveCustomStyle(e, style.name)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Upload, Loader2, X } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    uploadStyleImageToGCS,
    getSignedUrlAction,
} from "@/app/features/shared/actions/storageActions";
import { analyzeStyleImageAction } from "@/app/features/create/actions/analyze-style";
import { useEffect } from "react";
import { toast } from "sonner";

export interface Style {
    name: string;
    image: string;
}

interface StyleSelectorProps {
    styles: Style[];
    onSelect: (style: string) => void;
    styleImageUri: string | null;
    onStyleImageUpload: (uri: string | null) => void;
    currentStyle: string;
}

export function StyleSelector({
    styles,
    onSelect,
    styleImageUri,
    onStyleImageUpload,
    currentStyle,
}: StyleSelectorProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [customStyleText, setCustomStyleText] = useState(() => {
        const isPreset = styles.some((s) => s.name === currentStyle);
        if (!isPreset && currentStyle && currentStyle !== "Custom Style") {
            return currentStyle;
        }
        return "";
    });
    const [prevCurrentStyle, setPrevCurrentStyle] = useState(currentStyle);
    const [isUploading, setIsUploading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    if (prevCurrentStyle !== currentStyle) {
        setPrevCurrentStyle(currentStyle);
        const isPreset = styles.some((s) => s.name === currentStyle);
        if (isPreset) {
            setCustomStyleText("");
        } else if (currentStyle && currentStyle !== "Custom Style") {
            setCustomStyleText(currentStyle);
        }
    }

    useEffect(() => {
        const resolveUrl = async () => {
            if (styleImageUri) {
                const url = await getSignedUrlAction(styleImageUri);
                setPreviewUrl(url);
            } else {
                setPreviewUrl(null);
                // Reset custom text if image is cleared
                setCustomStyleText("");
            }
        };
        resolveUrl();
    }, [styleImageUri]);

    const handleSelect = (style: Style) => {
        onSelect(style.name);
        onStyleImageUpload(null); // Clear custom image if preset selected
    };

    const handleCustomStyleToggle = () => {
        setIsDialogOpen(true);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                const gcsUri = await uploadStyleImageToGCS(base64, file.name);
                if (gcsUri) {
                    onStyleImageUpload(gcsUri);

                    // Start analysis
                    setIsAnalyzing(true);
                    try {
                        const result = await analyzeStyleImageAction(gcsUri);
                        if (result.success && result.description) {
                            setCustomStyleText(result.description);
                            toast.success("Style analysis complete");
                        } else {
                            toast.error(
                                result.error || "Failed to analyze style",
                            );
                        }
                    } catch (err) {
                        toast.error("Failed to analyze style");
                        console.error("Analysis error:", err);
                    } finally {
                        setIsAnalyzing(false);
                    }
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            toast.error("Error uploading style image");
            console.error("Error uploading style image:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleApplyCustomStyle = () => {
        onSelect(customStyleText || "Custom Style");
        setIsDialogOpen(false);
    };

    const isCustomSelected =
        currentStyle !== "" &&
        !styles.some((s) => s.name === currentStyle) &&
        (customStyleText !== "" || styleImageUri !== null);

    return (
        <div className="grid grid-cols-4 gap-3 md:grid-cols-6 lg:grid-cols-8">
            {styles.map((style) => (
                <button
                    key={style.name}
                    onClick={() => handleSelect(style)}
                    className={`relative aspect-square w-full overflow-hidden rounded-lg transition-all duration-200 ${
                        currentStyle === style.name
                            ? "ring-2 ring-[#0EA5E9] ring-offset-1"
                            : "hover:ring-1 hover:ring-[#0EA5E9]/50"
                    }`}
                >
                    <Image
                        src={style.image || "/placeholder.svg"}
                        alt={style.name}
                        fill
                        className="rounded-lg object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-1">
                        <span className="text-[10px] font-medium text-white">
                            {style.name}
                        </span>
                    </div>
                </button>
            ))}

            {/* Custom Style Box */}
            <button
                onClick={handleCustomStyleToggle}
                className={`group relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-all duration-200 ${
                    isCustomSelected
                        ? "border-[#0EA5E9] bg-[#0EA5E9]/5 ring-2 ring-[#0EA5E9] ring-offset-1"
                        : "border-border hover:border-[#0EA5E9]/50 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
            >
                {styleImageUri ? (
                    <div className="relative h-full w-full">
                        {previewUrl ? (
                            <Image
                                src={previewUrl}
                                alt="Custom reference"
                                fill
                                className="object-cover"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                            </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-1">
                            <span className="text-[10px] font-medium text-white">
                                Custom
                            </span>
                        </div>
                    </div>
                ) : (
                    <>
                        <Plus className="mb-1 h-6 w-6 text-zinc-400 group-hover:text-[#0EA5E9]" />
                        <span className="text-[10px] font-medium text-zinc-500 group-hover:text-[#0EA5E9]">
                            Custom
                        </span>
                    </>
                )}
            </button>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Custom Visual Style</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="style-description">
                                describe the style in detail
                            </Label>
                            <div className="relative">
                                <Textarea
                                    id="style-description"
                                    placeholder={
                                        isAnalyzing
                                            ? "Analyzing visual style..."
                                            : "Cinematic, 35mm film, grainy, high contrast, warm sepia tones..."
                                    }
                                    value={customStyleText}
                                    onChange={(e) =>
                                        setCustomStyleText(e.target.value)
                                    }
                                    disabled={isAnalyzing}
                                    className="min-h-[100px] resize-none"
                                />
                                {isAnalyzing && (
                                    <div className="absolute right-2 bottom-2">
                                        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label>Style reference image</Label>
                            <div className="flex flex-col items-center justify-center space-y-4">
                                {styleImageUri || previewUrl ? (
                                    <div className="relative aspect-video w-full overflow-hidden rounded-lg border">
                                        {previewUrl ? (
                                            <Image
                                                src={previewUrl}
                                                alt="Style reference"
                                                fill
                                                className="object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                                                <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                                            </div>
                                        )}
                                        <Button
                                            variant="destructive"
                                            size="icon"
                                            className="absolute top-2 right-2 h-6 w-6"
                                            onClick={() =>
                                                onStyleImageUpload(null)
                                            }
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <Label className="border-border flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors hover:border-[#0EA5E9]/50 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                                        {isUploading ? (
                                            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                                        ) : (
                                            <>
                                                <Upload className="mb-2 h-8 w-8 text-zinc-400" />
                                                <p className="text-sm text-zinc-500">
                                                    Click to upload a reference
                                                    image
                                                </p>
                                            </>
                                        )}
                                        <Input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleFileUpload}
                                            disabled={isUploading}
                                        />
                                    </Label>
                                )}
                            </div>
                        </div>

                        <Button
                            onClick={handleApplyCustomStyle}
                            className="w-full bg-[#0EA5E9] hover:bg-[#0EA5E9]/90"
                            disabled={!customStyleText && !styleImageUri}
                        >
                            Apply Custom Style
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

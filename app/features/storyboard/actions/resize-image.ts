// app/actions/imageActions.ts
"use server";

import { uploadImage, gcsUriToSharp } from "@/lib/storage/storage";
import sharp, { type OverlayOptions } from "sharp";
import { v4 as uuidv4 } from "uuid";
import logger from "@/app/logger";
import { createCollageSchema, resizeImageSchema } from "@/app/schemas";
import { requireAuth } from "@/lib/api/auth-utils";

export async function resizeImage(
    base64Image: string,
    width: number = 1920,
    height: number = 1080,
): Promise<string> {
    await requireAuth();
    const parseResult = resizeImageSchema.safeParse({
        base64Image,
        width,
        height,
    });
    if (!parseResult.success) {
        logger.error("Validation error in resizeImage:", parseResult.error);
        throw new Error(`Invalid input: ${parseResult.error.message}`);
    }
    logger.debug("Resizing image");
    try {
        // Remove data URL prefix if present
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

        // Convert base64 to buffer
        const buffer = Buffer.from(base64Data, "base64");
        const resizedImageBuffer = await sharp(buffer)
            .resize(width, height, {
                fit: "contain",
                background: { r: 0, g: 0, b: 0 }, // Black background for initial resize
            })
            // .flatten({ background: '#FFFFFF' })
            // .extend({
            //   top: 256,
            //   bottom: 256,
            //   left: 256,
            //   right: 256,
            //   background: { r: 255, g: 255, b: 255 } // White background for the canvas
            // })
            .toBuffer();

        // resizedImageBuffer to base64
        const uuid = uuidv4();
        const imageGcsUri = await uploadImage(
            resizedImageBuffer.toString("base64"),
            `upload-${uuid}.png`,
        );
        logger.debug("Image resized!");
        return imageGcsUri;
    } catch (error) {
        logger.error("Error resizing image:", error);
        throw new Error("Failed to resize image");
    }
}

/**
 * Creates a collage of character, prop, and setting images with labels
 */
export async function createCollage(
    characters: Array<{
        name: string;
        description: string;
        imageGcsUri?: string;
    }>,
    props: Array<{ name: string; description: string; imageGcsUri?: string }>,
    aspectRatio: string,
): Promise<string> {
    await requireAuth();
    const parseResult = createCollageSchema.safeParse({
        characters,
        props,
        aspectRatio,
    });
    if (!parseResult.success) {
        logger.error("Validation error in createCollage:", parseResult.error);
        throw new Error(`Invalid input: ${parseResult.error.message}`);
    }
    // Calculate canvas dimensions based on aspect ratio
    let canvasWidth: number, canvasHeight: number;

    if (aspectRatio === "16:9") {
        canvasWidth = 1920;
        canvasHeight = 1080;
    } else if (aspectRatio === "9:16") {
        canvasWidth = 1080;
        canvasHeight = 1920;
    } else {
        // Default to 16:9
        canvasWidth = 1920;
        canvasHeight = 1080;
    }

    // Collect all items with images
    const items = [
        ...characters
            .filter((c) => c.imageGcsUri)
            .map((c) => ({ ...c, type: "character" })),
        ...props
            .filter((p) => p.imageGcsUri)
            .map((p) => ({ ...p, type: "prop" })),
    ];

    logger.debug(`Creating collage with ${items.length} items`);

    if (items.length === 0) {
        throw new Error("No images available for collage");
    }

    // Calculate grid layout
    const itemsPerRow = Math.ceil(Math.sqrt(items.length));
    const rows = Math.ceil(items.length / itemsPerRow);

    // Calculate item dimensions
    const padding = 20;
    const labelHeight = 40;
    const availableWidth = canvasWidth - padding * 2;
    const availableHeight = canvasHeight - padding * 2 - labelHeight * rows;

    const itemWidth = Math.floor(
        (availableWidth - padding * (itemsPerRow - 1)) / itemsPerRow,
    );
    const itemHeight = Math.floor(availableHeight / rows);

    // Create blank canvas
    const canvas = sharp({
        create: {
            width: canvasWidth,
            height: canvasHeight,
            channels: 3,
            background: { r: 240, g: 240, b: 240 },
        },
    });

    // Process each item
    const composites: OverlayOptions[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = Math.floor(i / itemsPerRow);
        const col = i % itemsPerRow;

        try {
            // Download and get image metadata
            const imageSharp = await gcsUriToSharp(item.imageGcsUri!);
            const metadata = await imageSharp.metadata();

            // Calculate aspect ratio of source image
            const sourceAspectRatio =
                (metadata.width || 1) / (metadata.height || 1);

            // Calculate dimensions to fit within grid cell while maintaining aspect ratio
            let finalWidth = itemWidth;
            let finalHeight = itemHeight;

            if (sourceAspectRatio > itemWidth / itemHeight) {
                // Image is wider than grid cell - fit to width
                finalHeight = Math.floor(itemWidth / sourceAspectRatio);
            } else {
                // Image is taller than grid cell - fit to height
                finalWidth = Math.floor(itemHeight * sourceAspectRatio);
            }

            // Resize image maintaining aspect ratio
            const resizedImage = await imageSharp
                .resize(finalWidth, finalHeight, {
                    fit: "contain",
                    background: { r: 255, g: 255, b: 255, alpha: 0 },
                })
                .png()
                .toBuffer();

            // Calculate position (center the image within the grid cell)
            const x =
                padding +
                col * (itemWidth + padding) +
                Math.floor((itemWidth - finalWidth) / 2);
            const y =
                padding +
                row * (itemHeight + labelHeight) +
                Math.floor((itemHeight - finalHeight) / 2);

            // Add image to canvas
            composites.push({
                input: resizedImage,
                left: x,
                top: y,
            });

            // Create label text
            const labelText = `${item.name} (${item.type})`;
            logger.debug(`Label text: ${labelText}`);

            // Create text label as SVG with same width as the resized image
            const svgText = `
        <svg width="${finalWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.7)" rx="4"/>
          <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" 
                fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="bold">
            ${labelText}
          </text>
        </svg>
      `;

            const labelBuffer = await sharp(Buffer.from(svgText))
                .png()
                .toBuffer();

            // Add label below image (centered with the image)
            composites.push({
                input: labelBuffer,
                left: x,
                top: y + finalHeight,
            });
        } catch (error) {
            logger.error(`Error processing image for ${item.name}:`, error);
            // Continue with other images even if one fails
        }
    }

    logger.debug(`Composites: ${composites.length}`);

    // Composite all images and labels onto canvas
    const collageBuffer = await canvas.composite(composites).png().toBuffer();

    // Upload to GCS
    const filename = `collage-${Date.now()}.png`;
    const base64Collage = collageBuffer.toString("base64");
    const gcsUri = await uploadImage(base64Collage, filename);

    return gcsUri;
}

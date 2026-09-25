import { GetSignedUrlConfig, Storage } from "@google-cloud/storage";
import sharp, { type Sharp } from "sharp";
import logger from "@/app/logger";
import { env } from "@/lib/utils/env";

// Use a global variable to ensure the client is reused across HMR in development
const globalForStorage = global as unknown as { storage: Storage };

// Initialize storage
export const storage =
    globalForStorage.storage ||
    new Storage({
        projectId: env.PROJECT_ID,
        // keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS, // Uncomment if needed
    });

if (process.env.NODE_ENV !== "production") {
    globalForStorage.storage = storage;
}

const storageUri = env.GCS_VIDEOS_STORAGE_URI;

export async function uploadImage(
    base64: string,
    filename: string,
): Promise<string> {
    if (!base64) {
        logger.warn("Attempted to upload an empty base64 string.");
        throw new Error("Attempted to upload an empty base64 string.");
    }

    try {
        // Decode the base64 string into a buffer
        // Remove the data URI prefix if it exists (e.g., "data:image/jpeg;base64,")
        let base64Data = base64;
        let contentType = "image/png";

        if (base64.startsWith("data:")) {
            const commaIndex = base64.indexOf(",");
            if (commaIndex !== -1) {
                const header = base64.substring(0, commaIndex);
                const match = header.match(/^data:([A-Za-z-+\/]+);base64$/);
                if (match) {
                    contentType = match[1];
                }
                base64Data = base64.substring(commaIndex + 1);
            }
        } else if (base64.includes(",")) {
            base64Data = base64.split(",")[1];
        }

        const buffer = Buffer.from(base64Data, "base64");

        // Get the bucket name from the storage URI
        // We know storageUri is defined here due to the check above
        const bucketName = storageUri.startsWith("gs://")
            ? storageUri.substring(5).split("/")[0]
            : storageUri.split("/")[0]; // Basic fallback if not starting with gs://

        if (!bucketName) {
            logger.error(
                `Could not extract bucket name from STORAGE_URI: ${storageUri}`,
            );
            throw new Error(
                `Could not extract bucket name from STORAGE_URI: ${storageUri}`,
            );
        }

        // Get a reference to the bucket
        const bucket = storage.bucket(bucketName);

        // Create a reference to the file object
        const file = bucket.file(filename);

        await file.save(buffer, {
            metadata: {
                contentType: contentType,
                // Optional: Add cache control headers, etc.
                // cacheControl: 'public, max-age=31536000',
            },
            public: false, // Keep files private unless explicitly made public
        });

        // Construct the GCS URI
        const gcsUri = `gs://${bucketName}/${filename}`; // Construct the standard gs:// URI
        logger.debug(`Successfully uploaded ${filename} to ${gcsUri}`);
        return gcsUri;
    } catch (error) {
        logger.error(`Failed to upload image ${filename} to GCS:`, error);
        throw new Error(`Failed to upload image ${filename} to GCS: ${error}`);
    }
}

export async function getSignedUrlFromGCS(
    gcsUri: string,
    download: boolean = false,
) {
    const [bucketName, ...pathSegments] = gcsUri
        .replace("gs://", "")
        .split("/");
    const fileName = pathSegments.join("/");
    const options: GetSignedUrlConfig = {
        version: "v4",
        action: "read",
        expires: Date.now() + 24 * 60 * 60 * 1000,
    };

    if (download) {
        options.responseDisposition = "attachment";
    }

    const [url] = await storage
        .bucket(bucketName)
        .file(fileName)
        .getSignedUrl(options);
    return url;
}

/**
 * Downloads an image from a GCS URI and returns a sharp object.
 *
 * @param gcsUri The Google Cloud Storage URI (e.g., "gs://bucket-name/path/to/image.jpg").
 * @returns A Promise resolving to a sharp instance.
 */
export async function gcsUriToSharp(gcsUri: string): Promise<Sharp> {
    try {
        // 1. Parse the GCS URI to extract bucket name and file path
        const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
        if (!match) {
            throw new Error(`Invalid GCS URI format: ${gcsUri}`);
        }
        const bucketName = match[1];
        const filePath = match[2];

        // 2. Download the image file from GCS into a buffer
        logger.debug(`Downloading image from gs://${bucketName}/${filePath}`);
        const [buffer] = await storage
            .bucket(bucketName)
            .file(filePath)
            .download();
        logger.debug(`Image downloaded successfully (${buffer.length} bytes)`);

        // 3. Create a sharp object from the downloaded buffer
        return sharp(buffer);
    } catch (error) {
        logger.error(`Error processing image from GCS URI ${gcsUri}:`, error);
        // Re-throw the error so the caller can handle it
        throw error;
    }
}

/**
 * Downloads an image from a GCS URI and returns its base64 encoded string
 * representation.
 *
 * @param gcsUri The Google Cloud Storage URI (e.g., "gs://bucket-name/path/to/image.jpg").
 * @returns A Promise resolving to the base64 data URI string.
 */
export async function gcsUriToBase64(gcsUri: string): Promise<string> {
    try {
        // 1. Parse the GCS URI
        const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
        if (!match) {
            throw new Error(`Invalid GCS URI format: ${gcsUri}`);
        }
        const bucketName = match[1];
        const filePath = match[2];

        // 2. Download the image file into a buffer
        logger.debug(
            `Downloading image for base64 conversion from gs://${bucketName}/${filePath}`,
        );
        const [buffer] = await storage
            .bucket(bucketName)
            .file(filePath)
            .download();
        logger.debug(`Image downloaded successfully (${buffer.length} bytes)`);

        // // 3. Determine image format using sharp to get the correct MIME type
        // const imageSharp = sharp(buffer);
        // const metadata = await imageSharp.metadata();
        // const format = metadata.format; // e.g., 'jpeg', 'png', 'webp', etc.
        // if (!format) {
        //   throw new Error('Could not determine image format.');
        // }
        // const mimeType = `image/${format}`;

        // 4. Convert buffer to base64 string
        const base64Data = buffer.toString("base64");

        // 5. Construct the full data URI
        // const dataUri = `data:${mimeType};base64,${base64Data}`;
        const dataUri = `${base64Data}`;
        return dataUri;
    } catch (error) {
        logger.error(`Error converting GCS URI ${gcsUri} to base64:`, error);
        // Re-throw the error so the caller can handle it
        throw error;
    }
}

export async function getMimeTypeFromGCS(
    gcsUri: string,
): Promise<string | null> {
    const [bucketName, ...pathSegments] = gcsUri
        .replace("gs://", "")
        .split("/");
    const fileName = pathSegments.join("/");
    const [metadata] = await storage
        .bucket(bucketName)
        .file(fileName)
        .getMetadata();
    return metadata.contentType || null;
}

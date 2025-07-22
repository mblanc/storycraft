import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Get range header from original request for video streaming support
    const rangeHeader = request.headers.get("range");

    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (compatible; Storycraft/1.0)",
    };

    // Forward range header if present (important for video streaming)
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    // Fetch the video file server-side
    const response = await fetch(url, {
      headers: fetchHeaders,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch video: ${response.status} ${response.statusText}`
      );
    }

    // Get the video data
    const videoBuffer = await response.arrayBuffer();

    // Determine content type
    const contentType = response.headers.get("Content-Type") || "video/mp4";

    // Create response with proper CORS and video headers
    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range, Accept-Ranges",
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    };

    // Forward content-length if available
    const contentLength = response.headers.get("Content-Length");
    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    // Forward content-range for partial content responses
    const contentRange = response.headers.get("Content-Range");
    if (contentRange) {
      responseHeaders["Content-Range"] = contentRange;
    }

    // Determine status code (206 for partial content, 200 for full content)
    const status = response.status === 206 ? 206 : 200;

    const videoResponse = new NextResponse(videoBuffer, {
      status,
      headers: responseHeaders,
    });

    return videoResponse;
  } catch (error) {
    console.error("Error proxying video:", error);
    return NextResponse.json(
      { error: "Failed to fetch video file" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range, Accept-Ranges",
    },
  });
}

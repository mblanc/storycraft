'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Pencil, RefreshCw, Video, Upload, Loader2 } from 'lucide-react'
import { EditSceneModal } from './edit-scene-modal'
import Image from 'next/image'
import { VideoPlayer } from "./video-player"

interface SceneDataProps {
  scene: {
    imagePrompt: string;
    videoPrompt: string;
    description: string;
    voiceover: string;
    imageBase64?: string;
    videoUri?: string | Promise<string>;
    videoUrl?: string | Promise<string>;
  };
  sceneNumber: number;
  onUpdate: (updatedScene: SceneDataProps['scene']) => void;
  onRegenerateImage: () => void;
  onGenerateVideo: () => void;
  onUploadImage: (file: File) => void;
  isGenerating: boolean;
}

export function SceneData({
  scene,
  sceneNumber,
  onUpdate,
  onRegenerateImage,
  onGenerateVideo,
  onUploadImage,
  isGenerating,
}: SceneDataProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  useEffect(() => {
    const getVideoUrl = async () => {
        console.log('Video URL change!')
        if (typeof scene.videoUrl === 'string') {
          setVideoUrl(scene.videoUrl);
        } else if (scene.videoUrl instanceof Promise) {
          try {
            const resolvedUrl = await scene.videoUrl;
            setVideoUrl(resolvedUrl);
          } catch (error) {
            console.error('Error resolving video URL:', error);
            setVideoUrl(null); // or some default error URL
          }
        } else {
          setVideoUrl(null);
        }
    }

    getVideoUrl();
  }, [scene.videoUrl]);
  
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onUploadImage(file)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col">
        <div className="relative w-full aspect-video overflow-hidden group">
          {isGenerating && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
          )}
          {videoUrl ? (
            <div className="absolute inset-0">
              <VideoPlayer src={videoUrl} />
            </div>
          ) : scene.imageBase64 ? (
            <Image
              src={`data:image/png;base64,${scene.imageBase64}`}
              alt={`Scene ${sceneNumber}`}
              className="absolute inset-0 w-full h-full object-cover object-center rounded-t-lg"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "/placeholder.svg";
                target.onerror = null; // Prevent infinite loop
              }}
            />
          ) : (
            <Image
              src='/placeholder.svg'
              alt={`Scene ${sceneNumber}`}
              className="absolute inset-0 w-full h-full object-cover object-center rounded-t-lg"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "/placeholder.svg";
                target.onerror = null; // Prevent infinite loop
              }}
            />
          )}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="icon"
              className="bg-black/50 hover:bg-blue-500 hover:text-white"
              onClick={onGenerateVideo}
              disabled={isGenerating}
            >
              <Video className="h-4 w-4" />
              <span className="sr-only">Generate video for scene</span>
            </Button>
          </div>
          <div className="absolute top-2 left-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="icon"
              className="bg-black/50 hover:bg-red-500 hover:text-white"
              onClick={onRegenerateImage}
              disabled={isGenerating}
            >
              <RefreshCw className="h-4 w-4" />
              <span className="sr-only">Regenerate image</span>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="bg-black/50 hover:bg-green-500 hover:text-white"
              onClick={handleUploadClick}
              disabled={isGenerating}
            >
              <Upload className="h-4 w-4" />
              <span className="sr-only">Upload image</span>
            </Button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          </div>
        </div>
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-primary">Scene {sceneNumber}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditModalOpen(true)}
              className="text-secondary hover:text-primary hover:bg-primary/10"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{scene.description}</p>
        </CardContent>
      </div>
      <EditSceneModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        scene={scene}
        sceneNumber={sceneNumber}
        onUpdate={onUpdate}
      />
    </Card>
  )
}
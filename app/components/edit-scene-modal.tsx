'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import Image from 'next/image'
import { VideoPlayer } from "./video-player"

interface EditSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  onUpdate: (updatedScene: EditSceneModalProps['scene']) => void;
}

export function EditSceneModal({ isOpen, onClose, scene, sceneNumber, onUpdate }: EditSceneModalProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [editedScene, setEditedScene] = useState(scene)
  
  useEffect(() => {
    setEditedScene(scene)
  }, [scene])
    
  useEffect(() => {
    const getVideoUrl = async () => {
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
        }
    }

    getVideoUrl();
  }, [scene.videoUri]);
  
  const handleSave = () => {
    onUpdate(editedScene)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Edit Scene {sceneNumber}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-4">
            <div className="relative w-full pb-[56.25%] overflow-hidden rounded-lg">
              {videoUrl ? (
                <div className="absolute inset-0">
                  <VideoPlayer src={videoUrl} />
                </div>
              ) : editedScene.imageBase64 ? (
              <Image
                src={scene.imageBase64 ? `data:image/png;base64,${scene.imageBase64}` : "/placeholder.svg"}
                alt={`Scene ${sceneNumber}`}
                fill
                className="absolute inset-0 w-full h-full object-cover object-center"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = "/placeholder.svg";
                }}
              />
              ) : (
                <Image
                    src="/placeholder.svg"
                    alt={`Scene ${sceneNumber}`}
                    className="absolute inset-0 w-full h-full object-cover object-center"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "/placeholder.svg";
                    }}
                  />
              )}
            </div>
            <div className="grid gap-2">
              <label htmlFor="imagePrompt" className="text-sm font-medium">
                Image Prompt
              </label>
              <Textarea
                id="imagePrompt"
                value={editedScene.imagePrompt}
                onChange={(e) => setEditedScene({ ...editedScene, imagePrompt: e.target.value })}
                placeholder="Describe the scene visually..."
                rows={4}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <label htmlFor="videoPrompt" className="text-sm font-medium">
              Video Prompt
            </label>
            <Textarea
              id="description"
              value={editedScene.videoPrompt}
              onChange={(e) => setEditedScene({ ...editedScene, videoPrompt: e.target.value })}
              placeholder="Describe the video..."
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="description"
              value={editedScene.description}
              onChange={(e) => setEditedScene({ ...editedScene, description: e.target.value })}
              placeholder="What happens in this scene?"
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="voiceover" className="text-sm font-medium">
              Voiceover
            </label>
            <Textarea
              id="voiceover"
              value={editedScene.voiceover}
              onChange={(e) => setEditedScene({ ...editedScene, voiceover: e.target.value })}
              placeholder="What should the narrator say?"
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}


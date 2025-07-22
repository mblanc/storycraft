"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface EditMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMusic: string;
  onUpdate: (updatedMusic: string) => void;
}

export function EditMusicModal({
  isOpen,
  onClose,
  currentMusic,
  onUpdate,
}: EditMusicModalProps) {
  const [editedMusic, setEditedMusic] = useState(currentMusic);

  useEffect(() => {
    setEditedMusic(currentMusic);
  }, [currentMusic]);

  const handleSave = () => {
    onUpdate(editedMusic);
    onClose();
  };

  const handleCancel = () => {
    setEditedMusic(currentMusic); // Reset changes
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Music</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-4 py-4">
            {/* Music Description */}
            <div className="grid gap-2">
              <label htmlFor="musicDescription" className="text-sm font-medium">
                Music Description
              </label>
              <Textarea
                id="musicDescription"
                value={editedMusic}
                onChange={(e) => setEditedMusic(e.target.value)}
                placeholder="Describe the music style, instruments, mood, etc..."
                rows={6}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end space-x-2 pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

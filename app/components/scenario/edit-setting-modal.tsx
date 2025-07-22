"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { regenerateScenarioFromSetting } from "@/app/actions/regenerate-scenario-from-setting";
import { ProgressIndicator } from "../ui/progress-indicator";

interface Setting {
  id?: string;
  name: string;
  description: string;
}

interface EditSettingModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Setting[];
  currentScenario: string;
  onUpdate: (updatedScenario: string, updatedSettings: Setting[]) => void;
}

export function EditSettingModal({
  isOpen,
  onClose,
  settings,
  currentScenario,
  onUpdate,
}: EditSettingModalProps) {
  const [editedSettings, setEditedSettings] = useState(settings);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setEditedSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    // Check if any settings changed
    const hasChanges = editedSettings.some((editedSetting, index) => {
      const originalSetting = settings[index];
      return (
        originalSetting.name !== editedSetting.name ||
        originalSetting.description !== editedSetting.description
      );
    });

    if (!hasChanges) {
      onClose();
      return;
    }

    setIsProcessing(true);
    setIsRegenerating(true);

    try {
      // For simplicity, regenerate scenario once with a summary of all changes
      const changedSettings = editedSettings.filter((editedSetting, index) => {
        const originalSetting = settings[index];
        return (
          originalSetting.name !== editedSetting.name ||
          originalSetting.description !== editedSetting.description
        );
      });

      if (changedSettings.length > 0) {
        // Use the first changed setting for regeneration
        const firstChanged = changedSettings[0];
        const originalFirst = settings.find(
          (s) => (s.id || s.name) === (firstChanged.id || firstChanged.name)
        );

        if (originalFirst) {
          const result = await regenerateScenarioFromSetting(
            currentScenario,
            originalFirst.name,
            firstChanged.name,
            firstChanged.description
          );

          // Call parent update with new scenario and all settings
          onUpdate(result.updatedScenario, editedSettings);
        } else {
          // Just update settings without scenario regeneration
          onUpdate(currentScenario, editedSettings);
        }
      } else {
        onUpdate(currentScenario, editedSettings);
      }

      onClose();
    } catch (error) {
      console.error("Error updating settings:", error);
    } finally {
      setIsProcessing(false);
      setIsRegenerating(false);
    }
  };

  const handleCancel = () => {
    setEditedSettings(settings); // Reset changes
    setIsProcessing(false);
    setIsRegenerating(false);
    onClose();
  };

  const updateSetting = (
    index: number,
    field: "name" | "description",
    value: string
  ) => {
    const updated = [...editedSettings];
    updated[index] = { ...updated[index], [field]: value };
    setEditedSettings(updated);
  };

  const isWorking = isProcessing || isRegenerating;

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Settings</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-6 py-4">
            {editedSettings.map((setting, index) => (
              <div
                key={setting.id || setting.name}
                className="space-y-4 p-4 border rounded-lg"
              >
                <h3 className="text-lg font-semibold">Setting {index + 1}</h3>

                {/* Setting Name */}
                <div className="grid gap-2">
                  <label
                    htmlFor={`settingName-${index}`}
                    className="text-sm font-medium"
                  >
                    Setting Name
                  </label>
                  <Input
                    id={`settingName-${index}`}
                    value={setting.name}
                    onChange={(e) =>
                      updateSetting(index, "name", e.target.value)
                    }
                    placeholder="Enter setting name..."
                  />
                </div>

                {/* Setting Description */}
                <div className="grid gap-2">
                  <label
                    htmlFor={`settingDescription-${index}`}
                    className="text-sm font-medium"
                  >
                    Setting Description
                  </label>
                  <Textarea
                    id={`settingDescription-${index}`}
                    value={setting.description}
                    onChange={(e) =>
                      updateSetting(index, "description", e.target.value)
                    }
                    placeholder="Describe the setting location, atmosphere, etc..."
                    rows={4}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Progress indicator in static position */}
        <div className="flex-shrink-0 px-6">
          <ProgressIndicator
            isVisible={isWorking}
            message="🔄 Updating scenario to match new settings..."
            progress={100}
          />
        </div>

        <div className="flex justify-end space-x-2 pt-4 px-6 border-t flex-shrink-0">
          <Button variant="outline" onClick={handleCancel} disabled={isWorking}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isWorking}>
            {isWorking ? "Processing..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { LayoutGrid, Loader2, Pencil, Upload } from "lucide-react";
import { Scenario } from "../../types";
import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { GcsImage } from "../ui/gcs-image";
import { CustomCharacterImageModal } from "./custom-character-image-modal";
import { EditCharacterModal } from "./edit-character-modal";
import { EditSettingModal } from "./edit-setting-modal";
import { EditMusicModal } from "./edit-music-modal";

interface ScenarioTabProps {
  scenario?: Scenario;
  onGenerateStoryBoard: () => void;
  isLoading: boolean;
  onScenarioUpdate?: (updatedScenario: Scenario) => void;
  sessionId?: string;
  style?: string;
}

export function ScenarioTab({
  scenario,
  onGenerateStoryBoard,
  isLoading,
  onScenarioUpdate,
  sessionId,
  style = "cinematic",
}: ScenarioTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedScenario, setEditedScenario] = useState(
    scenario?.scenario || ""
  );
  const [isHovering, setIsHovering] = useState(false);
  const [characterImageModalOpen, setCharacterImageModalOpen] = useState(false);
  const [selectedCharacterName, setSelectedCharacterName] = useState<
    string | null
  >(null);

  // Character edit modal state
  const [characterEditModalOpen, setCharacterEditModalOpen] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null
  );

  // Setting edit modal state
  const [settingEditModalOpen, setSettingEditModalOpen] = useState(false);

  // Music edit modal state
  const [musicEditModalOpen, setMusicEditModalOpen] = useState(false);

  const scenarioRef = useRef<HTMLDivElement>(null);

  // Helper function to ensure characters have IDs
  const ensureCharacterIds = (characters: Scenario["characters"]) => {
    return characters.map((character) => ({
      ...character,
      id:
        character.id ||
        `char_${character.name
          .toLowerCase()
          .replace(/\s+/g, "_")}_${Date.now()}`,
    }));
  };

  // Helper function to ensure settings have IDs
  const ensureSettingIds = (settings: Scenario["settings"]) => {
    return settings.map((setting) => ({
      ...setting,
      id:
        setting.id ||
        `setting_${setting.name
          .toLowerCase()
          .replace(/\s+/g, "_")}_${Date.now()}`,
    }));
  };

  useEffect(() => {
    if (scenario?.scenario) {
      setEditedScenario(scenario.scenario);
    }

    // Ensure all characters and settings have IDs
    if (scenario && onScenarioUpdate) {
      const charactersWithIds = ensureCharacterIds(scenario.characters);
      const settingsWithIds = ensureSettingIds(scenario.settings);

      const needsCharacterUpdate = charactersWithIds.some(
        (char, index) => char.id !== scenario.characters[index]?.id
      );
      const needsSettingUpdate = settingsWithIds.some(
        (setting, index) => setting.id !== scenario.settings[index]?.id
      );

      if (needsCharacterUpdate || needsSettingUpdate) {
        onScenarioUpdate({
          ...scenario,
          characters: charactersWithIds,
          settings: settingsWithIds,
        });
      }
    }
  }, [scenario?.scenario]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        scenarioRef.current &&
        !scenarioRef.current.contains(event.target as Node)
      ) {
        if (isEditing) {
          handleSave();
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditing, editedScenario]);

  const handleScenarioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedScenario(e.target.value);
  };

  const handleSave = async () => {
    if (scenario && onScenarioUpdate) {
      const updatedScenario = {
        ...scenario,
        scenario: editedScenario,
      };
      onScenarioUpdate(updatedScenario);
      setEditedScenario(updatedScenario.scenario);
    }
    setIsEditing(false);
  };

  const handleCharacterImageUpload = (characterName: string) => {
    setSelectedCharacterName(characterName);
    setCharacterImageModalOpen(true);
  };

  const handleCharacterImageUploaded = async (imageGcsUri: string) => {
    if (!scenario || !selectedCharacterName || !onScenarioUpdate) return;

    // Update the character's imageGcsUri
    const updatedCharacters = scenario.characters.map((character) =>
      character.name === selectedCharacterName
        ? { ...character, imageGcsUri }
        : character
    );

    const updatedScenario = {
      ...scenario,
      characters: updatedCharacters,
    };

    onScenarioUpdate(updatedScenario);
  };

  const handleCharacterAndScenarioUpdate = async (
    updatedScenarioText: string,
    updatedCharacter: { name: string; description: string },
    imageGcsUri: string
  ) => {
    if (!scenario || !onScenarioUpdate) return;

    // Update both the scenario text and the character description
    // IMPORTANT: Use the explicit imageGcsUri parameter to ensure we have the correct custom image
    const updatedCharacters = scenario.characters.map((character) =>
      character.name === updatedCharacter.name
        ? {
            ...character,
            description: updatedCharacter.description,
            imageGcsUri: imageGcsUri, // Explicitly set the custom image URI
          }
        : character
    );

    const updatedScenario = {
      ...scenario,
      scenario: updatedScenarioText,
      characters: updatedCharacters,
    };

    onScenarioUpdate(updatedScenario);
  };

  const handleModalClose = () => {
    setCharacterImageModalOpen(false);
    setSelectedCharacterName(null);
  };

  // Character edit handlers
  const handleCharacterEdit = (characterId: string) => {
    setSelectedCharacterId(characterId);
    setCharacterEditModalOpen(true);
  };

  const handleCharacterEditClose = () => {
    setCharacterEditModalOpen(false);
    setSelectedCharacterId(null);
  };

  const handleCharacterUpdate = async (
    updatedScenarioText: string,
    updatedCharacter: {
      id: string;
      name: string;
      description: string;
      imageGcsUri?: string;
    }
  ) => {
    if (!scenario || !onScenarioUpdate) return;

    // Update character and scenario
    const updatedCharacters = scenario.characters.map((character) =>
      character.id === updatedCharacter.id ? updatedCharacter : character
    );

    const updatedScenario = {
      ...scenario,
      scenario: updatedScenarioText,
      characters: updatedCharacters,
    };

    onScenarioUpdate(updatedScenario);
  };

  // Setting edit handlers
  const handleSettingEdit = () => {
    setSettingEditModalOpen(true);
  };

  const handleSettingEditClose = () => {
    setSettingEditModalOpen(false);
  };

  const handleSettingUpdate = (
    updatedScenarioText: string,
    updatedSettings: { id?: string; name: string; description: string }[]
  ) => {
    if (!scenario || !onScenarioUpdate) return;

    const updatedScenario = {
      ...scenario,
      scenario: updatedScenarioText,
      settings: updatedSettings,
    };

    onScenarioUpdate(updatedScenario);
  };

  // Music edit handlers
  const handleMusicEdit = () => {
    setMusicEditModalOpen(true);
  };

  const handleMusicEditClose = () => {
    setMusicEditModalOpen(false);
  };

  const handleMusicUpdate = (updatedMusic: string) => {
    if (!scenario || !onScenarioUpdate) return;

    const updatedScenario = {
      ...scenario,
      music: updatedMusic,
    };

    onScenarioUpdate(updatedScenario);
  };

  return (
    <div className="space-y-8">
      {scenario && (
        <>
          <div className="flex justify-end">
            <Button
              onClick={onGenerateStoryBoard}
              disabled={isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Storyboard...
                </>
              ) : (
                <>
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Generate Storyboard with Imagen 4.0
                </>
              )}
            </Button>
          </div>
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="col-span-1">
              <h3 className="text-xl font-bold">Scenario</h3>
            </div>
            <div
              ref={scenarioRef}
              className="relative group"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              {!isEditing && isHovering && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="absolute top-2 right-2 p-2 rounded-full bg-white/80 hover:bg-white shadow-sm transition-all"
                >
                  <Pencil className="h-4 w-4 text-gray-600" />
                </button>
              )}
              {isEditing ? (
                <Textarea
                  value={editedScenario}
                  onChange={handleScenarioChange}
                  className="min-h-[200px] w-full"
                  placeholder="Enter your scenario..."
                  autoFocus
                />
              ) : (
                <p className="whitespace-pre-wrap p-4 rounded-lg border border-transparent group-hover:border-gray-200 transition-colors">
                  {scenario.scenario}
                </p>
              )}
            </div>
            <div className="col-span-1">
              <h3 className="text-xl font-bold">Characters</h3>
            </div>
            {scenario.characters.map((character) => (
              <div
                key={character.id || character.name}
                className="flex gap-4 items-start"
              >
                <div className="flex-shrink-0 space-y-3">
                  <div className="w-[200px] h-[200px] relative">
                    <GcsImage
                      gcsUri={character.imageGcsUri || null}
                      alt={`Character ${character.name}`}
                      className="object-cover rounded-lg shadow-md"
                      sizes="200px"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCharacterImageUpload(character.name)}
                    className="flex items-center gap-2 w-full"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Custom Image
                  </Button>
                </div>
                <div className="flex-grow">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-lg font-semibold text-primary">
                      {character.name}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        handleCharacterEdit(
                          character.id || `temp_${character.name}`
                        )
                      }
                      className="text-secondary hover:text-primary hover:bg-primary/10"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {character.description}
                  </p>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Settings</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSettingEdit}
                className="text-secondary hover:text-primary hover:bg-primary/10"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
            {scenario.settings.map((setting) => (
              <div key={setting.id || setting.name} className="space-y-2">
                <h4 className="text-lg font-semibold text-primary">
                  {setting.name}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {setting.description}
                </p>
              </div>
            ))}
            <div className="col-span-1">
              <h3 className="text-xl font-bold">Music</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-lg font-semibold text-primary">
                  Music Description
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMusicEdit}
                  className="text-secondary hover:text-primary hover:bg-primary/10"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{scenario.music}</p>
            </div>
          </div>
        </>
      )}

      {/* Character Image Upload Modal */}
      {selectedCharacterName && scenario && (
        <CustomCharacterImageModal
          isOpen={characterImageModalOpen}
          onClose={handleModalClose}
          onImageUpload={handleCharacterImageUploaded}
          onCharacterAndScenarioUpdate={handleCharacterAndScenarioUpdate}
          characterName={selectedCharacterName}
          characterDescription={
            scenario.characters.find((c) => c.name === selectedCharacterName)
              ?.description || ""
          }
          currentScenario={scenario.scenario}
          allCharacters={scenario.characters}
          sessionId={sessionId || "default"}
        />
      )}

      {/* Character Edit Modal */}
      {selectedCharacterId && scenario && (
        <EditCharacterModal
          isOpen={characterEditModalOpen}
          onClose={handleCharacterEditClose}
          character={
            scenario.characters.find((c) => c.id === selectedCharacterId) || {
              id: selectedCharacterId,
              name: "Unknown",
              description: "",
              imageGcsUri: undefined,
            }
          }
          currentScenario={scenario.scenario}
          style={style}
          onUpdate={handleCharacterUpdate}
        />
      )}

      {/* Setting Edit Modal */}
      {scenario && (
        <EditSettingModal
          isOpen={settingEditModalOpen}
          onClose={handleSettingEditClose}
          settings={scenario.settings}
          currentScenario={scenario.scenario}
          onUpdate={handleSettingUpdate}
        />
      )}

      {/* Music Edit Modal */}
      {scenario && (
        <EditMusicModal
          isOpen={musicEditModalOpen}
          onClose={handleMusicEditClose}
          currentMusic={scenario.music}
          onUpdate={handleMusicUpdate}
        />
      )}
    </div>
  );
}

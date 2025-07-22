"use client";

import { Stepper } from "@/components/ui/stepper";
import {
  BookOpen,
  Film,
  LayoutGrid,
  PenLine,
  Scissors,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { generateScenes, generateStoryboard } from "./actions/generate-scenes";
import { exportMovieAction } from "./actions/generate-video";
import { regenerateImage } from "./actions/regenerate-image";
import { resizeImage } from "./actions/resize-image";
import { saveImageToPublic } from "./actions/upload-image";
import { CreateTab } from "./components/create/create-tab";
import { ScenarioTab } from "./components/scenario/scenario-tab";
import { StoryboardTab } from "./components/storyboard/storyboard-tab";
import { type Style } from "@/lib/projectStorage";
import { VideoTab } from "./components/video/video-tab";
import { Scenario, Scene, type Language, TimelineLayer } from "./types";
import { EditorTab } from "./components/editor/editor-tab";
import { generateMusic } from "./actions/generate-music";
import { generateVoiceover } from "./actions/generate-voiceover";
import { useProjectState } from "@/hooks/useProjectState";
import { getInitialTab } from "@/lib/projectStorage";
import { ClearProjectButton } from "@/components/ClearProjectButton";

const DEFAULT_LANGUAGE: Language = {
  name: "English (United States)",
  code: "en-US",
};

export default function Home() {
  // Persistent state management
  const { state, updateState, clearProject, isLoaded } = useProjectState();

  // Transient state (not persisted)
  const [isLoading, setIsLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [generatingScenes, setGeneratingScenes] = useState<Set<number>>(
    new Set()
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false);
  const FALLBACK_URL =
    "https://videos.pexels.com/video-files/4276282/4276282-hd_1920_1080_25fps.mp4";

  // Convenience getters for persistent state (with defaults)
  const pitch = state?.pitch || "";
  const style = state?.style || "Photographic";
  const language = state?.language || DEFAULT_LANGUAGE;
  const logoOverlay = state?.logoOverlay || null;
  const numScenes = state?.numScenes || 6;
  const customStyles = state?.customStyles || [];
  const selectedVeoModel =
    state?.selectedVeoModel || process.env.NEXT_PUBLIC_MODEL!;
  const scenario = state?.scenario;
  const scenes = state?.scenes || [];
  const videoUri = state?.videoUri || null;
  const vttUri = state?.vttUri || null;
  const activeTab = state?.activeTab || getInitialTab(state);

  // Default styles
  const defaultStyles: Style[] = [
    { name: "Photographic", image: "/styles/cinematic.jpg" },
    { name: "2D Animation", image: "/styles/2d.jpg" },
    { name: "Anime", image: "/styles/anime.jpg" },
    { name: "3D Animation", image: "/styles/3d.jpg" },
    { name: "Claymation Animation", image: "/styles/claymation.jpg" },
  ];

  // Custom style management
  const handleAddCustomStyle = (newStyle: Style) => {
    const updatedCustomStyles = [...customStyles, newStyle];
    updateState({ customStyles: updatedCustomStyles });
  };

  const handleRemoveCustomStyle = (styleName: string) => {
    const updatedCustomStyles = customStyles.filter(
      (s) => s.name !== styleName
    );
    updateState({ customStyles: updatedCustomStyles });
    // If the removed style was selected, reset to default
    if (style === styleName) {
      updateState({ style: "Photographic" });
    }
  };

  useEffect(() => {}, [generatingScenes]); // Log only when generatingScenes changes

  // Show loading until state is loaded - this must come after all hooks
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const handleGenerate = async () => {
    if (pitch.trim() === "" || numScenes < 1) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const newScenario = await generateScenes(
        pitch,
        numScenes,
        style,
        language
      );
      if (logoOverlay) {
        newScenario.logoOverlay = logoOverlay;
      }
      updateState({
        scenario: newScenario,
        scenes: newScenario.scenes,
        activeTab: "scenario",
      });
    } catch (error) {
      console.error("Error generating scenes:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while generating scenes"
      );
      updateState({ scenes: [] }); // Clear any partially generated scenes
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateImage = async (index: number, imagePrompt?: string) => {
    setGeneratingScenes((prev) => new Set([...prev, index]));
    setErrorMessage(null);
    try {
      // Regenerate a single image
      const scene = scenes[index];
      // Use provided imagePrompt or fall back to current scene's imagePrompt
      const promptToUse = imagePrompt || scene.imagePrompt;

      console.log(
        `🔄 Regenerating scene ${index + 1} image and clearing video`
      );

      const { imageGcsUri } = await regenerateImage(promptToUse, style);
      const updatedScenes = [...scenes];
      updatedScenes[index] = {
        ...scene,
        imagePrompt: promptToUse, // Save the updated prompt
        imageGcsUri,
        videoUri: undefined, // Explicitly clear video
      };

      console.log(`✅ Scene ${index + 1} image updated, video cleared`);
      console.log(updatedScenes);
      updateState({ scenes: updatedScenes });
    } catch (error) {
      console.error("Error regenerating images:", error);
      setErrorMessage(
        `Failed to regenerate scene ${index + 1}. Please try again.`
      );
    } finally {
      setGeneratingScenes((prev) => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const handleExportMovie = async (layers: TimelineLayer[]) => {
    setIsVideoLoading(true);
    setErrorMessage(null);
    try {
      console.log("Export Movie");
      console.log(layers);
      const result = await exportMovieAction(layers);
      if (result.success) {
        updateState({
          videoUri: result.videoUrl,
          vttUri: result.vttUrl || null,
          activeTab: "video",
        });
      } else {
        updateState({
          videoUri: FALLBACK_URL,
          vttUri: null,
        });
      }
    } catch (error) {
      console.error("Error generating video:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while generating video"
      );
      updateState({ vttUri: null });
    } finally {
      setIsVideoLoading(false);
    }
  };

  const handleGenerateAllVideos = async () => {
    if (scenes.length === 0) return;
    setErrorMessage(null);

    try {
      setIsVideoLoading(true);
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes: scenes.filter((s) => s.imageGcsUri),
          selectedVeoModel: selectedVeoModel,
        }),
      });

      const { success, videoUrls, error } = await response.json();
      console.log("success", success);
      console.log("videoUrls", videoUrls);

      if (!success) {
        throw new Error(error || "Failed to generate videos");
      }

      // Update all scenes with their corresponding video URLs
      const updatedScenes = scenes.map((scene, index) => ({
        ...scene,
        videoUri: videoUrls[index] || FALLBACK_URL,
      }));

      updateState({
        scenes: updatedScenes,
        scenario: scenario ? { ...scenario, scenes: updatedScenes } : scenario,
        activeTab: "editor", // Auto-redirect to editor tab after videos are generated
      });
    } catch (error) {
      console.error("[Client] Error generating videos:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while generating videos"
      );
    } finally {
      setIsVideoLoading(false);
    }
  };

  const handleGenerateVideo = async (index: number) => {
    setErrorMessage(null);
    try {
      // Single scene generation logic remains the same
      setGeneratingScenes((prev) => new Set([...prev, index]));
      const scene = scenes[index];
      console.log("scene", scene);

      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes: [scene],
          selectedVeoModel: selectedVeoModel,
        }),
      });

      const { success, videoUrls } = await response.json();
      const videoUri = success ? videoUrls[0] : FALLBACK_URL;
      const updatedScenes = [...scenes];
      updatedScenes[index] = { ...updatedScenes[index], videoUri };
      updateState({
        scenes: updatedScenes,
        scenario: scenario ? { ...scenario, scenes: updatedScenes } : scenario,
      });
    } catch (error) {
      console.error("[Client] Error generating video:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while generating video"
      );

      const videoUri = FALLBACK_URL;
      const updatedScenes = scenes.map((s, i) =>
        i === index ? { ...s, videoUri } : s
      );
      updateState({ scenes: updatedScenes });
    } finally {
      console.log(`[Client] Generating video done`);
      setGeneratingScenes((prev) => {
        const updated = new Set(prev);
        updated.delete(index); // Remove index from generatingScenes
        return updated;
      });
    }
  };

  const handleGenerateVoiceover = async () => {
    if (!scenario) return;
    setIsGeneratingVoiceover(true);
    setErrorMessage(null);
    try {
      const scenesVoiceovers = scenario.scenes.map((scene) => ({
        voiceover: scene.voiceover,
      }));
      const voiceoverAudioUrls = await generateVoiceover(
        scenesVoiceovers,
        scenario.language
      );
      const updatedScenes = scenes.map((scene, index) => ({
        ...scene,
        voiceoverAudioUri: voiceoverAudioUrls[index],
      }));
      updateState({
        scenes: updatedScenes,
        scenario: scenario ? { ...scenario, scenes: updatedScenes } : scenario,
      });
    } catch (error) {
      console.error("Error generating voiceover:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while generating voiceover"
      );
    } finally {
      setIsGeneratingVoiceover(false);
    }
  };

  const handleGenerateMusic = async () => {
    if (!scenario) return;
    setIsGeneratingMusic(true);
    setErrorMessage(null);
    try {
      const musicUrl = await generateMusic(scenario?.music);
      const updatedScenario = {
        ...scenario,
        musicUrl: musicUrl,
      };
      updateState({ scenario: updatedScenario });
      console.log(musicUrl);
    } catch (error) {
      console.error("Error generating music:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while generating music"
      );
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  const handleGenerateStoryBoard = async () => {
    if (!scenario) return;
    console.log(
      "Generating storyboard with scenario characters:",
      scenario.characters
    );
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const scenarioWithStoryboard = await generateStoryboard(
        scenario,
        numScenes,
        style,
        language
      );
      updateState({
        scenario: scenarioWithStoryboard,
        scenes: scenarioWithStoryboard.scenes,
        activeTab: "storyboard",
      });
    } catch (error) {
      console.error("Error generating storyboard:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while generating storyboard"
      );
      updateState({ scenes: [], activeTab: "scenario" }); // Clear scenes and stay on scenario tab
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateScene = (index: number, updatedScene: Scene) => {
    const newScenes = [...scenes];
    newScenes[index] = updatedScene;
    updateState({ scenes: newScenes });
  };

  const handleUploadImage = async (index: number, file: File) => {
    setErrorMessage(null);
    try {
      console.log(
        `📤 Uploading new image for scene ${index + 1} and clearing video`
      );

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const imageBase64 = base64String.split(",")[1]; // Remove the data URL prefix
        const resizedImageGcsUri = await resizeImage(imageBase64);
        const updatedScenes = [...scenes];
        updatedScenes[index] = {
          ...updatedScenes[index],
          imageGcsUri: resizedImageGcsUri,
          videoUri: undefined, // Explicitly clear video
        };

        console.log(`✅ Scene ${index + 1} image uploaded, video cleared`);
        updateState({ scenes: updatedScenes });
      };
      reader.onerror = () => {
        throw new Error("Failed to read the image file");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading image:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while uploading the image"
      );
    }
  };

  const handleLogoRemove = () => {
    updateState({
      logoOverlay: null,
      scenario: scenario ? { ...scenario, logoOverlay: undefined } : scenario,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Convert file to base64 string
      const base64String = await fileToBase64(file);

      // Call server action to save the image
      const imagePath = await saveImageToPublic(base64String, file.name);

      // Update state with the path to the saved image
      console.log(imagePath);
      updateState({
        logoOverlay: imagePath,
        scenario: scenario ? { ...scenario, logoOverlay: imagePath } : scenario,
      });
    } catch (error) {
      console.error("Error uploading logo:", error);
    }
  };

  // Utility function to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const steps = [
    {
      id: "create",
      label: "Create",
      icon: PenLine,
    },
    {
      id: "scenario",
      label: "Scenario",
      icon: BookOpen,
      disabled: !scenario,
    },
    {
      id: "storyboard",
      label: "Storyboard",
      icon: LayoutGrid,
      disabled: !scenario,
    },
    {
      id: "editor",
      label: "Editor",
      icon: Scissors,
      disabled:
        !scenario ||
        !scenes.every((scene) => typeof scene.videoUri === "string"),
    },
    {
      id: "video",
      label: "Video",
      icon: Film,
      disabled:
        !scenario ||
        !scenes.every((scene) => typeof scene.videoUri === "string"),
    },
  ];

  const handleScenarioUpdate = (updatedScenario: Scenario) => {
    console.log(
      "handleScenarioUpdate called with characters:",
      updatedScenario.characters
    );
    updateState({ scenario: updatedScenario });
  };

  // Helper functions for component props
  const handleTabChange = (tabId: string) => {
    updateState({ activeTab: tabId });
  };

  const handlePitchChange = (newPitch: string) => {
    updateState({ pitch: newPitch });
  };

  const handleNumScenesChange = (newNumScenes: number) => {
    updateState({ numScenes: newNumScenes });
  };

  const handleStyleChange = (newStyle: string) => {
    updateState({ style: newStyle });
  };

  const handleLanguageChange = (newLanguage: Language) => {
    updateState({ language: newLanguage });
  };

  const handleLogoOverlayChange = (newLogoOverlay: string | null) => {
    updateState({ logoOverlay: newLogoOverlay });
  };

  const handleVeoModelChange = (newVeoModel: string) => {
    updateState({ selectedVeoModel: newVeoModel });
  };

  return (
    <main className="container mx-auto p-8 min-h-screen bg-background flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Image
            src="/logo5.png"
            alt="Storycraft"
            width={32}
            height={32}
            className="h-8"
          />
          <h1 className="text-3xl font-bold text-primary ml-[-10px]">
            toryCraft
          </h1>
        </div>
        <ClearProjectButton onClear={clearProject} />
      </div>
      <div className="flex-1 space-y-4">
        <Stepper
          steps={steps}
          currentStep={activeTab}
          onStepClick={handleTabChange}
          className="mb-8"
        />

        {activeTab === "create" && (
          <CreateTab
            pitch={pitch}
            setPitch={handlePitchChange}
            numScenes={numScenes}
            setNumScenes={handleNumScenesChange}
            style={style}
            setStyle={handleStyleChange}
            language={language}
            setLanguage={handleLanguageChange}
            isLoading={isLoading}
            errorMessage={errorMessage}
            onGenerate={handleGenerate}
            styles={defaultStyles}
            customStyles={customStyles}
            onAddCustomStyle={handleAddCustomStyle}
            onRemoveCustomStyle={handleRemoveCustomStyle}
            sessionId={state?.projectId || "default"}
          />
        )}

        {activeTab === "scenario" && (
          <ScenarioTab
            scenario={scenario}
            onGenerateStoryBoard={handleGenerateStoryBoard}
            isLoading={isLoading}
            onScenarioUpdate={handleScenarioUpdate}
            sessionId={state?.projectId || "default"}
            style={style}
          />
        )}

        {activeTab === "storyboard" && (
          <StoryboardTab
            scenes={scenes}
            isVideoLoading={isVideoLoading}
            generatingScenes={generatingScenes}
            errorMessage={errorMessage}
            selectedVeoModel={selectedVeoModel}
            onGenerateAllVideos={handleGenerateAllVideos}
            onUpdateScene={handleUpdateScene}
            onRegenerateImage={handleRegenerateImage}
            onGenerateVideo={handleGenerateVideo}
            onUploadImage={handleUploadImage}
            onVeoModelChange={handleVeoModelChange}
          />
        )}

        {activeTab === "editor" && scenario && (
          <EditorTab
            scenario={scenario}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onTimelineItemUpdate={(layerId, itemId, updates) => {
              // TODO: Implement timeline item updates
              console.log("Timeline item update:", {
                layerId,
                itemId,
                updates,
              });
            }}
            logoOverlay={logoOverlay}
            setLogoOverlay={handleLogoOverlayChange}
            onLogoUpload={handleLogoUpload}
            onLogoRemove={handleLogoRemove}
            onGenerateMusic={handleGenerateMusic}
            isGeneratingMusic={isGeneratingMusic}
            onGenerateVoiceover={handleGenerateVoiceover}
            isGeneratingVoiceover={isGeneratingVoiceover}
            onExportMovie={handleExportMovie}
            isExporting={isVideoLoading}
          />
        )}

        {activeTab === "video" && (
          <VideoTab
            videoUri={videoUri}
            vttUri={vttUri}
            isVideoLoading={isVideoLoading}
            language={scenario?.language || DEFAULT_LANGUAGE}
          />
        )}
      </div>
      <footer className="mt-auto pt-8">
        <div className="flex items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground">
            Made with ❤️ by @mblanc
          </p>
        </div>
      </footer>
    </main>
  );
}

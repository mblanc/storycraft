import { Scenario, Scene, Language } from "@/app/types";

const STORAGE_KEY = "storycraft-project";
export const CURRENT_VERSION = "1.0.1";

export interface Style {
  name: string;
  image: string;
}

export interface PersistedProjectState {
  // Input Configuration
  pitch: string;
  style: string;
  language: Language;
  numScenes: number;
  withVoiceOver: boolean;
  logoOverlay: string | null;
  customStyles: Style[];
  selectedVeoModel: string;

  // Generated Content
  scenario: Scenario | undefined;
  scenes: Scene[];
  videoUri: string | null;
  vttUri: string | null;

  // UI State
  activeTab: string;

  // Metadata
  projectId: string;
  lastModified: Date;
  version: string;
}

export const loadProject = (): PersistedProjectState | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Simple version check - if mismatch, alert and clear
    if (parsed.version !== CURRENT_VERSION) {
      alert("App has been updated. Your previous session will be cleared.");
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Convert date string back to Date object
    if (parsed.lastModified) {
      parsed.lastModified = new Date(parsed.lastModified);
    }

    return parsed as PersistedProjectState;
  } catch (error) {
    console.error("Failed to load project:", error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const saveProject = (state: PersistedProjectState): void => {
  try {
    const toSave = {
      ...state,
      lastModified: new Date(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error("Failed to save project:", error);
  }
};

export const clearProject = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear project:", error);
  }
};

export const getInitialTab = (state: PersistedProjectState | null): string => {
  if (!state || !state.pitch) return "create";
  if (!state.scenario) return "create";
  if (!state.scenes.length) return "scenario";
  if (state.scenes.some((s) => !s.videoUri)) return "storyboard";
  if (!state.videoUri) return "editor";
  return "video";
};

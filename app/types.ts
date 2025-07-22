export interface Scene {
  imagePrompt: string;
  videoPrompt: string;
  description: string;
  voiceover: string;
  charactersPresent: string[];
  imageGcsUri?: string;
  videoUri?: string | Promise<string>;
  voiceoverAudioUri?: string | Promise<string>;
}

export interface Scenario {
  scenario: string;
  genre: string;
  mood: string;
  music: string;
  musicUrl?: string;
  language: Language;
  characters: Array<{
    id: string;
    name: string;
    description: string;
    imageGcsUri?: string;
  }>;
  settings: Array<{ id?: string; name: string; description: string }>;
  logoOverlay?: string;
  scenes: Scene[];
}

export interface Language {
  name: string;
  code: string;
}

export interface TimelineLayer {
  id: string;
  name: string;
  type: "video" | "voiceover" | "music";
  items: TimelineItem[];
}

export interface TimelineItem {
  id: string;
  startTime: number;
  duration: number;
  content: string; // URL for video/music/voiceover
  type: "video" | "voiceover" | "music";
  metadata?: {
    logoOverlay?: string;
    [key: string]: any; // Allow for additional metadata fields
  };
}

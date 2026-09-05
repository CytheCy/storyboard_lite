declare module "nspell" {
  type Dictionary = { aff: string; dic?: string };
  type SpellChecker = {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): SpellChecker;
  };
  export default function nspell(dictionary: Dictionary): SpellChecker;
  export default function nspell(aff: string, dic?: string): SpellChecker;
}

declare module "*.aff?raw" {
  const value: string;
  export default value;
}

declare module "*.dic?raw" {
  const value: string;
  export default value;
}

interface Window {
  frameforge?: {
    openPath(options: { directory: boolean; proseOnly: boolean }): Promise<string | null>;
    runStoryboard(job: {
      prosePath: string;
      outputPath: string;
      promptPath: string;
      imageFormat: "1:1" | "9:16" | "16:9";
      promptModel: { name: string; provider: string; apiKeyPath: string };
      imageModel: { name: string; provider: string; apiKeyPath: string };
      environments: Array<{ title: string; description: string; negativePrompt?: string; enabled: boolean }>;
      styles: Array<{ title: string; description: string; enabled: boolean }>;
    }): Promise<{ scenes: number; promptFiles: string[]; imageFiles: string[] }>;
    onProgress(callback: (update: { progress: number; message: string }) => void): () => void;
  };
}

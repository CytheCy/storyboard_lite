const fs = require("node:fs/promises");
const path = require("node:path");

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const IMAGES_URL = "https://api.openai.com/v1/images/generations";

const SCENE_DETECTION_INSTRUCTIONS = `
You are a professional story analyst and storyboard supervisor.

Divide the supplied prose into discrete visual scenes. Begin a new scene for a
meaningful time shift, location change, subject or point-of-view shift, or a hard
change in tone. Keep continuous action in the same place together. Explicitly
list every character physically present in each scene.

Return only a JSON array. Do not repeat the prose. Each item must contain:
scene_number, scene_title, location, time, characters, prose_start, and prose_end.
Offsets are zero-based character offsets into the original prose. Adjacent scenes
must share boundaries, the first scene must start at 0, and the final scene must
end at the supplied character count.`;

const IMAGE_PROMPT_INSTRUCTIONS = `
You are an expert visual concept artist and storyboard prompt writer. Produce one
complete text-to-image prompt for the supplied scene. The prompt must faithfully
use the supplied ENVIRONMENT in its setting, architecture, objects, technology,
clothing, atmosphere, and other applicable visual details. Treat the environment
as required art direction for every prompt; do not omit it or replace it with a
generic setting.

Write these labeled sections: SHOT TYPE, SUBJECT, FOREGROUND, BACKGROUND,
LIGHTING, ATMOSPHERE, TEXTURE, and NEGATIVE PROMPT. Return only the prompt text,
with no markdown fence and no commentary. Do not add a STYLE section; the app
will append the user's exact Style description after you finish.`;

function cleanModelName(model, kind) {
  const value = String(model?.name ?? "").trim();
  const aliases = kind === "prompt"
    ? { "GPT-5": "gpt-5" }
    : { "GPT Image 1": "gpt-image-1", "GPT Image 1 Mini": "gpt-image-1-mini" };
  return aliases[value] ?? value;
}

function requireOpenAIModel(model, kind) {
  if (!model) throw new Error(`Choose a ${kind} model.`);
  if (String(model.provider).trim().toLowerCase() !== "openai") {
    throw new Error(`${model.name} uses ${model.provider}. This pipeline currently supports OpenAI models.`);
  }
  const name = cleanModelName(model, kind);
  if (!name) throw new Error(`The selected ${kind} model has no model name.`);
  return name;
}

async function readApiKey(filePath, label) {
  if (!String(filePath ?? "").trim()) throw new Error(`Choose an API key file for the ${label}.`);
  let contents;
  try {
    contents = (await fs.readFile(filePath, "utf8")).trim();
  } catch (error) {
    throw new Error(`Could not read the ${label} API key file: ${error.message}`);
  }
  const assignment = contents.match(/(?:^|\n)\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*["']?([^\s"']+)/);
  const key = assignment?.[1] ?? contents.split(/\s+/)[0];
  if (!key) throw new Error(`The ${label} API key file is empty.`);
  return key;
}

async function apiRequest(url, apiKey, body, timeoutMs = 180_000) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function responseText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const text = (data.output ?? [])
    .filter(item => item?.type === "message")
    .flatMap(item => item.content ?? [])
    .filter(item => item?.type === "output_text" && typeof item.text === "string")
    .map(item => item.text)
    .join("");
  if (!text.trim()) throw new Error("The prompt model returned no text.");
  return text.trim();
}

function responseControls(model, verbosity) {
  if (/^gpt-5(?:-|$)/i.test(model)) {
    return { reasoning: { effort: "minimal" }, text: { verbosity } };
  }
  if (/^(?:gpt-5\.|gpt-6|o[134](?:-|$))/i.test(model)) {
    return { reasoning: { effort: "low" }, text: { verbosity } };
  }
  return {};
}

async function callPromptModel({
  apiKey,
  model,
  instructions,
  input,
  maxOutputTokens,
  retryMaxOutputTokens,
  verbosity = "medium",
  label = "Prompt"
}) {
  const limits = [maxOutputTokens, retryMaxOutputTokens].filter((value, index, values) =>
    Number.isFinite(value) && value > 0 && values.indexOf(value) === index
  );

  for (let attempt = 0; attempt < limits.length; attempt += 1) {
    const data = await apiRequest(RESPONSES_URL, apiKey, {
      model,
      instructions,
      input,
      max_output_tokens: limits[attempt],
      store: false,
      ...responseControls(model, verbosity)
    });
    if (data.status !== "incomplete") return responseText(data);

    const reason = data.incomplete_details?.reason ?? "unknown reason";
    if (reason !== "max_output_tokens" || attempt === limits.length - 1) {
      const used = data.usage?.output_tokens ? ` after ${data.usage.output_tokens} output tokens` : "";
      throw new Error(`${label} response was incomplete (${reason})${used}.`);
    }
  }

  throw new Error(`${label} response could not be completed.`);
}

function parseScenes(raw, prose) {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let scenes;
  try {
    scenes = JSON.parse(json);
  } catch (error) {
    throw new Error(`Could not parse the scene list returned by the prompt model: ${error.message}`);
  }
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error("The prompt model returned no scenes.");

  return scenes.map((scene, index) => {
    const fallbackStart = index === 0 ? 0 : Number(scenes[index - 1]?.prose_end ?? 0);
    const start = Math.max(0, Math.min(prose.length, Number(scene.prose_start ?? fallbackStart)));
    const fallbackEnd = index === scenes.length - 1 ? prose.length : Number(scenes[index + 1]?.prose_start ?? prose.length);
    const end = Math.max(start, Math.min(prose.length, Number(scene.prose_end ?? fallbackEnd)));
    return {
      sceneNumber: Number(scene.scene_number) || index + 1,
      title: String(scene.scene_title || `Scene ${index + 1}`),
      location: String(scene.location || "Unspecified"),
      time: scene.time == null ? "Unspecified" : String(scene.time),
      characters: Array.isArray(scene.characters) ? scene.characters.map(String) : [],
      prose: prose.slice(start, end).trim() || prose
    };
  });
}

function buildImagePromptInput(scene, environment) {
  const characters = scene.characters.length ? scene.characters.join(", ") : "None specified";
  const negative = String(environment.negativePrompt ?? "").trim() || "None supplied";
  return `ENVIRONMENT (required in this prompt):
Name: ${environment.title}
Description:
${environment.description.trim()}

Environment exclusions for NEGATIVE PROMPT:
${negative}

SCENE METADATA:
Title: ${scene.title}
Location: ${scene.location}
Time: ${scene.time}
Characters present: ${characters}

SCENE PROSE:
${scene.prose}

Write the complete storyboard image prompt now. Use the ENVIRONMENT throughout.`;
}

function appendStyleDescription(aiPrompt, styles) {
  const descriptions = styles.map(style => String(style.description).trim()).filter(Boolean);
  return `${aiPrompt.trim()}\n\nSTYLE:\n${descriptions.join("\n\n")}`;
}

function stripMarkdownFence(value) {
  return value.trim().replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function safeStem(value) {
  return value.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "storyboard";
}

async function availablePath(directory, filename) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = path.join(directory, filename);
  for (let version = 1; ; version += 1) {
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${stem}_v${String(version).padStart(2, "0")}${extension}`);
    } catch {
      return candidate;
    }
  }
}

function markdownForScene(scene, finalPrompt) {
  const characters = scene.characters.length ? scene.characters.join(", ") : "-";
  return `# Scene ${scene.sceneNumber}: ${scene.title}\n\n**Location:** ${scene.location}  \n**Time:** ${scene.time}  \n**Characters:** ${characters}\n\n---\n\n\`\`\`text\n${finalPrompt}\n\`\`\`\n`;
}

async function generateImage({ apiKey, model, prompt, imageFormat }) {
  const size = { "1:1": "1024x1024", "9:16": "1024x1536", "16:9": "1536x1024" }[imageFormat] ?? "1536x1024";
  const data = await apiRequest(IMAGES_URL, apiKey, { model, prompt, size }, 240_000);
  const image = data?.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) {
    const response = await fetch(image.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Could not download the generated image (${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("The image model returned no image data.");
}

function validateJob(job) {
  if (!job?.prosePath || !job?.promptPath || !job?.outputPath) {
    throw new Error("Choose a prose file, prompt folder, and storyboard folder.");
  }
  const environment = (job.environments ?? []).find(item => item.enabled);
  if (!environment?.description?.trim()) {
    throw new Error("Enable one Environment and give it an Environment description before generating.");
  }
  const styles = (job.styles ?? []).filter(item => item.enabled && item.description?.trim());
  if (styles.length === 0) {
    throw new Error("Enable at least one Style with a Style description before generating.");
  }
  return { environment, styles };
}

async function runStoryboardPipeline(job, onProgress = () => {}) {
  const { environment, styles } = validateJob(job);
  const promptModel = requireOpenAIModel(job.promptModel, "prompt");
  const imageModel = requireOpenAIModel(job.imageModel, "image");
  const [promptKey, imageKey] = await Promise.all([
    readApiKey(job.promptModel.apiKeyPath, "prompt model"),
    readApiKey(job.imageModel.apiKeyPath, "image model")
  ]);

  await Promise.all([fs.mkdir(job.promptPath, { recursive: true }), fs.mkdir(job.outputPath, { recursive: true })]);
  const prose = (await fs.readFile(job.prosePath, "utf8")).trim();
  if (!prose) throw new Error("The selected prose file is empty.");

  onProgress({ progress: 4, message: "Reading prose and identifying scenes" });
  const sceneText = await callPromptModel({
    apiKey: promptKey,
    model: promptModel,
    instructions: SCENE_DETECTION_INSTRUCTIONS,
    input: `Divide this prose into scenes. Character count: ${prose.length}\n\nPROSE:\n${prose}`,
    maxOutputTokens: 12_000,
    retryMaxOutputTokens: 32_000,
    verbosity: "low",
    label: "Scene detection"
  });
  const scenes = parseScenes(sceneText, prose);
  onProgress({ progress: 18, message: `Found ${scenes.length} scene${scenes.length === 1 ? "" : "s"}` });

  const sourceStem = safeStem(path.basename(job.prosePath, path.extname(job.prosePath)));
  const promptResults = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    onProgress({
      progress: 20 + Math.round(((index + 1) / scenes.length) * 35),
      message: `Writing prompt ${index + 1} of ${scenes.length} with ${environment.title}`
    });
    const aiPrompt = await callPromptModel({
      apiKey: promptKey,
      model: promptModel,
      instructions: IMAGE_PROMPT_INSTRUCTIONS,
      input: buildImagePromptInput(scene, environment),
      maxOutputTokens: 2_000,
      retryMaxOutputTokens: 6_000,
      verbosity: "medium",
      label: `Scene ${scene.sceneNumber} prompt`
    });
    const finalPrompt = appendStyleDescription(stripMarkdownFence(aiPrompt), styles);
    const tag = String(scene.sceneNumber).padStart(Math.max(2, String(scenes.length).length), "0");
    const promptFile = await availablePath(job.promptPath, `${sourceStem}_scene_${tag}.md`);
    await fs.writeFile(promptFile, markdownForScene(scene, finalPrompt), "utf8");
    promptResults.push({ scene, finalPrompt, promptFile });
  }

  const imageFiles = [];
  for (let index = 0; index < promptResults.length; index += 1) {
    const item = promptResults[index];
    onProgress({
      progress: 58 + Math.round(((index + 1) / promptResults.length) * 39),
      message: `Rendering storyboard ${index + 1} of ${promptResults.length}`
    });
    const bytes = await generateImage({
      apiKey: imageKey,
      model: imageModel,
      prompt: item.finalPrompt,
      imageFormat: job.imageFormat
    });
    const imageFile = await availablePath(job.outputPath, `${path.basename(item.promptFile, ".md")}.png`);
    await fs.writeFile(imageFile, bytes);
    imageFiles.push(imageFile);
  }

  onProgress({ progress: 100, message: `Created ${imageFiles.length} storyboard${imageFiles.length === 1 ? "" : "s"}` });
  return {
    scenes: scenes.length,
    promptFiles: promptResults.map(item => item.promptFile),
    imageFiles
  };
}

module.exports = {
  appendStyleDescription,
  buildImagePromptInput,
  runStoryboardPipeline,
  validateJob
};

import "./style.css";
import nspell from "nspell";
import aff from "dictionary-en-us/index.aff?raw";
import dic from "dictionary-en-us/index.dic?raw";

type Tab = "settings" | "environment" | "style";
type ModelKind = "prompt" | "image";
type Theme = "light" | "dark";
type ImageFormat = "1:1" | "9:16" | "16:9";
type Model = { id: string; name: string; provider: string; apiKeyPath: string };
type LibraryItem = { id: string; title: string; description: string; negativePrompt?: string; enabled: boolean };
type AppState = {
  activeTab: Tab;
  theme: Theme;
  imageFormat: ImageFormat;
  prosePath: string;
  outputPath: string;
  promptPath: string;
  promptModels: Model[];
  imageModels: Model[];
  selectedPromptModel: string;
  selectedImageModel: string;
  environments: LibraryItem[];
  styles: LibraryItem[];
};

const icon = (name: "file" | "folder" | "plus" | "trash" | "spark" | "check" | "chevron" | "play" | "save") => {
  const paths = {
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    spark: '<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7zM5 14l.7 1.8L8 17l-2.3.8L5 20l-.7-2.2L2 17l2.3-1.2z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    save: '<path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>'
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name]}</svg>`;
};

const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const initialState: AppState = {
  activeTab: "settings",
  theme: "light",
  imageFormat: "16:9",
  prosePath: "",
  outputPath: "",
  promptPath: "",
  promptModels: [
    { id: uid(), name: "GPT-5", provider: "OpenAI", apiKeyPath: "" },
    { id: uid(), name: "Claude Sonnet", provider: "Anthropic", apiKeyPath: "" }
  ],
  imageModels: [
    { id: uid(), name: "GPT Image 1", provider: "OpenAI", apiKeyPath: "" },
    { id: uid(), name: "Flux Pro", provider: "Black Forest Labs", apiKeyPath: "" }
  ],
  selectedPromptModel: "",
  selectedImageModel: "",
  environments: [{ id: uid(), title: "Primary environment", description: "", negativePrompt: "", enabled: true }],
  styles: [{ id: uid(), title: "Primary visual style", description: "", enabled: true }]
};
initialState.selectedPromptModel = initialState.promptModels[0].id;
initialState.selectedImageModel = initialState.imageModels[0].id;

const saved = localStorage.getItem("frameforge-state");
let state: AppState = saved ? { ...initialState, ...JSON.parse(saved) } : initialState;
const spaceRingsRecoveryKey = "frameforge-recovery-space-rings-v1";
if (!localStorage.getItem(spaceRingsRecoveryKey)) {
  const recoveredDescription = `  * Cinematic composition — choose a clear shot type (wide, medium, close-up, POV)
  * Clean vector-like lines
All rooms are gently curved, sunken in the middle and higher on the ends.
Lighting is integrated into walls.
Most walls act as screens and can show scenes, the scenes are usually of nature or space.
People wear papery clothes.
All adults wear caps with nodes and circuses.
Everything is made of futuristic material.
Everything is clean and new looking.`;
  const spaceRings = state.environments.find(environment => /space rings?|space ring ships?/i.test(environment.title));
  if (spaceRings) {
    if (!spaceRings.description.trim()) spaceRings.description = recoveredDescription;
  } else {
    state.environments.push({ id: uid(), title: "Space Ring Ships", description: recoveredDescription, negativePrompt: "", enabled: false });
  }
  localStorage.setItem("frameforge-state", JSON.stringify(state));
  localStorage.setItem(spaceRingsRecoveryKey, "complete");
}
const spellChecker = nspell(aff, dic);
const personalWords: string[] = JSON.parse(localStorage.getItem("frameforge-dictionary") ?? "[]");
["Frameforge", "storyboard", "storyboards", "KDE", "API", "GPT", ...personalWords].forEach(word => spellChecker.add(word));
let progress = 0;
let isRunning = false;
let eventMessage = "Ready to begin";
let eventTime = "";

const app = document.querySelector<HTMLDivElement>("#app")!;
const persist = () => localStorage.setItem("frameforge-state", JSON.stringify(state));
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]!);

function render() {
  document.documentElement.dataset.theme = state.theme;
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="Frameforge home">
          <span class="brand-mark">${icon("spark")}</span>
          <span>Frameforge</span>
          <small>Storyboard studio</small>
        </a>
        <nav class="tabs" aria-label="Workspace pages">
          ${tabButton("settings", "Settings", "01")}
          ${tabButton("environment", "Environment", "02")}
          ${tabButton("style", "Style", "03")}
        </nav>
        <span class="status-pill"><i></i> Local draft</span>
      </header>
      <main>${renderPage()}</main>
      ${renderFooter()}
    </div>`;
  bindEvents();
}

function tabButton(tab: Tab, label: string, index: string) {
  return `<button class="tab ${state.activeTab === tab ? "active" : ""}" data-tab="${tab}"><span>${index}</span>${label}</button>`;
}

function renderPage() {
  if (state.activeTab === "settings") return renderSettings();
  if (state.activeTab === "environment") return renderLibrary("environment");
  return renderLibrary("style");
}

function pageIntro(kicker: string, title: string, description: string) {
  return `<section class="page-intro"><p class="kicker">${kicker}</p><h1>${title}</h1><p>${description}</p></section>`;
}

function renderSettings() {
  return `<div class="page settings-page">
    <div class="settings-header">
      ${pageIntro("Project setup", "Shape the story, frame by frame.", "Choose your source, destination, and the creative engines behind your storyboard.")}
      <div class="theme-picker" aria-label="Appearance">
        <span>Appearance</span>
        <div class="theme-options" role="radiogroup" aria-label="Color theme">
          <button class="theme-option ${state.theme === "light" ? "active" : ""}" role="radio" aria-checked="${state.theme === "light"}" data-theme-choice="light"><i class="sun-icon"></i>Light</button>
          <button class="theme-option ${state.theme === "dark" ? "active" : ""}" role="radio" aria-checked="${state.theme === "dark"}" data-theme-choice="dark"><i class="moon-icon"></i>Dark</button>
        </div>
      </div>
    </div>
    <section class="settings-grid">
      <article class="panel source-panel">
        <div class="panel-heading"><span class="step">A</span><div><h2>Source & output</h2><p>Point Frameforge to your prose and a home for the finished frames.</p></div></div>
        ${pathField("prosePath", "Prose file", "Select a .txt or .md file", "file", "file")}
        ${pathField("outputPath", "Storyboard folder", "Choose where generated images will be saved", "folder", "directory")}
        ${pathField("promptPath", "Prompt folder", "Choose where generated prompts will be saved", "folder", "directory")}
        ${renderImageFormat()}
      </article>
      ${renderModelPanel("prompt", "Prompt writer", "Uses the active Environment in every scene prompt.", state.promptModels, state.selectedPromptModel)}
      ${renderModelPanel("image", "Image maker", "Renders each approved visual prompt.", state.imageModels, state.selectedImageModel)}
    </section>
  </div>`;
}

function pathField(key: "prosePath" | "outputPath" | "promptPath", label: string, placeholder: string, type: "file" | "folder", picker: "file" | "directory") {
  const value = state[key];
  return `<div class="field path-field"><label>${label}</label><div class="path-control ${value ? "has-value" : ""}"><span class="path-icon">${icon(type)}</span><span class="path-value">${value ? escapeHtml(value) : placeholder}</span><button class="browse" data-pick="${picker}" data-target="${key}">Browse</button></div></div>`;
}

function renderImageFormat() {
  const formats: ImageFormat[] = ["1:1", "9:16", "16:9"];
  return `<div class="field format-field">
    <label>Image format</label>
    <div class="format-options" role="radiogroup" aria-label="Image format">
      ${formats.map(format => `<button class="format-option ${state.imageFormat === format ? "active" : ""}" role="radio" aria-checked="${state.imageFormat === format}" data-image-format="${format}"><i class="format-shape format-${format.replace(":", "-")}"></i><span>${format}</span></button>`).join("")}
    </div>
  </div>`;
}

function renderModelPanel(kind: ModelKind, title: string, description: string, models: Model[], selected: string) {
  return `<article class="panel model-panel">
    <div class="panel-heading"><span class="step">${kind === "prompt" ? "B" : "C"}</span><div><h2>${title}</h2><p>${description}</p></div></div>
    <div class="model-list">
      ${models.map(model => `<div class="model-row ${selected === model.id ? "selected" : ""}">
        <button class="model-choice" role="radio" aria-checked="${selected === model.id}" data-select-model="${model.id}" data-kind="${kind}">
          <span class="checkbox">${selected === model.id ? icon("check") : ""}</span>
          <span><strong>${escapeHtml(model.name)}</strong><small>${escapeHtml(model.provider)}</small></span>
        </button>
        <div class="key-path"><span>${model.apiKeyPath ? escapeHtml(model.apiKeyPath) : "API key file not set"}</span><button title="Choose API key file" data-key-model="${model.id}" data-kind="${kind}">${icon("file")}</button></div>
      </div>`).join("")}
    </div>
    <button class="add-button" data-add-model="${kind}">${icon("plus")} Add model</button>
  </article>`;
}

function renderLibrary(type: "environment" | "style") {
  const isEnvironment = type === "environment";
  const items = isEnvironment ? state.environments : state.styles;
  return `<div class="page library-page">
    <div class="library-header">
      ${pageIntro(isEnvironment ? "World building" : "Visual language", isEnvironment ? "Set the scene." : "Define the look.", isEnvironment ? "Describe recurring locations and worlds. The active Environment is sent to the prompt writer for every scene." : "Active Style descriptions are appended exactly after the prompt writer finishes each scene prompt.")}
      <button class="primary-add" data-add-item="${type}">${icon("plus")} Add ${type}</button>
    </div>
    <div class="item-count"><span>${String(items.length).padStart(2, "0")}</span> ${type}${items.length === 1 ? "" : "s"} in this project</div>
    <section class="library-list">
      ${items.length ? items.map((item, index) => renderLibraryItem(type, item, index)).join("") : `<div class="empty-state">${icon("spark")}<h2>No ${type}s yet</h2><p>Add one when you are ready to define this part of your storyboard.</p></div>`}
    </section>
  </div>`;
}

function renderLibraryItem(type: "environment" | "style", item: LibraryItem, index: number) {
  const placeholder = type === "environment"
    ? "Describe the location, time of day, weather, architecture, mood, and recurring details…"
    : "Describe the medium, color palette, lighting, composition, lens, texture, and overall mood…";
  return `<article class="library-card ${item.enabled ? "enabled" : ""}" data-item-card="${item.id}">
    <div class="card-number">${String(index + 1).padStart(2, "0")}</div>
    <div class="card-content">
      <div class="card-topline">
        <div class="title-editor"><input class="title-input spell-input" aria-label="${type} title" data-item-title="${item.id}" data-type="${type}" value="${escapeHtml(item.title)}" spellcheck="true" autocapitalize="sentences" /><div class="spell-feedback compact" aria-live="polite"></div></div>
        <div class="card-actions">
          <label class="use-toggle"><input type="checkbox" data-item-enabled="${item.id}" data-type="${type}" ${item.enabled ? "checked" : ""}/><span>${icon("check")}</span>Use this</label>
          <button class="delete-button" title="Delete ${type}" data-delete-item="${item.id}" data-type="${type}">${icon("trash")}</button>
        </div>
      </div>
      <label class="textarea-label">${type === "environment" ? "Environment description" : "Style description"}</label>
      <textarea class="spell-input" data-item-description="${item.id}" data-type="${type}" placeholder="${placeholder}" spellcheck="true" autocapitalize="sentences">${escapeHtml(item.description)}</textarea>
      <div class="spell-feedback" aria-live="polite"></div>
      ${type === "environment" ? `<label class="textarea-label negative-label">Negative prompt</label><textarea class="negative-prompt spell-input" data-item-negative="${item.id}" data-type="${type}" placeholder="Describe anything that should not appear in this environment…" spellcheck="true" autocapitalize="sentences">${escapeHtml(item.negativePrompt ?? "")}</textarea><div class="spell-feedback" aria-live="polite"></div>` : ""}
      <div class="card-meta"><span>${item.description.length} characters</span><span>${item.enabled ? "Included in generation" : "Not included"}</span></div>
    </div>
  </article>`;
}

function renderFooter() {
  return `<footer class="footer">
    <div class="event-block"><span class="event-label">Latest event</span><p><i class="event-dot ${isRunning ? "working" : ""}"></i>${eventMessage}</p>${eventTime ? `<time>${eventTime}</time>` : ""}</div>
    <div class="progress-block"><div class="progress-copy"><span>Overall progress</span><strong>${progress}%</strong></div><div class="progress-track"><span style="width:${progress}%"></span></div></div>
    <div class="footer-actions">
      <button class="save-button" ${isRunning ? "disabled" : ""}>${icon("save")} Save</button>
      <button class="make-button" ${isRunning ? "disabled" : ""}>${isRunning ? '<span class="spinner"></span>Creating storyboard' : `${icon("play")} Make storyboards`}</button>
    </div>
  </footer>`;
}

async function choosePath(directory: boolean, proseOnly = false): Promise<string | null> {
  if (window.frameforge) return window.frameforge.openPath({ directory, proseOnly });
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => resolve(input.files?.[0]?.name ?? null);
    input.click();
  });
}

function getItems(type: string) { return type === "environment" ? state.environments : state.styles; }
function saveAndRender() { persist(); render(); }

function spellingIssues(value: string) {
  const words = value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
  return [...new Set(words.filter(word => word.length > 2 && !/^[A-Z]{2,}$/.test(word) && !spellChecker.correct(word) && !spellChecker.correct(word.toLowerCase())))];
}

function updateSpellFeedback(editor: HTMLInputElement | HTMLTextAreaElement) {
  const feedback = editor.nextElementSibling as HTMLElement | null;
  if (!feedback?.classList.contains("spell-feedback")) return;
  const issues = spellingIssues(editor.value);
  if (!editor.value.trim()) { feedback.innerHTML = '<span class="spell-idle">Spell check ready</span>'; return; }
  if (!issues.length) { feedback.innerHTML = `<span class="spell-ok">${icon("check")} No spelling issues</span>`; return; }
  feedback.innerHTML = `<span class="spell-summary">${issues.length} possible ${issues.length === 1 ? "misspelling" : "misspellings"}</span><div class="spell-issues">${issues.slice(0, 4).map(word => {
    const suggestions = spellChecker.suggest(word).slice(0, 3);
    return `<span class="spell-issue"><strong>${escapeHtml(word)}</strong>${suggestions.map(suggestion => `<button data-spell-word="${escapeHtml(word)}" data-spell-replacement="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`).join("")}<button class="learn-word" title="Add to dictionary" data-learn-word="${escapeHtml(word)}">＋</button></span>`;
  }).join("")}</div>`;
}

function preserveCase(original: string, replacement: string) {
  return /^[A-Z]/.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

function bindEvents() {
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach(el => el.onclick = () => { state.activeTab = el.dataset.tab as Tab; saveAndRender(); });
  document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach(el => el.onclick = () => {
    state.theme = el.dataset.themeChoice as Theme;
    saveAndRender();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-image-format]").forEach(el => el.onclick = () => {
    state.imageFormat = el.dataset.imageFormat as ImageFormat;
    saveAndRender();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach(el => el.onclick = async () => {
    const result = await choosePath(el.dataset.pick === "directory", el.dataset.target === "prosePath");
    if (result) { (state as unknown as Record<string, string>)[el.dataset.target!] = result; saveAndRender(); }
  });
  document.querySelectorAll<HTMLButtonElement>("[data-select-model]").forEach(el => el.onclick = () => {
    if (el.dataset.kind === "prompt") state.selectedPromptModel = el.dataset.selectModel!;
    else state.selectedImageModel = el.dataset.selectModel!;
    saveAndRender();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-key-model]").forEach(el => el.onclick = async () => {
    const result = await choosePath(false); if (!result) return;
    const models = el.dataset.kind === "prompt" ? state.promptModels : state.imageModels;
    const model = models.find(m => m.id === el.dataset.keyModel); if (model) model.apiKeyPath = result;
    saveAndRender();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-add-model]").forEach(el => el.onclick = () => {
    const kind = el.dataset.addModel as ModelKind;
    const name = window.prompt("Model name"); if (!name?.trim()) return;
    const provider = window.prompt("Provider", "Custom")?.trim() || "Custom";
    const model = { id: uid(), name: name.trim(), provider, apiKeyPath: "" };
    if (kind === "prompt") state.promptModels.push(model); else state.imageModels.push(model);
    saveAndRender();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-add-item]").forEach(el => el.onclick = () => {
    const type = el.dataset.addItem!; const items = getItems(type);
    items.push({ id: uid(), title: type === "environment" ? `Untitled environment ${items.length + 1}` : `Untitled style ${items.length + 1}`, description: "", negativePrompt: type === "environment" ? "" : undefined, enabled: true });
    saveAndRender(); requestAnimationFrame(() => document.querySelector(`[data-item-card]:last-child`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-delete-item]").forEach(el => el.onclick = () => {
    const items = getItems(el.dataset.type!);
    const index = items.findIndex(item => item.id === el.dataset.deleteItem); if (index >= 0) items.splice(index, 1);
    saveAndRender();
  });
  document.querySelectorAll<HTMLInputElement>("[data-item-enabled]").forEach(el => el.onchange = () => {
    const items = getItems(el.dataset.type!);
    const item = items.find(i => i.id === el.dataset.itemEnabled);
    if (item) {
      if (el.dataset.type === "environment" && el.checked) items.forEach(environment => environment.enabled = environment.id === item.id);
      else item.enabled = el.checked;
    }
    saveAndRender();
  });
  document.querySelectorAll<HTMLInputElement>("[data-item-title]").forEach(el => el.oninput = () => {
    const item = getItems(el.dataset.type!).find(i => i.id === el.dataset.itemTitle); if (item) { item.title = el.value; persist(); updateSpellFeedback(el); }
  });
  document.querySelectorAll<HTMLTextAreaElement>("[data-item-description]").forEach(el => el.oninput = () => {
    const item = getItems(el.dataset.type!).find(i => i.id === el.dataset.itemDescription); if (item) { item.description = el.value; persist(); el.closest(".card-content")!.querySelector(".card-meta span")!.textContent = `${el.value.length} characters`; updateSpellFeedback(el); }
  });
  document.querySelectorAll<HTMLTextAreaElement>("[data-item-negative]").forEach(el => el.oninput = () => {
    const item = state.environments.find(i => i.id === el.dataset.itemNegative); if (item) { item.negativePrompt = el.value; persist(); updateSpellFeedback(el); }
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(".spell-input").forEach(updateSpellFeedback);
  document.querySelectorAll<HTMLElement>(".spell-feedback").forEach(feedback => feedback.onclick = event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    const editor = feedback.previousElementSibling as HTMLInputElement | HTMLTextAreaElement | null;
    if (!button || !editor) return;
    if (button.dataset.spellReplacement && button.dataset.spellWord) {
      const original = button.dataset.spellWord;
      const replacement = preserveCase(original, button.dataset.spellReplacement);
      editor.value = editor.value.replace(new RegExp(`\\b${original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), replacement);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (button.dataset.learnWord) {
      spellChecker.add(button.dataset.learnWord);
      if (!personalWords.includes(button.dataset.learnWord)) personalWords.push(button.dataset.learnWord);
      localStorage.setItem("frameforge-dictionary", JSON.stringify(personalWords));
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(".spell-input").forEach(updateSpellFeedback);
    }
  });
  document.querySelector<HTMLButtonElement>(".make-button")!.onclick = runStoryboard;
  document.querySelector<HTMLButtonElement>(".save-button")!.onclick = saveProject;
}

function saveProject() {
  persist();
  eventMessage = "Project settings saved";
  eventTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  render();
}

async function runStoryboard() {
  if (!state.prosePath || !state.outputPath || !state.promptPath) {
    state.activeTab = "settings"; eventMessage = "Choose a prose file, storyboard folder, and prompt folder first"; eventTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); render(); return;
  }
  const promptModel = state.promptModels.find(model => model.id === state.selectedPromptModel);
  const imageModel = state.imageModels.find(model => model.id === state.selectedImageModel);
  const environment = state.environments.find(item => item.enabled && item.description.trim());
  const style = state.styles.find(item => item.enabled && item.description.trim());
  if (!promptModel || !imageModel) {
    eventMessage = "Choose a prompt model and image model first"; eventTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); render(); return;
  }
  if (!environment) {
    state.activeTab = "environment"; eventMessage = "Enable an Environment and add its description first"; eventTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); render(); return;
  }
  if (!style) {
    state.activeTab = "style"; eventMessage = "Enable a Style and add its description first"; eventTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); render(); return;
  }
  if (!window.frameforge) {
    eventMessage = "Storyboard generation is available in the Electron app"; eventTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); render(); return;
  }

  isRunning = true; progress = 1; eventMessage = "Starting storyboard pipeline"; eventTime = ""; render();
  try {
    const result = await window.frameforge.runStoryboard({
      prosePath: state.prosePath,
      outputPath: state.outputPath,
      promptPath: state.promptPath,
      imageFormat: state.imageFormat,
      promptModel,
      imageModel,
      environments: state.environments,
      styles: state.styles
    });
    progress = 100;
    eventMessage = `Created ${result.imageFiles.length} storyboard${result.imageFiles.length === 1 ? "" : "s"} from ${result.scenes} scene${result.scenes === 1 ? "" : "s"}`;
  } catch (error) {
    progress = 0;
    const message = error instanceof Error ? error.message : String(error);
    eventMessage = message.replace(/^Error invoking remote method '[^']+': Error:\s*/, "");
  } finally {
    isRunning = false;
    eventTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    render();
  }
}

window.frameforge?.onProgress(update => {
  progress = update.progress;
  eventMessage = update.message;
  render();
});

render();

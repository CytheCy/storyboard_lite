import "./style.css";
import nspell from "nspell";
import aff from "dictionary-en-us/index.aff?raw";
import dic from "dictionary-en-us/index.dic?raw";

type Tab = "settings" | "environment" | "style" | "story-description";
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
  dataPath: string;
  storyDescriptionPrompt: string;
  elevatorPitchPrompt: string;
  promptModels: Model[];
  imageModels: Model[];
  selectedPromptModel: string;
  selectedImageModel: string;
  environments: LibraryItem[];
  styles: LibraryItem[];
};

const icon = (name: "file" | "folder" | "plus" | "trash" | "edit" | "up" | "spark" | "check" | "chevron" | "play" | "save") => {
  const paths = {
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4z"/>',
    up: '<path d="m12 19 0-14m-6 6 6-6 6 6"/>',
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
  dataPath: "",
  storyDescriptionPrompt: "",
  elevatorPitchPrompt: "",
  promptModels: [
    { id: uid(), name: "GPT-5", provider: "OpenAI", apiKeyPath: "" },
    { id: uid(), name: "Claude Sonnet", provider: "Anthropic", apiKeyPath: "" }
  ],
  imageModels: [
    { id: uid(), name: "gpt-image-2", provider: "OpenAI", apiKeyPath: "" },
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
let completionAudioContext: AudioContext | null = null;
let addingModel: ModelKind | null = null;
let editingModel: { kind: ModelKind; id: string } | null = null;

const app = document.querySelector<HTMLDivElement>("#app")!;
const persist = () => localStorage.setItem("frameforge-state", JSON.stringify(state));
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]!);

function render() {
  document.documentElement.dataset.theme = state.theme;
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <span aria-hidden="true"></span>
        <nav class="tabs" aria-label="Workspace pages">
          ${tabButton("settings", "Settings", "01")}
          ${tabButton("environment", "Environment", "02")}
          ${tabButton("style", "Style", "03")}
          ${tabButton("story-description", "Story Description", "04")}
        </nav>
        <span aria-hidden="true"></span>
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
  if (state.activeTab === "story-description") return renderStoryDescription();
  return renderLibrary("style");
}

function renderStoryDescription() {
  return `<div class="page story-description-page">
    <section class="page-intro"><h2>Story Description</h2><p>Enter instructions for the selected Prompt AI to use with your prose file. The story description and elevator pitch each use a separate request when their prompts are filled in. Their results and the separate technology list are saved in one .txt file in the storyboard folder. Either prompt can be left blank.</p></section>
    <section class="panel story-description-panel">
      <label class="textarea-label" for="story-description-prompt">Story description prompt</label>
      <textarea id="story-description-prompt" placeholder="Paste your story description prompt here…" spellcheck="true">${escapeHtml(state.storyDescriptionPrompt)}</textarea>
    </section>
    <section class="panel story-description-panel">
      <label class="textarea-label" for="elevator-pitch-prompt">Elivator Pitch Prompt</label>
      <textarea id="elevator-pitch-prompt" placeholder="Paste your elevator pitch prompt here…" spellcheck="true">${escapeHtml(state.elevatorPitchPrompt)}</textarea>
    </section>
  </div>`;
}

function renderSettings() {
  return `<div class="page settings-page">
    <div class="settings-header">
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
        ${pathField("prosePath", "Prose file", "Select a .txt or .md file", "file", "file")}
        ${pathField("outputPath", "Storyboard folder", "Choose where generated images will be saved", "folder", "directory")}
        ${pathField("promptPath", "Prompt folder", "Choose where generated prompts will be saved", "folder", "directory")}
        ${pathField("dataPath", "Project data folder", "Choose where settings, prompts, and models will be saved", "folder", "directory")}
        <p class="data-folder-note">Save writes frameforge-project.json here. Use Load saved project to restore it.</p>
        <button class="load-project-button" type="button" ${state.dataPath ? "" : "disabled"}>Load saved project</button>
        ${renderImageFormat()}
      </article>
      ${renderModelPanel("prompt", state.promptModels, state.selectedPromptModel)}
      ${renderModelPanel("image", state.imageModels, state.selectedImageModel)}
    </section>
  </div>`;
}

function pathField(key: "prosePath" | "outputPath" | "promptPath" | "dataPath", label: string, placeholder: string, type: "file" | "folder", picker: "file" | "directory") {
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

function renderModelPanel(kind: ModelKind, models: Model[], selected: string) {
  return `<article class="panel model-panel">
    <h2 class="model-panel-label">${kind === "image" ? "TTI AI" : "Prompt AI"}</h2>
    <div class="model-list">
      ${models.map((model, index) => `<div class="model-row ${selected === model.id ? "selected" : ""}">
        <button class="model-choice" role="radio" aria-checked="${selected === model.id}" data-select-model="${model.id}" data-kind="${kind}">
          <span class="checkbox">${selected === model.id ? icon("check") : ""}</span>
          <span><strong>${escapeHtml(model.name)}</strong><small>${escapeHtml(model.provider)}</small></span>
        </button>
        <div class="key-path"><span>${model.apiKeyPath ? escapeHtml(model.apiKeyPath) : "API key file not set"}</span><button title="Choose API key file" data-key-model="${model.id}" data-kind="${kind}">${icon("file")}</button></div>
        <button class="model-edit-button" type="button" title="Edit ${escapeHtml(model.name)}" aria-label="Edit ${escapeHtml(model.name)}" aria-expanded="${editingModel?.kind === kind && editingModel.id === model.id}" data-edit-model="${model.id}" data-kind="${kind}">${icon("edit")}</button>
        ${editingModel?.kind === kind && editingModel.id === model.id ? `<form class="edit-model-form" data-edit-model-form="${model.id}" data-kind="${kind}">
          <label>Model name<input name="name" required value="${escapeHtml(model.name)}" autocomplete="off" /></label>
          <label>Provider<input name="provider" required value="${escapeHtml(model.provider)}" autocomplete="off" /></label>
          <div class="edit-model-actions"><div><button class="remove-model-button" type="button" data-delete-model="${model.id}" data-kind="${kind}">${icon("trash")} Delete model</button><button class="move-model-button" type="button" data-move-model-top="${model.id}" data-kind="${kind}" ${index === 0 ? "disabled" : ""}>${icon("up")} Move to top</button></div><div><button type="button" data-cancel-edit-model>Cancel</button><button type="submit">Save changes</button></div></div>
        </form>` : ""}
      </div>`).join("")}
    </div>
    ${addingModel === kind ? `<form class="add-model-form" data-model-form="${kind}">
      <label>Model name<input name="name" required placeholder="${kind === "image" ? "gpt-image-2" : "gpt-5"}" autocomplete="off" /></label>
      <label>Provider<input name="provider" required value="OpenAI" autocomplete="off" /></label>
      <div class="add-model-actions"><button type="button" data-cancel-model="${kind}">Cancel</button><button type="submit">Add model</button></div>
    </form>` : `<button class="add-button" data-add-model="${kind}">${icon("plus")} Add model</button>`}
  </article>`;
}

function renderLibrary(type: "environment" | "style") {
  const isEnvironment = type === "environment";
  const items = isEnvironment ? state.environments : state.styles;
  return `<div class="page library-page">
    <div class="library-header">
      ${isEnvironment
        ? `<section class="page-intro library-note"><p>The active Environment is sent to the prompt writer for every scene.</p></section>`
        : `<section class="page-intro library-note"><p>Active Style descriptions are appended exactly after the prompt writer finishes each scene prompt.</p></section>`}
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
    <div class="event-block"><span class="event-label">Latest event</span><p><i class="event-dot ${isRunning ? "working" : ""}"></i>${escapeHtml(eventMessage)}</p>${eventTime ? `<time>${eventTime}</time>` : ""}</div>
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
  const descriptionPrompt = document.querySelector<HTMLTextAreaElement>("#story-description-prompt");
  if (descriptionPrompt) descriptionPrompt.oninput = () => {
    state.storyDescriptionPrompt = descriptionPrompt.value;
    persist();
  };
  const elevatorPitchPrompt = document.querySelector<HTMLTextAreaElement>("#elevator-pitch-prompt");
  if (elevatorPitchPrompt) elevatorPitchPrompt.oninput = () => {
    state.elevatorPitchPrompt = elevatorPitchPrompt.value;
    persist();
  };
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
  document.querySelector<HTMLButtonElement>(".load-project-button")?.addEventListener("click", () => { void loadProjectFromFolder(state.dataPath); });
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
  document.querySelectorAll<HTMLButtonElement>("[data-edit-model]").forEach(el => el.onclick = () => {
    const kind = el.dataset.kind as ModelKind;
    const id = el.dataset.editModel!;
    editingModel = editingModel?.kind === kind && editingModel.id === id ? null : { kind, id };
    render();
    if (editingModel) document.querySelector<HTMLInputElement>(`[data-edit-model-form="${id}"] input[name="name"]`)?.focus();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-cancel-edit-model]").forEach(el => el.onclick = () => {
    editingModel = null;
    render();
  });
  document.querySelectorAll<HTMLFormElement>("[data-edit-model-form]").forEach(el => el.onsubmit = event => {
    event.preventDefault();
    const models = el.dataset.kind === "prompt" ? state.promptModels : state.imageModels;
    const model = models.find(item => item.id === el.dataset.editModelForm);
    if (!model) return;
    const name = (el.elements.namedItem("name") as HTMLInputElement).value.trim();
    const provider = (el.elements.namedItem("provider") as HTMLInputElement).value.trim();
    if (!name || !provider) return;
    model.name = name;
    model.provider = provider;
    editingModel = null;
    saveAndRender();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-delete-model]").forEach(el => el.onclick = () => {
    const kind = el.dataset.kind as ModelKind;
    const models = kind === "prompt" ? state.promptModels : state.imageModels;
    const index = models.findIndex(model => model.id === el.dataset.deleteModel);
    if (index < 0) return;
    const [removed] = models.splice(index, 1);
    if (kind === "prompt" && state.selectedPromptModel === removed.id) state.selectedPromptModel = models[0]?.id ?? "";
    if (kind === "image" && state.selectedImageModel === removed.id) state.selectedImageModel = models[0]?.id ?? "";
    editingModel = null;
    saveAndRender();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-move-model-top]").forEach(el => el.onclick = () => {
    const models = el.dataset.kind === "prompt" ? state.promptModels : state.imageModels;
    const index = models.findIndex(model => model.id === el.dataset.moveModelTop);
    if (index <= 0) return;
    models.unshift(...models.splice(index, 1));
    editingModel = null;
    saveAndRender();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-add-model]").forEach(el => el.onclick = () => {
    addingModel = el.dataset.addModel as ModelKind;
    render();
    document.querySelector<HTMLInputElement>(`[data-model-form="${addingModel}"] input[name="name"]`)?.focus();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-cancel-model]").forEach(el => el.onclick = () => {
    addingModel = null;
    render();
  });
  document.querySelectorAll<HTMLFormElement>("[data-model-form]").forEach(el => el.onsubmit = event => {
    event.preventDefault();
    const kind = el.dataset.modelForm as ModelKind;
    const name = (el.elements.namedItem("name") as HTMLInputElement).value.trim();
    const provider = (el.elements.namedItem("provider") as HTMLInputElement).value.trim();
    if (!name || !provider) return;
    const model = { id: uid(), name, provider, apiKeyPath: "" };
    if (kind === "prompt") {
      state.promptModels.push(model);
      state.selectedPromptModel = model.id;
    } else {
      state.imageModels.push(model);
      state.selectedImageModel = model.id;
    }
    addingModel = null;
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

function showEvent(message: string) {
  eventMessage = message;
  eventTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  render();
}

async function loadProjectFromFolder(folder: string) {
  if (!window.frameforge) { showEvent("Loading a project folder is available in the Electron app"); return; }
  try {
    const loaded = await window.frameforge.loadProject(folder);
    if (!loaded) { showEvent("No frameforge-project.json file found in that folder"); return; }
    state = { ...initialState, ...loaded, dataPath: folder } as AppState;
    editingModel = null;
    addingModel = null;
    persist();
    showEvent("Project loaded from folder");
  } catch (error) {
    showEvent(`Could not load project: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function saveProject() {
  persist();
  if (!window.frameforge) { showEvent("Saving to a folder is available in the Electron app"); return; }
  if (!state.dataPath) {
    const folder = await choosePath(true);
    if (!folder) return;
    state.dataPath = folder;
    persist();
  }
  try {
    await window.frameforge.saveProject(state.dataPath, state);
    showEvent("Settings, prompts, and models saved to project folder");
  } catch (error) {
    showEvent(`Could not save project: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function prepareCompletionAudio() {
  try {
    completionAudioContext ??= new AudioContext();
    if (completionAudioContext.state === "suspended") void completionAudioContext.resume();
  } catch {
    completionAudioContext = null;
  }
}

async function playCompletionChime() {
  try {
    if (!completionAudioContext) return;
    if (completionAudioContext.state === "suspended") await completionAudioContext.resume();
    const start = completionAudioContext.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = completionAudioContext!.createOscillator();
      const gain = completionAudioContext!.createGain();
      const noteStart = start + index * 0.14;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.16, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.28);
      oscillator.connect(gain).connect(completionAudioContext!.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.3);
    });
  } catch {
    // Audio may be unavailable or disabled; storyboard completion still succeeds.
  }
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

  prepareCompletionAudio();
  isRunning = true; progress = 1; eventMessage = "Starting storyboard pipeline"; eventTime = ""; render();
  try {
    const result = await window.frameforge.runStoryboard({
      prosePath: state.prosePath,
      outputPath: state.outputPath,
      promptPath: state.promptPath,
      storyDescriptionPrompt: state.storyDescriptionPrompt,
      elevatorPitchPrompt: state.elevatorPitchPrompt,
      imageFormat: state.imageFormat,
      promptModel,
      imageModel,
      environments: state.environments,
      styles: state.styles
    });
    progress = 100;
    eventMessage = `Created ${result.imageFiles.length} storyboard${result.imageFiles.length === 1 ? "" : "s"} from ${result.scenes} scene${result.scenes === 1 ? "" : "s"}`;
    if (result.storyDescriptionFile) eventMessage += " and saved story text file";
    if (result.skippedScenes.length) {
      const sceneNumbers = result.skippedScenes.map(item => item.sceneNumber).join(", ");
      eventMessage += `; skipped rejected scene${result.skippedScenes.length === 1 ? "" : "s"} ${sceneNumbers}`;
    }
    if (result.skippedSteps.length) {
      eventMessage += `; skipped rejected ${result.skippedSteps.map(item => item.stage).join(", ")}`;
    }
    void playCompletionChime();
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

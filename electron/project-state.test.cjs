const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { filename, loadProject, saveProject } = require("./project-state.cjs");

test("project settings, prompts, and models round trip through the chosen folder", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "frameforge-project-"));
  const state = {
    dataPath: folder,
    storyDescriptionPrompt: "Describe the story",
    elevatorPitchPrompt: "Pitch the story",
    promptModels: [{ id: "prompt-1", name: "GPT-5", provider: "OpenAI", apiKeyPath: "/keys/openai" }],
    imageModels: [{ id: "image-1", name: "gpt-image-2", provider: "OpenAI", apiKeyPath: "/keys/openai" }],
    environments: [{ id: "room", title: "Room", description: "Blue walls", enabled: true }],
    styles: [{ id: "ink", title: "Ink", description: "Fine lines", enabled: true }]
  };
  try {
    assert.equal(await loadProject(folder), null);
    assert.equal(await saveProject(folder, state), path.join(folder, filename));
    assert.deepEqual(await loadProject(folder), state);
    state.storyDescriptionPrompt = "Describe the new story";
    await saveProject(folder, state);
    assert.deepEqual(await loadProject(folder), state);
    assert.deepEqual(await fs.readdir(folder), [filename]);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

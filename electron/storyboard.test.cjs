const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  appendStyleDescription,
  buildImagePromptInput,
  runStoryboardPipeline,
  validateJob
} = require("./storyboard.cjs");

test("every prompt-writer input contains the active Environment", () => {
  const input = buildImagePromptInput({
    title: "Arrival",
    location: "Dock",
    time: "Night",
    characters: ["Mara"],
    prose: "Mara enters the station."
  }, {
    title: "Orbital station",
    description: "Curved white rooms with light built into the walls.",
    negativePrompt: "No exposed wiring."
  });

  assert.match(input, /ENVIRONMENT \(required in this prompt\)/);
  assert.match(input, /Curved white rooms with light built into the walls\./);
  assert.match(input, /No exposed wiring\./);
  assert.match(input, /Use the ENVIRONMENT throughout\./);
});

test("Style descriptions are appended after the AI-written prompt", () => {
  const result = appendStyleDescription("SHOT TYPE:\nWide shot", [
    { description: "Clean ink outlines." },
    { description: "High-contrast chiaroscuro." }
  ]);

  assert.equal(
    result,
    "SHOT TYPE:\nWide shot\n\nSTYLE:\nClean ink outlines.\n\nHigh-contrast chiaroscuro."
  );
  assert.ok(result.indexOf("STYLE:") > result.indexOf("Wide shot"));
});

test("generation requires described Environment and Style selections", () => {
  assert.throws(() => validateJob({
    prosePath: "/tmp/story.md",
    promptPath: "/tmp/prompts",
    outputPath: "/tmp/images",
    environments: [{ enabled: true, description: "" }],
    styles: [{ enabled: true, description: "Ink" }]
  }), /Environment description/);

  assert.throws(() => validateJob({
    prosePath: "/tmp/story.md",
    promptPath: "/tmp/prompts",
    outputPath: "/tmp/images",
    environments: [{ enabled: true, description: "Station" }],
    styles: [{ enabled: true, description: "" }]
  }), /Style description/);
});

test("the pipeline sends Environment to AI, then appends Style before saving and rendering", async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frameforge-pipeline-"));
  const prosePath = path.join(testRoot, "story.md");
  const keyPath = path.join(testRoot, "openai.key");
  const promptPath = path.join(testRoot, "prompts");
  const outputPath = path.join(testRoot, "images");
  await fs.writeFile(prosePath, "Mara walks into the orbital station.", "utf8");
  await fs.writeFile(keyPath, "test-api-key", "utf8");

  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (requests.length === 1) {
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          output_text: JSON.stringify([{
            scene_number: 1,
            scene_title: "Arrival",
            location: "Station",
            time: "Night",
            characters: ["Mara"],
            prose_start: 0,
            prose_end: 36
          }])
        })
      };
    }
    if (requests.length === 2) {
      return { ok: true, json: async () => ({ status: "completed", output_text: "SHOT TYPE:\nWide shot" }) };
    }
    return { ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }) };
  };

  try {
    const result = await runStoryboardPipeline({
      prosePath,
      promptPath,
      outputPath,
      imageFormat: "16:9",
      promptModel: { name: "GPT-5", provider: "OpenAI", apiKeyPath: keyPath },
      imageModel: { name: "GPT Image 1", provider: "OpenAI", apiKeyPath: keyPath },
      environments: [{
        title: "Orbital station",
        description: "Curved white rooms with integrated wall lights.",
        negativePrompt: "No exposed wiring.",
        enabled: true
      }],
      styles: [{ title: "Ink", description: "Clean ink outlines.", enabled: true }]
    });

    assert.equal(requests.length, 3);
    assert.deepEqual(requests[0].body.reasoning, { effort: "minimal" });
    assert.deepEqual(requests[0].body.text, { verbosity: "low" });
    assert.match(requests[1].body.input, /Curved white rooms with integrated wall lights\./);
    assert.deepEqual(requests[1].body.reasoning, { effort: "minimal" });
    assert.equal(requests[2].body.prompt, "SHOT TYPE:\nWide shot\n\nSTYLE:\nClean ink outlines.");
    const savedPrompt = await fs.readFile(result.promptFiles[0], "utf8");
    assert.match(savedPrompt, /SHOT TYPE:\nWide shot\n\nSTYLE:\nClean ink outlines\./);
    assert.equal(await fs.readFile(result.imageFiles[0], "utf8"), "image");
  } finally {
    global.fetch = originalFetch;
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});

test("an incomplete prompt response retries with a larger token allowance", async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frameforge-retry-"));
  const prosePath = path.join(testRoot, "story.md");
  const keyPath = path.join(testRoot, "openai.key");
  await fs.writeFile(prosePath, "Mara enters.", "utf8");
  await fs.writeFile(keyPath, "test-api-key", "utf8");

  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (requests.length === 1) {
      return {
        ok: true,
        json: async () => ({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })
      };
    }
    if (requests.length === 2) {
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          output_text: JSON.stringify([{
            scene_number: 1,
            scene_title: "Arrival",
            location: "Station",
            time: null,
            characters: ["Mara"],
            prose_start: 0,
            prose_end: 12
          }])
        })
      };
    }
    if (requests.length === 3) {
      return { ok: true, json: async () => ({ status: "completed", output_text: "SHOT TYPE:\nWide shot" }) };
    }
    return { ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }) };
  };

  try {
    await runStoryboardPipeline({
      prosePath,
      promptPath: path.join(testRoot, "prompts"),
      outputPath: path.join(testRoot, "images"),
      imageFormat: "1:1",
      promptModel: { name: "GPT-5", provider: "OpenAI", apiKeyPath: keyPath },
      imageModel: { name: "GPT Image 1", provider: "OpenAI", apiKeyPath: keyPath },
      environments: [{ title: "Station", description: "White rooms.", enabled: true }],
      styles: [{ title: "Ink", description: "Clean ink.", enabled: true }]
    });

    assert.equal(requests[0].body.max_output_tokens, 12_000);
    assert.equal(requests[1].body.max_output_tokens, 32_000);
    assert.equal(requests.length, 4);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});

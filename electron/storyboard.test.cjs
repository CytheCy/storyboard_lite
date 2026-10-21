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

test("story descriptions use an isolated request and preserve existing description files", async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frameforge-description-"));
  const prosePath = path.join(testRoot, "story.md");
  const keyPath = path.join(testRoot, "test.key");
  const outputPath = path.join(testRoot, "images");
  const prose = "Mara enters the station. She finds her missing brother.";
  const instructions = "Write a short story description with no spoilers.";
  const originalFetch = global.fetch;
  const requests = [];
  try {
    await fs.writeFile(prosePath, prose);
    await fs.writeFile(keyPath, "test-key");
    await fs.mkdir(outputPath);
    const existingFile = path.join(outputPath, "story_story_description.txt");
    await fs.writeFile(existingFile, "Earlier description");
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      const responses = [
        { output_text: "A traveler makes an unexpected discovery." },
        { output_text: "- Station: A constructed facility that Mara enters." },
        { output_text: JSON.stringify([{ scene_number: 1, scene_title: "Arrival", prose_start: 0, prose_end: prose.length }]) },
        { output_text: "SHOT TYPE: Wide shot" },
        { data: [{ b64_json: Buffer.from("image").toString("base64") }] }
      ];
      assert.ok(responses[requests.length - 1], "No unexpected extra request");
      return { ok: true, json: async () => ({ status: "completed", ...responses[requests.length - 1] }) };
    };
    const result = await runStoryboardPipeline({
      prosePath, outputPath, promptPath: path.join(testRoot, "prompts"),
      storyDescriptionPrompt: instructions,
      promptModel: { name: "GPT-5", provider: "OpenAI", apiKeyPath: keyPath },
      imageModel: { name: "GPT Image 1", provider: "OpenAI", apiKeyPath: keyPath },
      environments: [{ title: "Station", description: "White rooms", enabled: true }],
      styles: [{ description: "Ink outlines", enabled: true }]
    });
    assert.equal(requests.length, 5);
    assert.equal(requests[1].body.model, "gpt-5");
    assert.equal(requests[1].body.input, `PROSE:\n${prose}`);
    assert.match(requests[1].body.instructions, /exactly one sentence/);
    assert.equal(requests[1].body.store, false);
    assert.equal(requests[0].body.model, "gpt-5");
    assert.equal(requests[0].body.instructions, instructions);
    assert.equal(requests[0].body.input, `PROSE:\n${prose}`);
    assert.equal(requests[0].body.store, false);
    for (const request of requests.slice(1)) {
      assert.ok(!JSON.stringify(request.body).includes(instructions));
      assert.ok(!JSON.stringify(request.body).includes("A traveler makes an unexpected discovery."));
      assert.equal(request.body.previous_response_id, undefined);
    }
    assert.equal(result.storyDescriptionFile, path.join(outputPath, "story_story_description_v01.txt"));
    assert.equal(await fs.readFile(result.storyDescriptionFile, "utf8"), "A traveler makes an unexpected discovery.\n\nTechnology\n\n- Station: A constructed facility that Mara enters.\n");
    for (const request of requests.slice(2)) {
      assert.ok(!JSON.stringify(request.body).includes(requests[1].body.instructions));
      assert.ok(!JSON.stringify(request.body).includes("A constructed facility that Mara enters."));
    }
    assert.equal(await fs.readFile(existingFile, "utf8"), "Earlier description");
  } finally {
    global.fetch = originalFetch;
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});

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
    if (JSON.parse(options.body).instructions?.startsWith("Find all technology")) {
      return { ok: true, json: async () => ({ status: "completed", output_text: "No technology found." }) };
    }
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
    assert.equal(path.dirname(result.storyDescriptionFile), outputPath);
    assert.equal(await fs.readFile(result.storyDescriptionFile, "utf8"), "Technology\n\nNo technology found.\n");
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
    if (JSON.parse(options.body).instructions?.startsWith("Find all technology")) {
      return { ok: true, json: async () => ({ status: "completed", output_text: "No technology found." }) };
    }
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

test("rejected scene prompts and image requests are skipped while later scenes finish", async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frameforge-rejections-"));
  const prosePath = path.join(testRoot, "story.md");
  const keyPath = path.join(testRoot, "openai.key");
  const promptPath = path.join(testRoot, "prompts");
  const outputPath = path.join(testRoot, "images");
  const prose = "First scene. Second scene. Third scene.";
  const originalFetch = global.fetch;
  const progressUpdates = [];
  const imagePrompts = [];
  try {
    await fs.writeFile(prosePath, prose);
    await fs.writeFile(keyPath, "test-api-key");
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.includes("/images/generations")) {
        imagePrompts.push(body.prompt);
        if (imagePrompts.length === 1) {
          return { ok: false, status: 400, json: async () => ({
            error: { message: "Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com." }
          }) };
        }
        return { ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("third image").toString("base64") }] }) };
      }
      if (body.instructions.startsWith("Find all technology")) {
        return { ok: true, json: async () => ({ status: "completed", output_text: "No technology found." }) };
      }
      if (body.instructions.includes("Divide the supplied prose")) {
        return { ok: true, json: async () => ({ status: "completed", output_text: JSON.stringify([
          { scene_number: 1, scene_title: "First", prose_start: 0, prose_end: 13 },
          { scene_number: 2, scene_title: "Second", prose_start: 13, prose_end: 27 },
          { scene_number: 3, scene_title: "Third", prose_start: 27, prose_end: prose.length }
        ]) }) };
      }
      if (body.input.includes("Title: First")) {
        return { ok: false, status: 400, json: async () => ({
          error: { code: "content_policy_violation", message: "Scene prompt blocked." }
        }) };
      }
      const scene = body.input.includes("Title: Second") ? "second" : "third";
      return { ok: true, json: async () => ({ status: "completed", output_text: `SHOT TYPE: ${scene}` }) };
    };

    const result = await runStoryboardPipeline({
      prosePath, promptPath, outputPath,
      promptModel: { name: "GPT-5", provider: "OpenAI", apiKeyPath: keyPath },
      imageModel: { name: "GPT Image 1", provider: "OpenAI", apiKeyPath: keyPath },
      environments: [{ title: "Station", description: "White rooms.", enabled: true }],
      styles: [{ title: "Ink", description: "Clean ink.", enabled: true }]
    }, update => progressUpdates.push(update));

    assert.equal(result.scenes, 3);
    assert.deepEqual(result.skippedScenes.map(({ sceneNumber, stage }) => ({ sceneNumber, stage })), [
      { sceneNumber: 1, stage: "prompt" },
      { sceneNumber: 2, stage: "image" }
    ]);
    assert.equal(result.promptFiles.length, 2);
    assert.equal(result.imageFiles.length, 1);
    assert.match(imagePrompts[1], /SHOT TYPE: third/);
    assert.equal(await fs.readFile(result.imageFiles[0], "utf8"), "third image");
    assert.match(await fs.readFile(result.promptFiles[0], "utf8"), /SHOT TYPE: second/);
    assert.ok(progressUpdates.some(update => update.message === "Skipped scene 1: prompt rejected"));
    assert.ok(progressUpdates.some(update => update.message === "Skipped scene 2: image prompt rejected"));
    assert.match(progressUpdates.at(-1).message, /skipped 2 rejected scenes/);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});

test("unrelated request failures still stop the pipeline", async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frameforge-error-"));
  const prosePath = path.join(testRoot, "story.md");
  const keyPath = path.join(testRoot, "openai.key");
  const prose = "A scene.";
  const originalFetch = global.fetch;
  try {
    await fs.writeFile(prosePath, prose);
    await fs.writeFile(keyPath, "test-api-key");
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.instructions.startsWith("Find all technology")) {
        return { ok: true, json: async () => ({ status: "completed", output_text: "No technology found." }) };
      }
      if (body.instructions.includes("Divide the supplied prose")) {
        return { ok: true, json: async () => ({ status: "completed", output_text: JSON.stringify([
          { scene_number: 1, scene_title: "One", prose_start: 0, prose_end: prose.length }
        ]) }) };
      }
      return { ok: false, status: 429, json: async () => ({ error: { message: "Rate limit exceeded." } }) };
    };

    await assert.rejects(runStoryboardPipeline({
      prosePath,
      promptPath: path.join(testRoot, "prompts"),
      outputPath: path.join(testRoot, "images"),
      promptModel: { name: "GPT-5", provider: "OpenAI", apiKeyPath: keyPath },
      imageModel: { name: "GPT Image 1", provider: "OpenAI", apiKeyPath: keyPath },
      environments: [{ title: "Station", description: "White rooms.", enabled: true }],
      styles: [{ title: "Ink", description: "Clean ink.", enabled: true }]
    }), /Rate limit exceeded/);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});

test("rejected optional story text requests do not stop scene generation", async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frameforge-story-text-rejection-"));
  const prosePath = path.join(testRoot, "story.md");
  const keyPath = path.join(testRoot, "openai.key");
  const prose = "Mara enters the station.";
  const originalFetch = global.fetch;
  try {
    await fs.writeFile(prosePath, prose);
    await fs.writeFile(keyPath, "test-api-key");
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.includes("/images/generations")) {
        return { ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }) };
      }
      if (body.instructions === "Write a summary." || body.instructions.startsWith("Find all technology")) {
        return { ok: false, status: 400, json: async () => ({
          error: { message: "Your request was rejected by the safety system." }
        }) };
      }
      if (body.instructions.includes("Divide the supplied prose")) {
        return { ok: true, json: async () => ({ status: "completed", output_text: JSON.stringify([
          { scene_number: 1, scene_title: "Arrival", prose_start: 0, prose_end: prose.length }
        ]) }) };
      }
      return { ok: true, json: async () => ({ status: "completed", output_text: "SHOT TYPE: Wide shot" }) };
    };

    const result = await runStoryboardPipeline({
      prosePath,
      storyDescriptionPrompt: "Write a summary.",
      promptPath: path.join(testRoot, "prompts"),
      outputPath: path.join(testRoot, "images"),
      promptModel: { name: "GPT-5", provider: "OpenAI", apiKeyPath: keyPath },
      imageModel: { name: "GPT Image 1", provider: "OpenAI", apiKeyPath: keyPath },
      environments: [{ title: "Station", description: "White rooms.", enabled: true }],
      styles: [{ title: "Ink", description: "Clean ink.", enabled: true }]
    });

    assert.deepEqual(result.skippedSteps.map(item => item.stage), ["story description", "technology list"]);
    assert.equal(result.storyDescriptionFile, null);
    assert.equal(result.imageFiles.length, 1);
    assert.equal(await fs.readFile(result.imageFiles[0], "utf8"), "image");
  } finally {
    global.fetch = originalFetch;
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});

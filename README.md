# Frameforge

A Fedora-friendly Electron desktop interface for turning prose into storyboard plans.

## Run in Electron

```bash
npm install
npm run dev
```

For a production-mode launch:

```bash
npm start
```

Project choices are saved locally as you edit. Choose a **Project data folder** in Settings
and click **Save** to write settings, story description prompts, environments, styles,
and model choices to `frameforge-project.json` in that folder. Use **Load saved project**
to restore a saved file. API key file
paths are saved, but the keys themselves are not copied into the project file.

**Make storyboards** detects scenes,
writes one prompt per scene with the active Environment, appends every active
Style description to the finished AI prompt, saves the prompts, and generates the
storyboard images.

The current pipeline supports OpenAI prompt and image models. Select an API key
file for each model; the file may contain a raw key or an `OPENAI_API_KEY=...`
assignment. Existing prompt and image files are preserved by adding version
suffixes to new files. Prose input may be Markdown or plain text.

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

Project choices are saved locally as you edit. **Make storyboards** detects scenes,
writes one prompt per scene with the active Environment, appends every active
Style description to the finished AI prompt, saves the prompts, and generates the
storyboard images.

The current pipeline supports OpenAI prompt and image models. Select an API key
file for each model; the file may contain a raw key or an `OPENAI_API_KEY=...`
assignment. Existing prompt and image files are preserved by adding version
suffixes to new files. Prose input may be Markdown or plain text.

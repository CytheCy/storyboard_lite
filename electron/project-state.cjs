const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const filename = "frameforge-project.json";

async function projectFile(folder) {
  if (typeof folder !== "string" || !folder.trim()) throw new Error("Choose a project data folder first");
  const stat = await fs.stat(folder);
  if (!stat.isDirectory()) throw new Error("Project data path must be a folder");
  return path.join(folder, filename);
}

async function loadProject(folder) {
  const file = await projectFile(folder);
  let contents;
  try {
    contents = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const state = JSON.parse(contents);
  if (!state || typeof state !== "object" || Array.isArray(state) ||
      !Array.isArray(state.promptModels) || !Array.isArray(state.imageModels) ||
      !Array.isArray(state.environments) || !Array.isArray(state.styles)) {
    throw new Error(`${filename} does not contain valid project data`);
  }
  return state;
}

async function saveProject(folder, state) {
  const file = await projectFile(folder);
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Invalid project data");
  const temporary = path.join(folder, `.${filename}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return file;
}

module.exports = { filename, loadProject, saveProject };

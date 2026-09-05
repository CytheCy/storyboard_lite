const { app, BrowserWindow } = require("electron");
const path = require("node:path");

app.setPath("userData", path.join(app.getPath("appData"), "storyboard-lite"));

const recoveredDescription = `  * Cinematic composition — choose a clear shot type (wide, medium, close-up, POV)
  * Clean vector-like lines
All rooms are gently curved, sunken in the middle and higher on the ends.
Lighting is integrated into walls.
Most walls act as screens and can show scenes, the scenes are usually of nature or space.
People wear papery clothes.
All adults wear caps with nodes and circuses.
Everything is made of futuristic material.
Everything is clean and new looking.`;

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL("http://127.0.0.1:1420");
  const result = await window.webContents.executeJavaScript(`(() => {
    const raw = localStorage.getItem("frameforge-state");
    if (!raw) return { recovered: false, reason: "Electron project data was not found" };
    const project = JSON.parse(raw);
    const environment = project.environments.find(item => /space rings?|space ring ships?/i.test(item.title));
    if (!environment) return { recovered: false, reason: "Space Rings environment was not found" };
    if (!environment.description.trim()) environment.description = ${JSON.stringify(recoveredDescription)};
    localStorage.setItem("frameforge-state", JSON.stringify(project));
    localStorage.setItem("frameforge-recovery-space-rings-v1", "complete");
    return { recovered: true, title: environment.title, characters: environment.description.length };
  })()`);
  console.log(JSON.stringify(result));
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});

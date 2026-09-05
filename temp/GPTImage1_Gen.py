import os
import requests
import time
import base64
from pathlib import Path

# --- CONFIGURATION ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

API_URL = "https://api.openai.com/v1/images/generations"
MODEL = "gpt-image-1-mini"  # Remove or add mini

SOURCE_DIR = Path("/home/cport/MEGA/Zed/Text_to_Image/TTImage")
OUTPUT_DIR = Path("/home/cport/MEGA/Zed/Text_to_Image/Output")
# ---------------------

def process_images():
    if not OPENAI_API_KEY:
        print("❌ ERROR: OPENAI_API_KEY not found in environment.")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    files = list(SOURCE_DIR.glob("*.md"))
    if not files:
        print(f"⚠️ No .md files found in {SOURCE_DIR}")
        return

    for md_file in files:
        print(f"\n📖 Processing: {md_file.name}")

        with open(md_file, "r", encoding="utf-8") as f:
            prompt = f.read().replace("```", "").strip()

        if not prompt:
            print(f"⚠️ Skipping {md_file.name} — file is empty.")
            continue

        print(f"🎨 Generating image for: {md_file.stem}...")

        payload = {
            "model": MODEL,
            "prompt": prompt,
            "size": "1024x1024"  # options: 256, 512, 1024
        }

        for attempt in range(3):
            try:
                response = requests.post(API_URL, headers=headers, json=payload, timeout=60)

                if response.status_code == 200:
                    data = response.json()

                    image_base64 = data["data"][0]["b64_json"]
                    image_bytes = base64.b64decode(image_base64)

                    dest = OUTPUT_DIR / f"{md_file.stem}.png"
                    with open(dest, "wb") as out:
                        out.write(image_bytes)

                    print(f"✅ Saved: {dest.name}")
                    break

                elif response.status_code == 429:
                    print(f"⏳ Rate limited. Waiting 30s (Attempt {attempt + 1}/3)...")
                    time.sleep(30)

                elif response.status_code in (500, 503):
                    print(f"⏳ Server error {response.status_code}. Waiting 15s (Attempt {attempt + 1}/3)...")
                    time.sleep(15)

                else:
                    print(f"❌ Failed [{response.status_code}]: {response.text}")
                    break

            except requests.exceptions.Timeout:
                print(f"⚠️ Request timed out (Attempt {attempt + 1}/3). Retrying...")
                time.sleep(10)

            except Exception as e:
                print(f"⚠️ Unexpected error: {e}")
                break

        time.sleep(2)

    print("\n🏁 Done!")


if __name__ == "__main__":
    process_images()

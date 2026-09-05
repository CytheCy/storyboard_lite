#!/usr/bin/env python3

import os
import json
import re
import requests
from pathlib import Path

# ==========================================================
# USER CONFIGURATION
# ==========================================================

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

MODEL      = os.getenv("TTI_MODEL", "gpt-5.5")
BASE_URL   = "https://api.openai.com/v1/responses"

IN_FILE       = Path("/home/cport/Desktop/Obsidian20xx/In.md")
OUTPUT_FOLDER = Path("/home/cport/MEGA/Zed/Text_to_Image/TTImage")

# ==========================================================
# STAGE 1 — SCENE DETECTION PROMPT
#
# KEY CHANGE: The model no longer echoes the prose back.
# It returns only lightweight metadata with character offsets
# (prose_start / prose_end) into the original text.
# Python slices the prose itself, so output tokens stay tiny
# regardless of input length.
# ==========================================================

SCENE_DETECTION_SYSTEM = """
You are a professional story analyst and storyboard supervisor.

Your job is to read prose and divide it into discrete visual scenes.
A new scene begins whenever ONE OR MORE of the following occur:

TIME SHIFTS
  — Explicit time markers: "an hour later", "the next morning", "a year passed",
    "three weeks earlier", "at dawn", "by nightfall"
  — Implied time jumps between paragraphs (a significant gap in narrative time)

LOCATION CHANGES
  — A character moves to a new physical space: "in the next room", "outside",
    "across the city", "aboard the ship", "back at headquarters"
  — The camera-equivalent pulls back or cuts to a new establishing shot

SUBJECT / FOCUS SHIFTS
  — The central character or group changes completely
  — A new POV character takes over
  — A flashback or flash-forward begins or ends

MOOD / TONE BREAKS
  — A hard tonal break: action to quiet reflection, interior to exterior,
    threat to calm
  — A chapter or section break in the source text

RULES:
  — Do NOT split mid-action if the same subject stays in the same space
  — Keep each scene as a coherent visual unit (one establishing shot concept)
  — Number scenes starting at 1
  — Pre-establish and explicitly list all characters physically present in each scene

IMPORTANT — OUTPUT FORMAT:
  — Do NOT reproduce any prose text in your response.
  — Instead, mark where each scene begins and ends using character offsets
    into the original text (prose_start and prose_end).
  — Offsets are zero-based, measured in characters (not tokens or words).
  — The prose_end of one scene should equal the prose_start of the next.
  — The final scene's prose_end should equal the total character length of the input.

Return ONLY a valid JSON array. No markdown fences. No explanation. Example:

[
  {
    "scene_number": 1,
    "scene_title": "Short evocative title",
    "location": "Brief location label",
    "time": "Time of day or period if known, else null",
    "characters": ["Character 1", "Character 2"],
    "prose_start": 0,
    "prose_end": 412
  }
]
"""

SCENE_DETECTION_USER = """
Analyse the following prose and divide it into scenes.
Return ONLY the JSON array as specified. Do NOT reproduce any prose.
Character length of this text: {char_count}

PROSE:

{prose}
"""

# ==========================================================
# STAGE 2 — IMAGE PROMPT GENERATION
# ==========================================================

IMAGE_PROMPT_SYSTEM = """
You are an expert Visual Concept Artist and Storyboard Prompt Engineer.

You receive a single scene of prose and produce ONE complete text-to-image prompt
for that scene. Think like a storyboard artist: establish the shot, place every
element, define mood, light, and texture.

Environment rules (apply to every prompt):



Return ONLY the final prompt inside a single markdown code block.
"""

IMAGE_PROMPT_TEMPLATE = """
Build the prompt using this structure:

SHOT TYPE:
Wide / medium / close-up / aerial / POV — choose the one that best frames the scene.

SUBJECT:
The central character, object, or focal point. Be specific — describe posture,
expression, clothing, scale.
(Characters present: {characters})

FOREGROUND:
Environmental details that create depth and anchor the viewer in the space.

BACKGROUND:
Large environmental or technological structures that establish the world.

LIGHTING:
Flat shading with subtle gradients. Note direction and quality of the key light.

ATMOSPHERE:
Mood keywords (tense, desolate, awe-inspiring, clinical, etc.)

TEXTURE:
Vintage printed sci-fi poster aesthetic — describe any surface detail that matters.

NEGATIVE PROMPT:


---

Scene metadata:
  Title      : {scene_title}
  Location   : {location}
  Time       : {time}
  Characters : {characters}

Scene prose:
{prose}
"""

# ==========================================================
# TOKEN CHECK
# ==========================================================

if not OPENAI_API_KEY:
    print("X OPENAI_API_KEY not set")
    print("Run:")
    print("  export OPENAI_API_KEY='your_key_here'")
    exit(1)

# ==========================================================
# STORYBOARD GENERATOR
# ==========================================================

class StoryboardGenerator:

    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }

    # ------------------------------------------------------

    def _call_api(self, system, user, max_tokens=2000):

        payload = {
            "model": MODEL,
            "instructions": system,
            "input": user,
            "max_output_tokens": max_tokens,
            "reasoning": {"effort": "low"}
        }

        response = requests.post(
            BASE_URL,
            headers=self.headers,
            json=payload,
            timeout=120
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"API error {response.status_code}: {response.text[:300]}"
            )

        data = response.json()

        if data.get("status") == "incomplete":
            reason = data.get("incomplete_details", {}).get("reason", "unknown")
            raise RuntimeError(
                f"API response was incomplete: {reason}. "
                f"Increase max_output_tokens for this request."
            )

        text = data.get("output_text")

        if text is None:
            # Defensive fallback for SDK/API shape variations.
            parts = []
            for item in data.get("output", []):
                if item.get("type") == "message":
                    for content in item.get("content", []):
                        if "text" in content:
                            parts.append(content["text"])
            text = "".join(parts)

        if not text:
            raise RuntimeError(
                f"API response did not contain text output: "
                f"{json.dumps(data)[:500]}"
            )

        return text.strip()

    # ------------------------------------------------------

    def detect_scenes(self, prose):
        """
        Stage 1: Ask the AI to split prose into scenes.

        The model returns only metadata + character offsets — it does NOT
        echo the prose. Python slices the original text to attach prose to
        each scene, keeping output tokens small regardless of input length.
        """

        print("  -> Stage 1: detecting scenes...")

        raw = self._call_api(
            system=SCENE_DETECTION_SYSTEM,
            user=SCENE_DETECTION_USER.format(
                prose=prose,
                char_count=len(prose)
            ),
            max_tokens=12000
        )

        # Strip accidental markdown fences
        raw = re.sub(r"^```[a-z]*\n?", "", raw.strip())
        raw = re.sub(r"\n?```$",        "", raw.strip())

        try:
            scenes = json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"Scene JSON parse failed: {e}\n\n"
                f"Raw response start:\n{raw[:500]}\n\n"
                f"Raw response end:\n{raw[-500:]}"
            )

        if not isinstance(scenes, list) or len(scenes) == 0:
            raise RuntimeError("Scene detection returned empty or non-list result.")

        # Attach prose slices from the original text
        prose_len = len(prose)
        for scene in scenes:
            start = scene.pop("prose_start", None)
            end   = scene.pop("prose_end",   None)

            if start is None or end is None:
                # Fallback: use the full prose if offsets are missing
                print(f"  ! Scene {scene.get('scene_number','?')} missing offsets "
                      f"— using full prose as fallback.")
                scene["prose"] = prose
            else:
                # Clamp to valid range
                start = max(0, int(start))
                end   = min(prose_len, int(end))
                scene["prose"] = prose[start:end].strip()

        print(f"  OK {len(scenes)} scene(s) detected")
        return scenes

    # ------------------------------------------------------

    def generate_image_prompt(self, scene):
        """Stage 2: Generate a TTI prompt for a single scene."""

        chars     = scene.get("characters", [])
        chars_str = ", ".join(chars) if isinstance(chars, list) else str(chars)

        user = IMAGE_PROMPT_TEMPLATE.format(
            scene_title = scene.get("scene_title", "Untitled"),
            location    = scene.get("location", "Unknown"),
            time        = scene.get("time") or "Unspecified",
            characters  = chars_str or "None specified",
            prose       = scene.get("prose", "")
        )

        return self._call_api(
            system     = IMAGE_PROMPT_SYSTEM,
            user       = user,
            max_tokens = 1500
        )

    # ------------------------------------------------------

    def get_output_path(self, base_stem, scene_number, total_scenes):
        """Return a versioned, scene-numbered output path."""

        digits    = len(str(total_scenes))
        scene_tag = str(scene_number).zfill(max(digits, 2))
        candidate = OUTPUT_FOLDER / f"{base_stem}_scene_{scene_tag}.md"

        version = 1
        while candidate.exists():
            candidate = OUTPUT_FOLDER / f"{base_stem}_scene_{scene_tag}_v{version:02d}.md"
            version  += 1

        return candidate

    # ------------------------------------------------------

    def process(self):

        OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

        if not IN_FILE.exists():
            print("X Input file not found:", IN_FILE)
            return

        prose = IN_FILE.read_text(encoding="utf-8").strip()

        if not prose:
            print("X Input file is empty.")
            return

        base_stem = IN_FILE.stem

        print(f"OK Read {len(prose):,} characters from {IN_FILE.name}")
        print(f"   Model: {MODEL}")
        print("-" * 60)

        # ---- Stage 1: scene detection ----

        try:
            scenes = self.detect_scenes(prose)
        except RuntimeError as e:
            print("X Scene detection failed:", e)
            return

        # ---- Stage 2: image prompt per scene ----

        total   = len(scenes)
        success = 0
        failed  = 0

        for scene in scenes:

            num       = scene.get("scene_number", "?")
            title     = scene.get("scene_title", "Untitled")
            chars     = scene.get("characters", [])
            chars_str = ", ".join(chars) if isinstance(chars, list) else str(chars)

            print(f"\n  Scene {num}/{total}: {title}")
            print(f"    Location   : {scene.get('location', '-')}")
            print(f"    Time       : {scene.get('time') or '-'}")
            print(f"    Characters : {chars_str or '-'}")
            print(f"    Prose chars: {len(scene.get('prose', ''))}")
            print(f"    -> Stage 2: generating image prompt...")

            try:
                image_prompt = self.generate_image_prompt(scene)

                out_path = self.get_output_path(base_stem, num, total)

                content = (
                    f"# Scene {num}: {title}\n\n"
                    f"**Location:** {scene.get('location', '-')}  \n"
                    f"**Time:** {scene.get('time') or '-'}  \n"
                    f"**Characters:** {chars_str or '-'}\n\n"
                    f"---\n\n"
                    f"{image_prompt}\n"
                )

                out_path.write_text(content, encoding="utf-8")

                print(f"    OK Saved: {out_path.name}")
                success += 1

            except Exception as e:
                print(f"    X Failed: {e}")
                failed += 1

        print("\n" + "=" * 60)
        print("Storyboard complete")
        print(f"  Scenes processed : {total}")
        print(f"  Prompts saved    : {success}")
        print(f"  Failed           : {failed}")
        print(f"  Output folder    : {OUTPUT_FOLDER}")
        print("=" * 60)


# ==========================================================
# MAIN
# ==========================================================

def main():
    print("=" * 60)
    print("OpenAI - Storyboard Prompt Generator")
    print("=" * 60)
    print("Input :", IN_FILE)
    print("Output:", OUTPUT_FOLDER)
    print("=" * 60)

    generator = StoryboardGenerator()
    generator.process()


if __name__ == "__main__":
    main()

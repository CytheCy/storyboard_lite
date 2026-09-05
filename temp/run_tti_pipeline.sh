#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="/home/cport/MEGA/Zed/Text_to_Image"
INPUT_FILE="/home/cport/Desktop/Obsidian20xx/In.md"
TTIMAGE_DIR="$PROJECT_DIR/TTImage"
OUTPUT_DIR="$PROJECT_DIR/Output"

TTI_SCRIPT="$PROJECT_DIR/TTI_Prompt.py"
STYLE_SCRIPT="$PROJECT_DIR/add_style_prompt.sh"
IMAGE_SCRIPT="$PROJECT_DIR/GPTImage1_Gen.py"
RUNNER_SCRIPT="$PROJECT_DIR/run_tti_pipeline.sh"

die() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

for command_name in python3 find bash realpath grep sed systemd-inhibit; do
    command -v "$command_name" >/dev/null 2>&1 || \
        die "Required command not found: $command_name"
done

for script_path in "$TTI_SCRIPT" "$STYLE_SCRIPT" "$IMAGE_SCRIPT"; do
    [[ -f "$script_path" ]] || die "Required script not found: $script_path"
done

[[ -f "$INPUT_FILE" ]] || die "Input file not found: $INPUT_FILE"
[[ -s "$INPUT_FILE" ]] || die "Input file is empty: $INPUT_FILE"

python3 -c 'import requests' >/dev/null 2>&1 || \
    die "Python package 'requests' is missing. Install it with: python3 -m pip install requests"

# Re-run the pipeline under a systemd inhibitor so shutdown, sleep, and idle
# suspend are blocked until this script exits. The environment flag prevents
# the re-run from recursively creating more inhibitors.
if [[ "${TTI_PIPELINE_INHIBITED:-0}" != "1" ]]; then
    export TTI_PIPELINE_INHIBITED=1
    exec systemd-inhibit \
        --what=shutdown:sleep:idle \
        --who="Text-to-image pipeline" \
        --why="Generating storyboard prompts and images" \
        --mode=block \
        "$RUNNER_SCRIPT" "$@"
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    read -r -s -p "OpenAI API key: " OPENAI_API_KEY
    printf '\n'
fi

[[ -n "$OPENAI_API_KEY" ]] || die "No OpenAI API key was provided."
export OPENAI_API_KEY

mkdir -p -- "$TTIMAGE_DIR" "$OUTPUT_DIR"

# These explicit paths are the only directories this script is allowed to clear.
[[ "$(realpath -- "$TTIMAGE_DIR")" == "$PROJECT_DIR/TTImage" ]] || \
    die "Refusing to clear unexpected path: $TTIMAGE_DIR"
[[ "$(realpath -- "$OUTPUT_DIR")" == "$PROJECT_DIR/Output" ]] || \
    die "Refusing to clear unexpected path: $OUTPUT_DIR"

printf '\nClearing previous prompts and images...\n'
find "$TTIMAGE_DIR" -mindepth 1 -delete
find "$OUTPUT_DIR" -mindepth 1 -delete

printf '\n[1/3] Generating scene prompts...\n'
python3 -u "$TTI_SCRIPT"

shopt -s nullglob
prompt_files=("$TTIMAGE_DIR"/*.md)
(( ${#prompt_files[@]} > 0 )) || die "TTI_Prompt.py did not create any Markdown prompts."

printf '\n[2/3] Adding the style prompt...\n'
bash "$STYLE_SCRIPT"

printf '\n[3/3] Generating images...\n'
python3 -u "$IMAGE_SCRIPT"

image_files=("$OUTPUT_DIR"/*.png)
(( ${#image_files[@]} > 0 )) || die "GPTImage1_Gen.py did not create any PNG images."
(( ${#image_files[@]} == ${#prompt_files[@]} )) || \
    die "Only ${#image_files[@]} of ${#prompt_files[@]} image(s) were created."

printf '\nPipeline complete: %d prompt(s), %d image(s).\n' \
    "${#prompt_files[@]}" "${#image_files[@]}"
printf 'Images: %s\n' "$OUTPUT_DIR"

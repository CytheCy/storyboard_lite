#!/bin/bash

TARGET_DIR="/home/cport/MEGA/Zed/Text_to_Image/TTImage"
INSERT_LINE="Style: cinematic, graphic novel illustration, urban, realism, clean ink outlines with varying weight, dramatic high-contrast chiaroscuro lighting, moody glows. Content: Everyone wears high tech classes or goggles."

find "$TARGET_DIR" -maxdepth 1 -name "*.md" | while read -r file; do
    # Skip if the style line already exists in the file
    if grep -qF "$INSERT_LINE" "$file"; then
        echo "SKIPPED (already present): $file"
        continue
    fi

    # Insert the style line above the first occurrence of "SUBJECT:"
    sed -i "s/^SUBJECT:/${INSERT_LINE}\nSUBJECT:/" "$file"

    echo "UPDATED: $file"
done

echo "Done."

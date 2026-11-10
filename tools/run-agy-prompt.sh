#!/bin/bash
# Usage: run-agy-prompt.sh <prompt_file> <output_file>
PROMPT_FILE="$1"
OUT_FILE="$2"

# Record conversation count before
BEFORE=$(ls /c/Users/93rob/.gemini/antigravity-cli/conversations/*.db 2>/dev/null | wc -l)

# Run agy
agy --print "$(cat "$PROMPT_FILE")" > /dev/null 2>&1
EXIT=$?
echo "agy exit: $EXIT"

# Find the newest conversation (might take a moment to flush)
sleep 2
NEWEST_CONV=$(ls -t /c/Users/93rob/.gemini/antigravity-cli/conversations/*.db 2>/dev/null | head -1)
CONV_ID=$(basename "$NEWEST_CONV" .db)
echo "Conversation: $CONV_ID"

TRANSCRIPT="/c/Users/93rob/.gemini/antigravity-cli/brain/$CONV_ID/.system_generated/logs/transcript.jsonl"

# Extract all PLANNER_RESPONSE entries with content
python3 << PYEOF > "$OUT_FILE"
import json, sys
results = []
try:
    with open("$TRANSCRIPT") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                e = json.loads(line)
                if e.get('type') == 'PLANNER_RESPONSE' and e.get('content') and len(e['content']) > 30:
                    results.append(e['content'])
            except: pass
except Exception as ex:
    print(f"Error: {ex}")
    sys.exit(1)

for r in results:
    print(r)
    print("\n---\n")
PYEOF

echo "Response saved to $OUT_FILE"

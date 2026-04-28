#!/usr/bin/env bash
set -euo pipefail

FEATURE_DIR="docs/features"

if [[ ! -d "$FEATURE_DIR" ]]; then
  echo "No $FEATURE_DIR directory found; skipping."
  exit 0
fi

files=()
while IFS= read -r file; do
  files+=("$file")
done < <(find "$FEATURE_DIR" -type f -name "*.md" ! -name "_template.md" | sort)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No feature docs found under $FEATURE_DIR; skipping."
  exit 0
fi

required_headings=(
  "## Strategy refs"
  "## Out of scope"
  "## Design decisions"
)

failed=0

for file in "${files[@]}"; do
  echo "Checking $file"

  for heading in "${required_headings[@]}"; do
    if ! rg -q "^${heading}$" "$file"; then
      echo "  ERROR: missing heading '$heading'"
      failed=1
    fi
  done

  strategy_refs_count=$(awk '
    /^## / { in_section=0 }
    /^## Strategy refs$/ { in_section=1; next }
    in_section && /^- / { count++ }
    END { print count+0 }
  ' "$file")

  out_of_scope_count=$(awk '
    /^## / { in_section=0 }
    /^## Out of scope$/ { in_section=1; next }
    in_section && /^- / { count++ }
    END { print count+0 }
  ' "$file")

  design_decisions_count=$(awk '
    /^## / { in_section=0 }
    /^## Design decisions$/ { in_section=1; next }
    in_section && /^- Decision:/ { count++ }
    END { print count+0 }
  ' "$file")

  if (( strategy_refs_count < 1 )); then
    echo "  ERROR: expected at least 1 bullet under '## Strategy refs'"
    failed=1
  fi

  if (( out_of_scope_count < 2 )); then
    echo "  ERROR: expected at least 2 bullets under '## Out of scope'"
    failed=1
  fi

  if (( design_decisions_count < 1 )); then
    echo "  ERROR: expected at least 1 '- Decision:' item under '## Design decisions'"
    failed=1
  fi
done

if (( failed )); then
  echo "Feature doc checks failed."
  exit 1
fi

echo "Feature doc checks passed."

# Enoch Book Engine

## What It Does

This skill helps an AI agent create or edit fixed-layout B5 books with one concept per
page, inline SVG diagrams, safe logo containment, and mandatory screenshot-based visual
quality assurance.

## Best For

- Creating a new book from `books/<slug>/` source files.
- Editing page copy, diagrams, photographs, or brand marks without breaking the layout.
- Checking page overflow, SVG structure, image loading, alignment, and logo containment.
- Producing a book that can be reviewed as both a browser layout and a print-ready PDF.

## Not For

- Replacing a full typesetting or prepress review for commercial print production.
- Hiding overflow by shrinking fonts, clipping diagrams, or changing print-only CSS.
- Removing upstream license or authorship notices from a derivative repository.

## Safety Notes

- Uses local build, screenshot, and structural-check commands; it does not need API keys.
- Requires the agent to open every block screenshot before acknowledging visual QA.
- Treats factual claims, quotes, numbers, and personal stories as source material that
  must be verified rather than invented.
- Keeps the repository's MIT license and upstream notice intact.

## Files

- `SKILL.md`: trigger, source rules, verification gate, and authoring workflow.
- `skill-card.md`: this public capability and safety summary.

"""One-off maintenance commands, run inside the container:

    docker compose exec arc python -m app.maintenance note-ids arc      # smriti_id -> arc_id
    docker compose exec arc python -m app.maintenance note-ids smriti   # arc_id -> smriti_id (undo)

note-ids rewrites the ID property in the frontmatter of the notes Arc exported (the paths it
recorded for items and articles). Other notes in the vault are never touched.
"""

import os
import sys

from . import db, obsidian

FIELDS = {"arc": obsidian.ID_FIELD, "smriti": obsidian.LEGACY_ID_FIELD}


def note_ids(target: str) -> int:
    new = FIELDS[target]
    old = next(f for f in FIELDS.values() if f != new)
    changed = 0
    with db.transaction() as conn:
        paths = [r[0] for r in conn.execute(
            "SELECT obsidian_path FROM items WHERE obsidian_path IS NOT NULL "
            "UNION SELECT obsidian_path FROM articles WHERE obsidian_path IS NOT NULL")]
    for rel in paths:
        path = os.path.join(obsidian.VAULT_DIR, rel)
        try:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        head, sep, body = text.partition("\n---\n")  # only the frontmatter block
        if not sep or f"\n{old}: " not in head:
            continue
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(head.replace(f"\n{old}: ", f"\n{new}: ", 1) + sep + body)
        changed += 1
    return changed


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "note-ids" or sys.argv[2] not in FIELDS:
        sys.exit(__doc__)
    print(f"Rewrote {note_ids(sys.argv[2])} notes to {FIELDS[sys.argv[2]]}.")

"""Check the actual release archive against the source runtime and manifest.

Run after packaging: python3 scripts/check-release-archive.py system.zip
This reads the archive without extracting or changing its contents.
"""
from pathlib import Path
from zipfile import ZipFile
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIRECTORIES = (
    "assets", "data", "fonts", "images", "lang", "lib", "modules", "styles", "templates",
)


def check_archive(archive):
    expected = {"system.json"}
    for directory in RUNTIME_DIRECTORIES:
        source = ROOT / directory
        if not source.is_dir():
            raise ValueError(f"Missing source runtime directory: {directory}")
        expected.update(path.relative_to(ROOT).as_posix()
                        for path in source.rglob("*") if path.is_file())
    with ZipFile(archive) as package:
        names = {entry.filename for entry in package.infolist() if not entry.is_dir()}
        missing = sorted(expected - names)
        if missing:
            raise ValueError("Missing runtime files in archive:\n" + "\n".join(missing))
        manifest = json.loads(package.read("system.json"))
        references = [*manifest.get("esmodules", []), *manifest.get("scripts", []),
                      *manifest.get("styles", []),
                      *(language["path"] for language in manifest.get("languages", []))]
        unresolved = sorted(set(references) - names)
        if unresolved:
            raise ValueError("Missing manifest dependencies:\n" + "\n".join(unresolved))
        corrupt = package.testzip()
        if corrupt:
            raise ValueError(f"Archive integrity error: {corrupt}")
    return len(expected)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/check-release-archive.py system.zip")
    try:
        count = check_archive(sys.argv[1])
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(f"Release archive checked: {count} runtime files and all manifest dependencies.")

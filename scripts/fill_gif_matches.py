#!/usr/bin/env python3
"""Match remaining Pages catalog rows to hasaneyldrm GIFs and public wger pages."""

from __future__ import annotations

import json
import re
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

CORE = Path(__file__).resolve().parents[1] / "core.js"
DATASET_URL = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json"
RAW = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main"
WGER_INFO = "https://wger.de/api/v2/exerciseinfo/"
PREFIX = "export const EXERCISE_REFERENCES = "
USER_AGENT = "BodyOS-Quick-Workout/1.0 gif-match"

ALIASES = {
    "chin_up": ["chin-up", "chin up", "underhand pull-up"],
    "wide_grip_pull_up": ["wide grip pull-up", "wide-grip pull-up", "wide pull-up"],
    "neutral_grip_pull_up": ["neutral grip pull-up", "hammer grip pull-up", "parallel grip pull-up"],
    "archer_pull_up": ["archer pull-up", "archer pull up"],
    "wide_grip_seated_row": ["wide grip seated row", "wide-grip seated row", "cable seated wide grip row"],
    "single_arm_cable_row": ["cable one arm seated row", "one arm cable row", "cable one arm row"],
    "underhand_barbell_row": ["reverse grip bent over row", "underhand barbell row", "barbell reverse grip bent over row"],
    "pendlay_row": ["pendlay row", "barbell pendlay row"],
    "t_bar_row": ["t-bar row", "t bar row", "lever t-bar row"],
    "meadows_row": ["meadows row", "landmine one arm row"],
    "one_arm_dumbbell_row": ["dumbbell one arm row", "one arm dumbbell row", "dumbbell bent over row"],
    "chest_supported_dumbbell_row": ["dumbbell incline row", "chest supported row", "dumbbell chest supported row"],
    "incline_dumbbell_row": ["dumbbell incline row", "incline dumbbell row"],
    "high_row_machine": ["lever high row", "high row", "iso-lateral high row"],
    "inverted_row": ["inverted row", "bodyweight inverted row", "australian pull-up"],
    "cable_pullover": ["cable pullover", "straight arm cable pullover"],
    "dumbbell_pullover": ["dumbbell pullover"],
    "back_extension": ["hyperextension", "back extension", "45 degree hyperextension"],
    "push_up": ["push-up", "push up"],
    "dip": ["chest dip", "triceps dip", "parallel bar dip"],
    "landmine_press": ["landmine press", "barbell landmine press"],
    "arnold_press": ["arnold press", "dumbbell arnold press"],
    "cable_lateral_raise": ["cable lateral raise", "cable side raise"],
    "rear_delt_fly_machine": ["reverse pec deck", "rear delt machine", "lever seated reverse fly"],
    "shrug": ["barbell shrug"],
    "dumbbell_shrug": ["dumbbell shrug"],
    "deadlift": ["barbell deadlift", "deadlift"],
    "sumo_deadlift": ["sumo deadlift", "barbell sumo deadlift"],
    "hip_thrust": ["barbell hip thrust", "hip thrust"],
    "hack_squat": ["hack squat", "sled hack squat"],
    "goblet_squat": ["goblet squat", "dumbbell goblet squat"],
    "bulgarian_split_squat": ["bulgarian split squat", "dumbbell bulgarian split squat"],
    "walking_lunge": ["walking lunge", "dumbbell walking lunge"],
    "leg_extension": ["leg extension", "lever leg extension"],
    "seated_calf_raise": ["seated calf raise", "lever seated calf raise"],
    "standing_calf_raise": ["standing calf raise", "lever standing calf raise"],
    "barbell_biceps_curl": ["barbell curl", "barbell biceps curl"],
    "hammer_curl": ["hammer curl", "dumbbell hammer curl"],
    "preacher_curl": ["preacher curl", "barbell preacher curl", "lever preacher curl"],
    "overhead_triceps_extension": ["overhead triceps extension", "dumbbell standing triceps extension"],
    "skull_crusher": ["lying triceps extension", "skull crusher", "barbell lying triceps extension"],
}


def _ssl():
    context = ssl.create_default_context()
    try:
        import certifi
        context = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    return context


def fetch_json(url: str) -> object:
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60, context=_ssl()) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize(value: str) -> str:
    text = str(value or "").lower()
    text = text.replace("°", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def score(item_name: str, aliases: list[str]) -> float:
    name = normalize(item_name)
    best = 0.0
    for alias in aliases:
        target = normalize(alias)
        if not target:
            continue
        if name == target:
            best = max(best, 1.0)
        elif name.startswith(target) or target.startswith(name):
            best = max(best, 0.94)
        elif target in name:
            best = max(best, 0.9 - min(0.2, abs(len(name) - len(target)) / 40))
        else:
            tokens = set(target.split())
            have = set(name.split())
            if tokens and tokens <= have:
                best = max(best, 0.82 + 0.05 * min(3, len(tokens)))
    return best


def load_core():
    source = CORE.read_text(encoding="utf-8")
    start = source.index(PREFIX) + len(PREFIX)
    end = source.index(";\nexport const LEGACY_EXERCISE_ID_MAP", start)
    catalog = json.loads(source[start:end])
    block_start = source.index("export const FALLBACK_EXERCISES = [")
    block_end = source.index("].map(([id, name, canonicalNameEn", block_start)
    block = source[block_start:block_end]
    exercises = []
    seen = set()
    for raw_id, name, english in re.findall(r'\["([a-z0-9_]+)", "([^"]+)", "([^"]+)"', block):
        ident = {
            "assisted_pull_up": "assisted_close_grip_pull_up",
            "barbell_flat_chest_press": "barbell_bench_press",
            "barbell_incline_chest_press": "barbell_incline_bench_press",
            "incline_chest_press_machine": "incline_chest_press",
        }.get(raw_id, raw_id)
        if ident in seen:
            continue
        seen.add(ident)
        exercises.append({"id": ident, "name": name, "canonicalNameEn": english})
    return source, catalog, exercises


def wger_for(english: str) -> dict | None:
    query = urllib.parse.urlencode({"limit": 20, "search": english})
    payload = fetch_json(f"{WGER_INFO}?{query}")
    results = payload.get("results") if isinstance(payload, dict) else []
    target = normalize(english)
    best = None
    best_score = 0.0
    for item in results or []:
        translations = item.get("translations") or []
        english_row = next((row for row in translations if row.get("language") == 2), None) or (translations[0] if translations else {})
        title = english_row.get("name") or item.get("name") or ""
        current = score(title, [english])
        if current > best_score:
            best_score = current
            description = re.sub(r"<[^>]+>", "", str(english_row.get("description") or "")).strip()
            videos = item.get("videos") or []
            video = next((row.get("video") for row in videos if row.get("video")), "")
            numeric_id = item.get("id")
            best = {
                "id": numeric_id,
                "pageUrl": f"https://wger.de/en/exercise/{numeric_id}",
                "videoUrl": video if isinstance(video, str) and video.startswith("https://wger.de/") else "",
                "descriptionEn": description,
                "descriptionZh": "",
                "author": "",
                "authors": [],
                "license": {"short_name": "CC-BY-SA 4", "full_name": "Creative Commons Attribution Share Alike 4", "url": "https://creativecommons.org/licenses/by-sa/4.0/deed.en"},
                "translationLicenseEn": {},
                "translationLicenseZh": {},
                "videoLicense": {},
                "confidence": round(current, 2),
                "matchType": "exact" if current >= 0.92 else "reference",
            }
    return best if best_score >= 0.82 and best and best.get("id") else None


def main() -> None:
    source, catalog, exercises = load_core()
    used = {str(item.get("datasetId")) for item in catalog.values()}
    dataset = fetch_json(DATASET_URL)
    records = [item for item in dataset if isinstance(item, dict) and item.get("gif_url")]
    added = []
    missing = []
    for exercise in exercises:
        ident = exercise["id"]
        # canonical remap happens in JS; skip duplicate raw ids already exported
        if ident in catalog:
            continue
        aliases = ALIASES.get(ident, []) + [exercise["canonicalNameEn"], exercise["name"]]
        ranked = sorted(((score(item.get("name") or "", aliases), item) for item in records), key=lambda pair: pair[0], reverse=True)
        pick = None
        for current, item in ranked:
            dataset_id = str(item.get("id"))
            if current < 0.82 or dataset_id in used:
                continue
            pick = (current, item)
            break
        if not pick:
            missing.append(ident)
            continue
        current, item = pick
        dataset_id = str(item.get("id"))
        used.add(dataset_id)
        gif = str(item.get("gif_url") or "").lstrip("/")
        image = str(item.get("image") or "").lstrip("/")
        wger = None
        try:
            wger = wger_for(exercise["canonicalNameEn"])
        except Exception:
            wger = None
        catalog[ident] = {
            "datasetId": dataset_id,
            "sourceNameEn": item.get("name") or "",
            "gifUrl": f"{RAW}/{gif}",
            "thumbnailUrl": f"{RAW}/{image}" if image else "",
            "detailsProvider": "wger",
            "detailsStatus": "ready" if wger else "pending",
            "instructionsEn": [wger["descriptionEn"]] if wger and wger.get("descriptionEn") else [],
            "instructionsZh": [],
            "wger": wger,
        }
        added.append({"id": ident, "datasetId": dataset_id, "name": item.get("name"), "score": current, "wger": bool(wger)})
    replacement = PREFIX + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";"
    lines = source.splitlines()
    for index, line in enumerate(lines):
        if line.startswith(PREFIX):
            lines[index] = replacement
            break
    CORE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"added": len(added), "missing": missing, "matches": added}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

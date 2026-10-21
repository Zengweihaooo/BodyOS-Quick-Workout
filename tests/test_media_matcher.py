import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("media_matcher", Path(__file__).parents[1] / "scripts/fill_gif_matches.py")
matcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matcher)

class MediaMatchTests(unittest.TestCase):
    def test_empty_or_non_english_name_cannot_match_everything(self):
        self.assertEqual(matcher.score("", ["Dumbbell Bench Press"]), 0)
        self.assertEqual(matcher.score("Σταθείτε", ["Dumbbell Bench Press"]), 0)
        with patch.object(matcher, "fetch_json", return_value={"results": [{"id": 320, "translations": [{"language": 4, "name": "Σταθείτε", "description": "Wrong language"}]}]}):
            self.assertIsNone(matcher.wger_for("Dumbbell Bench Press"))

    def test_auto_matches_stay_unreviewed_without_invented_license(self):
        with patch.object(matcher, "fetch_json", return_value={"results": [{"id": 73, "translations": [{"language": 2, "name": "Barbell Bench Press", "description": "Example source"}]}]}):
            candidate = matcher.wger_for("Barbell Bench Press")
        self.assertEqual(candidate["matchType"], "unverified_candidate")
        self.assertEqual(candidate["license"], {})

if __name__ == "__main__":
    unittest.main()

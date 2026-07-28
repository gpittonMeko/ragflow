from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))

from scraper_mef.checkpoint import Checkpoint  # noqa: E402


class TestCheckpoint(unittest.TestCase):
    def test_atomic_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cp.json"
            cp = Checkpoint(path)
            cp.set_page(12)
            cp.mark_processed("Sentenza_V70_1205_2026")
            cp2 = Checkpoint(path)
            self.assertEqual(cp2.data["last_page"], 12)
            self.assertIn("Sentenza_V70_1205_2026", cp2.data["processed"])


if __name__ == "__main__":
    unittest.main()

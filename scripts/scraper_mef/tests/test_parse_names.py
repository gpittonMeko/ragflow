from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))

from scraper_mef.names import row_to_filename  # noqa: E402
from scraper_mef.parse import parse_table_html  # noqa: E402


class TestNames(unittest.TestCase):
    def test_lombardia(self):
        meta = row_to_filename("1205", "2026", "CGT 2° Lombardia")
        self.assertTrue(meta["ok"])
        self.assertEqual(meta["nomeFile"], "Sentenza_V70_1205_2026.pdf")

    def test_fixture_rows(self):
        html = (ROOT / "fixtures" / "sample_rows.html").read_text(encoding="utf-8")
        rows = parse_table_html(html)
        self.assertGreaterEqual(len(rows), 3)


if __name__ == "__main__":
    unittest.main()

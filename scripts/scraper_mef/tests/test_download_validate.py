from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))

from scraper_mef.download import (  # noqa: E402
    coherence_nome_vs_meta,
    ingest_pdf_bytes,
    make_minimal_pdf,
    validate_local_pdf,
    verify_pdf,
)


class TestDownloadValidate(unittest.TestCase):
    def test_html_as_pdf_rejected(self):
        data = b"<!DOCTYPE html><html><body>nope</body></html>"
        errs = verify_pdf(data, min_bytes=10, max_bytes=1_000_000)
        self.assertTrue(any("HTML" in e for e in errs))

    def test_truncated_pdf_no_eof(self):
        data = b"%PDF-1.4\n1 0 obj<<>>endobj\n"
        data = data + b"0" * 1200
        errs = verify_pdf(data, min_bytes=1000, max_bytes=1_000_000)
        self.assertTrue(any("EOF" in e for e in errs))

    def test_valid_minimal(self):
        data = make_minimal_pdf(1200)
        self.assertEqual(verify_pdf(data, min_bytes=1000, max_bytes=1_000_000), [])

    def test_local_empty_and_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            empty = Path(tmp) / "a.pdf"
            empty.write_bytes(b"")
            self.assertTrue(validate_local_pdf(empty, min_bytes=1000, max_bytes=1_000_000))

            html = Path(tmp) / "b.pdf"
            html.write_bytes(b"<html>x</html>" + b"0" * 1200)
            errs = validate_local_pdf(html, min_bytes=1000, max_bytes=1_000_000)
            self.assertTrue(any("HTML" in e or "firma" in e for e in errs))

    def test_ingest_and_coherence(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "Sentenza_V70_1205_2026.pdf"
            out = ingest_pdf_bytes(
                make_minimal_pdf(1200), dest, min_bytes=1000, max_bytes=1_000_000
            )
            self.assertTrue(out["ok"])
            self.assertTrue(out["sha256"])
            meta = {
                "tipo": "Sentenza",
                "codice": "V70",
                "numero": "1205",
                "anno": "2026",
            }
            self.assertEqual(coherence_nome_vs_meta("Sentenza_V70_1205_2026", meta), [])
            self.assertTrue(
                coherence_nome_vs_meta("Sentenza_V70_999_2026", meta)
            )


if __name__ == "__main__":
    unittest.main()

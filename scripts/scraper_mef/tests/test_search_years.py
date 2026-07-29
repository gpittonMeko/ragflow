from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scraper_mef.checkpoint import Checkpoint
from scraper_mef.client import (
    SEARCH_ERROR_TEXT,
    SEARCH_YEAR_SELECTOR,
    VISUALIZZA_SELECTOR,
    LiveMefClient,
    MefBlockedError,
    MefPortalError,
)
from scraper_mef.config import Config, parse_search_years
from scraper_mef.download import make_minimal_pdf
from scraper_mef.parse import PortalRow
from scraper_mef.runner import next_search_year, run_scraper


class FakeLocator:
    def __init__(
        self,
        *,
        count: int = 1,
        enabled: bool = True,
        on_click=None,
        on_select=None,
    ):
        self._count = count
        self._enabled = enabled
        self._on_click = on_click
        self._on_select = on_select

    @property
    def first(self):
        return self

    def count(self):
        return self._count

    def nth(self, _index):
        return self

    def is_enabled(self):
        return self._enabled

    def click(self):
        if self._on_click:
            self._on_click()

    def select_option(self, value):
        if self._on_select:
            self._on_select(value)


class FakeSearchPage:
    def __init__(self, outcome: str, *, year_selects: int = 1):
        self.outcome = outcome
        self.year_selects = year_selects
        self.results = outcome == "already_results"
        self.error = False
        self.selected = []
        self.clicks = 0

    def locator(self, selector):
        if selector == VISUALIZZA_SELECTOR:
            return FakeLocator(count=int(self.results))
        if selector == SEARCH_YEAR_SELECTOR:
            return FakeLocator(
                count=self.year_selects,
                on_select=lambda value: self.selected.append(value),
            )
        return FakeLocator(count=0)

    def get_by_role(self, role, *, name, exact):
        assert (role, name, exact) == ("button", "Ricerca", True)
        return FakeLocator(on_click=self._search)

    def get_by_text(self, text, *, exact):
        assert text == SEARCH_ERROR_TEXT
        return FakeLocator(count=int(self.error))

    def content(self):
        return "<html><body>MEF</body></html>"

    def _search(self):
        self.clicks += 1
        if self.outcome == "results":
            self.results = True
        elif self.outcome == "error":
            self.error = True


class TestEnsureResults(unittest.TestCase):
    def client(self, page):
        client = LiveMefClient(min_action_interval=0)
        client.page = page
        return client

    def test_form_to_results(self):
        page = FakeSearchPage("results")
        self.client(page).ensure_results(2026, timeout_ms=50)
        self.assertEqual(page.selected, ["2026"])
        self.assertEqual(page.clicks, 1)

    def test_form_to_application_error(self):
        page = FakeSearchPage("error")
        with self.assertRaises(MefPortalError) as caught:
            self.client(page).ensure_results(2026, timeout_ms=50)
        self.assertTrue(caught.exception.retryable)
        self.assertEqual(page.clicks, 1)

    def test_existing_results_do_not_touch_form(self):
        page = FakeSearchPage("already_results")
        self.client(page).ensure_results(2026, timeout_ms=50)
        self.assertEqual(page.selected, [])
        self.assertEqual(page.clicks, 0)

    def test_ambiguous_year_selector_fails_closed(self):
        page = FakeSearchPage("results", year_selects=2)
        with self.assertRaisesRegex(RuntimeError, "ambiguo"):
            self.client(page).ensure_results(2026, timeout_ms=50)
        self.assertEqual(page.clicks, 0)

    def test_akamai_asset_name_alone_is_not_a_block(self):
        self.client(FakeSearchPage("results"))._raise_if_blocked(
            body_snippet='<script src="/akamai/bot-manager.js"></script>'
        )

    def test_explicit_access_denied_is_blocked(self):
        with self.assertRaises(MefBlockedError):
            self.client(FakeSearchPage("results"))._raise_if_blocked(
                body_snippet="<h1>Access Denied</h1>"
            )

    def test_visible_text_wins_over_script_markers(self):
        class Page:
            def inner_text(self, selector, timeout):
                self.args = (selector, timeout)
                return "Ricerca Giurisprudenza"

            def content(self):
                return "<script>captcha akamai bot manager</script>"

        page = Page()
        text = self.client(page)._visible_body_text(page)
        self.assertEqual(text, "Ricerca Giurisprudenza")
        self.client(page)._raise_if_blocked(body_snippet=text)


class TestSearchYearConfig(unittest.TestCase):
    def test_list_interval_and_default(self):
        self.assertEqual(parse_search_years("2026,2025,2023", current_year=2026), [2026, 2025, 2023])
        self.assertEqual(parse_search_years("2021-2026", current_year=2026), [2026, 2025, 2024, 2023, 2022, 2021])
        self.assertEqual(parse_search_years("", current_year=2024), [2024, 2023, 2022, 2021])

    def test_rejects_out_of_range(self):
        for raw in ("2020", "2021-2027", "2026,bad"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_search_years(raw, current_year=2026)


class TestYearCheckpoint(unittest.TestCase):
    def test_resume_rotation_and_completed_years(self):
        with tempfile.TemporaryDirectory() as tmp:
            cp = Checkpoint(Path(tmp) / "checkpoint.json")
            self.assertTrue(cp.begin_year(2026))
            cp.set_position(page=3, row_index=7)
            self.assertFalse(cp.begin_year(2026))
            self.assertEqual((cp.data["last_page"], cp.data["last_row_index"]), (3, 7))

            cp.mark_year_completed(2026)
            self.assertEqual(next_search_year(cp, [2026, 2025]), 2025)
            self.assertTrue(cp.begin_year(2025))
            self.assertEqual((cp.data["last_page"], cp.data["last_row_index"]), (0, 0))
            cp.mark_year_completed(2025)
            self.assertIsNone(next_search_year(cp, [2026, 2025]))

            cp.reset_completed_years()
            self.assertEqual(next_search_year(cp, [2026, 2025]), 2026)
            self.assertEqual(cp.data["processed"], [])


class FakeYearClient:
    instance = None

    def __init__(self, *_args, **_kwargs):
        type(self).instance = self
        self.year = None
        self.ensured = []
        self.form_opens = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def open_search_form(self):
        self.form_opens += 1
        self.year = None

    def ensure_results(self, year):
        self.year = year
        self.ensured.append(year)

    def current_page_number(self):
        return 1

    def current_rows(self):
        return [
            PortalRow(
                tipo="Sentenza",
                numero="1",
                anno=str(self.year),
                corte="CGT 2° Lombardia",
                href=f"/ricerca/dettaglio/{self.year}",
                row_index=0,
            )
        ]

    def fetch_row_pdf(self, row, _tmp):
        return make_minimal_pdf(1200), row.to_meta()

    def has_next_page(self):
        return False


class PortalErrorClient(FakeYearClient):
    def ensure_results(self, year):
        raise MefPortalError(f"backend non disponibile per {year}")


class TestLiveYearOrchestration(unittest.TestCase):
    def configured(self, tmp):
        cfg = Config()
        root = Path(tmp)
        cfg.tmp_dir = root / "tmp"
        cfg.output_dir = root / "out"
        cfg.checkpoint_path = root / "checkpoint.json"
        cfg.queue_path = root / "queue.db"
        cfg.upload_enabled = False
        cfg.browser_profile = str(root / "profile")
        cfg.search_years = [2026, 2025]
        cfg.download_delay_min = 0
        cfg.download_delay_max = 0
        cfg.page_delay_sec = 0
        cfg.min_pdf_bytes = 1000
        return cfg

    def test_rotates_and_completes_only_after_final_pages(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = self.configured(tmp)
            with patch("scraper_mef.runner.LiveMefClient", FakeYearClient):
                code = run_scraper(
                    cfg=cfg,
                    mode="live",
                    max_downloads=5,
                    fixture=None,
                    output_dir=cfg.output_dir,
                    server_caches=[],
                    cdp_url="unused",
                )
            cp = Checkpoint(cfg.checkpoint_path)
            self.assertEqual(code, 0)
            self.assertEqual(cp.data["completed_years"], [2026, 2025])
            self.assertEqual(cp.data["status"], "completed")
            self.assertEqual(FakeYearClient.instance.ensured, [2026, 2025])

    def test_portal_error_is_retryable_and_does_not_complete_year(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = self.configured(tmp)
            with patch("scraper_mef.runner.LiveMefClient", PortalErrorClient):
                code = run_scraper(
                    cfg=cfg,
                    mode="live",
                    max_downloads=5,
                    fixture=None,
                    output_dir=cfg.output_dir,
                    server_caches=[],
                    cdp_url="unused",
                )
            cp = Checkpoint(cfg.checkpoint_path)
            self.assertEqual(code, 4)
            self.assertEqual(cp.data["status"], "error")
            self.assertEqual(cp.data["completed_years"], [])


if __name__ == "__main__":
    unittest.main()

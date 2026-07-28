"""
Client portale MEF.

- fixture: HTML locale
- simulate: nessun browser (PDF sintetico)
- live: Playwright via CDP su browser già aperto (stesso approccio anti-Akamai)
"""
from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

from .parse import PortalRow, parse_table_html

SITE_ORIGIN = "https://bancadatigiurisprudenza.giustiziatributaria.gov.it"
VISUALIZZA_SELECTOR = 'a[title^="Visualizza provvedimento"]'
DETTAGLIO_SCARICA_BTN = 'button[title="Scarica il pdf del provvedimento"]'


class MefClient:
    def rows_from_fixture(self, html_path: Path) -> list[PortalRow]:
        html = html_path.read_text(encoding="utf-8")
        return parse_table_html(html)

    def rows_from_html(self, html: str) -> list[PortalRow]:
        return parse_table_html(html)


class LiveMefClient:
    """Si collega a Edge/Chromium già avviato con remote debugging."""

    def __init__(self, cdp_url: str = "http://127.0.0.1:9222") -> None:
        self.cdp_url = cdp_url
        self._pw = None
        self._browser = None
        self.page = None

    def __enter__(self) -> "LiveMefClient":
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.connect_over_cdp(self.cdp_url)
        contexts = self._browser.contexts
        if not contexts:
            raise RuntimeError("Nessun context CDP — avvia Edge/Opera con remote debugging")
        pages = contexts[0].pages
        if not pages:
            raise RuntimeError("Nessuna tab aperta nel browser CDP")
        # preferisci tab con risultati MEF
        chosen = pages[0]
        for p in pages:
            try:
                if "giustiziatributaria" in (p.url or ""):
                    chosen = p
                    break
            except Exception:
                continue
        self.page = chosen
        return self

    def __exit__(self, *exc: Any) -> None:
        # Non chiudere il browser dell'utente: solo disconnect Playwright
        try:
            if self._browser:
                self._browser.close()
        except Exception:
            pass
        try:
            if self._pw:
                self._pw.stop()
        except Exception:
            pass

    def current_rows(self) -> list[PortalRow]:
        assert self.page is not None
        html = self.page.content()
        rows = parse_table_html(html)
        # arricchisci title dai link Visualizza se possibile
        try:
            titles = self.page.eval_on_selector_all(
                VISUALIZZA_SELECTOR,
                "els => els.map(e => e.getAttribute('title') || '')",
            )
            for i, row in enumerate(rows):
                if i < len(titles) and titles[i]:
                    row.title = titles[i]
        except Exception:
            pass
        return rows

    def download_row_pdf(self, row_index: int, tmp_path: Path) -> bytes:
        """Apre dettaglio della riga N e scarica il PDF."""
        assert self.page is not None
        page = self.page
        lista_url = page.url
        tmp_path.parent.mkdir(parents=True, exist_ok=True)
        vis = page.locator(VISUALIZZA_SELECTOR).nth(row_index)
        href = vis.get_attribute("href") or ""
        if href.startswith("/"):
            href = f"{SITE_ORIGIN}{href}"
        if href.startswith("http"):
            page.goto(href, timeout=60000)
        else:
            vis.click()
        page.wait_for_url("**/ricerca/dettaglio/**", timeout=60000)
        page.wait_for_selector(DETTAGLIO_SCARICA_BTN, timeout=30000)
        try:
            with page.expect_download(timeout=90000) as download_info:
                page.locator(DETTAGLIO_SCARICA_BTN).click()
            download_info.value.save_as(str(tmp_path))
        except Exception:
            pdf_url = page.evaluate(
                """() => {
                    const btn = document.querySelector('button[title="Scarica il pdf del provvedimento"]');
                    return btn ? (btn.getAttribute('data-url') || btn.dataset?.url || '') : '';
                }"""
            )
            if not pdf_url:
                onclick = page.locator(DETTAGLIO_SCARICA_BTN).get_attribute("onclick") or ""
                m = re.search(r"https?://[^'\"\\s]+\.pdf", onclick, re.I)
                pdf_url = m.group(0) if m else ""
            if pdf_url:
                if pdf_url.startswith("/"):
                    pdf_url = f"{SITE_ORIGIN}{pdf_url}"
                resp = page.context.request.get(pdf_url, timeout=90000)
                if not resp.ok:
                    raise RuntimeError(f"HTTP {resp.status} su PDF")
                tmp_path.write_bytes(resp.body())
            else:
                raise
        finally:
            try:
                if page.url != lista_url:
                    page.goto(lista_url, timeout=60000)
                    page.wait_for_selector(VISUALIZZA_SELECTOR, timeout=45000)
            except Exception:
                pass
            time.sleep(0.5)

        data = tmp_path.read_bytes()
        if not data.startswith(b"%PDF"):
            raise RuntimeError("download non è un PDF valido")
        return data

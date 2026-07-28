"""Estrazione metadati da riga tabella HTML o title link."""
from __future__ import annotations

import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Iterable

from .names import row_to_filename, title_to_filename


@dataclass
class PortalRow:
    tipo: str
    numero: str
    anno: str
    corte: str
    title: str | None = None

    def to_meta(self) -> dict:
        if self.title:
            meta = title_to_filename(self.title)
            if meta.get("ok"):
                return meta
        return row_to_filename(self.numero, self.anno, self.corte, self.tipo)


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._in_td = False
        self._current_row: list[str] | None = None
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._current_row = []
        elif tag == "td" and self._current_row is not None:
            self._in_td = True
            self._buf = ""

    def handle_endtag(self, tag):
        if tag == "td" and self._in_td and self._current_row is not None:
            self._current_row.append(self._buf.strip())
            self._in_td = False
        elif tag == "tr" and self._current_row is not None:
            if self._current_row:
                self.rows.append(self._current_row)
            self._current_row = None

    def handle_data(self, data):
        if self._in_td:
            self._buf += data


def parse_table_html(html: str) -> list[PortalRow]:
    parser = _TableParser()
    parser.feed(html)
    out: list[PortalRow] = []
    for cells in parser.rows:
        if len(cells) < 4:
            continue
        tipo, numero, anno, corte = cells[0], cells[1], cells[2], cells[3]
        if not re.fullmatch(r"\d+", numero or ""):
            continue
        if not re.fullmatch(r"\d{4}", anno or ""):
            continue
        out.append(PortalRow(tipo=tipo, numero=numero, anno=anno, corte=corte))
    return out


def validate_row(row: PortalRow) -> list[str]:
    errors: list[str] = []
    if not row.numero:
        errors.append("numero mancante")
    if not row.anno:
        errors.append("anno mancante")
    if not row.corte:
        errors.append("corte mancante")
    meta = row.to_meta()
    if not meta.get("ok"):
        errors.append(meta.get("error") or "nome non calcolabile")
    return errors


def iter_validated(rows: Iterable[PortalRow]) -> list[tuple[PortalRow, dict, list[str]]]:
    results = []
    for row in rows:
        errs = validate_row(row)
        meta = row.to_meta() if not errs else {}
        results.append((row, meta, errs))
    return results

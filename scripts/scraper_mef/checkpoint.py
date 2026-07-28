"""Checkpoint atomico per resume dopo crash."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


class Checkpoint:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.data: dict[str, Any] = {
            "version": 1,
            "last_page": 0,
            "processed": [],
            "last_nome_base": None,
        }
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            return
        self.data = json.loads(self.path.read_text(encoding="utf-8"))

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.path)

    def mark_processed(self, nome_base: str) -> None:
        processed = self.data.setdefault("processed", [])
        if nome_base not in processed:
            processed.append(nome_base)
        self.data["last_nome_base"] = nome_base
        self.save()

    def set_page(self, page: int) -> None:
        self.data["last_page"] = int(page)
        self.save()

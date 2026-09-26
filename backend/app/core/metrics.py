"""Bounded, process-local counters. No URLs, coordinates, search text, or IPs."""

from collections import Counter
from typing import Any


class OperationalMetrics:
    def __init__(self) -> None:
        self.counts: Counter[str] = Counter()
        self.duration_totals_ms: dict[str, float] = {}
        self.duration_max_ms: dict[str, float] = {}

    def record_api(self, path: str, status: int, duration_ms: float) -> None:
        route = (
            path if path in {"/api/v1/health", "/api/v1/locations", "/api/v1/weather"} else "other"
        )
        key = f"api.{route}.{status // 100}xx"
        self._record(key, duration_ms)

    def record_cache(self, kind: str, hit: bool) -> None:
        self.counts[f"cache.{kind}.{'hit' if hit else 'miss'}"] += 1

    def record_provider(self, kind: str, status: int | str, duration_ms: float) -> None:
        category = (
            "ok" if status == 200 else "rate_limited" if status in (429, "local_quota") else "error"
        )
        self._record(f"provider.{kind}.{category}", duration_ms)

    def _record(self, key: str, duration_ms: float) -> None:
        self.counts[key] += 1
        self.duration_totals_ms[key] = self.duration_totals_ms.get(key, 0) + duration_ms
        self.duration_max_ms[key] = max(self.duration_max_ms.get(key, 0), duration_ms)

    def drain(self, active_clients_60s: int) -> dict[str, Any]:
        counts = dict(self.counts)
        cache_hits = sum(value for key, value in counts.items() if key.endswith(".hit"))
        cache_misses = sum(value for key, value in counts.items() if key.endswith(".miss"))
        upstream = sum(value for key, value in counts.items() if key.startswith("provider."))
        result = {
            "event": "operational_summary",
            "period_seconds": 60,
            "counts": counts,
            "duration_avg_ms": {
                key: round(self.duration_totals_ms[key] / count, 1)
                for key, count in counts.items()
                if key in self.duration_totals_ms
            },
            "duration_max_ms": {
                key: round(value, 1) for key, value in self.duration_max_ms.items()
            },
            "cache_hit_rate": round(cache_hits / (cache_hits + cache_misses), 3)
            if cache_hits + cache_misses
            else None,
            # An estimate, not people or sessions: distinct rate-limit keys in this process.
            "active_client_keys_60s": active_clients_60s,
            "upstream_requests_per_active_client_key": round(upstream / active_clients_60s, 2)
            if active_clients_60s
            else None,
        }
        self.counts.clear()
        self.duration_totals_ms.clear()
        self.duration_max_ms.clear()
        return result

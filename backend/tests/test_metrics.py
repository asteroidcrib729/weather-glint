from backend.app.core.metrics import OperationalMetrics


def test_summary_is_bounded_and_has_no_location_or_client_identifiers() -> None:
    metrics = OperationalMetrics()
    metrics.record_api("/api/v1/weather/private-coordinate", 502, 120.0)
    metrics.record_cache("forecast", False)
    metrics.record_cache("forecast", True)
    metrics.record_provider("forecast", 200, 80.0)
    summary = metrics.drain(active_clients_60s=2)
    assert summary["cache_hit_rate"] == 0.5
    assert summary["upstream_requests_per_active_client_key"] == 0.5
    assert summary["counts"]["api.other.5xx"] == 1
    assert "private-coordinate" not in str(summary)
    assert metrics.drain(0)["counts"] == {}

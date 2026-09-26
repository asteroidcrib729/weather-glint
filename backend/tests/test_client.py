import asyncio

import httpx
import pytest

from backend.app.clients.open_meteo import OpenMeteoClient, ProviderQuota, _retry_after
from backend.app.core.config import get_settings


@pytest.mark.asyncio
async def test_concurrent_identical_requests_share_one_provider_call() -> None:
    calls = 0

    async def respond(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return httpx.Response(200, json={"results": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        provider = OpenMeteoClient(http, get_settings())
        results = await asyncio.gather(
            provider.geocode("Karachi", 5), provider.geocode("Karachi", 5)
        )
        assert results[0] == {"results": []}
        assert results[1] == {"results": []}
        assert calls == 1
        await provider.geocode("Karachi", 5)
        assert calls == 1
        key = next(iter(provider.cache))
        _, payload = provider.cache[key]
        provider.cache[key] = (0, payload)
        await provider.geocode("Karachi", 5)
        assert calls == 2


def test_retry_after_invalid_and_negative_values() -> None:
    assert _retry_after(None) is None
    assert _retry_after("invalid") is None
    assert _retry_after("-2") == 0


def test_provider_quota_counts_attempts_and_recovers_after_window() -> None:
    quota = ProviderQuota((2, 2, 2))
    assert quota.allow(0)
    assert quota.allow(1)
    assert not quota.allow(2)
    assert quota.allow(86401)


@pytest.mark.asyncio
async def test_exhausted_quota_blocks_new_upstream_call_but_not_cached_result() -> None:
    from backend.app.core.errors import ProviderError

    calls = 0

    def respond(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"results": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        provider = OpenMeteoClient(http, get_settings())
        provider.quota = ProviderQuota((1, 1, 1))
        await provider.geocode("Karachi", 5)
        await provider.geocode("Karachi", 5)
        with pytest.raises(ProviderError) as error:
            await provider.geocode("Lahore", 5)
        assert error.value.code == "provider_rate_limited"
        assert calls == 1


@pytest.mark.asyncio
async def test_malformed_success_is_not_cached_and_next_request_can_recover() -> None:
    from backend.app.core.errors import ProviderError

    calls = 0

    def respond(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(200, json={"results": [{"id": "invalid"}]})
        return httpx.Response(200, json={"results": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        provider = OpenMeteoClient(http, get_settings())
        with pytest.raises(ProviderError):
            await provider.geocode("Karachi", 5)
        assert provider.cache == {}
        assert await provider.geocode("Karachi", 5) == {"results": []}
        assert calls == 2


@pytest.mark.asyncio
async def test_expired_cached_locations_are_removed_without_key_reuse() -> None:
    async with httpx.AsyncClient() as http:
        provider = OpenMeteoClient(http, get_settings())
        provider.cache["expired-search"] = (10.0, {"results": []})
        provider.cache["active-search"] = (100.0, {"results": []})
        provider.prune_expired(50.0)
        assert list(provider.cache) == ["active-search"]

class ProviderError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


PROVIDER_UNAVAILABLE = ProviderError(
    "provider_unavailable", "Weather service is temporarily unavailable.", 502
)
PROVIDER_RATE_LIMITED = ProviderError(
    "provider_rate_limited", "Weather service is busy. Please try again shortly.", 503
)

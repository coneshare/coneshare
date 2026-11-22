from collections.abc import Iterable
from fnmatch import fnmatchcase
import re

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

MAX_ENTRIES = 500
ALLOWED_PATTERN_RE = re.compile(r'^[a-z0-9.+_%*-]+@[a-z0-9.*-]+$')


def clean_entry(raw: str) -> str:
    """Validate and normalize a single allowed email or domain wildcard pattern."""
    if not isinstance(raw, str):
        raise ValidationError("Each allowlist entry must be a string.")

    entry = raw.strip().lower()
    if not entry:
        raise ValidationError("Allowlist entries cannot be empty.")

    if entry.startswith('@'):
        entry = f"*{entry}"

    if entry.count('@') != 1 or not ALLOWED_PATTERN_RE.match(entry):
        raise ValidationError(f"Invalid email or domain pattern: '{raw}'.")

    local_part, domain_part = entry.split('@', 1)
    if not local_part or not domain_part:
        raise ValidationError(f"Invalid email or domain pattern: '{raw}'.")

    labels = domain_part.split('.')
    if len(labels) < 2 or any(not label for label in labels):
        raise ValidationError(f"Invalid domain in allowlist pattern: '{raw}'.")

    tld = labels[-1]
    if '*' in tld or '*' in labels[-2] or len(tld) < 2:
        raise ValidationError(f"Wildcard in base domain or invalid top-level domain is not allowed: '{raw}'.")

    if '*' not in entry:
        try:
            validate_email(entry)
        except ValidationError:
            raise ValidationError(f"Invalid email address: '{raw}'.")

    return entry


def normalize_entries(values: Iterable[str]) -> list[str]:
    """Validate, normalize, and deduplicate a list of allowlist entries."""
    if not isinstance(values, (list, tuple)):
        raise ValidationError("Allowed emails must be provided as a list.")

    normalized: list[str] = []
    seen: set[str] = set()

    for raw in values:
        if not isinstance(raw, str):
            raise ValidationError("Each allowlist entry must be a string.")
        if not raw.strip():
            continue
        entry = clean_entry(raw)
        if entry not in seen:
            seen.add(entry)
            normalized.append(entry)
            if len(normalized) > MAX_ENTRIES:
                raise ValidationError(f"A maximum of {MAX_ENTRIES} allowlist entries is allowed.")

    return normalized


def email_matches(email: str, patterns: Iterable[str]) -> bool:
    """Return True if the normalized candidate email matches any stored allowlist pattern."""
    candidate = (email or '').strip().lower()
    if not candidate or not patterns:
        return False

    for pattern in patterns:
        if not isinstance(pattern, str):
            continue
        normalized_pattern = pattern.strip().lower()
        if not normalized_pattern:
            continue
        if normalized_pattern.startswith('@'):
            normalized_pattern = f"*{normalized_pattern}"
        if fnmatchcase(candidate, normalized_pattern):
            return True

    return False

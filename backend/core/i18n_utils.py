from typing import Optional

from django.conf import settings
from django.utils.translation.trans_real import parse_accept_lang_header


def normalize_language_code(code: Optional[str]) -> Optional[str]:
    """
    Normalize a language code or locale tag into one of the supported language keys.
    Returns None if the language is unsupported.
    """
    if not code:
        return None
    code = code.lower().strip()
    supported_codes = dict(settings.LANGUAGES)
    if code in supported_codes:
        return code
    if code.startswith('zh'):
        return 'zh-hans'
    if code.startswith('ru'):
        return 'ru'
    if code.startswith('de'):
        return 'de'
    if code.startswith('en'):
        return 'en'
    prefix = code.split('-')[0]
    return prefix if prefix in supported_codes else None


def resolve_email_language(
    accept_header: str = '',
    user_lang: Optional[str] = None,
    request_lang: Optional[str] = None,
    default_lang: str = 'en'
) -> str:
    """
    Resolve the best supported language code for email sending or localized responses.
    Priority order:
    1. Explicit Accept-Language header matching a supported language
    2. Saved user language preference (if provided and supported)
    3. Request language code (if provided and supported)
    4. Default fallback ('en')
    """
    if accept_header:
        for lang_tag, _q in parse_accept_lang_header(accept_header):
            matched = normalize_language_code(lang_tag)
            if matched:
                return matched

    return (
        normalize_language_code(user_lang)
        or normalize_language_code(request_lang)
        or default_lang
    )

import ipaddress
import logging
import os
import re
from functools import lru_cache

from django.conf import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=128)
def _parse_proxy_network(entry: str):
    """
    Parses an IP address or CIDR string into an ipaddress network object.
    Caches results for high performance across repeated requests.
    """
    if not entry or not isinstance(entry, str):
        return None
    try:
        return ipaddress.ip_network(entry.strip(), strict=False)
    except (ValueError, TypeError):
        return None


def _is_ip_in_trusted_proxies(ip_str: str, trusted_proxies) -> bool:
    """
    Checks if a given IP string is contained in the trusted proxies configuration.
    Supports single IP strings and CIDR notations in trusted_proxies.
    """
    if not ip_str or not trusted_proxies:
        return False

    try:
        ip = ipaddress.ip_address(ip_str.strip())
    except ValueError:
        return False

    if isinstance(trusted_proxies, str):
        trusted_proxies = [p.strip() for p in trusted_proxies.split(',') if p.strip()]

    for entry in trusted_proxies:
        if isinstance(entry, (ipaddress.IPv4Network, ipaddress.IPv6Network)):
            net = entry
        elif isinstance(entry, (ipaddress.IPv4Address, ipaddress.IPv6Address)):
            if ip == entry:
                return True
            continue
        elif isinstance(entry, str):
            net = _parse_proxy_network(entry)
            if net is None:
                continue
        else:
            continue

        try:
            if ip in net:
                return True
        except (ValueError, TypeError):
            continue

    return False


def _is_valid_ip(ip_str: str) -> bool:
    """Validates whether a string is a valid IPv4 or IPv6 address."""
    if not ip_str or not isinstance(ip_str, str):
        return False
    try:
        ipaddress.ip_address(ip_str.strip())
        return True
    except ValueError:
        return False


def get_client_ip(request):
    """
    Gets the real client IP address from a request.

    Forwarding headers (X-Forwarded-For, X-Real-IP) are ONLY honoured if the
    immediate connecting peer (REMOTE_ADDR) is in TRUSTED_PROXIES. If REMOTE_ADDR
    is untrusted, REMOTE_ADDR itself is returned to prevent header spoofing.

    When REMOTE_ADDR is trusted and X-Forwarded-For is present, the header is
    traversed from right to left, returning the right-most untrusted IP address.
    If X-Forwarded-For is absent, X-Real-IP is used as a fallback.
    """
    if not request or not hasattr(request, 'META'):
        return None

    remote_addr = request.META.get('REMOTE_ADDR')
    if remote_addr:
        remote_addr = remote_addr.strip()

    if not remote_addr:
        return None

    default_proxies = ['127.0.0.1', '::1', '172.16.0.0/12']
    trusted_proxies = getattr(settings, 'TRUSTED_PROXIES', default_proxies)
    if trusted_proxies is None:
        trusted_proxies = default_proxies

    # If the immediate peer is NOT a trusted proxy, never trust forwarding headers.
    if not _is_ip_in_trusted_proxies(remote_addr, trusted_proxies):
        return remote_addr

    # If the peer IS a trusted proxy, inspect X-Forwarded-For first
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        raw_ips = [ip.strip() for ip in xff.split(',') if ip.strip()]
        # Walk from right to left to find the right-most untrusted IP
        for ip_str in reversed(raw_ips):
            if not _is_valid_ip(ip_str):
                continue
            if not _is_ip_in_trusted_proxies(ip_str, trusted_proxies):
                return ip_str

        # If all valid IPs in XFF are trusted proxies, fall back to the first valid IP
        for ip_str in raw_ips:
            if _is_valid_ip(ip_str):
                return ip_str

    # Fall back to X-Real-IP if present from the trusted proxy
    real_ip = request.META.get('HTTP_X_REAL_IP')
    if real_ip:
        real_ip = real_ip.strip()
        if _is_valid_ip(real_ip):
            return real_ip

    return remote_addr


def get_unique_name(
    model_class,
    original_name: str,
    filter_kwargs: dict,
    has_extension: bool,
    base_qs=None,
    max_length: int = 255,
) -> str:
    """
    Generates a unique name for a model instance within a given scope.
    If 'name' exists, it will suggest 'name (2)', 'name (3)', etc., truncating the
    base name when needed so the deduplicated result stays within `max_length`.
    """
    if not original_name:
        return ""

    if base_qs is None:
        if hasattr(model_class.objects, 'active'):
            base_qs = model_class.objects.active()
        else:
            base_qs = model_class.objects.all()

    # Check if the original name is available. If so, use it.
    initial_check_kwargs = filter_kwargs.copy()
    initial_check_kwargs['name'] = original_name
    if not base_qs.filter(**initial_check_kwargs).exists():
        return original_name

    if has_extension:
        base, ext = os.path.splitext(original_name)
    else:
        base, ext = original_name, ""

    # Fetch all names that could be duplicates in a single query to process in memory.
    queryset_filter_kwargs = filter_kwargs.copy()
    queryset_filter_kwargs['name__startswith'] = base
    if has_extension:
        # This makes the query more efficient for names with extensions
        queryset_filter_kwargs['name__endswith'] = ext

    queryset = base_qs.filter(**queryset_filter_kwargs).values_list('name', flat=True)
    existing_names = set(queryset)

    # Regex to find ' (number)' at the end of the name. It handles names with and without extensions.
    pattern_str = rf'^{re.escape(base)}(?: \((\d+)\))?{re.escape(ext)}$'
    pattern = re.compile(pattern_str)

    highest_num = 0
    # The original name exists, so we start counting from 1.
    if original_name in existing_names:
        highest_num = 1

    for name in existing_names:
        match = pattern.match(name)
        if match:
            # group(1) will be the number string if it exists.
            num_str = match.group(1)
            if num_str:
                num = int(num_str)
                if num > highest_num:
                    highest_num = num

    # Fast path: fits within max_length without truncating base.
    candidate = f"{base} ({highest_num + 1}){ext}"
    if max_length is None or len(candidate) <= max_length:
        return candidate

    # Long-name fallback: preserve short extensions and guarantee result fits within max_length.
    effective_base, effective_ext = (
        (original_name, "")
        if has_extension and len(ext) > 32
        else (base, ext)
    )
    sibling_names = set(base_qs.filter(**filter_kwargs).values_list('name', flat=True))
    counter = 2
    while True:
        suffix = f" ({counter})"
        if len(suffix) + len(effective_ext) >= max_length:
            allowed_len = max(0, max_length - len(suffix))
            truncated_candidate = f"{original_name[:allowed_len]}{suffix}"
        else:
            allowed_base_len = max_length - len(suffix) - len(effective_ext)
            truncated_candidate = f"{effective_base[:allowed_base_len]}{suffix}{effective_ext}"
        if truncated_candidate not in sibling_names:
            return truncated_candidate
        counter += 1


def parse_user_agent(ua_string: str) -> tuple:
    if not ua_string:
        return "Unknown OS", "Unknown Browser"

    ua_lower = ua_string.lower()
    
    # 1. Detect OS (check mobile platforms before general desktop OS like macOS)
    os_name = "Unknown OS"
    if "windows nt 10.0" in ua_lower:
        os_name = "Windows 10/11"
    elif "windows nt 6.3" in ua_lower:
        os_name = "Windows 8.1"
    elif "windows nt 6.2" in ua_lower:
        os_name = "Windows 8"
    elif "windows nt 6.1" in ua_lower:
        os_name = "Windows 7"
    elif "iphone" in ua_lower:
        os_name = "iOS (iPhone)"
    elif "ipad" in ua_lower:
        os_name = "iOS (iPad)"
    elif "android" in ua_lower:
        os_name = "Android"
    elif "macintosh" in ua_lower or "mac os x" in ua_lower:
        os_name = "macOS"
    elif "linux" in ua_lower:
        os_name = "Linux"

    # 2. Detect Browser (check specialized browsers like Opera and Edge before Chrome and Safari)
    browser_name = "Unknown Browser"
    if "edg/" in ua_lower:
        browser_name = "Microsoft Edge"
    elif "opr/" in ua_lower or "opera/" in ua_lower:
        browser_name = "Opera"
    elif "chrome/" in ua_lower or "chromium/" in ua_lower:
        browser_name = "Chrome"
    elif "safari/" in ua_lower and "applewebkit/" in ua_lower:
        browser_name = "Safari"
    elif "firefox/" in ua_lower:
        browser_name = "Firefox"
    elif "msie" in ua_lower or "trident/" in ua_lower:
        browser_name = "Internet Explorer"
    
    # Fallback to display the raw string if it's brief
    if os_name == "Unknown OS" and browser_name == "Unknown Browser" and len(ua_string) < 30:
        return ua_string, "Unknown Browser"

    return os_name, browser_name

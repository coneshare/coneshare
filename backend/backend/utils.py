import os
import re


def get_client_ip(request):
    """
    Gets the real client IP address from a request, prioritizing a trusted
    X-Real-IP header set by a proxy. If not present, it falls back to
    X-Forwarded-For and then REMOTE_ADDR.
    """
    real_ip = request.META.get('HTTP_X_REAL_IP')
    if real_ip:
        return real_ip

    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        # The first IP in the list is the original client IP.
        return xff.split(',')[0].strip()
    # If X-Forwarded-For is not present, fall back to REMOTE_ADDR.
    return request.META.get('REMOTE_ADDR')


def get_unique_name(model_class, original_name: str, filter_kwargs: dict, has_extension: bool) -> str:
    """
    Generates a unique name for a model instance within a given scope.
    If 'name' exists, it will suggest 'name (2)', 'name (3)', etc.
    This is optimized to use a single database query.

    Args:
        model_class: The Django model class to query (e.g., Document, Folder).
        original_name: The desired name for the instance.
        filter_kwargs: A dictionary of filters to define the uniqueness scope
                       (e.g., {'organization': org, 'folder': folder}).
        has_extension: A boolean indicating if the name has a file extension
                       that should be preserved.
    """
    if not original_name:
        return ""

    # Check if the original name is available. If so, use it.
    initial_check_kwargs = filter_kwargs.copy()
    initial_check_kwargs['name'] = original_name
    if not model_class.objects.filter(**initial_check_kwargs).exists():
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

    queryset = model_class.objects.filter(**queryset_filter_kwargs).values_list('name', flat=True)
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

    # The new name will have the next number in sequence.
    return f"{base} ({highest_num + 1}){ext}"


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

import os
import json
import time
import errno
import tempfile

from typing import List
from contextlib import contextmanager
from config import ROOT_DIR

# How long to wait for a lock before giving up, and how long to sleep between
# attempts. The lock only guards the brief read-modify-write on small JSON
# files, so contention is short-lived in practice.
_LOCK_TIMEOUT_SECONDS = 10.0
_LOCK_POLL_SECONDS = 0.05

def get_cache_path() -> str:
    """
    Gets the path to the cache file.

    Returns:
        path (str): The path to the cache folder
    """
    return os.path.join(ROOT_DIR, '.mp')

def get_afm_cache_path() -> str:
    """
    Gets the path to the Affiliate Marketing cache file.

    Returns:
        path (str): The path to the AFM cache folder
    """
    return os.path.join(get_cache_path(), 'afm.json')

def get_twitter_cache_path() -> str:
    """
    Gets the path to the Twitter cache file.

    Returns:
        path (str): The path to the Twitter cache folder
    """
    return os.path.join(get_cache_path(), 'twitter.json')

def get_youtube_cache_path() -> str:
    """
    Gets the path to the YouTube cache file.

    Returns:
        path (str): The path to the YouTube cache folder
    """
    return os.path.join(get_cache_path(), 'youtube.json')

def get_provider_cache_path(provider: str) -> str:
    """
    Gets the cache path for a supported account provider.

    Args:
        provider (str): The provider name ("twitter" or "youtube")

    Returns:
        path (str): The provider-specific cache path

    Raises:
        ValueError: If the provider is unsupported
    """
    if provider == "twitter":
        return get_twitter_cache_path()
    if provider == "youtube":
        return get_youtube_cache_path()

    raise ValueError(f"Unsupported provider '{provider}'. Expected 'twitter' or 'youtube'.")

@contextmanager
def _file_lock(target_path: str):
    """
    Acquires a cross-process advisory lock for a cache file.

    Uses an exclusive lock file created with ``O_CREAT | O_EXCL`` so that only
    one process can hold it at a time. This is portable across POSIX and
    Windows and does not depend on ``fcntl``/``msvcrt``. The lock is released
    (the lock file removed) when the context exits, even on error.

    Args:
        target_path (str): The cache file being protected. The lock file is
            created alongside it as ``<target_path>.lock``.

    Raises:
        TimeoutError: If the lock cannot be acquired within the timeout.
    """
    lock_path = target_path + ".lock"
    os.makedirs(os.path.dirname(lock_path), exist_ok=True)

    deadline = time.monotonic() + _LOCK_TIMEOUT_SECONDS
    fd = None
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise TimeoutError(
                    f"Timed out waiting for cache lock on '{target_path}'."
                )
            time.sleep(_LOCK_POLL_SECONDS)

    try:
        yield
    finally:
        os.close(fd)
        try:
            os.remove(lock_path)
        except OSError as e:
            # If the lock file is already gone, that's fine.
            if e.errno != errno.ENOENT:
                raise

def _atomic_write_json(path: str, data) -> None:
    """
    Writes JSON to ``path`` atomically.

    Serializes to a temporary file in the same directory and then
    ``os.replace``s it into place, so a reader never observes a half-written
    file and a crash mid-write cannot corrupt the existing cache.

    Args:
        path (str): Destination file path
        data: JSON-serializable object to write

    Returns:
        None
    """
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as file:
            json.dump(data, file, indent=4)
            file.flush()
            os.fsync(file.fileno())
        os.replace(tmp_path, path)
    except BaseException:
        # Clean up the temp file if the replace never happened.
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise

def _read_json(path: str, default):
    """
    Reads and parses a JSON file, returning ``default`` if it does not exist.

    Args:
        path (str): The file to read
        default: Value to return when the file is missing

    Returns:
        The parsed JSON, or ``default`` when the file does not exist.
    """
    if not os.path.exists(path):
        return default

    with open(path, 'r') as file:
        parsed = json.load(file)

    if parsed is None:
        return default

    return parsed

def get_accounts(provider: str) -> List[dict]:
    """
    Gets the accounts from the cache.

    Args:
        provider (str): The provider to get the accounts for

    Returns:
        account (List[dict]): The accounts
    """
    cache_path = get_provider_cache_path(provider)

    if not os.path.exists(cache_path):
        # Create the cache file atomically so concurrent readers never see a
        # partial write.
        _atomic_write_json(cache_path, {"accounts": []})

    parsed = _read_json(cache_path, {"accounts": []})

    if not isinstance(parsed, dict) or 'accounts' not in parsed:
        return []

    return parsed['accounts']

def add_account(provider: str, account: dict) -> None:
    """
    Adds an account to the cache.

    The read-modify-write is performed while holding a cross-process lock so
    that two concurrent runs (e.g. two scheduled jobs firing at once) cannot
    clobber each other's changes.

    Args:
        provider (str): The provider to add the account to ("twitter" or "youtube")
        account (dict): The account to add

    Returns:
        None
    """
    cache_path = get_provider_cache_path(provider)

    with _file_lock(cache_path):
        parsed = _read_json(cache_path, {"accounts": []})
        accounts = parsed.get('accounts', []) if isinstance(parsed, dict) else []

        accounts.append(account)

        _atomic_write_json(cache_path, {"accounts": accounts})

def remove_account(provider: str, account_id: str) -> None:
    """
    Removes an account from the cache.

    Args:
        provider (str): The provider to remove the account from ("twitter" or "youtube")
        account_id (str): The ID of the account to remove

    Returns:
        None
    """
    cache_path = get_provider_cache_path(provider)

    with _file_lock(cache_path):
        parsed = _read_json(cache_path, {"accounts": []})
        accounts = parsed.get('accounts', []) if isinstance(parsed, dict) else []

        accounts = [account for account in accounts if account['id'] != account_id]

        _atomic_write_json(cache_path, {"accounts": accounts})

def get_products() -> List[dict]:
    """
    Gets the products from the cache.

    Returns:
        products (List[dict]): The products
    """
    afm_path = get_afm_cache_path()

    if not os.path.exists(afm_path):
        _atomic_write_json(afm_path, {"products": []})

    parsed = _read_json(afm_path, {"products": []})

    if not isinstance(parsed, dict) or 'products' not in parsed:
        return []

    return parsed["products"]

def add_product(product: dict) -> None:
    """
    Adds a product to the cache.

    Args:
        product (dict): The product to add

    Returns:
        None
    """
    afm_path = get_afm_cache_path()

    with _file_lock(afm_path):
        parsed = _read_json(afm_path, {"products": []})
        products = parsed.get('products', []) if isinstance(parsed, dict) else []

        products.append(product)

        _atomic_write_json(afm_path, {"products": products})

def get_results_cache_path() -> str:
    """
    Gets the path to the results cache file.

    Returns:
        path (str): The path to the results cache folder
    """
    return os.path.join(get_cache_path(), 'scraper_results.csv')

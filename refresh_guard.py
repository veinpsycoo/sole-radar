"""OS-managed lock: a crashed collector cannot leave the next run locked out."""
from pathlib import Path
import os

if os.name == 'nt':
    import msvcrt
else:
    import fcntl


def acquire(directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    # Let a collector started before the OS-lock migration finish undisturbed.
    if (directory / 'refresh.lock').exists() and not (directory / '.refresh.guard').exists():
        raise RuntimeError('Önceki tarama çalışıyor; tamamlanmasını bekle')
    file = (directory / '.refresh.guard').open('a+b')
    if file.seek(0, 2) == 0:
        file.write(b'0')
        file.flush()
    file.seek(0)
    try:
        if os.name == 'nt':
            msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        file.close()
        raise RuntimeError('Başka bir tarama çalışıyor; tamamlanmasını bekle') from None
    return file


def release(file):
    file.seek(0)
    try:
        if os.name == 'nt':
            msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            fcntl.flock(file.fileno(), fcntl.LOCK_UN)
    finally:
        file.close()


def running(directory: Path):
    try:
        file = acquire(directory)
    except RuntimeError:
        return True
    release(file)
    return False

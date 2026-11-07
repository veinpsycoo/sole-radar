from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import refresh_guard


class GuardTests(unittest.TestCase):
    def test_legacy_collector_is_not_interrupted(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            (directory / 'refresh.lock').write_text('123')
            self.assertTrue(refresh_guard.running(directory))
            self.assertFalse((directory / '.refresh.guard').exists())

    def test_concurrent_process_and_crash_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            script = "import sys,time;from pathlib import Path;import refresh_guard;f=refresh_guard.acquire(Path(sys.argv[1]));print('locked',flush=True);time.sleep(20)"
            process = subprocess.Popen([sys.executable, '-c', script, str(directory)], stdout=subprocess.PIPE, text=True)
            try:
                self.assertEqual(process.stdout.readline().strip(), 'locked')
                self.assertTrue(refresh_guard.running(directory))
                with self.assertRaises(RuntimeError):
                    refresh_guard.acquire(directory)
                process.terminate()
                process.wait(timeout=5)
                self.assertFalse(refresh_guard.running(directory))
                file = refresh_guard.acquire(directory)
                refresh_guard.release(file)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)
                process.stdout.close()


if __name__ == '__main__':
    unittest.main()

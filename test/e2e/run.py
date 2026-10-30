"""Run every end-to-end script. Needs pyte: python3 -m venv /tmp/e2e && /tmp/e2e/bin/pip install pyte"""
import os, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
failed = []
for script in ("interactive.py", "images.py", "resume.py"):
    print(f"\n=== {script}")
    if subprocess.call([sys.executable, os.path.join(here, script)], cwd=here) != 0:
        failed.append(script)
print("\nall end-to-end checks passed" if not failed else f"\nFAILED: {', '.join(failed)}")
sys.exit(1 if failed else 0)

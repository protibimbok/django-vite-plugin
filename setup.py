#!/usr/bin/env python3
"""
Setup script for django-vite-plugin example projects.

Usage:
    python setup.py [example_name] [options]

Examples:
    python setup.py output
    python setup.py --all
    python setup.py --help
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

# Available examples
EXAMPLES = [
    "output",
    "react",
    "multi_app",
    "custom_build",
    "svelte-in-different-dir",
    "stderr",
]

# Examples with frontend in subdirectory
NESTED_FRONTEND = {
    "svelte-in-different-dir": "frontend",
    "custom_build": "frontend",
}

# Examples with non-standard manage.py location
MANAGE_PY_LOCATION = {
    "svelte-in-different-dir": "project/manage.py",
}

# Lockfile to package manager mapping
LOCKFILE_MAP = {
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "package-lock.json": "npm",
}

# Preference order when no lockfile found
PM_PREFERENCE = ["pnpm", "yarn", "npm"]

# Python package installer preference (uv is faster)
PY_INSTALLER_PREFERENCE = ["uv", "pip"]


class Colors:
    """ANSI color codes for terminal output."""

    BLUE = "\033[94m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    RESET = "\033[0m"
    BOLD = "\033[1m"

    @classmethod
    def disable(cls):
        """Disable colors (for non-TTY output)."""
        cls.BLUE = cls.GREEN = cls.YELLOW = cls.RED = cls.RESET = cls.BOLD = ""


# Disable colors if not a TTY
if not sys.stdout.isatty():
    Colors.disable()


def print_step(message: str) -> None:
    print(f"{Colors.BLUE}==>{Colors.RESET} {message}")


def print_success(message: str) -> None:
    print(f"{Colors.GREEN}[OK]{Colors.RESET} {message}")


def print_warning(message: str) -> None:
    print(f"{Colors.YELLOW}[WARN]{Colors.RESET} {message}")


def print_error(message: str) -> None:
    print(f"{Colors.RED}[ERROR]{Colors.RESET} {message}", file=sys.stderr)


def detect_package_manager(directory: Path) -> Optional[str]:
    """Detect package manager from lockfile in directory."""
    for lockfile, pm in LOCKFILE_MAP.items():
        if (directory / lockfile).exists():
            if shutil.which(pm):
                return pm
            print_warning(f"Found {lockfile} but {pm} is not installed")
    return None


def get_available_package_manager() -> Optional[str]:
    """Get first available package manager by preference."""
    for pm in PM_PREFERENCE:
        if shutil.which(pm):
            return pm
    return None


def get_package_manager(directory: Path) -> Optional[str]:
    """Get package manager for directory (from lockfile or preference)."""
    # First try to detect from lockfile
    pm = detect_package_manager(directory)
    if pm:
        return pm

    # Fall back to preference order
    return get_available_package_manager()


def run_command(cmd: List[str], cwd: Optional[Path] = None) -> bool:
    """Run a command and return success status."""
    try:
        subprocess.run(cmd, cwd=cwd, check=True)
        return True
    except subprocess.CalledProcessError:
        return False
    except FileNotFoundError:
        print_error(f"Command not found: {cmd[0]}")
        return False


def check_command_works(cmd: List[str]) -> bool:
    """Check if a command runs successfully."""
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return False


def get_python_installer() -> Optional[str]:
    """Get Python package installer (uv preferred, then pip)."""
    # Check for uv in PATH
    if shutil.which("uv"):
        return "uv"

    # When running via 'uv run', uv might not be in PATH but pip will work
    # Check pip as module first (most reliable)
    if check_command_works([sys.executable, "-m", "pip", "--version"]):
        return "pip"

    # Check for pip in PATH
    if shutil.which("pip"):
        return "pip"

    return None


def setup_vite_plugin(project_root: Path) -> bool:
    """Build the Vite plugin."""
    print_step("Building Vite plugin...")
    vite_dir = project_root / "vite"

    pm = get_package_manager(vite_dir)
    if not pm:
        print_error("No package manager found. Install pnpm, yarn, or npm.")
        return False

    print_step(f"Using {pm}")

    if not run_command([pm, "install"], cwd=vite_dir):
        print_error(f"{pm} install failed")
        return False

    if not run_command([pm, "run", "build"], cwd=vite_dir):
        print_error(f"{pm} build failed")
        return False

    print_success("Vite plugin built")
    return True


def setup_django_package(project_root: Path, installer: str) -> bool:
    """Install the Django package in editable mode."""
    print_step(f"Installing Django package with {installer}...")
    django_dir = project_root / "django"

    if installer == "uv":
        # Use --system if not in a venv to install to system Python
        in_venv = os.environ.get("VIRTUAL_ENV") is not None
        cmd = ["uv", "pip", "install", "-e", "."]
        if not in_venv:
            cmd.append("--system")
    else:
        # Use python -m pip (more reliable than bare pip)
        cmd = [sys.executable, "-m", "pip", "install", "-e", "."]

    try:
        subprocess.run(cmd, cwd=django_dir, check=True)
        print_success("Django package installed")
        return True
    except subprocess.CalledProcessError:
        print_error(f"{installer} install failed")
        return False


def setup_example(project_root: Path, example_name: str) -> bool:
    """Set up a single example project."""
    example_path = project_root / "example" / example_name

    if not example_path.exists():
        print_error(f"Example '{example_name}' not found at {example_path}")
        return False

    print_step(f"Setting up example: {example_name}")

    # Determine npm directory (some examples have frontend in subdirectory)
    npm_dir = example_path
    if example_name in NESTED_FRONTEND:
        npm_dir = example_path / NESTED_FRONTEND[example_name]

    package_json = npm_dir / "package.json"
    if not package_json.exists():
        print_warning(f"No package.json found in {npm_dir}")
        return True

    pm = get_package_manager(npm_dir)
    if not pm:
        print_error("No package manager found. Install pnpm, yarn, or npm.")
        return False

    print_step(f"Installing dependencies with {pm}...")
    if not run_command([pm, "install"], cwd=npm_dir):
        print_error(f"{pm} install failed")
        return False

    print_success(f"Example '{example_name}' is ready")
    print_run_instructions(example_name, example_path, npm_dir, pm)
    return True


def print_run_instructions(
    example_name: str, example_path: Path, npm_dir: Path, pm: str
) -> None:
    """Print instructions for running the example."""
    print()
    print("To run this example:")
    print(f"  cd example/{example_name}")
    print()
    print("  # Terminal 1 - Django:")
    manage_py = MANAGE_PY_LOCATION.get(example_name, "manage.py")
    print(f"  python {manage_py} runserver")
    print()
    print("  # Terminal 2 - Vite:")
    if npm_dir != example_path:
        subdir = npm_dir.relative_to(example_path)
        print(f"  cd {subdir} && {pm} run dev")
    else:
        print(f"  {pm} run dev")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="Setup script for django-vite-plugin example projects",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Available examples:
  {', '.join(EXAMPLES)}

Examples:
  python setup.py output       Setup the 'output' example
  python setup.py --all        Setup all examples
  python setup.py --vite-only  Only build the Vite plugin
""",
    )

    parser.add_argument(
        "example",
        nargs="?",
        choices=EXAMPLES,
        metavar="EXAMPLE",
        help=f"Example to set up ({', '.join(EXAMPLES)})",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Setup all example projects",
    )
    parser.add_argument(
        "--vite-only",
        action="store_true",
        help="Only build the Vite plugin",
    )
    parser.add_argument(
        "--django-only",
        action="store_true",
        help="Only install Django package",
    )
    parser.add_argument(
        "--skip-core",
        action="store_true",
        help="Skip building core packages (only set up example)",
    )

    args = parser.parse_args()

    # Determine project root (script is in root)
    script_path = Path(__file__).resolve()
    project_root = script_path.parent

    print()
    print(f"{Colors.BOLD}Django Vite Plugin - Setup{Colors.RESET}")
    print("=" * 26)
    print()

    # Check Python installer (uv or pip)
    py_installer = get_python_installer()
    if not py_installer:
        print_error("No Python installer found. Install uv or pip.")
        sys.exit(1)

    # Check for at least one JS package manager
    if not get_available_package_manager():
        print_error("No package manager found. Install pnpm, yarn, or npm.")
        sys.exit(1)

    print_success(f"Requirements check passed (python: {py_installer})")

    # Build core packages
    if not args.skip_core:
        if not args.django_only:
            if not setup_vite_plugin(project_root):
                sys.exit(1)

        if not args.vite_only:
            if not setup_django_package(project_root, py_installer):
                sys.exit(1)

    # Exit early if only building core
    if args.vite_only or args.django_only:
        print_success("Done")
        sys.exit(0)

    # Handle example setup
    if args.all:
        failed = []
        for example in EXAMPLES:
            if not setup_example(project_root, example):
                failed.append(example)

        if failed:
            print_error(f"Failed to set up: {', '.join(failed)}")
            sys.exit(1)

        print_success("All examples are ready!")

    elif args.example:
        if not setup_example(project_root, args.example):
            sys.exit(1)

    else:
        print()
        print_warning("No example specified. Core packages are installed.")
        print()
        print("To set up an example project:")
        print("  python setup.py output")
        print("  python setup.py --all")
        print()
        print(f"Available: {', '.join(EXAMPLES)}")


if __name__ == "__main__":
    main()

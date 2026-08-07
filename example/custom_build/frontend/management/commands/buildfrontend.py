import shutil
import subprocess
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

PROJECT_DIR = Path(__file__).resolve().parents[3]


class Command(BaseCommand):
    help = 'Install frontend dependencies and make a production build.'

    def handle(self, *args, **options):
        # shutil.which also finds pnpm.cmd/npm.cmd on Windows.
        runner = shutil.which('pnpm') or shutil.which('npm')
        if runner is None:
            raise CommandError('Neither pnpm nor npm was found on PATH.')

        for command in ([runner, 'install'], [runner, 'run', 'build']):
            self.stdout.write(f'Running {" ".join(command[1:])} in {PROJECT_DIR}...')
            result = subprocess.run(command, cwd=PROJECT_DIR)
            if result.returncode != 0:
                raise CommandError(
                    f'`{" ".join(command)}` failed with exit code {result.returncode}'
                )

        self.stdout.write(self.style.SUCCESS('Frontend built into frontend/dist/'))

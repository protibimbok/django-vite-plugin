from typing import Any
from django.core.management.base import BaseCommand, CommandParser
import django
from ...config_helper import get_config
import json

CONFIG = get_config()
CONFIG['BUILD_DIR'] = CONFIG['BUILD_DIR'].strip('/\\')

class Command(BaseCommand):
    help = 'Communicates with the django-vite-plugin'

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument('action')

    def handle(self, *args: Any, **options: Any) -> None:
        if options['action'] == 'config':
            self.stdout.write(
                json.dumps(CONFIG)
            )
        elif options['action'] == 'version':
            self.stdout.write(
                json.dumps(django.get_version()),
                ending=''
            )

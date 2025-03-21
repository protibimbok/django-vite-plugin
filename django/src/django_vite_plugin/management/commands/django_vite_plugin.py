from typing import Any
from django.core.management.base import BaseCommand, CommandParser
import django
import json
from ...config_helper import get_config
from .utils import format_config_for_output, find_static_assets

class Command(BaseCommand):
    """Management command for django-vite-plugin operations."""
    help = 'Communicates with the django-vite-plugin'

    def add_arguments(self, parser: CommandParser) -> None:
        """Add command arguments."""
        parser.add_argument(
            '--find-static',
            help='List of the assets to find',
            nargs='*'
        )

        parser.add_argument(
            '--action',
            help='Specifies the action to be taken',
            default='find_static'
        )

    def handle(self, **options: Any) -> None:
        """Handle the command execution."""
        if options['action'] == 'config':
            self.print_config()
        elif options['action'] == 'version':
            self.stdout.write(
                json.dumps(django.get_version()),
                ending=''
            )
        elif options['find_static'] is not None:
            founds = find_static_assets(options['find_static'])
            self.stdout.write(
                json.dumps(founds),
                ending=''
            )
    
    def print_config(self):
        """Print the current configuration."""
        config = get_config()
        config = format_config_for_output(config)
        self.stdout.write(json.dumps(config))

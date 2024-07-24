from typing import Any, Dict, List
from django.apps import apps
from django.core.management.base import BaseCommand, CommandParser
from django.conf import settings
import django
from ...config_helper import get_config
from ...utils import find_asset
import json


class Command(BaseCommand):
    help = 'Communicates with the django-vite-plugin'

    def add_arguments(self, parser: CommandParser) -> None:
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
        if options['action'] == 'config':
            self.print_config()
        elif options['action'] == 'version':
            self.stdout.write(
                json.dumps(django.get_version()),
                ending=''
            )
        elif options['find_static'] is not None:
            founds = [find_asset(asset) for asset in options['find_static']]
            self.stdout.write(
                json.dumps(founds),
                ending=''
            )
    
    def get_apps(self) -> Dict[str, str]:
        APPS= {}
        app_configs = apps.get_app_configs()
        for app_config in app_configs:
            name = app_config.name
            if '.' in name or name == 'django_vite_plugin':
                continue
            APPS[name] = app_config.path
        return APPS

    def print_config(self):
        CONFIG = get_config()
        if isinstance(CONFIG["BUILD_DIR"], str):
            CONFIG["BUILD_DIR"] = CONFIG["BUILD_DIR"].strip("/\\")
        else:
            CONFIG["BUILD_DIR"] = str(CONFIG["BUILD_DIR"])
        CONFIG['MANIFEST'] = str(CONFIG['MANIFEST'])
        CONFIG['INSTALLED_APPS'] = self.get_apps()
        self.stdout.write(
            json.dumps(CONFIG)
        )

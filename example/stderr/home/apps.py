from django.apps import AppConfig


class HomeConfig(AppConfig):
    name = 'home'

    def ready(self):
        # Registers the intentional system-check warning.
        from . import checks  # noqa: F401

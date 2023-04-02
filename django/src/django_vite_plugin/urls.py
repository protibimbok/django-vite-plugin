from django.conf import settings
from django.conf.urls.static import static
from .config_helper import get_config

CONFIG = get_config()

urlpatterns = []

if not CONFIG['DEV_MODE']:
    urlpatterns = static(CONFIG['BUILD_URL_PREFIX'].strip('/'), document_root=settings.BASE_DIR / CONFIG['BUILD_DIR'])
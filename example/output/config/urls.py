from django.urls import include, path

urlpatterns = [
    # Serves the production build at BUILD_URL_PREFIX when DEV_MODE is off
    # (only while DEBUG is True — Django never serves static files without it).
    path('', include('django_vite_plugin.urls')),
    path('', include('home.urls')),
]

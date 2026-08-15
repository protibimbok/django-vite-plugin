from django.shortcuts import render


def home(request):
    return render(request, 'home/index.html', {
        # Asset paths and attribute values may come from the view context;
        # the demo page passes these straight to {% vite %}.
        'dyn_js': 'static/dynamic.js',
        'dyn_css': 'static/dynamic.css',
        'dyn_attr': 'from-view-context',
    })

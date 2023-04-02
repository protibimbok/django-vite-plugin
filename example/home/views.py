from django.shortcuts import render

# Create your views here.
def home(req):
    return render(req, 'index.html', {
        'dyn_js' : 'a_dynamic_js.js',
        'dyn_css' : 'a_dynamic_css.css',
        'dyn_attr': 'A dynamic attr'
    })
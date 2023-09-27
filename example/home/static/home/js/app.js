import { find } from './utils'
import { createApp } from 'vue'
import { showAlert } from '@s:home/js/deep/deep.js'
import VueCounter from '@t:home/vue/counter.vue'
import '@s:home/css/imported.css'

import "inter-ui/inter.css"

find("#next-move").addEventListener("click", showAlert);

createApp(VueCounter).mount("#vue-app");

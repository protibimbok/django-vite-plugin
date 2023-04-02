import Swal from "sweetalert2";
import { find } from "./utils";
import { createApp } from "vue";
import VueCounter from "@/home/templates/vue/counter.vue";

find("#next-move").addEventListener("click", () => {
    let timerInterval;
    Swal.fire({
        title: "ChatGPT is going to take your job, what are going to do about it?!",
        html: "Time to decide: <b></b>.",
        timer: 2000,
        timerProgressBar: true,
        didOpen: () => {
            Swal.showLoading();
            const b = Swal.getHtmlContainer().querySelector("b");
            timerInterval = setInterval(() => {
                b.textContent = Swal.getTimerLeft();
            }, 100);
        },
        willClose: () => {
            clearInterval(timerInterval);
        },
    });
});

createApp(VueCounter).mount("#vue-app");

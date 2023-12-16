import Swal from "sweetalert2";

export const showAlert = () => {
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
}
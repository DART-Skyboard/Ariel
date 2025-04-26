document.addEventListener("DOMContentLoaded", () => {
  const privacyModal = document.getElementById("privacy-modal");
  const accepted = localStorage.getItem("acceptedPrivacy");
  if (!accepted) {
    privacyModal.style.display = "flex";
  }
  document.getElementById("accept-privacy").onclick = () => {
    localStorage.setItem("acceptedPrivacy", "yes");
    privacyModal.style.display = "none";
  };

  const historyEl = document.getElementById("chat-history");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg) return;
    appendMessage("You", msg);
    input.value = "";

    // call /api/chat
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    const { reply } = await res.json();
    appendMessage("Autumn", reply);
  });

  function appendMessage(who, text) {
    const div = document.createElement("div");
    div.className = `msg ${who === "You" ? "user" : "bot"}`;
    div.innerHTML = `<strong>${who}:</strong> ${text}`;
    historyEl.appendChild(div);
    historyEl.scrollTop = historyEl.scrollHeight;
  }
});

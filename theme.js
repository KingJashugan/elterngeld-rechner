(function () {
  var root = document.documentElement, btn = document.getElementById("themeToggle");
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  function current() { return root.dataset.theme || (mq.matches ? "dark" : "light"); }
  function render() {
    var dark = current() === "dark";
    btn.textContent = dark ? "☀ Hell" : "☾ Dunkel";
    btn.setAttribute("aria-label", dark ? "Zum hellen Modus wechseln" : "Zum dunklen Modus wechseln");
  }
  btn.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* ignorieren */ }
    render();
  });
  mq.addEventListener("change", render);
  render();
})();

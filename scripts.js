// Expand / collapse service panels on the dashboard
document.querySelectorAll(".service[data-panel]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const panel = document.getElementById(btn.dataset.panel);
    if (panel) panel.classList.toggle("open");
  });
});

// Tabs on the My Forms page
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.target).classList.add("active");
  });
});

// Draft expiry countdown (14-day retention)
document.querySelectorAll("[data-created]").forEach((el) => {
  const created = new Date(el.dataset.created);
  const expires = new Date(created.getTime() + 14 * 24 * 60 * 60 * 1000);
  const days = Math.ceil((expires - new Date()) / (24 * 60 * 60 * 1000));
  el.textContent = days > 0 ? days + " day(s) left" : "Expired";
});

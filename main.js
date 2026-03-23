import './style.css';

document.addEventListener("DOMContentLoaded", () => {
  const iframe = document.getElementById("gee-iframe");
  const spinner = document.querySelector(".media-placeholder");

  // Remove spinner once iframe loads
  if (iframe && spinner) {
    iframe.onload = () => {
      iframe.classList.add("loaded");
      spinner.style.opacity = "0";
      setTimeout(() => spinner.remove(), 500);
    };
  }

  // Intersection Observer for fade-in elements
  const sections = document.querySelectorAll(".fade-in-section");
  
  const observerOptions = {
    root: null,
    rootMargin: "0px",
    threshold: 0.15
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  }, observerOptions);

  sections.forEach(section => observer.observe(section));
});

document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".site-header");
  const menuButton = document.querySelector("#menuToggle");
  const nav = document.querySelector("#primaryNav");
  const topButton = document.querySelector("#backToTop");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const updateScrollUI = () => {
    if (header) header.classList.toggle("scrolled", window.scrollY > 20);
    if (topButton) topButton.hidden = window.scrollY < 350;
  };
  updateScrollUI();
  window.addEventListener("scroll", updateScrollUI, { passive: true });

  const closeMenu = () => {
    if (!menuButton || !nav) return;
    nav.classList.remove("menu-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
    menuButton.innerHTML = "<span></span><span></span><span></span>";
  };
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = nav.classList.toggle("menu-open");
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      menuButton.innerHTML = open ? '<span class="menu-x">×</span>' : "<span></span><span></span><span></span>";
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", event => { if (event.key === "Escape") { closeMenu(); menuButton.focus(); } });
    document.addEventListener("click", event => { if (nav.classList.contains("menu-open") && !nav.contains(event.target) && !menuButton.contains(event.target)) closeMenu(); });
  }

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -25px 0px" });
    revealItems.forEach(item => observer.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add("is-visible"));
  }

  if (topButton) topButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));
  const contactForm = document.querySelector("#contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", event => {
      if (!contactForm.checkValidity()) {
        event.preventDefault();
        contactForm.reportValidity();
        return;
      }
      const attachment = contactForm.querySelector('#contactAttachment');
      if (attachment && attachment.files.length && attachment.files[0].size > 10 * 1024 * 1024) {
        event.preventDefault();
        attachment.setCustomValidity('Please choose a file smaller than or equal to 10 MB.');
        attachment.reportValidity();
        attachment.setCustomValidity('');
        return;
      }
      const submitButton = contactForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
        submitButton.innerHTML = 'Submitting…';
      }
    });
  }

  const year = document.querySelector("#currentYear");
  if (year) year.textContent = new Date().getFullYear();


  // Accessible Services dropdown: click/tap, Escape, and close after choosing a link.
  document.querySelectorAll(".nav-dropdown").forEach(dropdown => {
    const toggle = dropdown.querySelector(".nav-dropdown-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", event => {
      event.stopPropagation();
      const open = dropdown.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    dropdown.querySelectorAll(".nav-dropdown-menu a").forEach(link => link.addEventListener("click", () => {
      dropdown.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { dropdown.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("click", event => {
      if (!dropdown.contains(event.target)) { dropdown.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
    });
  });

});

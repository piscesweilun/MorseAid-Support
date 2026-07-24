(() => {
  const body = document.body;
  const buttons = document.querySelectorAll("[data-language]");
  const preferredLanguage = navigator.language.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";

  function setLanguage(language) {
    body.dataset.lang = language;
    document.documentElement.lang = language === "zh" ? "zh-Hant" : "en";

    buttons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.language === language),
      );
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      setLanguage(button.dataset.language);
    });
  });

  document.querySelectorAll("[data-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  setLanguage(preferredLanguage);
})();

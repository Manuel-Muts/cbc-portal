(() => {
  const STORAGE_KEY = "teacherDisplayPreferences";
  const textSizeOptions = new Set(["small", "medium", "large"]);
  const densityOptions = new Set(["comfortable", "compact"]);
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const readPreferences = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return {
        textSize: textSizeOptions.has(saved?.textSize) ? saved.textSize : "medium",
        density: densityOptions.has(saved?.density) ? saved.density : "comfortable",
        reducedMotion: typeof saved?.reducedMotion === "boolean"
          ? saved.reducedMotion
          : reducedMotionQuery.matches
      };
    } catch (error) {
      console.warn("Could not load teacher display preferences:", error);
      return {
        textSize: "medium",
        density: "comfortable",
        reducedMotion: reducedMotionQuery.matches
      };
    }
  };

  const applyPreferences = (preferences) => {
    const root = document.documentElement;
    root.dataset.teacherTextSize = preferences.textSize;
    root.dataset.teacherDensity = preferences.density;
    root.dataset.teacherReducedMotion = String(preferences.reducedMotion);
  };

  const savePreferences = (preferences) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.warn("Could not save teacher display preferences:", error);
    }
  };

  const initialize = () => {
    const textSizeInputs = document.querySelectorAll('input[name="teacherTextSize"]');
    const densityInputs = document.querySelectorAll('input[name="teacherLayoutDensity"]');
    const reducedMotionInput = document.getElementById("teacherReducedMotion");
    const status = document.getElementById("teacherSettingsStatus");
    if (!textSizeInputs.length || !densityInputs.length || !reducedMotionInput) return;

    const preferences = readPreferences();
    const updateSettings = (message) => {
      applyPreferences(preferences);
      savePreferences(preferences);
      if (status) status.textContent = message;
    };

    textSizeInputs.forEach(input => {
      input.checked = input.value === preferences.textSize;
      input.addEventListener("change", () => {
        if (!input.checked || !textSizeOptions.has(input.value)) return;
        preferences.textSize = input.value;
        updateSettings("Text size updated.");
      });
    });

    densityInputs.forEach(input => {
      input.checked = input.value === preferences.density;
      input.addEventListener("change", () => {
        if (!input.checked || !densityOptions.has(input.value)) return;
        preferences.density = input.value;
        updateSettings("Layout density updated.");
      });
    });

    reducedMotionInput.checked = preferences.reducedMotion;
    reducedMotionInput.addEventListener("change", () => {
      preferences.reducedMotion = reducedMotionInput.checked;
      updateSettings("Motion preference updated.");
    });

    applyPreferences(preferences);
    if (status) status.textContent = "Preferences are saved on this device.";
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();

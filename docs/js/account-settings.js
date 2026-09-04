(() => {
  const API_BASE = window.config?.api?.baseURL;
  const tokenKey = window.config?.auth?.tokenKey || "token";
  const userKey = window.config?.auth?.userKey || "loggedInUser";

  const style = document.createElement("style");
  style.textContent = `
    .account-settings-modal { position: fixed; inset: 0; z-index: 30000; display: flex; align-items: center; justify-content: center; padding: 18px; background: radial-gradient(circle at 50% 10%, rgba(45,212,191,.16), transparent 32%), rgba(15, 23, 42, .58); backdrop-filter: blur(10px) saturate(120%); opacity: 0; transition: opacity .22s ease; }
    .account-settings-modal.account-settings-visible { opacity: 1; }
    .account-settings-dialog { position: relative; width: min(330px, 100%); padding: 24px 22px 20px; border: 1px solid rgba(255,255,255,.88); border-radius: 20px; background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(239,250,252,.96)); box-shadow: 0 30px 90px rgba(2,12,27,.38), inset 0 1px 0 #fff; transform: translateY(10px) scale(.96); transition: transform .22s ease; overflow: hidden; }
    .account-settings-dialog::before { content: ""; position: absolute; inset: 0 0 auto; height: 5px; background: linear-gradient(90deg, #0f766e, #2dd4bf, #2563eb); }
    .account-settings-dialog::after { content: ""; position: absolute; width: 150px; height: 150px; right: -92px; top: 62px; border: 1px solid rgba(15,118,110,.12); border-radius: 50%; box-shadow: 0 0 0 18px rgba(15,118,110,.035), 0 0 0 36px rgba(15,118,110,.025); pointer-events: none; }
    .account-settings-visible .account-settings-dialog { transform: translateY(0) scale(1); }
    .account-settings-close { position: absolute; top: 14px; right: 14px; z-index: 2; width: 28px; height: 28px; border: 1px solid #dbe5ee; border-radius: 50%; background: rgba(255,255,255,.7); color: #64748b; font-size: 1.2rem; line-height: 1; cursor: pointer; }
    .account-settings-close:hover { background: #dbeafe; color: #1d4ed8; }
    .account-settings-heading { position: relative; z-index: 1; display: flex; align-items: center; gap: 11px; margin-bottom: 15px; }
    .account-settings-icon { display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid rgba(255,255,255,.75); border-radius: 13px; background: linear-gradient(145deg, #0f766e, #2dd4bf); color: #fff; font-size: 1.1rem; box-shadow: 0 10px 22px rgba(15,118,110,.24); }
    .account-settings-eyebrow { margin: 0 0 5px; color: #0f766e; font-size: .62rem; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; }
    .account-settings-dialog h2 { margin: 0; color: #102a43; font-family: Georgia, serif; font-size: 1.38rem; font-weight: 600; letter-spacing: 0; }
    .account-settings-subtitle { margin: -4px 0 14px 49px; color: #627d98; font-size: .78rem; }
    .account-settings-form label { display: grid; gap: 5px; margin-top: 11px; color: #486581; font-size: .7rem; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
    .account-settings-input-wrap { position: relative; }
    .account-settings-form input { width: 100%; padding: 11px 42px 11px 13px; border: 1px solid #c7d7e2; border-radius: 10px; background: rgba(255,255,255,.84); color: #172033; font: inherit; transition: border-color .18s ease, box-shadow .18s ease, background .18s ease; }
    .account-settings-form input:focus { outline: 0; border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37,99,235,.12); }
    .account-settings-toggle { position: absolute; top: 50%; right: 10px; transform: translateY(-50%); border: 0; background: transparent; color: #64748b; font-size: .72rem; font-weight: 800; cursor: pointer; }
    .account-settings-toggle:hover { color: #2563eb; }
    .account-settings-hint { margin: 8px 0 0; color: #627d98; font-size: .75rem; }
    .account-settings-strength { display: grid; gap: 5px; margin-top: 7px; }
    .account-settings-strength-bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
    .account-settings-strength-bars span { height: 4px; border-radius: 4px; background: #dbe5ee; transition: background .18s ease; }
    .account-settings-strength-label { color: #627d98; font-size: .7rem; font-weight: 700; }
    .account-settings-error { min-height: 20px; margin: 12px 0 0; color: #dc2626; font-size: .8rem; }
    .account-settings-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 6px; }
    .account-settings-actions button { padding: 9px 13px; border: 0; border-radius: 9px; font: inherit; font-size: .76rem; font-weight: 800; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease; }
    .account-settings-actions button:hover { transform: translateY(-1px); }
    .account-settings-cancel { border: 1px solid #d6e1e8 !important; background: rgba(255,255,255,.7); color: #486581; }
    .account-settings-submit { background: linear-gradient(135deg, #0f766e, #2563eb); color: #fff; box-shadow: 0 8px 18px rgba(37,99,235,.2); }
    .account-settings-submit:disabled { cursor: wait; opacity: .65; }
  `;
  document.head.appendChild(style);

  const getToken = () => window.authService?.getToken?.() || localStorage.getItem(tokenKey);

  const request = async (path, body) => {
    const token = getToken();
    if (!API_BASE || !token) throw new Error("Your session has expired. Please log in again.");

    const response = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  };

  const closeModal = (modal) => {
    modal.classList.remove("account-settings-visible");
    setTimeout(() => modal.remove(), 180);
  };

  const showModal = ({ title, subtitle, icon, fields, submitText, onSubmit }) => {
    const modal = document.createElement("div");
    modal.className = "account-settings-modal";
    modal.innerHTML = `
      <div class="account-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="accountSettingsTitle">
        <button class="account-settings-close" type="button" aria-label="Close">&times;</button>
        <div class="account-settings-heading"><span class="account-settings-icon" aria-hidden="true">${icon}</span><div><p class="account-settings-eyebrow">Account settings</p><h2 id="accountSettingsTitle">${title}</h2></div></div>
        <p class="account-settings-subtitle">${subtitle}</p>
        <form class="account-settings-form">
          ${fields.map(field => `
            <label>${field.label}<span class="account-settings-input-wrap"><input name="${field.name}" type="${field.type || "text"}" autocomplete="${field.autocomplete || "off"}" ${field.strength ? "data-strength" : ""} required>${field.type === "password" ? `<button class="account-settings-toggle" type="button" data-toggle-password aria-label="Show ${field.label}">Show</button>` : ""}</span>${field.strength ? `<span class="account-settings-strength"><span class="account-settings-strength-bars"><span></span><span></span><span></span><span></span></span><span class="account-settings-strength-label">Start typing to check strength</span></span>` : ""}${field.hint ? `<span class="account-settings-hint">${field.hint}</span>` : ""}</label>
          `).join("")}
          <p class="account-settings-error" role="alert"></p>
          <div class="account-settings-actions">
            <button class="account-settings-cancel" type="button">Cancel</button>
            <button class="account-settings-submit" type="submit">${submitText}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("account-settings-visible"));

    const form = modal.querySelector("form");
    const error = modal.querySelector(".account-settings-error");
    const submit = modal.querySelector(".account-settings-submit");
    const close = () => closeModal(modal);
    modal.querySelector(".account-settings-close").onclick = close;
    modal.querySelector(".account-settings-cancel").onclick = close;
    modal.querySelectorAll("[data-toggle-password]").forEach(toggle => {
      toggle.onclick = () => {
        const input = toggle.parentElement.querySelector("input");
        const isVisible = input.type === "text";
        input.type = isVisible ? "password" : "text";
        toggle.textContent = isVisible ? "Show" : "Hide";
        toggle.setAttribute("aria-label", `${isVisible ? "Show" : "Hide"} ${input.name}`);
      };
    });
    const strengthInput = modal.querySelector("input[data-strength]");
    if (strengthInput) {
      const bars = modal.querySelectorAll(".account-settings-strength-bars span");
      const strengthLabel = modal.querySelector(".account-settings-strength-label");
      strengthInput.addEventListener("input", () => {
        const value = strengthInput.value;
        const score = [value.length >= 8, /[a-z]/.test(value) && /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
        const colors = ["#ef4444", "#f59e0b", "#eab308", "#16a34a"];
        const labels = ["Very weak", "Needs improvement", "Good", "Strong"];
        bars.forEach((bar, index) => { bar.style.background = index < score ? colors[Math.max(0, score - 1)] : "#dbe5ee"; });
        strengthLabel.textContent = value ? labels[Math.max(0, score - 1)] || "Very weak" : "Start typing to check strength";
        strengthLabel.style.color = value ? colors[Math.max(0, score - 1)] || colors[0] : "#627d98";
      });
    }
    modal.addEventListener("click", event => { if (event.target === modal) close(); });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      error.textContent = "";
      submit.disabled = true;
      submit.textContent = "Updating...";
      try {
        await onSubmit(Object.fromEntries(new FormData(form)));
        window.alert("Your account details were updated successfully.");
        close();
      } catch (err) {
        error.textContent = err.message || "Unable to update account details.";
        submit.disabled = false;
        submit.textContent = submitText;
      }
    });
    modal.querySelector("input")?.focus();
  };

  const persistUser = (data) => {
    if (data.token) localStorage.setItem(tokenKey, data.token);
    if (data.user) localStorage.setItem(userKey, JSON.stringify(data.user));
    localStorage.removeItem("user_profile_cache");
  };

  const openPasswordModal = () => showModal({
    title: "Change password",
    subtitle: "Protect your account with a new password.",
    icon: "🔑",
    submitText: "Update password",
    fields: [
      { name: "currentPassword", label: "Current password", type: "password", autocomplete: "current-password" },
      { name: "newPassword", label: "New password", type: "password", autocomplete: "new-password", strength: true, hint: "Use 8+ characters with upper/lowercase, a number, and a symbol, e.g. @ # ! $ %." }
    ],
    onSubmit: async values => {
      if (values.newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
      const data = await request("/users/change-password", values);
      persistUser(data);
      window.location.reload();
    }
  });

  const openEmailModal = () => showModal({
    title: "Change email address",
    subtitle: "Your new address will be used for future sign-ins.",
    icon: "✉",
    submitText: "Update email",
    fields: [
      { name: "currentPassword", label: "Current password", type: "password", autocomplete: "current-password" },
      { name: "newEmail", label: "New email address", type: "email", autocomplete: "email" }
    ],
    onSubmit: async values => {
      const data = await request("/users/change-email", values);
      persistUser(data);
      document.querySelectorAll("[data-account-email]").forEach(element => { element.textContent = values.newEmail; });
    }
  });

  window.accountSettings = { openPasswordModal, openEmailModal };

  document.addEventListener("click", event => {
    if (event.target.closest("[data-account-action='password']")) openPasswordModal();
    if (event.target.closest("[data-account-action='email']")) openEmailModal();
  }, true);
})();

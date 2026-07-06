// API_BASE is now loaded from config.js
// To change the API endpoint, update config.js

document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("loginForm");
  const changePasswordForm = document.getElementById("changePasswordForm");
  if (!loginForm) return;

  const roleSelect = document.getElementById("role");

  const firstnameField = document.getElementById("firstname");
  const firstnameLabel = document.getElementById("firstnameLabel");
  const admissionField = document.getElementById("admission");
  const admissionLabel = document.getElementById("admissionLabel");
  const emailField = document.getElementById("email");
  const emailLabel = document.getElementById("emailLabel");
  const passwordField = admissionField;
  const keepLoggedInCheckbox = document.getElementById("keepLoggedIn");

  // Subtle Parallax Effect for Login Background
  document.addEventListener("mousemove", (e) => {
    const body = document.querySelector(".login-body");
    if (!body) return;
    const moveX = (e.clientX - window.innerWidth / 2) * 0.006;
    const moveY = (e.clientY - window.innerHeight / 2) * 0.006;
    body.style.setProperty("--parallax-x", `${moveX}px`);
    body.style.setProperty("--parallax-y", `${moveY}px`);
  });

  // ---------------------------
  // PASSWORD TOGGLE HELPER
  // ---------------------------
  function attachToggle(field) {
    if (!field) return null;
    const icon = document.createElement("i");
    icon.className = "fas fa-eye toggle-password-icon";
    icon.title = "Toggle Visibility";
    
    const wrapper = document.createElement("div");
    wrapper.className = "password-input-wrapper";
    if (field.parentNode) field.parentNode.insertBefore(wrapper, field);
    wrapper.appendChild(field);
    wrapper.appendChild(icon);
    icon.addEventListener("click", () => {
      const isPass = field.type === "password";
      field.type = isPass ? "text" : "password";
      icon.classList.toggle("fa-eye", !isPass);
      icon.classList.toggle("fa-eye-slash", isPass);
    });
    return icon;
  }

  const loginToggle = attachToggle(admissionField);
  if (loginToggle) loginToggle.style.display = "none";

  const currentPasswordInputModal = changePasswordForm?.querySelector("input[name='currentPassword']");
  const newPasswordInputModal = changePasswordForm?.querySelector("input[name='newPassword']");
  attachToggle(currentPasswordInputModal);
  attachToggle(newPasswordInputModal);
  attachStrengthMeter(newPasswordInputModal);

  // ---------------------------
  // PASSWORD STRENGTH HELPERS
  // ---------------------------
  function scorePassword(pw) {
    let score = 0;
    if (!pw) return 0;
    if (pw.length >= 8) score += 1;
    if (pw.length >= 12) score += 1;
    if (/[A-Z]/.test(pw)) score += 1;
    if (/[0-9]/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;
    return score;
  }

  function updatePwMeter(pw, bar, text) {
    if (!bar || !text) return;
    const s = scorePassword(pw);
    const pct = (s / 5) * 100;
    bar.style.width = `${pct}%`;
    if (s <= 1) {
      bar.style.background = "linear-gradient(90deg,#f43f5e,#ef4444)";
      text.textContent = "Very weak";
    } else if (s === 2) {
      bar.style.background = "linear-gradient(90deg,#f97316,#f59e0b)";
      text.textContent = "Weak";
    } else if (s === 3) {
      bar.style.background = "linear-gradient(90deg,#f59e0b,#eab308)";
      text.textContent = "Fair";
    } else if (s === 4) {
      bar.style.background = "linear-gradient(90deg,#10b981,#06b6d4)";
      text.textContent = "Good";
    } else {
      bar.style.background = "linear-gradient(90deg,#06b6d4,#0ea5a3)";
      text.textContent = "Strong";
    }
  }

  function attachStrengthMeter(field) {
    if (!field) return;
    // The field was wrapped by attachToggle
    const wrapper = field.parentNode; 
    if (!wrapper || !wrapper.classList.contains('password-input-wrapper')) return;
    
    const meter = document.createElement("div");
    meter.className = "pw-strength-meter";
    meter.innerHTML = `
      <div class="pw-strength-bar-bg">
        <div class="pw-strength-bar"></div>
      </div>
      <div class="pw-strength-text"></div>
    `;
    
    // Insert after the toggle wrapper
    wrapper.parentNode.insertBefore(meter, wrapper.nextSibling);
    
    const bar = meter.querySelector(".pw-strength-bar");
    const text = meter.querySelector(".pw-strength-text");

    field.addEventListener("input", (e) => {
      updatePwMeter(e.target.value, bar, text);
    });
  }

  // ---------------------------
  // ROLE SWITCHING UI
  // ---------------------------
  function updateRoleUI(selectedRole) {
    if (!admissionField) return;

    const show = (el) => { 
      if (!el) return;
      el.style.display = "block"; 
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) el.required = true;
      // Ensure parent form-group or wrapper is also shown
      if (el.parentElement && (el.parentElement.classList.contains('form-group') || el.parentElement.classList.contains('password-input-wrapper'))) {
        el.parentElement.style.display = "block";
      }
      // Trigger the fade-in animation
      el.classList.remove("field-fade-in");
      void el.offsetWidth; // Force reflow to restart animation
      el.classList.add("field-fade-in");
    };
    const hide = (el) => { 
      if (!el) return;
      el.style.display = "none";
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) el.required = false;
      // Hide parent form-group if it's a specific toggleable field
      if (el.parentElement && el.parentElement.classList.contains('form-group') && (el.id === 'firstname' || el.id === 'email')) {
        el.parentElement.style.display = "none";
      }
      el.classList.remove("field-fade-in");
    };

    if (selectedRole === "student" || selectedRole === "learner") {
      show(firstnameField); show(firstnameLabel);
      show(admissionField); show(admissionLabel);
      admissionField.type = "text"; // Show admission number as plain text
      if (admissionField.parentNode) admissionField.parentNode.style.display = "block";
      if (loginToggle) loginToggle.style.display = "none";
      admissionLabel.textContent = "Admission Number";
      hide(emailField); hide(emailLabel);
    } else if (["teacher", "admin", "classteacher", "accounts", "superAdmin", "super_admin"].includes(selectedRole)) {
      show(emailField); show(emailLabel);
      show(admissionField); show(admissionLabel);
      admissionField.type = "password"; // Hide password by default
      if (loginToggle) {
        loginToggle.style.display = "block";
        loginToggle.className = "fas fa-eye toggle-password-icon"; 
      }
      hide(firstnameField); hide(firstnameLabel);
      admissionLabel.textContent = selectedRole === "classteacher" ? "Class Teacher Password" : "Password";
    } else {
      hide(firstnameField); hide(firstnameLabel);
      hide(emailField); hide(emailLabel);
      hide(admissionField); hide(admissionLabel);
      if (loginToggle) {
        loginToggle.style.display = "none";
        if (admissionField.parentNode && admissionField.parentNode.classList.contains('password-input-wrapper')) {
          admissionField.parentNode.style.display = "none";
        }
      }
    }
  }

  roleSelect.addEventListener("change", () => updateRoleUI(roleSelect.value));
  updateRoleUI(roleSelect.value);

  // ---------------------------
  // HELPER: API REQUEST
  // ---------------------------
  async function apiRequest(endpoint, method = "GET", body = null, token = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const url = endpoint.startsWith('/') ? config.getApiUrl(endpoint) : config.getApiUrl(`/users/${endpoint}`);
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    const data = await res.json().catch(() => { throw new Error("Invalid server response"); });
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
  }

  // ---------------------------
  // LOGIN HANDLER
  // ---------------------------
  async function handleLogin(e) {
    e.preventDefault();
    const selectedRole = roleSelect.value;
    if (!selectedRole) return alert("Please select your role.");

    let payload = { role: selectedRole.toLowerCase() };
    
    // Normalize superAdmin role for backend if the dropdown uses camelCase
    if (payload.role === 'superadmin' || payload.role === 'superAdmin') payload.role = 'super_admin';

    if (selectedRole === "student" || selectedRole === "learner") {
      const fullname = firstnameField.value.trim();
      const admission = admissionField.value.trim();
      if (!fullname || !admission) return alert("Enter full name and admission number.");
      payload.fullname = fullname;
      payload.admission = admission;
    } else {
      const email = emailField.value.trim().toLowerCase();
      const password = passwordField.value.trim();
      if (!email || !password) return alert("Enter email and password.");
      payload.email = email;
      payload.password = password;
    }

    console.debug("Login request payload:", {
      role: payload.role,
      email: payload.email,
      passwordProvided: !!payload.password
    });

    // Get the submit button and show loading state
    // Add expiresIn to payload based on "Keep me logged in" checkbox
    if (keepLoggedInCheckbox && keepLoggedInCheckbox.checked) {
      payload.expiresIn = config.auth.expiresInLong;
    }
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    window.spinner?.show(submitBtn, "Logging in...");

    try {
      // Login and fetch user + token + schoolId
      const data = await apiRequest("login", "POST", payload);

      // Clear any existing session/cache data from previous users to prevent data leakage
      localStorage.clear();

      // Save user + token + schoolId in localStorage
      const tokenKey = config?.auth?.tokenKey || "token";
      const userKey = config?.auth?.userKey || "loggedInUser";
      localStorage.setItem(tokenKey, data.token);
      localStorage.setItem(userKey, JSON.stringify(data.user));
      localStorage.setItem("userRole", selectedRole);
      if (data.user.schoolId) localStorage.setItem("schoolId", data.user.schoolId);

      // Open password change modal if required
      if ((["teacher", "classteacher", "admin", "accounts"].includes(selectedRole)) && data.user.passwordMustChange) {
        openChangePasswordModal();
        window.spinner?.hide(submitBtn);
        return;
      }

      // Redirect based on role using clean URL mappings from config.js
      // This ensures users land on paths like /teacher instead of teacher-dashboard.html
      const redirectUrl = config.redirects[selectedRole] || 
                         config.redirects.learner;

      window.location.href = redirectUrl;
    } catch (err) {
      console.error(err);
      alert(err.message);
      // Reset button on error
      window.spinner?.hide(submitBtn);
    }
  }

  loginForm.addEventListener("submit", handleLogin);

  // ---------------------------
  // CHANGE PASSWORD MODAL
  // ---------------------------
  const changePasswordModal = document.getElementById("changePasswordModal");
  window.openChangePasswordModal = function () {
    changePasswordModal.classList.remove("hidden");
    const userKey = config?.auth?.userKey || "loggedInUser";
    const user = JSON.parse(localStorage.getItem(userKey));
    const currentField = document.getElementById("currentPasswordField");
    const currentPasswordInput = changePasswordModal.querySelector("input[name='currentPassword']");
    const newPasswordInput = changePasswordModal.querySelector("input[name='newPassword']");
    if (!user) return;
    currentField.style.display = (user.role === "classteacher" || user.isClassTeacher) ? "none" : "block";
    if (currentField.style.display !== "none" && currentPasswordInput) {
      currentPasswordInput.focus();
    } else if (newPasswordInput) {
      newPasswordInput.focus();
    }
  };

  document.getElementById("cancelChangePasswordBtn")?.addEventListener("click", () => {
    changePasswordModal.classList.add("hidden");
  });

  changePasswordForm?.addEventListener("submit", async function (e) {
    e.preventDefault();
    const newPassword = changePasswordForm.querySelector("input[name='newPassword']").value.trim();
    const currentPasswordInput = changePasswordForm.querySelector("input[name='currentPassword']");
    const currentPassword = currentPasswordInput?.value.trim();

    if (!newPassword || newPassword.length < 8) return alert("New password must be at least 8 characters.");

    // Retrieve token reliably using the key from config
    const tokenKey = config?.auth?.tokenKey || "authToken";
    const token = window.authService?.getToken() || localStorage.getItem(tokenKey);
    
    const selectedRole = localStorage.getItem("userRole");
    const payload = { newPassword };
    if (selectedRole !== "classteacher") payload.currentPassword = currentPassword;

    if (!token) return alert("Session token missing. Please try logging in again.");

    const submitBtn = changePasswordForm.querySelector("button[type='submit']");
    window.spinner?.show(submitBtn, "Updating...");

    try {
      // Include schoolId automatically
      const schoolId = localStorage.getItem("schoolId");
      if (schoolId) payload.schoolId = schoolId;

      const data = await apiRequest("change-password", "PUT", payload, token);
      localStorage.setItem(tokenKey, data.token); // Persist the new token returned after password change
      const userKey = config?.auth?.userKey || "loggedInUser";
      localStorage.setItem(userKey, JSON.stringify(data.user));
      if (data.user.schoolId) localStorage.setItem("schoolId", data.user.schoolId);

      alert("Password changed successfully!");
      changePasswordModal.classList.add("hidden");

      // Use configuration for clean redirection after password change
      const redirectUrl = config.redirects[selectedRole] || 
                         config.redirects.learner;

      window.location.href = redirectUrl;
    } catch (err) {
      console.error("Change password error:", err);
      alert(err.message);
      // Reset button on error
      window.spinner?.hide(submitBtn);
    }
  });

  // ---------------------------
  // LOGOUT FUNCTION
  // ---------------------------
  function logoutUser() {
    localStorage.clear();
    window.location.href = "/login";
  }
  document.getElementById("logoutBtn")?.addEventListener("click", logoutUser);
});

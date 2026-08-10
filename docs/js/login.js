// API_BASE is now loaded from config.js
// To change the API endpoint, update config.js

document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("loginForm");
  const changePasswordForm = document.getElementById("changePasswordForm");
  if (!loginForm) return;

  const roleSelect = document.getElementById("role");
  const isInstalledApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || window.matchMedia('(display-mode: fullscreen)').matches;

  const firstnameField = document.getElementById("firstname");
  const firstnameLabel = document.getElementById("firstnameLabel");
  const admissionField = document.getElementById("admission");
  const admissionLabel = document.getElementById("admissionLabel");
  const emailField = document.getElementById("email");
  const emailLabel = document.getElementById("emailLabel");
  const passwordField = admissionField;
  const keepLoggedInCheckbox = document.getElementById("keepLoggedIn");
  const nextButton = document.getElementById("nextButton");
  const backButton = document.getElementById("backButton");
  const stepNextButton = document.getElementById("stepNextButton");
  const submitButton = document.getElementById("submitButton");
  const formSteps = Array.from(document.querySelectorAll(".form-step"));

  let selectedRole = "";
  let credentialStage = 0;

  function setActiveStep(stepIndex) {
    formSteps.forEach((step) => {
      step.classList.toggle("active", Number(step.dataset.step) === stepIndex);
    });

    if (stepIndex === 1) {
      roleSelect.focus();
      const rememberGroup = document.getElementById('rememberGroup');
      if (rememberGroup) showElement(rememberGroup);
    } else if (stepIndex === 2) {
      const activeInput = document.querySelector(".form-step.active input:not([type='hidden'])");
      if (activeInput) activeInput.focus();
      const rememberGroup = document.getElementById('rememberGroup');
      if (rememberGroup) hideElement(rememberGroup);
    }
  }

  function showElement(el) {
    if (!el) return;
    el.classList.remove("hidden");
    if (el.style) el.style.display = "block";
  }

  function hideElement(el) {
    if (!el) return;
    el.classList.add("hidden");
    if (el.style) el.style.display = "none";
  }

  function updateCredentialStage() {
    const isLearner = selectedRole === "student" || selectedRole === "learner";
    const showFirstCredential = credentialStage === 0;

    if (isLearner) {
      firstnameLabel.textContent = "Full Name";
      firstnameField.placeholder = "Enter your full name";
      emailLabel.textContent = "Email";
      emailField.placeholder = "Enter your email";
      admissionLabel.textContent = credentialStage === 1 ? "Admission Number" : "Password";
      admissionField.placeholder = credentialStage === 1 ? "Enter your admission number" : "Enter your password";
      admissionField.type = credentialStage === 1 ? "text" : "password";
    } else {
      firstnameLabel.textContent = "Full Name";
      firstnameField.placeholder = "Enter your full name";
      emailLabel.textContent = "Email";
      emailField.placeholder = "Enter your email";
      admissionLabel.textContent = "Password";
      admissionField.placeholder = "Enter your password";
      admissionField.type = "password";
    }

    if (showFirstCredential) {
      if (isLearner) {
        showElement(firstnameLabel.parentElement);
        showElement(firstnameField);
        hideElement(emailLabel.parentElement);
        hideElement(emailField);
      } else {
        showElement(emailLabel.parentElement);
        showElement(emailField);
        hideElement(firstnameLabel.parentElement);
        hideElement(firstnameField);
      }

      hideElement(admissionLabel.parentElement);
      hideElement(admissionField);
      hideElement(submitButton);
      showElement(stepNextButton);
    } else {
      hideElement(firstnameLabel.parentElement);
      hideElement(firstnameField);
      hideElement(emailLabel.parentElement);
      hideElement(emailField);

      showElement(admissionLabel.parentElement);
      showElement(admissionField);
      showElement(submitButton);
      hideElement(stepNextButton);
    }
  }

  function startCredentialFlow() {
    if (!roleSelect.value) return alert("Please select your role before continuing.");
    selectedRole = roleSelect.value;
    credentialStage = 0;
    setActiveStep(2);
    updateCredentialStage();
  }

  // Show transient three-dot loader on a button for a short duration
  function showTransientDots(btn, duration = 300) {
    if (!btn) return;
    btn.dataset._orig = btn.textContent;
    btn.classList.add('has-dots');
    btn.textContent = '';
    const s = document.createElement('span');
    s.className = 'login-state';
    s.innerHTML = '<span class="login-dot"></span><span class="login-dot"></span><span class="login-dot"></span>';
    btn.appendChild(s);
    setTimeout(() => {
      const el = btn.querySelector('.login-state');
      if (el) el.remove();
      btn.classList.remove('has-dots');
      if (btn.dataset._orig) { btn.textContent = btn.dataset._orig; delete btn.dataset._orig; }
    }, duration);
  }

  function advanceCredentialStage() {
    const isLearner = selectedRole === "student" || selectedRole === "learner";
    if (credentialStage === 0) {
      if (isLearner) {
        if (!firstnameField.value.trim()) return alert("Please enter your full name before continuing.");
      } else {
        if (!emailField.value.trim()) return alert("Please enter your email before continuing.");
      }
      credentialStage = 1;
      updateCredentialStage();
    }
  }

  function handleBack() {
    if (credentialStage === 1) {
      credentialStage = 0;
      updateCredentialStage();
      return;
    }
    setActiveStep(1);
  }

  nextButton?.addEventListener("click", (e) => {
    // show a brief micro-loading state before advancing
    showTransientDots(nextButton, 260);
    setTimeout(() => startCredentialFlow(e), 260);
  });
  stepNextButton?.addEventListener("click", advanceCredentialStage);
  backButton?.addEventListener("click", handleBack);
  setActiveStep(1);
  updateCredentialStage();

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

    const refreshIcon = () => {
      const isPasswordField = field.type === "password";
      icon.style.display = isPasswordField ? "inline-block" : "none";
      icon.classList.toggle("fa-eye", isPasswordField);
      icon.classList.toggle("fa-eye-slash", false);
    };

    icon.addEventListener("click", () => {
      const isPass = field.type === "password";
      field.type = isPass ? "text" : "password";
      icon.classList.toggle("fa-eye", !isPass);
      icon.classList.toggle("fa-eye-slash", isPass);
    });

    refreshIcon();
    return { icon, refreshIcon };
  }

  const loginToggle = attachToggle(admissionField);

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
  // ROLE LIST CONFIGURATION
  // ---------------------------
  function configureRoleOptions() {
    if (!roleSelect) return;

    const allRoles = [
      { value: "teacher", label: "Teacher", icon: "fas fa-chalkboard-teacher" },
      { value: "learner", label: "Learner", icon: "fas fa-user-graduate" },
      { value: "accounts", label: "Accounts", icon: "fas fa-wallet" },
      { value: "admin", label: "Admin", icon: "fas fa-shield-alt" }
    ];

    const visibleRoles = isInstalledApp
      ? allRoles.filter(role => ["learner", "teacher"].includes(role.value))
      : allRoles;

    const roleDropdown = document.getElementById('roleDropdown');
    const roleTrigger = document.getElementById('roleTrigger');
    if (!roleDropdown || !roleTrigger) return;

    const currentValue = roleSelect.value;
    const placeholder = roleTrigger.querySelector('.role-select-placeholder');
    roleDropdown.innerHTML = '';

    visibleRoles.forEach(role => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'role-dropdown-item';
      item.dataset.value = role.value;
      item.setAttribute('role', 'option');
      item.innerHTML = `
        <span class="role-dropdown-label">${role.label}</span>
      `;

      item.addEventListener('click', () => {
        document.querySelectorAll('.role-dropdown-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        roleSelect.value = role.value;
        if (placeholder) placeholder.textContent = role.label;
        roleDropdown.classList.remove('open');
        roleDropdown.classList.add('hidden');
        roleTrigger.setAttribute('aria-expanded', 'false');
        if (credentialStage === 0) updateCredentialStage();
      });

      if (currentValue === role.value) {
        item.classList.add('selected');
        if (placeholder) placeholder.textContent = role.label;
      }

      roleDropdown.appendChild(item);
    });

    roleTrigger.addEventListener('click', () => {
      const open = !roleDropdown.classList.contains('open');
      roleDropdown.classList.toggle('open', open);
      roleDropdown.classList.toggle('hidden', !open);
      roleTrigger.setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('click', (event) => {
      if (!roleTrigger.contains(event.target) && !roleDropdown.contains(event.target)) {
        roleDropdown.classList.remove('open');
        roleDropdown.classList.add('hidden');
        roleTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    if (isInstalledApp && ["accounts", "admin"].includes(currentValue)) {
      roleSelect.value = "";
    } else if (!currentValue || !visibleRoles.some(role => role.value === currentValue)) {
      roleSelect.value = "";
    }
  }

  configureRoleOptions();

  // Recompute the current stage when the role is changed while still on step 1.
  roleSelect.addEventListener("change", () => {
    if (credentialStage === 0) updateCredentialStage();
  });

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
    // Visual loading state for minimal floating design: replace text with animated dots
    if (submitBtn) {
      // Use the three-dot animation exclusively for the button.
      submitBtn.classList.add('loading', 'has-dots');
      submitBtn.dataset.origText = submitBtn.textContent;
      // hide original text and add animated login state (three dots only)
      submitBtn.textContent = "";
      const stateEl = document.createElement('span');
      stateEl.className = 'login-state';
      stateEl.innerHTML = '<span class="login-dot"></span><span class="login-dot"></span><span class="login-dot"></span>';
      submitBtn.appendChild(stateEl);
      // Ensure any external circular spinner is hidden for this button
      window.spinner?.hide(submitBtn);
    }

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
      if ((["teacher", "admin", "accounts"].includes(selectedRole)) && data.user.passwordMustChange) {
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
      // Reset button on error (remove loading + dot state)
      window.spinner?.hide(submitBtn);
      if (submitBtn) {
        submitBtn.classList.remove('loading', 'has-dots');
        const stateEl = submitBtn.querySelector('.login-state');
        if (stateEl) stateEl.remove();
        if (submitBtn.dataset.origText) { submitBtn.textContent = submitBtn.dataset.origText; delete submitBtn.dataset.origText; }
      }
    }
    finally {
      // Ensure spinner and dot state are hidden in all cases (redirect may navigate away)
      window.spinner?.hide(submitBtn);
      if (submitBtn) {
        submitBtn.classList.remove('loading', 'has-dots');
        const stateEl = submitBtn.querySelector('.login-state');
        if (stateEl) stateEl.remove();
        if (submitBtn.dataset.origText) { submitBtn.textContent = submitBtn.dataset.origText; delete submitBtn.dataset.origText; }
      }
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
    currentField.style.display = "block";
    if (currentPasswordInput) {
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
    const payload = {
      currentPassword,
      newPassword
    };

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

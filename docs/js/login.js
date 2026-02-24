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

  const redirectPaths = {
  student: "/student-dashboard",
  learner: "/student-dashboard",
  teacher: "/teacher-dashboard",
  classteacher: "/analysis",
  accounts: "/accounts",
  admin: "/admin",
  superAdmin: "/super-admin"
};


  // ---------------------------
  // ROLE SWITCHING UI
  // ---------------------------
  function updateRoleUI(selectedRole) {
    const show = (el) => { el.style.display = "block"; el.required = true; };
    const hide = (el) => { el.style.display = "none"; el.required = false; };

    if (selectedRole === "student" || selectedRole === "learner") {
      show(firstnameField); show(firstnameLabel);
      show(admissionField); show(admissionLabel);
      admissionLabel.textContent = "Admission Number";
      hide(emailField); hide(emailLabel);
    } else if (["teacher", "admin", "classteacher", "accounts", "superAdmin"].includes(selectedRole)) {
      show(emailField); show(emailLabel);
      show(admissionField); show(admissionLabel);
      hide(firstnameField); hide(firstnameLabel);
      admissionLabel.textContent = selectedRole === "classteacher" ? "Class Teacher Password" : "Password";
    } else {
      hide(firstnameField); hide(firstnameLabel);
      hide(emailField); hide(emailLabel);
      hide(admissionField); hide(admissionLabel);
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

    let payload = { role: selectedRole };

    if (selectedRole === "student" || selectedRole === "learner") {
      const fullname = firstnameField.value.trim();
      const admission = admissionField.value.trim();
      if (!fullname || !admission) return alert("Enter full name and admission number.");
      payload.fullname = fullname;
      payload.admission = admission;
    } else {
      const email = emailField.value.trim();
      const password = passwordField.value.trim();
      if (!email || !password) return alert("Enter email and password.");
      payload.email = email;
      payload.password = password;
    }

    console.log("Payload sending to backend:", payload);

    // Get the submit button and show loading state
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Logging in...';

    try {
      // Login and fetch user + token + schoolId
      const data = await apiRequest("login", "POST", payload);

      // Save user + token + schoolId in localStorage
      localStorage.setItem("token", data.token);
      localStorage.setItem("loggedInUser", JSON.stringify(data.user));
      localStorage.setItem("userRole", selectedRole);
      if (data.user.schoolId) localStorage.setItem("schoolId", data.user.schoolId);

      // Open password change modal if required
      if ((["teacher", "classteacher", "admin", "accounts"].includes(selectedRole)) && data.user.passwordMustChange) {
        openChangePasswordModal();
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      // Redirect based on role
      window.location.href = redirectPaths[selectedRole];
    } catch (err) {
      console.error(err);
      alert(err.message);
      // Reset button on error
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  loginForm.addEventListener("submit", handleLogin);

  // ---------------------------
  // CHANGE PASSWORD MODAL
  // ---------------------------
  const changePasswordModal = document.getElementById("changePasswordModal");
  window.openChangePasswordModal = function () {
    changePasswordModal.classList.remove("hidden");
    const user = JSON.parse(localStorage.getItem("loggedInUser"));
    const currentField = document.getElementById("currentPasswordField");
    currentField.style.display = (user.role === "classteacher" || user.isClassTeacher) ? "none" : "block";
    changePasswordModal.querySelector("input[name='newPassword']").focus();
  };

  changePasswordForm?.addEventListener("submit", async function (e) {
    e.preventDefault();
    const newPassword = changePasswordForm.querySelector("input[name='newPassword']").value.trim();
    const currentPasswordInput = changePasswordForm.querySelector("input[name='currentPassword']");
    const currentPassword = currentPasswordInput?.value.trim();

    if (!newPassword || newPassword.length < 8) return alert("New password must be at least 8 characters.");

    const token = localStorage.getItem("token");
    const selectedRole = localStorage.getItem("userRole");
    const payload = { newPassword };
    if (selectedRole !== "classteacher") payload.currentPassword = currentPassword;

    // Get the submit button and show loading state
    const submitBtn = changePasswordForm.querySelector("button[type='submit']");
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Updating...';

    try {
      // Include schoolId automatically
      const schoolId = localStorage.getItem("schoolId");
      if (schoolId) payload.schoolId = schoolId;

      const data = await apiRequest("change-password", "PUT", payload, token);
      localStorage.setItem("token", data.token);
      localStorage.setItem("loggedInUser", JSON.stringify(data.user));
      if (data.user.schoolId) localStorage.setItem("schoolId", data.user.schoolId);

      alert("Password changed successfully!");
      changePasswordModal.classList.add("hidden");
      window.location.href = redirectPaths[selectedRole];
    } catch (err) {
      console.error("Change password error:", err);
      alert(err.message);
      // Reset button on error
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  // ---------------------------
  // LOGOUT FUNCTION
  // ---------------------------
  function logoutUser() {
    localStorage.removeItem("token");
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("userRole");
    localStorage.removeItem("schoolId");
    window.location.href = "/login";
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logoutUser);
});

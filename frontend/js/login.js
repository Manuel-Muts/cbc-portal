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

  const redirectPaths = {
    student: "student-dashboard.html",
    teacher: "teacher-dashboard.html",
    classteacher: "analysis.html",
    admin: "admin.html",
    superAdmin: "super-admin.html"
  };

  // ---------------------------
// ROLE SWITCHING UI
// ---------------------------
function updateRoleUI(selectedRole) {
  const show = (el) => { el.style.display = "block"; el.required = true; };
  const hide = (el) => { el.style.display = "none"; el.required = false; };

  if (selectedRole === "student") {
    // show first name and admission fields
    show(firstnameField); show(firstnameLabel);
    show(admissionField); show(admissionLabel);
    admissionLabel.textContent = "Admission Number"; // make clear
    // hide email
    hide(emailField); hide(emailLabel);

  } else if (["teacher", "admin", "classteacher", "superAdmin"].includes(selectedRole)) {
    // ✅ include superAdmin
    show(emailField); show(emailLabel);
    show(admissionField); show(admissionLabel);
    hide(firstnameField); hide(firstnameLabel);

    admissionLabel.textContent =
      selectedRole === "classteacher" ? "Class Teacher Password" : "Password";

  } else {
    hide(firstnameField); hide(firstnameLabel);
    hide(emailField); hide(emailLabel);
    hide(admissionField); hide(admissionLabel);
  }
}

roleSelect.addEventListener("change", () => updateRoleUI(roleSelect.value));
updateRoleUI(roleSelect.value);


// ---------------------------
// LOGIN HANDLER
// ---------------------------
async function handleLogin(e) {
  e.preventDefault();

  const selectedRole = roleSelect.value;
  if (!selectedRole) return alert("Please select your role.");

  let payload = { role: selectedRole };

  if (selectedRole === "student") {
    const firstname = firstnameField.value.trim();
    const password = admissionField.value.trim(); // admission number

    if (!firstname || !password) return alert("Enter first name and admission number.");

    payload.firstname = firstname; // student first name
    payload.password = password;   // admission number

  } else {
    const email = emailField.value.trim();
    const password = admissionField.value.trim();

    if (!email || !password) return alert("Email and password required.");

    payload.email = email;
    payload.password = password;
  }

  try {
    const res = await fetch("http://localhost:5000/api/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) return alert(data.message || "Login failed.");

    // ✅ Store token and user for session
    localStorage.setItem("token", data.token);
    localStorage.setItem("loggedInUser", JSON.stringify(data.user));
    localStorage.setItem("userRole", selectedRole);
// ✅ store jwtToken for super-admin pages
    if (selectedRole === "superAdmin") {
      localStorage.setItem("jwtToken", data.token);
    }
    // ---------------------------
    // Password change check
    // ---------------------------
    if ((selectedRole === "teacher" || selectedRole === "classteacher") && data.user.passwordMustChange) {
      openChangePasswordModal();
      return;
    }

    // ---------------------------
    // Redirect based on role
    // ---------------------------
    const redirectPaths = {
      student: "student-dashboard.html",
      teacher: "teacher-dashboard.html",
      classteacher: "analysis.html",
      admin: "admin.html",
      superAdmin: "super-admin.html"
    };

    const redirect = redirectPaths[selectedRole];
    if (!redirect) return alert("Invalid role redirect configuration.");

    window.location.href = redirect;

  } catch (err) {
    console.error(err);
    alert("Server error. Try again.");
  }
}

// Attach the handler
loginForm.addEventListener("submit", handleLogin);

  // ---------------------------
  // CHANGE PASSWORD MODAL
  // ---------------------------
  const changePasswordModal = document.getElementById("changePasswordModal");

  window.openChangePasswordModal = function () {
    changePasswordModal.classList.remove("hidden");
    const user = JSON.parse(localStorage.getItem("loggedInUser"));
    const currentField = document.getElementById("currentPasswordField");

    if (user.role === "classteacher" || user.isClassTeacher) {
      currentField.style.display = "none";
    } else {
      currentField.style.display = "block";
    }

    changePasswordModal.querySelector("input[name='newPassword']").focus();
  };

  changePasswordForm?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const currentPasswordInput = changePasswordForm.querySelector("input[name='currentPassword']");
    const newPasswordInput = changePasswordForm.querySelector("input[name='newPassword']");

    const currentPassword = currentPasswordInput?.value.trim();
    const newPassword = newPasswordInput.value.trim();
    if (!newPassword || newPassword.length < 8) return alert("New password must be at least 8 characters.");

    const user = JSON.parse(localStorage.getItem("loggedInUser"));
    const token = localStorage.getItem("token");
    const selectedRole = localStorage.getItem("userRole");

    const payload = { newPassword };
    if (selectedRole !== "classteacher") payload.currentPassword = currentPassword;

    try {
      const res = await fetch("http://localhost:5000/api/users/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) return alert(data.message || "Password change failed.");

      localStorage.setItem("token", data.token);
      localStorage.setItem("loggedInUser", JSON.stringify(data.user));
      alert("Password changed successfully!");
      changePasswordModal.classList.add("hidden");

      const redirect = redirectPaths[selectedRole] || "/";
      window.location.href = redirect;
    } catch (err) {
      console.error("Change password error:", err);
      alert("Server error. Try again.");
    }
  });
});

// ---------------------------
// LOGOUT FUNCTION
// ---------------------------
function logoutUser() {
  localStorage.removeItem("token");
  localStorage.removeItem("loggedInUser");
  localStorage.removeItem("userRole");
  window.location.href = "login.html"; // redirect to login page
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", logoutUser);
}

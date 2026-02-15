/* reset.js
   Full frontend logic:
   - step handling
   - verify-user -> request -> verify -> new-password
   - OTP 6 boxes (auto focus/auto next/backspace)
   - resend timer + frontend rate-limit
   - button spinners and disabled states
   - password strength meter + toggle
   - sessionStorage resume
   - enter-to-submit
*/

document.addEventListener("DOMContentLoaded", () => {
  // -------------------------
  // Elements
  // -------------------------
  const stepEmail = document.getElementById("stepEmail");
  const stepCode = document.getElementById("stepCode");
  const stepPassword = document.getElementById("stepPassword");
  const stepSuccess = document.getElementById("stepSuccess");

  const roleInput = document.getElementById("role");
  const fullnameInput = document.getElementById("fullname");
  const emailInput = document.getElementById("email");
  const codeInput = document.getElementById("code"); // fallback single field
  const otpBoxes = Array.from(document.querySelectorAll(".otp"));
  const resendBtn = document.getElementById("resendBtn");
  const resendText = document.getElementById("resendText");
  const resendTimer = document.getElementById("resendTimer");

  const sendCodeBtn = document.getElementById("sendCodeBtn");
  const verifyCodeBtn = document.getElementById("verifyCodeBtn");
  const resetPasswordBtn = document.getElementById("resetPasswordBtn");
  const clearBtn = document.getElementById("clearBtn");
  const cancelBtn = document.getElementById("cancelBtn");

  const feedbackEmail = document.getElementById("feedback-email");
  const feedbackCode = document.getElementById("feedback-code");
  const feedbackPassword = document.getElementById("feedback-password");

  const newPasswordInput = document.getElementById("newPassword");
  const togglePwdBtn = document.getElementById("togglePwdBtn");
  const pwStrengthBar = document.getElementById("pwStrengthBar");
  const pwStrengthText = document.getElementById("pwStrengthText");

  const API_BASE = "http://localhost:5000/api/reset";
  window.location.hostname === "localhost"
    ? "http://localhost:5000/api/reset"
    : "https://competence-hub.onrender.com/api/reset";

  // -------------------------
  // Frontend rate-limit / resend protection
  // -------------------------
  const RESEND_COOLDOWN = 60; // seconds
  const MAX_REQUESTS_WINDOW = 5; // 5 requests
  const MAX_REQUESTS_TIME = 10 * 60 * 1000; // 10 minutes window

  // Persisted state (sessionStorage so progress is temporary)
  const STATE_KEY = "reset_flow_state_v1";
  function saveState(state) {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function clearState() { try { sessionStorage.removeItem(STATE_KEY); } catch (e) {} }

  // Load previous state
  const saved = loadState();
  if (saved.email) emailInput.value = saved.email;
  if (saved.role) roleInput.value = saved.role;
  if (saved.fullname) fullnameInput.value = saved.fullname;

  // -------------------------
  // Step helpers
  // -------------------------
  function showStep(el) {
    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    el.classList.add("active");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function setFeedback(el, msg = "", type = "info") {
    el.textContent = msg;
    el.classList.remove("error", "success", "info");
    if (type === "error") el.classList.add("error");
    else if (type === "success") el.classList.add("success");
    else el.classList.add("info");
  }

  // Reset visual errors on inputs
  function clearInputErrors() {
    [roleInput, fullnameInput, emailInput, newPasswordInput].forEach(i => i && i.classList.remove("input-error"));
    otpBoxes.forEach(b => b.classList.remove("input-error"));
    codeInput && codeInput.classList.remove("input-error");
  }

  // -------------------------
  // Button helpers (spinner + disable)
  // -------------------------
  function setLoading(btn, loading = true) {
    if (!btn) return;
    if (loading) {
      btn.classList.add("loading");
      btn.setAttribute("disabled", "true");
    } else {
      btn.classList.remove("loading");
      btn.removeAttribute("disabled");
    }
  }

  function withLoading(btn, fn) {
    return (async (...args) => {
      try {
        setLoading(btn, true);
        return await fn(...args);
      } finally {
        setLoading(btn, false);
      }
    });
  }

  // -------------------------
  // OTP boxes logic (auto-next/backspace)
  // -------------------------
  function getOtpValue() {
    const v = otpBoxes.map(b => b.value.trim()).join("");
    if (/^\d{6}$/.test(v)) return v;
    if (codeInput && codeInput.value.trim().length === 6) return codeInput.value.trim();
    return "";
  }

  function setOtpFromString(str = "") {
    for (let i = 0; i < otpBoxes.length; i++) {
      otpBoxes[i].value = str[i] || "";
    }
    if (codeInput) codeInput.value = str;
  }

  otpBoxes.forEach((box, idx) => {
    box.addEventListener("input", (e) => {
      const val = e.target.value.replace(/\D/g, "");
      e.target.value = val ? val[val.length - 1] : "";
      if (val) {
        if (idx < otpBoxes.length - 1) otpBoxes[idx + 1].focus();
      }
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && idx > 0) {
        otpBoxes[idx - 1].focus();
      } else if (e.key === "ArrowLeft" && idx > 0) {
        otpBoxes[idx - 1].focus();
      } else if (e.key === "ArrowRight" && idx < otpBoxes.length - 1) {
        otpBoxes[idx + 1].focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        verifyCodeBtn.click();
      }
    });
  });

  if (codeInput) {
    codeInput.addEventListener("input", () => {
      const v = codeInput.value.replace(/\D/g, "").slice(0,6);
      setOtpFromString(v);
    });
    codeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); verifyCodeBtn.click(); }
    });
  }

  // -------------------------
  // Resend logic with cooldown + request count guard
  // -------------------------
  let resendCountdown = 0;
  let resendInterval = null;
  const REQ_HISTORY_KEY = "reset_req_hist_v1";
  function loadReqHistory() {
    try { return JSON.parse(sessionStorage.getItem(REQ_HISTORY_KEY) || "[]"); } catch(e){ return []; }
  }
  function saveReqHistory(arr) {
    try { sessionStorage.setItem(REQ_HISTORY_KEY, JSON.stringify(arr)); } catch(e) {}
  }
  function pushReqHistory() {
    const arr = loadReqHistory().filter(t => Date.now() - t < MAX_REQUESTS_TIME);
    arr.push(Date.now());
    saveReqHistory(arr);
    return arr.length;
  }
  function canRequestNow() {
    const arr = loadReqHistory().filter(t => Date.now() - t < MAX_REQUESTS_TIME);
    return arr.length < MAX_REQUESTS_WINDOW;
  }

  function startResendCooldown(seconds = RESEND_COOLDOWN) {
    clearInterval(resendInterval);
    resendCountdown = seconds;
    resendBtn.setAttribute("disabled", "true");
    resendTimer.style.display = "inline";
    resendText.textContent = "Resend code";
    resendTimer.textContent = ` (${resendCountdown}s)`;
    resendInterval = setInterval(() => {
      resendCountdown--;
      if (resendCountdown <= 0) {
        clearInterval(resendInterval);
        resendBtn.removeAttribute("disabled");
        resendTimer.style.display = "none";
        resendText.textContent = "Resend code";
      } else {
        resendTimer.textContent = ` (${resendCountdown}s)`;
      }
    }, 1000);
  }

  // -------------------------
  // Password strength meter
  // -------------------------
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

  function updatePwMeter(pw) {
    const s = scorePassword(pw);
    const pct = (s / 5) * 100;
    pwStrengthBar.style.width = `${pct}%`;
    if (s <= 1) {
      pwStrengthBar.style.background = "linear-gradient(90deg,#f43f5e,#ef4444)";
      pwStrengthText.textContent = "Very weak";
    } else if (s === 2) {
      pwStrengthBar.style.background = "linear-gradient(90deg,#f97316,#f59e0b)";
      pwStrengthText.textContent = "Weak";
    } else if (s === 3) {
      pwStrengthBar.style.background = "linear-gradient(90deg,#f59e0b,#eab308)";
      pwStrengthText.textContent = "Fair";
    } else if (s === 4) {
      pwStrengthBar.style.background = "linear-gradient(90deg,#10b981,#06b6d4)";
      pwStrengthText.textContent = "Good";
    } else {
      pwStrengthBar.style.background = "linear-gradient(90deg,#06b6d4,#0ea5a3)";
      pwStrengthText.textContent = "Strong";
    }
  }

  newPasswordInput.addEventListener("input", (e) => {
    updatePwMeter(e.target.value);
  });

  togglePwdBtn.addEventListener("click", () => {
    const t = newPasswordInput.type === "password" ? "text" : "password";
    newPasswordInput.type = t;
    togglePwdBtn.textContent = t === "text" ? "Hide" : "Show";
  });

  // -------------------------
  // Enter key handling for steps
  // -------------------------
  [roleInput, fullnameInput, emailInput].forEach(el => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); sendCodeBtn.click(); }
    });
  });

  otpBoxes.forEach(b => b.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); verifyCodeBtn.click(); }
  }));

  // -------------------------
  // Step actions: send code
  // -------------------------
  async function doVerifyUserAndSend() {
  clearInputErrors();

  // -------------------------
  // Normalize input
  // -------------------------
  const role = roleInput.value.trim();

  // Collapse all spaces, tabs, newlines
  function normalizeFullname(str) {
    return str.replace(/\s+/g, " ").trim();
  }
  const fullname = normalizeFullname(fullnameInput.value);

  const email = emailInput.value.trim();

  // -------------------------
  // Basic validations
  // -------------------------
  if (!role) { 
    roleInput.classList.add("input-error"); 
    setFeedback(feedbackEmail, "Please select a role.", "error"); 
    return; 
  }
  if (!fullname || fullname.length < 2) { 
    fullnameInput.classList.add("input-error"); 
    setFeedback(feedbackEmail, "Please enter your full name.", "error"); 
    return; 
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { 
    emailInput.classList.add("input-error"); 
    setFeedback(feedbackEmail, "Please enter a valid email.", "error"); 
    return; 
  }

  // -------------------------
  // Rate-limit check
  // -------------------------
  if (!canRequestNow()) {
    setFeedback(feedbackEmail, "Too many requests. Please try again later.", "error");
    return;
  }

  // -------------------------
  // Save to session for resume
  // -------------------------
  saveState({ role, fullname, email });

  setFeedback(feedbackEmail, "Verifying user...");

  try {
    // -------------------------
    // Verify user exists
    // -------------------------
    const verifyRes = await fetch(`${API_BASE}/verify-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, name: fullname, email }) // <-- 'name' key
    });

    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok) {
      setFeedback(feedbackEmail, verifyData.msg || "User not found", "error");
      if (verifyRes.status === 404) emailInput.classList.add("input-error");
      return;
    }

    // -------------------------
    // Request OTP
    // -------------------------
    setFeedback(feedbackEmail, "Sending reset code...");
    const reqRes = await fetch(`${API_BASE}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const reqData = await reqRes.json().catch(() => ({}));
    if (!reqRes.ok) {
      setFeedback(feedbackEmail, reqData.msg || "Failed to send reset code", "error");
      return;
    }

    pushReqHistory();
    startResendCooldown(RESEND_COOLDOWN);

    setFeedback(feedbackEmail, "Reset code sent! Check your email.", "success");
    showStep(stepCode);
    setTimeout(() => { otpBoxes[0].focus(); }, 250);

  } catch (err) {
    console.error("Request OTP error:", err);
    setFeedback(feedbackEmail, "Network error. Try again.", "error");
  }
}

  sendCodeBtn.addEventListener("click", withLoading(sendCodeBtn, doVerifyUserAndSend));

  // -------------------------
  // Clear button
  // -------------------------
  clearBtn.addEventListener("click", () => {
    roleInput.value = "";
    fullnameInput.value = "";
    emailInput.value = "";
    clearInputErrors();
    setFeedback(feedbackEmail, "");
    clearState();
  });

  // -------------------------
  // Resend button
  // -------------------------
  resendBtn.addEventListener("click", withLoading(resendBtn, async () => {
    const email = emailInput.value.trim();
    if (!email) { setFeedback(feedbackCode, "No email to resend to.", "error"); return; }
    if (!canRequestNow()) { setFeedback(feedbackCode, "Too many requests. Please wait.", "error"); return; }
    try {
      const res = await fetch(`${API_BASE}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFeedback(feedbackCode, data.msg || "Failed to resend", "error"); return; }
      pushReqHistory();
      startResendCooldown(RESEND_COOLDOWN);
      setFeedback(feedbackCode, "Code resent. Check your email.", "success");
      setTimeout(() => otpBoxes[0].focus(), 200);
    } catch (err) {
      console.error("Resend error:", err);
      setFeedback(feedbackCode, "Network error.", "error");
    }
  }));

  // -------------------------
  // Verify code
  // -------------------------
  async function doVerifyCode() {
    clearInputErrors();
    const email = emailInput.value.trim();
    const code = getOtpValue();
    if (!code || code.length !== 6) {
      otpBoxes.forEach(b => b.classList.add("input-error"));
      setFeedback(feedbackCode, "Please enter the 6-digit code.", "error");
      return;
    }

    setFeedback(feedbackCode, "Verifying code...");

    try {
      const res = await fetch(`${API_BASE}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(feedbackCode, data.msg || "Invalid or expired code.", "error");
        return;
      }

      setFeedback(feedbackCode, "Code verified! Please set a new password.", "success");
      showStep(stepPassword);
      newPasswordInput.focus();
    } catch (err) {
      console.error("Verify code error:", err);
      setFeedback(feedbackCode, "Network error.", "error");
    }
  }

  verifyCodeBtn.addEventListener("click", withLoading(verifyCodeBtn, doVerifyCode));

  // -------------------------
  // Reset password
  // -------------------------
  async function doResetPassword() {
    clearInputErrors();
    const email = emailInput.value.trim();
    const code = getOtpValue();
    const password = newPasswordInput.value.trim();

    if (!password || password.length < 8) {
      newPasswordInput.classList.add("input-error");
      setFeedback(feedbackPassword, "Password must be at least 8 characters.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.classList.add("input-error");
      setFeedback(feedbackPassword, "Invalid email.", "error");
      return;
    }
    if (!code || code.length !== 6) {
      otpBoxes.forEach(b => b.classList.add("input-error"));
      setFeedback(feedbackPassword, "Missing verification code. Please verify OTP first.", "error");
      return;
    }

    setFeedback(feedbackPassword, "Resetting password...");

    try {
      const res = await fetch(`${API_BASE}/new-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(feedbackPassword, data.msg || "Error resetting password.", "error");
        return;
      }

      setFeedback(feedbackPassword, "Password reset successful!", "success");
      showStep(stepSuccess);

      clearState();
      setTimeout(() => window.location.href = "login.html", 2500);

    } catch (err) {
      console.error("Reset password error:", err);
      setFeedback(feedbackPassword, "Network error.", "error");
    }
  }

  resetPasswordBtn.addEventListener("click", withLoading(resetPasswordBtn, doResetPassword));

  cancelBtn.addEventListener("click", () => {
    window.location.href = "login.html";
  });

  // -------------------------
  // Prevent step skipping & accessibility
  // -------------------------
  function setStepAccessibility() {
    const inEmail = stepEmail.classList.contains("active");
    const inCode = stepCode.classList.contains("active");
    const inPassword = stepPassword.classList.contains("active");
    Array.from(stepEmail.querySelectorAll("input,select,button")).forEach(i => i.tabIndex = inEmail ? 0 : -1);
    Array.from(stepCode.querySelectorAll("input,button")).forEach(i => i.tabIndex = inCode ? 0 : -1);
    Array.from(stepPassword.querySelectorAll("input,button")).forEach(i => i.tabIndex = inPassword ? 0 : -1);
  }
  const observer = new MutationObserver(setStepAccessibility);
  observer.observe(document.querySelector(".reset-form"), { attributes: true, subtree: true, attributeFilter: ["class"] });
  setStepAccessibility();

  if (saved && saved.lastStep) {
    if (saved.lastStep === "code") showStep(stepCode);
    else if (saved.lastStep === "password") showStep(stepPassword);
    else showStep(stepEmail);
  } else showStep(stepEmail);

  function persistLastStep() {
    const state = loadState();
    state.lastStep = document.querySelector(".step.active").id;
    saveState(state);
  }
  document.querySelectorAll(".step").forEach(s => s.addEventListener("transitionend", persistLastStep));

  [roleInput, fullnameInput, emailInput].forEach(i => {
    i.addEventListener("input", () => {
      const st = loadState();
      st.role = roleInput.value;
      st.fullname = fullnameInput.value;
      st.email = emailInput.value;
      saveState(st);
    });
  });

  const stepObserver = new MutationObserver(() => {
    const active = document.querySelector(".step.active");
    if (!active) return;
    const firstFocusable = active.querySelector("input,select,button,textarea,[tabindex]:not([tabindex='-1'])");
    if (firstFocusable) setTimeout(() => firstFocusable.focus(), 220);
  });
  stepObserver.observe(document.querySelector(".reset-form"), { attributes: true, subtree: true, attributeFilter: ["class"] });

  window.addEventListener("beforeunload", () => {});

  resendBtn.setAttribute("disabled", "true");
  resendTimer.style.display = "none";

});

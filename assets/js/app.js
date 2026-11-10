
/* =========================================================
   EPDS FRONTEND - PHASE 2
   Backend: Google Apps Script Web App v2.1
   ========================================================= */

(() => {
  "use strict";

  const API_URL = window.APP_CONFIG?.API_URL;

  const state = {
    token: null,
    role: null,
    profile: null,
    responses: []
  };

  const $ = (id) => document.getElementById(id);

  // ---------------- API ----------------

  async function api(action, payload = {}) {
    if (!API_URL) throw new Error("API URL មិនត្រូវបានកំណត់ក្នុង config.js ទេ។");

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload })
    });

    const json = await response.json();

    if (!json.success) {
      throw new Error(json.message || "មានបញ្ហាក្នុងការភ្ជាប់ទៅ Server។");
    }

    return json.data || {};
  }

  // ---------------- UI HELPERS ----------------

  function showView(viewId) {
    ["loginView", "employeeView", "adminView"].forEach((id) => {
      $(id)?.classList.toggle("hidden", id !== viewId);
    });
  }

  function showMessage(id, message, type = "error") {
    const el = $(id);
    if (!el) return;

    el.textContent = message || "";
    el.className = message ? `message ${type}` : "message";
  }

  function setLoading(button, loading, label) {
    if (!button) return;
    button.disabled = loading;
    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = "កំពុងដំណើរការ...";
    } else {
      button.textContent = label || button.dataset.originalText || "បញ្ជូន";
    }
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)]
      .map((el) => el.value);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function firstValue(obj, keys, fallback = "") {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null) {
        return obj[key];
      }
    }
    return fallback;
  }

  // ---------------- LOGIN ----------------

  $("loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const identifier = $("loginIdentifier").value.trim();
    const password = $("loginPassword").value;
    const button = $("loginBtn");

    if (!identifier || !password) {
      showMessage("loginMessage", "សូមបញ្ចូលព័ត៌មាន Login ឱ្យបានគ្រប់គ្រាន់។");
      return;
    }

    setLoading(button, true);

    try {
      const result = await api("unifiedLogin", { identifier, password });

      if (!result.token) {
        throw new Error("Server មិនបានផ្តល់ Login Token។ សូមពិនិត្យ Backend។");
      }

      state.token = result.token;

      // Detect role from backend response first.
      const backendRole = String(result.role || result.userRole || "").toUpperCase();

      if (backendRole === "ADMIN" || (!result.profile && identifier.includes("@"))) {
        state.role = "ADMIN";
        state.profile = result.profile || { email: identifier };
        showView("adminView");
        await loadAdminDashboard();
      } else {
        state.role = "EMPLOYEE";
        state.profile = result.profile || {};
        renderEmployeeProfile(state.profile);
        showView("employeeView");
      }

      $("loginPassword").value = "";
      showMessage("loginMessage", "");

    } catch (error) {
      showMessage("loginMessage", error.message || "Login មិនបានជោគជ័យ។");
    } finally {
      setLoading(button, false, "ចូលប្រើប្រាស់ →");
    }
  });

  // ---------------- EMPLOYEE REGISTRATION ----------------

  $("showRegisterBtn")?.addEventListener("click", () => {
    $("registerCard")?.classList.remove("hidden");
    $("registerCard")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("backToLoginBtn")?.addEventListener("click", () => {
    $("registerCard")?.classList.add("hidden");
    showMessage("registerMessage", "");
  });

  $("registerForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const staffId = $("registerStaffId").value.trim();
    const activationCode = $("activationCode").value.trim();
    const password = $("newPassword").value;
    const confirmPassword = $("confirmPassword").value;
    const button = $("registerBtn");

    if (password.length < 8) {
      showMessage("registerMessage", "Password ត្រូវមានយ៉ាងតិច ៨ តួអក្សរ។");
      return;
    }

    if (password !== confirmPassword) {
      showMessage("registerMessage", "Password និង Confirm Password មិនដូចគ្នាទេ។");
      return;
    }

    setLoading(button, true);

    try {
      await api("activateAccount", {
        staffId,
        activationCode,
        password
      });

      showMessage(
        "registerMessage",
        "បង្កើតគណនីបានជោគជ័យ! អ្នកអាច Login បានហើយ។",
        "success"
      );

      $("registerForm").reset();

    } catch (error) {
      showMessage("registerMessage", error.message || "មិនអាចបង្កើតគណនីបានទេ។");
    } finally {
      setLoading(button, false, "បង្កើតគណនី");
    }
  });

  // ---------------- EMPLOYEE PROFILE ----------------

  function renderEmployeeProfile(profile) {
    const name = firstValue(profile, ["employeeName", "name"], "Employee");
    const staffId = firstValue(profile, ["staffId", "Staff_ID"], "");
    const department = firstValue(profile, ["department", "Department"], "");
    const position = firstValue(profile, ["position", "Position"], "");

    $("employeeName").textContent = name;
    $("employeeMeta").textContent =
      [staffId, department, position].filter(Boolean).join(" · ");
    $("employeeAvatar").textContent = name.trim().charAt(0).toUpperCase() || "E";
  }

  // ---------------- EMPLOYEE SURVEY ----------------

  $("q1OtherCheck")?.addEventListener("change", (event) => {
    $("q1Other").classList.toggle("visible", event.target.checked);
    if (!event.target.checked) $("q1Other").value = "";
  });

  $("surveyForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const q1 = checkedValues("q1");
    const q2 = checkedValues("q2");
    const q3 = checkedValues("q3");
    const q1Other = $("q1Other").value.trim();

    if (!q1.length || !q2.length || !q3.length) {
      showMessage("surveyMessage", "សូមឆ្លើយសំណួរទី ១ ទី ២ និងទី ៣ ជាមុនសិន។");
      return;
    }

    if (q1.includes("ផ្សេងៗ") && !q1Other) {
      showMessage("surveyMessage", "សូមបញ្ជាក់ជំនាញផ្សេងៗដែលអ្នកចង់រៀន។");
      return;
    }

    const button = $("submitSurveyBtn");
    setLoading(button, true);

    try {
      await api("submitSurvey", {
        token: state.token,
        answers: {
          q1,
          q1Other,
          q2,
          q3,
          q4: $("q4Comments").value.trim()
        }
      });

      showMessage(
        "surveyMessage",
        "ចម្លើយរបស់អ្នកត្រូវបានបញ្ជូនដោយជោគជ័យ។ សូមអរគុណចំពោះការចូលរួម!",
        "success"
      );

      $("surveyForm").querySelectorAll("input, textarea, button").forEach((el) => {
        el.disabled = true;
      });

    } catch (error) {
      showMessage("surveyMessage", error.message || "មិនអាចបញ្ជូនចម្លើយបានទេ។");
    } finally {
      setLoading(button, false, "បញ្ជូនចម្លើយស្ទង់មតិ →");
    }
  });

  // ---------------- ADMIN DASHBOARD ----------------

  async function loadAdminDashboard() {
    showMessage("adminMessage", "កំពុងទាញយកទិន្នន័យពី Google Sheets...", "info");

    try {
      const [summary, analytics, responseData] = await Promise.all([
        api("adminSummary", { token: state.token }),
        api("adminAnalytics", { token: state.token }),
        api("adminResponses", { token: state.token })
      ]);

      renderSummary(summary);
      renderAnalytics(analytics);

      state.responses = extractResponses(responseData);
      renderResponses(state.responses);

      showMessage("adminMessage", "ទិន្នន័យបានធ្វើបច្ចុប្បន្នភាព។", "success");

    } catch (error) {
      showMessage("adminMessage", error.message || "មិនអាចទាញយកទិន្នន័យ Admin បានទេ។");
    }
  }

  function renderSummary(data) {
    const total = Number(firstValue(data, ["totalEmployees", "total"], 0));
    const active = Number(firstValue(data, ["activeEmployees", "active"], 0));
    const responded = Number(firstValue(data, ["respondedEmployees", "totalResponses", "responded"], 0));
    const pending = Number(firstValue(data, ["pendingEmployees", "pending"], Math.max(0, active - responded)));

    $("statTotalEmployees").textContent = total.toLocaleString();
    $("statActiveEmployees").textContent = active.toLocaleString();
    $("statResponded").textContent = responded.toLocaleString();
    $("statPending").textContent = pending.toLocaleString();

    const rate = active > 0 ? Math.min(100, (responded / active) * 100) : 0;
    $("completionRate").textContent = `${rate.toFixed(1)}%`;
    $("completionBar").style.width = `${rate}%`;

    $("surveyStatus").textContent =
      `Survey Status: ${firstValue(data, ["surveyStatus", "status"], "—")}`;
    $("surveyIdLabel").textContent =
      `Survey ID: ${firstValue(data, ["surveyId"], "—")}`;
  }

  // Supports arrays and object-based analytics returned by Apps Script.
  function normalizeAnalytics(source) {
    if (Array.isArray(source)) {
      return source.map((item) => ({
        label: firstValue(item, ["name", "label", "department", "skill", "value"], "Other"),
        count: Number(firstValue(item, ["count", "total", "responses", "valueCount"], 0))
      }));
    }

    if (source && typeof source === "object") {
      return Object.entries(source).map(([label, value]) => ({
        label,
        count: Number(
          typeof value === "object"
            ? firstValue(value, ["count", "total", "responses"], 0)
            : value
        )
      }));
    }

    return [];
  }

  function renderAnalytics(data) {
    const department = firstValue(data, ["department", "departments", "byDepartment"], []);
    const skills = firstValue(data, ["skills", "bySkill"], []);
    const development = firstValue(data, ["development", "developments", "byDevelopment"], []);
    const support = firstValue(data, ["support", "supports", "bySupport"], []);

    renderAnalyticsList("departmentAnalytics", department);
    renderAnalyticsList("skillsAnalytics", skills);
    renderAnalyticsList("developmentAnalytics", development);
    renderAnalyticsList("supportAnalytics", support);
  }

  function renderAnalyticsList(elementId, source) {
    const container = $(elementId);
    if (!container) return;

    const items = normalizeAnalytics(source).sort((a, b) => b.count - a.count);

    if (!items.length) {
      container.innerHTML = '<p class="empty-state">មិនទាន់មានទិន្នន័យ។</p>';
      return;
    }

    const max = Math.max(...items.map((item) => item.count), 1);

    container.innerHTML = items.map((item) => {
      const percent = Math.max(0, Math.min(100, (item.count / max) * 100));
      return `
        <div class="analytics-item">
          <div class="analytics-label">
            <span>${escapeHTML(item.label)}</span>
            <strong>${item.count.toLocaleString()}</strong>
          </div>
          <div class="mini-track">
            <div class="mini-bar" style="width:${percent}%"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function extractResponses(data) {
    if (Array.isArray(data)) return data;

    for (const key of ["responses", "data", "items", "records"]) {
      if (Array.isArray(data?.[key])) return data[key];
    }

    return [];
  }

  function renderResponses(responses) {
    const tbody = $("responsesTableBody");
    if (!tbody) return;

    const search = ($("responseSearch")?.value || "").trim().toLowerCase();

    const filtered = responses.filter((row) => {
      const staffId = String(firstValue(row, ["staffId", "Staff_ID"], "")).toLowerCase();
      const name = String(firstValue(row, ["employeeName", "Employee_Name"], "")).toLowerCase();
      return staffId.includes(search) || name.includes(search);
    });

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">មិនមានទិន្នន័យត្រូវនឹងការស្វែងរកទេ។</td></tr>';
      $("responseCount").textContent = "0 responses";
      return;
    }

    tbody.innerHTML = filtered.map((row, index) => {
      const staffId = firstValue(row, ["staffId", "Staff_ID"], "");
      const name = firstValue(row, ["employeeName", "Employee_Name"], "");
      const department = firstValue(row, ["department", "Department"], "");
      const skills = firstValue(row, ["q1Skills", "Q1_Skills"], "");
      const date = firstValue(row, ["submissionDate", "Submission_Date"], "");

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHTML(staffId)}</td>
          <td>${escapeHTML(name)}</td>
          <td>${escapeHTML(department)}</td>
          <td>${escapeHTML(skills)}</td>
          <td>${escapeHTML(date)}</td>
        </tr>
      `;
    }).join("");

    $("responseCount").textContent =
      `បង្ហាញ ${filtered.length} នៃ ${responses.length} ចម្លើយ`;
  }

  $("refreshAdminBtn")?.addEventListener("click", loadAdminDashboard);
  $("responseSearch")?.addEventListener("input", () => {
    renderResponses(state.responses);
  });

  // ---------------- LOGOUT ----------------

  function logout() {
    state.token = null;
    state.role = null;
    state.profile = null;
    state.responses = [];

    $("loginForm")?.reset();
    $("surveyForm")?.reset();

    $("surveyForm")?.querySelectorAll("input, textarea, button").forEach((el) => {
      el.disabled = false;
    });

    $("q1Other")?.classList.remove("visible");
    $("registerCard")?.classList.add("hidden");

    showMessage("loginMessage", "");
    showMessage("surveyMessage", "");
    showMessage("adminMessage", "");

    showView("loginView");
  }

  document.querySelectorAll(".logoutBtn").forEach((button) => {
    button.addEventListener("click", logout);
  });

  // Initial screen
  showView("loginView");

})();

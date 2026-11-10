
/* =========================================================
   EPDS - Employee Development Survey
   Frontend Application v2.2
   Backend: Google Apps Script v2.1
========================================================= */

(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const API_URL = CONFIG.API_URL;

  const $ = (id) => document.getElementById(id);

  let currentUser = null;
  let currentToken = null;
  let allResponses = [];

  /* =========================
     VIEW MANAGEMENT
  ========================= */

  const views = [
    "loginView",
    "registerView",
    "employeeView",
    "adminView"
  ];

  function showView(viewId) {
    views.forEach(id => {
      const element = $(id);
      if (element) element.classList.toggle("hidden", id !== viewId);
    });
  }

  function showMessage(id, message, type = "error") {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = message ? "block" : "none";
  }

  function clearMessage(id) {
    showMessage(id, "");
  }

  function setLoading(show, message = "កំពុងដំណើរការ...") {
    const overlay = $("loadingOverlay");
    if (!overlay) return;

    overlay.classList.toggle("hidden", !show);

    const text = $("loadingText");
    if (text) text.textContent = message;
  }

  function setButtonLoading(buttonId, loading, text) {
    const button = $(buttonId);
    if (!button) return;

    if (loading) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = text || "កំពុងដំណើរការ...";
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || text || "Submit";
    }
  }

  /* =========================
     API CONNECTION
  ========================= */

  async function api(action, payload = {}) {
    if (!API_URL) {
      throw new Error("មិនទាន់កំណត់ API_URL ក្នុង config.js ទេ។");
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    });

    if (!response.ok) {
      throw new Error(`Server Error: HTTP ${response.status}`);
    }

    let json;

    try {
      json = await response.json();
    } catch {
      throw new Error("មិនអាចអានទិន្នន័យពី Server បានទេ។");
    }

    if (!json.success) {
      throw new Error(json.message || "មានបញ្ហាក្នុងការដំណើរការ។");
    }

    return json.data || {};
  }

  /* =========================
     SAFE DISPLAY HELPERS
  ========================= */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function displayValue(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString("km-KH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  }

  function numberFormat(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  /* =========================
     SESSION MANAGEMENT
  ========================= */

  function saveSession(token, user) {
    currentToken = token;
    currentUser = user;

    sessionStorage.setItem("epds_token", token);
    sessionStorage.setItem("epds_user", JSON.stringify(user));
  }

  function clearSession() {
    currentToken = null;
    currentUser = null;
    allResponses = [];

    sessionStorage.removeItem("epds_token");
    sessionStorage.removeItem("epds_user");
  }

  function restoreSession() {
    const token = sessionStorage.getItem("epds_token");
    const user = sessionStorage.getItem("epds_user");

    if (!token || !user) return false;

    try {
      currentToken = token;
      currentUser = JSON.parse(user);
      return true;
    } catch {
      clearSession();
      return false;
    }
  }

  function logout() {
    clearSession();
    showView("loginView");

    if ($("loginPassword")) $("loginPassword").value = "";
    if ($("loginIdentifier")) $("loginIdentifier").value = "";

    clearMessage("loginMessage");
  }

  /* =========================
     LOGIN - AUTOMATIC ROLE
  ========================= */

  async function handleLogin(event) {
    event.preventDefault();
    clearMessage("loginMessage");

    const identifier = $("loginIdentifier").value.trim();
    const password = $("loginPassword").value;

    if (!identifier || !password) {
      showMessage("loginMessage", "សូមបញ្ចូលព័ត៌មានឱ្យបានគ្រប់គ្រាន់។");
      return;
    }

    setButtonLoading("loginBtn", true, "កំពុងផ្ទៀងផ្ទាត់...");

    try {
      const result = await api("unifiedLogin", {
        identifier,
        password
      });

      if (!result.token || !result.role) {
        throw new Error("Server មិនបានបញ្ជូនព័ត៌មាន Login ត្រឹមត្រូវទេ។");
      }

      if (result.role === "EMPLOYEE") {
        const profile = result.profile || {};

        const user = {
          role: "EMPLOYEE",
          staffId: profile.staffId || "",
          employeeName: profile.employeeName || "",
          department: profile.department || "",
          position: profile.position || ""
        };

        saveSession(result.token, user);
        showEmployeeDashboard(user);

      } else if (result.role === "ADMIN") {

        const user = {
          role: "ADMIN",
          email: result.email || identifier,
          adminRole: result.adminRole || "ADMIN"
        };

        saveSession(result.token, user);
        showAdminDashboard(user);

      } else {
        throw new Error("Role មិនត្រឹមត្រូវ។");
      }

    } catch (error) {
      showMessage("loginMessage", error.message);
    } finally {
      setButtonLoading("loginBtn", false);
    }
  }

  /* =========================
     EMPLOYEE DASHBOARD
  ========================= */

  function showEmployeeDashboard(user) {
    showView("employeeView");

    $("employeeName").textContent = user.employeeName || "Employee";
    $("employeeStaffId").textContent = user.staffId || "";

    $("profileName").textContent = user.employeeName || "-";
    $("profileStaffId").textContent = user.staffId || "-";
    $("profileDepartment").textContent = user.department || "-";
    $("profilePosition").textContent = user.position || "-";

    $("surveyForm")?.reset();
    clearMessage("surveyMessage");
  }

  /* =========================
     ACCOUNT REGISTRATION
  ========================= */

  async function handleRegistration(event) {
    event.preventDefault();
    clearMessage("registerMessage");

    const staffId = $("registerStaffId").value.trim();
    const activationCode = $("activationCode").value.trim();
    const password = $("registerPassword").value;
    const confirmPassword = $("confirmPassword").value;

    if (!staffId || !activationCode || !password || !confirmPassword) {
      showMessage("registerMessage", "សូមបំពេញព័ត៌មានទាំងអស់។");
      return;
    }

    if (password !== confirmPassword) {
      showMessage("registerMessage", "Password ទាំងពីរមិនដូចគ្នាទេ។");
      return;
    }

    if (password.length < 6) {
      showMessage("registerMessage", "Password ត្រូវមានយ៉ាងហោចណាស់ ៦ តួអក្សរ។");
      return;
    }

    setButtonLoading("registerBtn", true, "កំពុងបង្កើតគណនី...");

    try {
      await api("activateAccount", {
        staffId,
        activationCode,
        password
      });

      $("registerForm").reset();

      showMessage(
        "registerMessage",
        "បង្កើតគណនីបានជោគជ័យ! សូមចូលប្រើប្រាស់ប្រព័ន្ធ។",
        "success"
      );

      setTimeout(() => {
        showView("loginView");
        $("loginIdentifier").value = staffId;
        clearMessage("registerMessage");
      }, 1800);

    } catch (error) {
      showMessage("registerMessage", error.message);
    } finally {
      setButtonLoading("registerBtn", false);
    }
  }

  /* =========================
     EMPLOYEE SURVEY SUBMISSION
  ========================= */

  function getCheckedValues(name) {
    return Array.from(
      document.querySelectorAll(`input[name="${name}"]:checked`)
    ).map(input => input.value);
  }

  async function handleSurveySubmit(event) {
    event.preventDefault();
    clearMessage("surveyMessage");

    if (!currentToken || currentUser?.role !== "EMPLOYEE") {
      showMessage("surveyMessage", "សូម Login ម្តងទៀត។");
      logout();
      return;
    }

    const q1 = getCheckedValues("q1");
    const q2 = getCheckedValues("q2");
    const q3 = getCheckedValues("q3");

    const q1Other = $("q1Other").value.trim();
    const q4 = $("q4Comments").value.trim();

    if (q1.length === 0 || q2.length === 0 || q3.length === 0) {
      showMessage(
        "surveyMessage",
        "សូមជ្រើសរើសចម្លើយយ៉ាងហោចណាស់មួយសម្រាប់សំណួរ ១, ២ និង ៣។"
      );
      return;
    }

    if (q1.includes("ផ្សេងៗ") && !q1Other) {
      showMessage(
        "surveyMessage",
        "សូមបញ្ជាក់ជំនាញផ្សេងៗដែលអ្នកចង់រៀន។"
      );
      return;
    }

    const answers = {
      q1,
      q1Other,
      q2,
      q3,
      q4
    };

    setButtonLoading("submitSurveyBtn", true, "កំពុងបញ្ជូនចម្លើយ...");

    try {
      await api("submitSurvey", {
        token: currentToken,
        answers
      });

      $("surveyForm").reset();

      showMessage(
        "surveyMessage",
        "សូមអរគុណ! ចម្លើយរបស់អ្នកត្រូវបានបញ្ជូនដោយជោគជ័យ។",
        "success"
      );

      $("submitSurveyBtn").disabled = true;
      $("submitSurveyBtn").textContent = "បានបញ្ជូនចម្លើយរួចរាល់";

    } catch (error) {
      showMessage("surveyMessage", error.message);
    } finally {
      if (!$("submitSurveyBtn").disabled) {
        setButtonLoading("submitSurveyBtn", false);
      }
    }
  }

  /* =========================
     ADMIN DASHBOARD
  ========================= */

  async function showAdminDashboard(user) {
    showView("adminView");

    $("adminEmail").textContent = user.email || "Administrator";
    $("adminRole").textContent = user.adminRole || "HR Admin";

    await loadAdminDashboard();
  }

  async function loadAdminDashboard() {
    if (!currentToken || currentUser?.role !== "ADMIN") {
      logout();
      return;
    }

    setLoading(true, "កំពុងទាញយកទិន្នន័យ Dashboard...");

    try {
      const [summary, analytics, responses] = await Promise.all([
        api("adminSummary", { token: currentToken }),
        api("adminAnalytics", { token: currentToken }),
        api("adminResponses", { token: currentToken })
      ]);

      renderSummary(summary);
      renderAnalytics(analytics);

      allResponses = Array.isArray(responses)
        ? responses
        : (responses.responses || responses.data || []);

      renderResponses(allResponses);

    } catch (error) {
      showMessage("responseMessage", error.message);
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     SUMMARY CARDS
  ========================= */

  function renderSummary(data) {
    $("totalEmployees").textContent =
      numberFormat(data.totalEmployees);

    $("activeEmployees").textContent =
      numberFormat(data.activeEmployees);

    $("respondedEmployees").textContent =
      numberFormat(data.respondedEmployees);

    $("pendingEmployees").textContent =
      numberFormat(data.pendingEmployees);

    $("totalResponses").textContent =
      numberFormat(data.totalResponses);

    $("surveyStatus").textContent =
      data.surveyStatus || "-";

    $("surveyId").textContent =
      data.surveyId || "EPDS-2026";
  }

  /* =========================
     ANALYTICS
  ========================= */

  function normalizeAggregate(data) {
    if (Array.isArray(data)) {
      return data.map(item => ({
        label: item.label || item.name || item.department || item.value || "Other",
        count: Number(item.count ?? item.total ?? item.valueCount ?? 0)
      }));
    }

    if (data && typeof data === "object") {
      return Object.entries(data).map(([label, count]) => ({
        label,
        count: Number(
          typeof count === "object"
            ? count.count ?? count.total ?? 0
            : count
        )
      }));
    }

    return [];
  }

  function renderAggregate(elementId, data) {
    const element = $(elementId);
    if (!element) return;

    const items = normalizeAggregate(data)
      .filter(item => item.label && Number.isFinite(item.count))
      .sort((a, b) => b.count - a.count);

    if (!items.length) {
      element.innerHTML = '<p class="empty-state">មិនទាន់មានទិន្នន័យ</p>';
      return;
    }

    const max = Math.max(...items.map(item => item.count), 1);

    element.innerHTML = items.map(item => {
      const percent = Math.max(0, Math.min(100, item.count / max * 100));

      return `
        <div class="analytics-item">
          <div class="analytics-label">
            <span>${escapeHTML(item.label)}</span>
            <strong>${numberFormat(item.count)}</strong>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${percent}%"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAnalytics(data) {
    renderAggregate("departmentAnalytics", data.department);
    renderAggregate("skillsAnalytics", data.skills);
    renderAggregate("developmentAnalytics", data.development);
    renderAggregate("supportAnalytics", data.support);
  }

  /* =========================
     RESPONSE TABLE
  ========================= */

  function renderResponses(rows) {
    const tbody = $("responsesTableBody");
    if (!tbody) return;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            មិនទាន់មានចម្លើយស្ទង់មតិ
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHTML(row.staffId || row.Staff_ID || "-")}</td>
        <td>${escapeHTML(row.employeeName || row.Employee_Name || "-")}</td>
        <td>${escapeHTML(row.department || row.Department || "-")}</td>
        <td>${escapeHTML(row.position || row.Position || "-")}</td>
        <td>${escapeHTML(formatDate(row.submissionDate || row.Submission_Date))}</td>
        <td>
          <button
            type="button"
            class="btn btn-small btn-outline response-detail-btn"
            data-index="${index}"
          >
            មើលព័ត៌មាន
          </button>
        </td>
      </tr>
    `).join("");
  }

  function filterResponses() {
    const keyword = $("responseSearch").value.trim().toLowerCase();

    if (!keyword) {
      renderResponses(allResponses);
      return;
    }

    const filtered = allResponses.filter(row => {
      const text = [
        row.staffId,
        row.Staff_ID,
        row.employeeName,
        row.Employee_Name,
        row.department,
        row.Department,
        row.position,
        row.Position
      ].join(" ").toLowerCase();

      return text.includes(keyword);
    });

    renderResponses(filtered);
  }

  /* =========================
     RESPONSE DETAIL MODAL
  ========================= */

  function showResponseDetail(index) {
    const row = allResponses[index];
    if (!row) return;

    const fields = [
      ["Staff ID", row.staffId || row.Staff_ID],
      ["Employee Name", row.employeeName || row.Employee_Name],
      ["Department", row.department || row.Department],
      ["Position", row.position || row.Position],
      ["Q1 - Skills", row.q1Skills || row.Q1_Skills],
      ["Q1 - Other Skill", row.q1OtherSkill || row.Q1_Other_Skill],
      ["Q2 - Development", row.q2Development || row.Q2_Development],
      ["Q3 - Support", row.q3Support || row.Q3_Support],
      ["Q4 - Comments", row.q4Comments || row.Q4_Comments],
      ["Submission Date", row.submissionDate || row.Submission_Date]
    ];

    $("responseDetailContent").innerHTML = fields.map(([label, value]) => `
      <div class="detail-row">
        <strong>${escapeHTML(label)}</strong>
        <p>${escapeHTML(displayValue(value))}</p>
      </div>
    `).join("");

    $("responseModal").classList.remove("hidden");
  }

  function closeResponseModal() {
    $("responseModal").classList.add("hidden");
  }

  /* =========================
     CSV EXPORT
  ========================= */

  function exportCSV() {
    if (!allResponses.length) {
      showMessage("responseMessage", "មិនមានទិន្នន័យសម្រាប់ Export ទេ។");
      return;
    }

    const columns = [
      ["Staff ID", "staffId", "Staff_ID"],
      ["Employee Name", "employeeName", "Employee_Name"],
      ["Department", "department", "Department"],
      ["Position", "position", "Position"],
      ["Q1 Skills", "q1Skills", "Q1_Skills"],
      ["Q1 Other Skill", "q1OtherSkill", "Q1_Other_Skill"],
      ["Q2 Development", "q2Development", "Q2_Development"],
      ["Q3 Support", "q3Support", "Q3_Support"],
      ["Q4 Comments", "q4Comments", "Q4_Comments"],
      ["Submission Date", "submissionDate", "Submission_Date"]
    ];

    const csvEscape = value => {
      const text = displayValue(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const header = columns.map(column => csvEscape(column[0])).join(",");

    const body = allResponses.map(row => {
      return columns.map(([, camel, snake]) => {
        return csvEscape(row[camel] ?? row[snake] ?? "");
      }).join(",");
    });

    const csv = "\uFEFF" + [header, ...body].join("\r\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `EPDS_Responses_${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  /* =========================
     EVENT LISTENERS
  ========================= */

  function bindEvents() {
    $("loginForm")?.addEventListener("submit", handleLogin);
    $("registerForm")?.addEventListener("submit", handleRegistration);
    $("surveyForm")?.addEventListener("submit", handleSurveySubmit);

    $("showRegisterBtn")?.addEventListener("click", () => {
      clearMessage("registerMessage");
      showView("registerView");
    });

    $("backToLoginBtn")?.addEventListener("click", () => {
      showView("loginView");
    });

    $("employeeLogoutBtn")?.addEventListener("click", logout);
    $("adminLogoutBtn")?.addEventListener("click", logout);

    $("refreshDashboardBtn")?.addEventListener("click", loadAdminDashboard);

    $("responseSearch")?.addEventListener("input", filterResponses);

    $("exportCsvBtn")?.addEventListener("click", exportCSV);

    $("responsesTableBody")?.addEventListener("click", event => {
      const button = event.target.closest(".response-detail-btn");
      if (!button) return;

      showResponseDetail(Number(button.dataset.index));
    });

    $("closeResponseModalBtn")?.addEventListener("click", closeResponseModal);
    $("closeModalBackdrop")?.addEventListener("click", closeResponseModal);
  }

  /* =========================
     APP INITIALIZATION
  ========================= */

  async function initializeApp() {
    bindEvents();

    if (!restoreSession()) {
      showView("loginView");
      return;
    }

    if (currentUser.role === "EMPLOYEE") {
      showEmployeeDashboard(currentUser);
      return;
    }

    if (currentUser.role === "ADMIN") {
      await showAdminDashboard(currentUser);
      return;
    }

    logout();
  }

  document.addEventListener("DOMContentLoaded", initializeApp);

})();

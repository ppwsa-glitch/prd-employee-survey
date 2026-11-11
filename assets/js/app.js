/* =========================================================
   EPDS - Employee Development Survey
   Frontend Application v4.0
   Backend: Google Apps Script v4.0

   Features:
   - Employee / Admin Unified Login
   - Pre-created accounts + forced password change (PRD001)
   - Admin: create account / reset password
   - Employee Survey Submission
   - Admin Dashboard & Analytics
   - Response Search & Details
   - Excel Export (.xlsx)
   - PDF Export (.pdf) - Khmer Font Support
   - iOS / Android Share Sheet
   - Save to Files / Browser Download
   - No password or activation code in exports
========================================================= */

(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const API_URL = CONFIG.API_URL;

  const $ = id => document.getElementById(id);

  let currentUser = null;
  let currentToken = null;
  let allResponses = [];
  let dashboardSummary = {};
  let dashboardAnalytics = {};

  // Prepared export file for the second user click.
  let pendingExportFile = null;

  /* ========================================================
     VIEW MANAGEMENT
  ======================================================== */

  const views = [
    "loginView",
    "changePasswordView",
    "employeeView",
    "adminView"
  ];

  function showView(viewId) {
    views.forEach(id => {
      const element = $(id);
      if (element) {
        element.classList.toggle("hidden", id !== viewId);
      }
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
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }

      button.disabled = true;
      button.textContent = text || "កំពុងដំណើរការ...";
    } else {
      button.disabled = false;
      button.textContent =
        button.dataset.originalText || text || "Submit";
    }
  }

  /* ========================================================
     API CONNECTION
  ======================================================== */

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
      throw new Error(
        json.message || "មានបញ្ហាក្នុងការដំណើរការ។"
      );
    }

    return json.data || {};
  }

  /* ========================================================
     SAFE DISPLAY HELPERS
  ======================================================== */

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

    if (value === null || value === undefined || value === "") {
      return "-";
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function getRowValue(row, camelKey, snakeKey) {
    return row?.[camelKey] ?? row?.[snakeKey] ?? "";
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

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("km-KH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function numberFormat(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function getTodayISO() {
    const now = new Date();

    const localDate = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    );

    return localDate.toISOString().slice(0, 10);
  }

  function normalizeResponseRows(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.responses)) return data.responses;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  }

  /* ========================================================
     SESSION MANAGEMENT
  ======================================================== */

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
    dashboardSummary = {};
    dashboardAnalytics = {};

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
    allEmployees = [];
    clearPendingExport();
    showView("loginView");

    if ($("loginPassword")) $("loginPassword").value = "";
    if ($("loginIdentifier")) $("loginIdentifier").value = "";

    clearMessage("loginMessage");
    clearMessage("responseMessage");
  }

  /* ========================================================
     LOGIN - AUTOMATIC ROLE
  ======================================================== */

  async function handleLogin(event) {
    event.preventDefault();
    clearMessage("loginMessage");

    const identifier = $("loginIdentifier")?.value.trim();
    const password = $("loginPassword")?.value;

    if (!identifier || !password) {
      showMessage(
        "loginMessage",
        "សូមបញ្ចូលព័ត៌មានឱ្យបានគ្រប់គ្រាន់។"
      );
      return;
    }

    setButtonLoading("loginBtn", true, "កំពុងផ្ទៀងផ្ទាត់...");

    try {
      const result = await api("unifiedLogin", {
        identifier,
        password
      });

      if (!result.token || !result.role) {
        throw new Error(
          "Server មិនបានបញ្ជូនព័ត៌មាន Login ត្រឹមត្រូវទេ។"
        );
      }

      if (result.role === "EMPLOYEE") {
        const profile = result.profile || result.employee || {};

        const user = {
          role: "EMPLOYEE",
          staffId: profile.staffId || "",
          employeeName: profile.employeeName || "",
          department: profile.department || "",
          position: profile.position || ""
        };

        user.mustChangePassword = Boolean(result.mustChangePassword);

        saveSession(result.token, user);

        if (user.mustChangePassword) {
          showChangePasswordView();
        } else {
          showEmployeeDashboard(user);
        }

      } else if (result.role === "ADMIN") {
        const user = {
          role: "ADMIN",
          email: result.email || identifier,
          adminRole: result.adminRole || "ADMIN"
        };

        saveSession(result.token, user);
        await showAdminDashboard(user);

      } else {
        throw new Error("Role មិនត្រឹមត្រូវ។");
      }

    } catch (error) {
      showMessage("loginMessage", error.message);

    } finally {
      setButtonLoading("loginBtn", false);
    }
  }

  /* ========================================================
     EMPLOYEE DASHBOARD
  ======================================================== */

  function showEmployeeDashboard(user) {
    showView("employeeView");

    if ($("employeeName")) {
      $("employeeName").textContent =
        user.employeeName || "Employee";
    }

    if ($("employeeStaffId")) {
      $("employeeStaffId").textContent = user.staffId || "";
    }

    if ($("profileName")) {
      $("profileName").textContent = user.employeeName || "-";
    }

    if ($("profileStaffId")) {
      $("profileStaffId").textContent = user.staffId || "-";
    }

    if ($("profileDepartment")) {
      $("profileDepartment").textContent =
        user.department || "-";
    }

    if ($("profilePosition")) {
      $("profilePosition").textContent =
        user.position || "-";
    }

    $("surveyForm")?.reset();
    clearMessage("surveyMessage");

    const submitButton = $("submitSurveyBtn");

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent =
        submitButton.dataset.originalText || "បញ្ជូនចម្លើយ";
    }
  }

  /* ========================================================
     FORCED PASSWORD CHANGE (FIRST LOGIN / AFTER RESET)
  ======================================================== */

  const TEMP_PASSWORD = "PRD001";

  function showChangePasswordView() {
    $("changePasswordForm")?.reset();
    clearMessage("changePasswordMessage");
    showView("changePasswordView");
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    clearMessage("changePasswordMessage");

    if (!currentToken || currentUser?.role !== "EMPLOYEE") {
      logout();
      return;
    }

    const newPassword = $("newPassword")?.value || "";
    const confirmPassword = $("confirmNewPassword")?.value || "";

    if (!newPassword || !confirmPassword) {
      showMessage("changePasswordMessage", "សូមបំពេញព័ត៌មានទាំងអស់។");
      return;
    }

    if (newPassword.length < 8) {
      showMessage(
        "changePasswordMessage",
        "Password ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ។"
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("changePasswordMessage", "Password ទាំងពីរមិនដូចគ្នាទេ។");
      return;
    }

    if (newPassword === TEMP_PASSWORD) {
      showMessage(
        "changePasswordMessage",
        "មិនអាចប្រើ Password បណ្តោះអាសន្នជា Password ថ្មីបានទេ។"
      );
      return;
    }

    setButtonLoading("changePasswordBtn", true, "កំពុងប្តូរ Password...");

    try {
      await api("changePassword", {
        token: currentToken,
        newPassword
      });

      currentUser.mustChangePassword = false;
      saveSession(currentToken, currentUser);

      $("changePasswordForm")?.reset();
      showEmployeeDashboard(currentUser);

    } catch (error) {
      showMessage("changePasswordMessage", error.message);

    } finally {
      setButtonLoading("changePasswordBtn", false);
    }
  }

  /* ========================================================
     ADMIN - EMPLOYEE ACCOUNTS (CREATE / RESET)
  ======================================================== */

  let allEmployees = [];

  function renderEmployees(rows) {
    const tbody = $("employeesTableBody");
    if (!tbody) return;

    if (!rows || !rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">មិនទាន់មានទិន្នន័យ</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const active =
        String(row.accountStatus || "").toLowerCase() === "active";

      const accountBadge = active
        ? '<span class="status-badge ok">ACTIVE</span>'
        : '<span class="status-badge off">INACTIVE</span>';

      let passwordBadge;

      if (!row.hasPassword) {
        passwordBadge =
          '<span class="status-badge off">មិនទាន់មាន</span>';
      } else if (row.mustChangePassword) {
        passwordBadge =
          '<span class="status-badge pending">រង់ចាំប្តូរ</span>';
      } else {
        passwordBadge =
          '<span class="status-badge ok">បានប្តូររួច</span>';
      }

      return `
        <tr>
          <td>${escapeHTML(row.staffId || "-")}</td>
          <td>${escapeHTML(row.employeeName || "-")}</td>
          <td>${escapeHTML(row.department || "-")}</td>
          <td>${accountBadge}</td>
          <td>${passwordBadge}</td>
          <td>
            <button
              type="button"
              class="btn btn-small btn-outline reset-password-btn"
              data-staff-id="${escapeHTML(row.staffId)}"
              data-name="${escapeHTML(row.employeeName)}"
            >
              Reset Password
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function filterEmployees() {
    const keyword =
      $("employeeSearch")?.value.trim().toLowerCase() || "";

    if (!keyword) {
      renderEmployees(allEmployees);
      return;
    }

    renderEmployees(allEmployees.filter(row =>
      [row.staffId, row.employeeName, row.department, row.position]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    ));
  }

  async function refreshEmployees() {
    const rows = await api("adminEmployees", { token: currentToken });
    allEmployees = normalizeResponseRows(rows);
    filterEmployees();
  }

  async function handleCreateEmployee(event) {
    event.preventDefault();
    clearMessage("employeeMessage");

    if (!currentToken || currentUser?.role !== "ADMIN") {
      logout();
      return;
    }

    const staffId = $("newStaffId")?.value.trim();
    const employeeName = $("newEmployeeName")?.value.trim();

    if (!staffId || !employeeName) {
      showMessage("employeeMessage", "សូមបញ្ចូល Staff ID និងឈ្មោះបុគ្គលិក។");
      return;
    }

    setButtonLoading("createEmployeeBtn", true, "កំពុងបង្កើត...");

    try {
      await api("adminCreateEmployee", {
        token: currentToken,
        staffId,
        employeeName,
        department: $("newDepartment")?.value.trim() || "",
        office: $("newOffice")?.value.trim() || "",
        position: $("newPosition")?.value.trim() || ""
      });

      $("createEmployeeForm")?.reset();

      showMessage(
        "employeeMessage",
        `បានបង្កើតគណនី ${staffId} រួចរាល់។ Password បណ្តោះអាសន្ន៖ ${TEMP_PASSWORD} (ត្រូវប្តូរពេល Login ដំបូង)`,
        "success"
      );

      await refreshEmployees();

    } catch (error) {
      showMessage("employeeMessage", error.message);

    } finally {
      setButtonLoading("createEmployeeBtn", false);
    }
  }

  async function handleEmployeeTableClick(event) {
    const button = event.target.closest(".reset-password-btn");
    if (!button) return;

    const staffId = button.dataset.staffId;
    const name = button.dataset.name || "";

    if (!staffId) return;

    const confirmed = window.confirm(
      `Reset Password របស់ ${name} (${staffId}) ទៅ ${TEMP_PASSWORD} ?\n` +
      "បុគ្គលិកត្រូវប្តូរ Password នៅពេល Login បន្ទាប់។"
    );

    if (!confirmed) return;

    clearMessage("employeeMessage");
    button.disabled = true;

    try {
      await api("adminResetPassword", {
        token: currentToken,
        staffId
      });

      showMessage(
        "employeeMessage",
        `បាន Reset Password របស់ ${staffId} ទៅ ${TEMP_PASSWORD} រួចរាល់។`,
        "success"
      );

      await refreshEmployees();

    } catch (error) {
      showMessage("employeeMessage", error.message);
      button.disabled = false;
    }
  }

  /* ========================================================
     EMPLOYEE SURVEY SUBMISSION
  ======================================================== */

  function getCheckedValues(name) {
    return Array.from(
      document.querySelectorAll(
        `input[name="${name}"]:checked`
      )
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

    const q1Other = $("q1Other")?.value.trim() || "";
    const q4 = $("q4Comments")?.value.trim() || "";

    if (!q1.length || !q2.length || !q3.length) {
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

    const answers = { q1, q1Other, q2, q3, q4 };

    setButtonLoading(
      "submitSurveyBtn",
      true,
      "កំពុងបញ្ជូនចម្លើយ..."
    );

    try {
      await api("submitSurvey", {
        token: currentToken,
        answers
      });

      $("surveyForm")?.reset();

      showMessage(
        "surveyMessage",
        "សូមអរគុណ! ចម្លើយរបស់អ្នកត្រូវបានបញ្ជូនដោយជោគជ័យ។",
        "success"
      );

      const button = $("submitSurveyBtn");

      if (button) {
        button.disabled = true;
        button.textContent = "បានបញ្ជូនចម្លើយរួចរាល់";
      }

    } catch (error) {
      showMessage("surveyMessage", error.message);

    } finally {
      const button = $("submitSurveyBtn");

      if (button && !button.disabled) {
        setButtonLoading("submitSurveyBtn", false);
      }
    }
  }

  /* ========================================================
     ADMIN DASHBOARD
  ======================================================== */

  async function showAdminDashboard(user) {
    showView("adminView");

    if ($("adminEmail")) {
      $("adminEmail").textContent = user.email || "Administrator";
    }

    if ($("adminRole")) {
      $("adminRole").textContent = user.adminRole || "HR Admin";
    }

    await loadAdminDashboard();
  }

  async function loadAdminDashboard() {
    if (!currentToken || currentUser?.role !== "ADMIN") {
      logout();
      return;
    }

    setLoading(true, "កំពុងទាញយកទិន្នន័យ Dashboard...");
    clearMessage("responseMessage");

    try {
      const [summary, analytics, responses, employees] = await Promise.all([
        api("adminSummary", { token: currentToken }),
        api("adminAnalytics", { token: currentToken }),
        api("adminResponses", { token: currentToken }),
        api("adminEmployees", { token: currentToken })
      ]);

      allEmployees = normalizeResponseRows(employees);

      dashboardSummary = summary || {};
      dashboardAnalytics = analytics || {};
      allResponses = normalizeResponseRows(responses);

      renderSummary(dashboardSummary);
      renderAnalytics(dashboardAnalytics);
      renderResponses(allResponses);
      filterEmployees();

    } catch (error) {
      showMessage("responseMessage", error.message);

      if (/token|session|unauthorized|expired/i.test(error.message)) {
        logout();
      }

    } finally {
      setLoading(false);
    }
  }

  /* ========================================================
     SUMMARY CARDS
  ======================================================== */

  function renderSummary(data) {
    const fields = {
      totalEmployees: data.totalEmployees,
      activeEmployees: data.activeEmployees,
      respondedEmployees: data.respondedEmployees,
      pendingEmployees: data.pendingEmployees,
      totalResponses: data.totalResponses
    };

    Object.entries(fields).forEach(([id, value]) => {
      if ($(id)) $(id).textContent = numberFormat(value);
    });

    if ($("surveyStatus")) {
      $("surveyStatus").textContent = data.surveyStatus || "-";
    }

    if ($("surveyId")) {
      $("surveyId").textContent = data.surveyId || "EPDS-2026";
    }
  }

  /* ========================================================
     ANALYTICS
  ======================================================== */

  function normalizeAggregate(data) {
    if (Array.isArray(data)) {
      return data.map(item => ({
        label:
          item.label ||
          item.name ||
          item.department ||
          item.value ||
          "Other",

        count: Number(
          item.count ??
          item.total ??
          item.valueCount ??
          0
        )
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
      element.innerHTML =
        '<p class="empty-state">មិនទាន់មានទិន្នន័យ</p>';
      return;
    }

    const max = Math.max(...items.map(item => item.count), 1);

    element.innerHTML = items.map(item => {
      const percent = Math.max(
        0,
        Math.min(100, item.count / max * 100)
      );

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
    renderAggregate(
      "departmentAnalytics",
      data.departments ?? data.department
    );

    renderAggregate("skillsAnalytics", data.skills);
    renderAggregate("developmentAnalytics", data.development);
    renderAggregate("supportAnalytics", data.support);
    renderAggregate("officeAnalytics", data.offices);
  }

  /* ========================================================
     RESPONSE TABLE
  ======================================================== */

  function renderResponses(rows) {
    const tbody = $("responsesTableBody");
    if (!tbody) return;

    if (!rows || !rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            មិនទាន់មានចម្លើយស្ទង់មតិ
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const originalIndex = allResponses.indexOf(row);

      return `
        <tr>
          <td>${originalIndex + 1}</td>
          <td>${escapeHTML(getRowValue(row, "staffId", "Staff_ID") || "-")}</td>
          <td>${escapeHTML(getRowValue(row, "employeeName", "Employee_Name") || "-")}</td>
          <td>${escapeHTML(getRowValue(row, "department", "Department") || "-")}</td>
          <td>${escapeHTML(getRowValue(row, "position", "Position") || "-")}</td>
          <td>${escapeHTML(formatDate(
            getRowValue(row, "submissionDate", "Submission_Date")
          ))}</td>
          <td>
            <button
              type="button"
              class="btn btn-small btn-outline response-detail-btn"
              data-index="${originalIndex}"
            >
              មើលព័ត៌មាន
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function filterResponses() {
    const keyword = $("responseSearch")?.value.trim().toLowerCase() || "";

    if (!keyword) {
      renderResponses(allResponses);
      return;
    }

    const filtered = allResponses.filter(row => {
      const text = [
        getRowValue(row, "staffId", "Staff_ID"),
        getRowValue(row, "employeeName", "Employee_Name"),
        getRowValue(row, "department", "Department"),
        getRowValue(row, "position", "Position")
      ].join(" ").toLowerCase();

      return text.includes(keyword);
    });

    renderResponses(filtered);
  }

  /* ========================================================
     RESPONSE DETAIL MODAL
  ======================================================== */

  function showResponseDetail(index) {
    const row = allResponses[index];
    if (!row) return;

    const fields = [
      ["Staff ID", getRowValue(row, "staffId", "Staff_ID")],
      ["Employee Name", getRowValue(row, "employeeName", "Employee_Name")],
      ["Department", getRowValue(row, "department", "Department")],
      ["Position", getRowValue(row, "position", "Position")],
      ["Q1 - Skills", getRowValue(row, "q1Skills", "Q1_Skills")],
      ["Q1 - Other Skill", getRowValue(row, "q1OtherSkill", "Q1_Other_Skill")],
      ["Q2 - Development", getRowValue(row, "q2Development", "Q2_Development")],
      ["Q3 - Support", getRowValue(row, "q3Support", "Q3_Support")],
      ["Q4 - Comments", getRowValue(row, "q4Comments", "Q4_Comments")],
      ["Submission Date", getRowValue(row, "submissionDate", "Submission_Date")]
    ];

    const content = $("responseDetailContent");
    const modal = $("responseModal");

    if (!content || !modal) return;

    content.innerHTML = fields.map(([label, value]) => `
      <div class="detail-row">
        <strong>${escapeHTML(label)}</strong>
        <p>${escapeHTML(displayValue(value))}</p>
      </div>
    `).join("");

    modal.classList.remove("hidden");
  }

  function closeResponseModal() {
    $("responseModal")?.classList.add("hidden");
  }

  /* ========================================================
     EXPORT DATA PREPARATION
  ======================================================== */

  function getExportRows() {
    return allResponses.map((row, index) => ({
      No: index + 1,

      "Staff ID": getRowValue(row, "staffId", "Staff_ID"),

      "Employee Name": getRowValue(
        row, "employeeName", "Employee_Name"
      ),

      "Department": getRowValue(
        row, "department", "Department"
      ),

      "Position": getRowValue(
        row, "position", "Position"
      ),

      "Q1 Skills": displayValue(
        getRowValue(row, "q1Skills", "Q1_Skills")
      ),

      "Q1 Other Skill": getRowValue(
        row, "q1OtherSkill", "Q1_Other_Skill"
      ),

      "Q2 Development": displayValue(
        getRowValue(row, "q2Development", "Q2_Development")
      ),

      "Q3 Support": displayValue(
        getRowValue(row, "q3Support", "Q3_Support")
      ),

      "Q4 Comments": getRowValue(
        row, "q4Comments", "Q4_Comments"
      ),

      "Submission Date": formatDateTime(
        getRowValue(row, "submissionDate", "Submission_Date")
      )
    }));
  }

  function getSummaryExportRows() {
    const summary = dashboardSummary || {};

    return [
      { Metric: "Survey ID", Value: summary.surveyId || "EPDS-2026" },
      { Metric: "Survey Status", Value: summary.surveyStatus || "-" },
      { Metric: "Total Employees", Value: Number(summary.totalEmployees || 0) },
      { Metric: "Active Employees", Value: Number(summary.activeEmployees || 0) },
      { Metric: "Total Responses", Value: Number(summary.totalResponses || 0) },
      { Metric: "Responded Employees", Value: Number(summary.respondedEmployees || 0) },
      { Metric: "Pending Employees", Value: Number(summary.pendingEmployees || 0) },
      { Metric: "Export Date", Value: formatDateTime(new Date()) }
    ];
  }

  function getAnalyticsExportRows() {
    const analytics = dashboardAnalytics || {};
    const rows = [];

    const groups = [
      ["Departments", analytics.departments ?? analytics.department],
      ["Offices", analytics.offices],
      ["Skills", analytics.skills],
      ["Development", analytics.development],
      ["Support", analytics.support]
    ];

    groups.forEach(([category, data]) => {
      normalizeAggregate(data).forEach(item => {
        rows.push({
          Category: category,
          Name: item.label,
          Count: item.count
        });
      });
    });

    return rows;
  }

  /* ========================================================
     EXPORT ACTION PANEL
     Important: Share must be called directly from a click.
  ======================================================== */

  function getExportActionContainer() {
    let container = $("epdsExportActions");

    if (container) return container;

    container = document.createElement("div");
    container.id = "epdsExportActions";

    container.style.cssText = `
      display:none;
      margin:14px 0;
      padding:14px;
      border:1px solid #d1d5db;
      border-radius:10px;
      background:#f8fafc;
      color:#1f2937;
      font-family:inherit;
    `;

    const anchor = $("exportPdfBtn") || $("exportExcelBtn");

    if (anchor?.parentNode) {
      anchor.parentNode.insertBefore(
        container,
        anchor.nextSibling
      );
    } else {
      const adminView = $("adminView");
      if (adminView) adminView.appendChild(container);
    }

    return container;
  }

  function clearPendingExport() {
    pendingExportFile = null;

    const container = $("epdsExportActions");

    if (container) {
      container.style.display = "none";
      container.innerHTML = "";
    }
  }

  function prepareExportFile(blob, filename, mimeType) {
    clearPendingExport();

    const file = new File(
      [blob],
      filename,
      { type: mimeType }
    );

    pendingExportFile = {
      file,
      blob,
      filename,
      mimeType,
      url: URL.createObjectURL(blob)
    };

    const container = getExportActionContainer();

    container.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px;">
        ឯកសាររួចរាល់៖ ${escapeHTML(filename)}
      </div>

      <div style="font-size:13px;margin-bottom:12px;">
        សូមជ្រើសរើសវិធីរក្សាទុកឯកសារ។
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        <button
          type="button"
          id="epdsShareFileBtn"
          class="btn btn-primary"
        >
          Share / Save to Files
        </button>

        <a
          id="epdsDownloadFileLink"
          class="btn btn-outline"
          href="${pendingExportFile.url}"
          download="${escapeHTML(filename)}"
          style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;"
        >
          Download File
        </a>
      </div>
    `;

    container.style.display = "block";

    $("epdsShareFileBtn")?.addEventListener(
      "click",
      sharePreparedFile
    );

    container.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }

  function sharePreparedFile() {
    if (!pendingExportFile) {
      showMessage(
        "responseMessage",
        "មិនមានឯកសារដែលត្រៀមរួចរាល់ទេ។"
      );
      return;
    }

    const { file, filename } = pendingExportFile;

    // Do not await or perform asynchronous work before this call.
    // This preserves the browser's direct user-activation context.
    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        const sharePromise = navigator.share({
          files: [file],
          title: filename
        });

        sharePromise.then(() => {
          showMessage(
            "responseMessage",
            "បានបើក Share Sheet រួចរាល់។",
            "success"
          );
        }).catch(error => {
          if (error.name === "AbortError") {
            showMessage(
              "responseMessage",
              "អ្នកបានបោះបង់ការចែករំលែកឯកសារ។"
            );
          } else {
            console.error("Share error:", error);

            showMessage(
              "responseMessage",
              "មិនអាចបើក Share Sheet បានទេ។ សូមប្រើ Download File។"
            );
          }
        });

        return;

      } catch (error) {
        console.error("Share error:", error);
      }
    }

    // Fallback for browsers without file sharing.
    downloadPreparedFile();
  }

  function downloadPreparedFile() {
    if (!pendingExportFile) return;

    const link = document.createElement("a");

    link.href = pendingExportFile.url;
    link.download = pendingExportFile.filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    showMessage(
      "responseMessage",
      "បានចាប់ផ្ដើម Download ឯកសាររួចរាល់។",
      "success"
    );
  }

  /* ========================================================
     EXCEL LIBRARY LOADER
  ======================================================== */

  let xlsxLibraryPromise = null;

  function loadXLSXLibrary() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLibraryPromise) return xlsxLibraryPromise;

    xlsxLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src =
        "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";

      script.async = true;

      script.onload = () => {
        if (window.XLSX) {
          resolve(window.XLSX);
        } else {
          xlsxLibraryPromise = null;
          reject(new Error("មិនអាច Load Excel Library បានទេ។"));
        }
      };

      script.onerror = () => {
        xlsxLibraryPromise = null;
        reject(
          new Error(
            "មិនអាចភ្ជាប់ Excel Library បានទេ។ សូមពិនិត្យ Internet។"
          )
        );
      };

      document.head.appendChild(script);
    });

    return xlsxLibraryPromise;
  }

  /* ========================================================
     EXCEL EXPORT (.XLSX)
  ======================================================== */

  async function exportExcel() {
    if (!allResponses.length) {
      showMessage(
        "responseMessage",
        "មិនមានទិន្នន័យសម្រាប់ Export ទេ។"
      );
      return;
    }

    clearPendingExport();

    setButtonLoading(
      "exportExcelBtn",
      true,
      "កំពុងបង្កើត Excel..."
    );

    try {
      const XLSX = await loadXLSXLibrary();
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summarySheet = XLSX.utils.json_to_sheet(
        getSummaryExportRows()
      );

      summarySheet["!cols"] = [
        { wch: 25 },
        { wch: 30 }
      ];

      XLSX.utils.book_append_sheet(
        workbook,
        summarySheet,
        "Summary"
      );

      // Sheet 2: Survey Responses
      const responseSheet = XLSX.utils.json_to_sheet(
        getExportRows()
      );

      responseSheet["!cols"] = [
        { wch: 8 },
        { wch: 16 },
        { wch: 28 },
        { wch: 25 },
        { wch: 22 },
        { wch: 40 },
        { wch: 30 },
        { wch: 35 },
        { wch: 40 },
        { wch: 45 },
        { wch: 22 }
      ];

      XLSX.utils.book_append_sheet(
        workbook,
        responseSheet,
        "Survey Responses"
      );

      // Sheet 3: Analytics
      const analyticsRows = getAnalyticsExportRows();

      const analyticsSheet = XLSX.utils.json_to_sheet(
        analyticsRows.length
          ? analyticsRows
          : [{ Category: "-", Name: "No data", Count: 0 }]
      );

      analyticsSheet["!cols"] = [
        { wch: 20 },
        { wch: 40 },
        { wch: 15 }
      ];

      XLSX.utils.book_append_sheet(
        workbook,
        analyticsSheet,
        "Analytics"
      );

      const excelBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
        compression: true
      });

      const blob = new Blob([excelBuffer], {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      const filename = `EPDS_Report_${getTodayISO()}.xlsx`;

      prepareExportFile(
        blob,
        filename,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      showMessage(
        "responseMessage",
        "បានបង្កើត Excel រួចរាល់។ សូមចុច Share / Save to Files ឬ Download File ខាងក្រោម។",
        "success"
      );

    } catch (error) {
      console.error("Excel Export Error:", error);

      showMessage(
        "responseMessage",
        error.message || "មានបញ្ហាក្នុងការបង្កើត Excel។"
      );

    } finally {
      setButtonLoading("exportExcelBtn", false);
    }
  }

  /* ========================================================
     PDF LIBRARY LOADER
  ======================================================== */

  let pdfLibraryPromise = null;

  function loadPDFLibrary() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (pdfLibraryPromise) return pdfLibraryPromise;

    pdfLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.3/html2pdf.bundle.min.js";

      script.async = true;

      script.onload = () => {
        if (window.html2pdf) {
          resolve(window.html2pdf);
        } else {
          pdfLibraryPromise = null;
          reject(new Error("មិនអាច Load PDF Library បានទេ។"));
        }
      };

      script.onerror = () => {
        pdfLibraryPromise = null;
        reject(
          new Error(
            "មិនអាចភ្ជាប់ PDF Library បានទេ។ សូមពិនិត្យ Internet។"
          )
        );
      };

      document.head.appendChild(script);
    });

    return pdfLibraryPromise;
  }

  /* ========================================================
     KHMER FONT LOADER
  ======================================================== */

  let khmerFontPromise = null;

  function loadKhmerFonts() {
    if (khmerFontPromise) return khmerFontPromise;

    khmerFontPromise = new Promise((resolve, reject) => {
      const fontLink = document.createElement("link");

      fontLink.rel = "stylesheet";
      fontLink.href =
        "https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&family=Noto+Sans+Khmer:wght@400;500;700&display=swap";

      fontLink.onload = async () => {
        try {
          if (document.fonts?.load) {
            await Promise.all([
              document.fonts.load('400 10px "Battambang"', "ភាសាខ្មែរ"),
              document.fonts.load('700 10px "Battambang"', "ភាសាខ្មែរ"),
              document.fonts.load('400 10px "Noto Sans Khmer"', "ភាសាខ្មែរ")
            ]);

            await document.fonts.ready;
          }

          resolve(true);

        } catch (error) {
          console.warn("Khmer font loading warning:", error);
          resolve(false);
        }
      };

      fontLink.onerror = () => {
        khmerFontPromise = null;
        reject(
          new Error(
            "មិនអាច Load Khmer Font បានទេ។ សូមពិនិត្យ Internet។"
          )
        );
      };

      document.head.appendChild(fontLink);
    });

    return khmerFontPromise;
  }

  /* ========================================================
     PDF REPORT HTML
  ======================================================== */

  function buildPDFReportHTML() {
    const summary = dashboardSummary || {};
    const rows = getExportRows();

    const tableRows = rows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHTML(row["Staff ID"])}</td>
        <td>${escapeHTML(row["Employee Name"])}</td>
        <td>${escapeHTML(row["Department"])}</td>
        <td>${escapeHTML(row["Position"])}</td>
        <td>${escapeHTML(row["Q1 Skills"])}</td>
        <td>${escapeHTML(row["Q2 Development"])}</td>
        <td>${escapeHTML(row["Q3 Support"])}</td>
        <td>${escapeHTML(row["Q4 Comments"])}</td>
        <td>${escapeHTML(row["Submission Date"])}</td>
      </tr>
    `).join("");

    const summaryHTML = `
      <div class="summary-grid">
        <div>
          <strong>Survey ID</strong>
          <span>${escapeHTML(summary.surveyId || "EPDS-2026")}</span>
        </div>

        <div>
          <strong>Survey Status</strong>
          <span>${escapeHTML(summary.surveyStatus || "-")}</span>
        </div>

        <div>
          <strong>Total Employees</strong>
          <span>${numberFormat(summary.totalEmployees)}</span>
        </div>

        <div>
          <strong>Active Employees</strong>
          <span>${numberFormat(summary.activeEmployees)}</span>
        </div>

        <div>
          <strong>Total Responses</strong>
          <span>${numberFormat(summary.totalResponses)}</span>
        </div>

        <div>
          <strong>Responded Employees</strong>
          <span>${numberFormat(summary.respondedEmployees)}</span>
        </div>

        <div>
          <strong>Pending Employees</strong>
          <span>${numberFormat(summary.pendingEmployees)}</span>
        </div>
      </div>
    `;

    const analyticsGroups = [
      ["Departments", dashboardAnalytics.departments ?? dashboardAnalytics.department],
      ["Offices", dashboardAnalytics.offices],
      ["Skills", dashboardAnalytics.skills],
      ["Development", dashboardAnalytics.development],
      ["Support", dashboardAnalytics.support]
    ];

    const analyticsHTML = analyticsGroups.map(([title, data]) => {
      const items = normalizeAggregate(data);
      if (!items.length) return "";

      return `
        <section class="analytics-section">
          <h3>${escapeHTML(title)}</h3>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Count</th>
              </tr>
            </thead>

            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${escapeHTML(item.label)}</td>
                  <td>${numberFormat(item.count)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </section>
      `;
    }).join("");

    return `
      <div id="epdsPdfReport">

        <h1>ប្រព័ន្ធស្ទង់មតិការអភិវឌ្ឍសមត្ថភាពបុគ្គលិក</h1>

        <div class="subtitle">
          Employee Development Survey (EPDS)
        </div>

        <div class="meta">
          <span>
            Survey ID:
            ${escapeHTML(summary.surveyId || "EPDS-2026")}
          </span>

          <span>
            Export Date:
            ${escapeHTML(formatDateTime(new Date()))}
          </span>
        </div>

        <h2>សេចក្តីសង្ខេប / Summary</h2>

        ${summaryHTML}

        <h2>លទ្ធផលវិភាគ / Analytics</h2>

        ${analyticsHTML || "<p>No analytics data available.</p>"}

        <h2>ចម្លើយស្ទង់មតិ / Survey Responses</h2>

        <table class="response-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Staff ID</th>
              <th>Employee Name</th>
              <th>Department</th>
              <th>Position</th>
              <th>Q1 Skills</th>
              <th>Q2 Development</th>
              <th>Q3 Support</th>
              <th>Q4 Comments</th>
              <th>Submission Date</th>
            </tr>
          </thead>

          <tbody>${tableRows}</tbody>
        </table>

        <div class="footer">
          Generated by EPDS - Employee Development Survey
        </div>

      </div>
    `;
  }

  /* ========================================================
     PDF EXPORT - KHMER + IOS SHARE
  ======================================================== */

  async function exportPDF() {
    if (!allResponses.length) {
      showMessage(
        "responseMessage",
        "មិនមានទិន្នន័យសម្រាប់ Export ទេ។"
      );
      return;
    }

    clearPendingExport();

    setButtonLoading(
      "exportPdfBtn",
      true,
      "កំពុងបង្កើត PDF..."
    );

    let reportContainer = null;

    try {
      const [html2pdf] = await Promise.all([
        loadPDFLibrary(),
        loadKhmerFonts()
      ]);

      reportContainer = document.createElement("div");

      reportContainer.style.cssText = `
        position:fixed;
        left:0;
        top:0;
        width:1100px;
        background:#ffffff;
        z-index:-9999;
        opacity:0.01;
        pointer-events:none;
      `;

      reportContainer.innerHTML = `
        <style>
          #epdsPdfReport {
            box-sizing:border-box;
            width:1100px;
            padding:25px;
            background:#ffffff;
            color:#1f2937;
            font-family:"Battambang","Noto Sans Khmer",sans-serif;
            font-size:10px;
            line-height:1.6;
          }

          #epdsPdfReport * {
            box-sizing:border-box;
            font-family:"Battambang","Noto Sans Khmer",sans-serif;
          }

          #epdsPdfReport h1 {
            text-align:center;
            font-size:20px;
            margin:0 0 8px;
            line-height:1.7;
          }

          #epdsPdfReport h2 {
            font-size:14px;
            margin:20px 0 10px;
            border-bottom:1px solid #cbd5e1;
            padding-bottom:6px;
          }

          #epdsPdfReport h3 {
            font-size:12px;
          }

          #epdsPdfReport .subtitle {
            text-align:center;
            margin-bottom:18px;
            color:#64748b;
          }

          #epdsPdfReport .meta {
            display:flex;
            justify-content:space-between;
            margin-bottom:15px;
          }

          #epdsPdfReport .summary-grid {
            display:grid;
            grid-template-columns:repeat(4,1fr);
            gap:8px;
          }

          #epdsPdfReport .summary-grid > div {
            border:1px solid #cbd5e1;
            padding:8px;
          }

          #epdsPdfReport .summary-grid strong,
          #epdsPdfReport .summary-grid span {
            display:block;
          }

          #epdsPdfReport .summary-grid span {
            font-size:13px;
            font-weight:bold;
          }

          #epdsPdfReport table {
            width:100%;
            border-collapse:collapse;
            margin-bottom:12px;
            table-layout:auto;
          }

          #epdsPdfReport th,
          #epdsPdfReport td {
            border:1px solid #cbd5e1;
            padding:5px;
            text-align:left;
            vertical-align:top;
            overflow-wrap:anywhere;
            word-break:normal;
          }

          #epdsPdfReport th {
            background:#f1f5f9;
            font-weight:bold;
          }

          #epdsPdfReport .analytics-section {
            margin-bottom:15px;
          }

          #epdsPdfReport .analytics-section table {
            max-width:600px;
          }

          #epdsPdfReport .footer {
            margin-top:20px;
            text-align:right;
            color:#64748b;
          }

          #epdsPdfReport tr {
            page-break-inside:avoid;
          }
        </style>

        ${buildPDFReportHTML()}
      `;

      document.body.appendChild(reportContainer);

      // Wait for Khmer fonts to be available.
      if (document.fonts?.ready) {
        await document.fonts.ready;

        await document.fonts.load(
          '400 10px "Battambang"',
          "ប្រព័ន្ធស្ទង់មតិ"
        );

        await document.fonts.load(
          '700 10px "Battambang"',
          "សមត្ថភាពបុគ្គលិក"
        );
      }

      // Wait for browser layout and font rendering.
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      const reportElement = reportContainer.querySelector(
        "#epdsPdfReport"
      );

      if (!reportElement) {
        throw new Error(
          "មិនអាចបង្កើតផ្ទាំង PDF Report បានទេ។"
        );
      }

      const pdfBlob = await html2pdf()
        .set({
          margin: [8, 8, 8, 8],

          filename: `EPDS_Report_${getTodayISO()}.pdf`,

          image: {
            type: "jpeg",
            quality: 0.98
          },

          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            logging: false,
            windowWidth: 1100,
            letterRendering: true,
            allowTaint: false
          },

          jsPDF: {
            unit: "mm",
            format: "a4",
            orientation: "landscape",
            compress: true
          },

          pagebreak: {
            mode: ["css", "legacy"],
            avoid: ["tr", ".analytics-section"]
          }
        })
        .from(reportElement)
        .toPdf()
        .get("pdf")
        .then(pdf => pdf.output("blob"));

      if (!pdfBlob || pdfBlob.size === 0) {
        throw new Error("PDF ដែលបង្កើតបានទទេ។ សូមព្យាយាមម្ដងទៀត។");
      }

      const filename = `EPDS_Report_${getTodayISO()}.pdf`;

      prepareExportFile(
        pdfBlob,
        filename,
        "application/pdf"
      );

      showMessage(
        "responseMessage",
        "បានបង្កើត PDF រួចរាល់។ សូមចុច Share / Save to Files ឬ Download File ខាងក្រោម។",
        "success"
      );

    } catch (error) {
      console.error("PDF Export Error:", error);

      showMessage(
        "responseMessage",
        error.message || "មានបញ្ហាក្នុងការបង្កើត PDF។"
      );

    } finally {
      if (reportContainer) {
        reportContainer.remove();
      }

      setButtonLoading("exportPdfBtn", false);
    }
  }

  /* ========================================================
     EVENT LISTENERS
  ======================================================== */

  function bindEvents() {
    $("loginForm")?.addEventListener("submit", handleLogin);

    $("changePasswordForm")?.addEventListener(
      "submit",
      handleChangePassword
    );

    $("surveyForm")?.addEventListener(
      "submit",
      handleSurveySubmit
    );

    $("cancelChangePasswordBtn")?.addEventListener("click", logout);

    $("createEmployeeForm")?.addEventListener(
      "submit",
      handleCreateEmployee
    );

    $("employeeSearch")?.addEventListener("input", filterEmployees);

    $("employeesTableBody")?.addEventListener(
      "click",
      handleEmployeeTableClick
    );

    $("employeeLogoutBtn")?.addEventListener("click", logout);
    $("adminLogoutBtn")?.addEventListener("click", logout);

    $("refreshDashboardBtn")?.addEventListener(
      "click",
      loadAdminDashboard
    );

    $("responseSearch")?.addEventListener(
      "input",
      filterResponses
    );

    $("exportPdfBtn")?.addEventListener(
      "click",
      exportPDF
    );

    $("exportExcelBtn")?.addEventListener(
      "click",
      exportExcel
    );

    $("responsesTableBody")?.addEventListener(
      "click",
      event => {
        const button = event.target.closest(
          ".response-detail-btn"
        );

        if (!button) return;

        showResponseDetail(
          Number(button.dataset.index)
        );
      }
    );

    $("closeResponseModalBtn")?.addEventListener(
      "click",
      closeResponseModal
    );

    $("closeModalBackdrop")?.addEventListener(
      "click",
      closeResponseModal
    );

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeResponseModal();
      }
    });
  }

  /* ========================================================
     APP INITIALIZATION
  ======================================================== */

  async function initializeApp() {
    bindEvents();

    if (!restoreSession()) {
      showView("loginView");
      return;
    }

    if (currentUser.role === "EMPLOYEE") {
      if (currentUser.mustChangePassword) {
        showChangePasswordView();
      } else {
        showEmployeeDashboard(currentUser);
      }
      return;
    }

    if (currentUser.role === "ADMIN") {
      await showAdminDashboard(currentUser);
      return;
    }

    logout();
  }

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp
  );

})();

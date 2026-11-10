
/* =========================================================
   EPDS - Employee Development Survey
   Frontend Application v3.0
   Backend: Google Apps Script v3.0

   Features:
   - Employee / Admin Unified Login
   - Employee Account Registration
   - Employee Survey Submission
   - Admin Dashboard & Analytics
   - Response Search & Details
   - Export PDF (Khmer supported via Browser Print)
   - Export Excel (.xlsx)
   - No password or activation code in exports
========================================================= */

(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const API_URL = CONFIG.API_URL;

  const $ = (id) => document.getElementById(id);

  let currentUser = null;
  let currentToken = null;
  let allResponses = [];
  let dashboardSummary = {};
  let dashboardAnalytics = {};

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
    showView("loginView");

    if ($("loginPassword")) $("loginPassword").value = "";
    if ($("loginIdentifier")) $("loginIdentifier").value = "";

    clearMessage("loginMessage");
    clearMessage("responseMessage");
  }

  /* =========================
     LOGIN - AUTOMATIC ROLE
  ========================= */

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

  /* =========================
     EMPLOYEE DASHBOARD
  ========================= */

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
      $("profileDepartment").textContent = user.department || "-";
    }

    if ($("profilePosition")) {
      $("profilePosition").textContent = user.position || "-";
    }

    $("surveyForm")?.reset();
    clearMessage("surveyMessage");

    const submitButton = $("submitSurveyBtn");
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent =
        submitButton.dataset.originalText ||
        "បញ្ជូនចម្លើយ";
    }
  }

  /* =========================
     ACCOUNT REGISTRATION
  ========================= */

  async function handleRegistration(event) {
    event.preventDefault();
    clearMessage("registerMessage");

    const staffId = $("registerStaffId")?.value.trim();
    const activationCode = $("activationCode")?.value.trim();
    const password = $("registerPassword")?.value;
    const confirmPassword = $("confirmPassword")?.value;

    if (!staffId || !activationCode || !password || !confirmPassword) {
      showMessage(
        "registerMessage",
        "សូមបំពេញព័ត៌មានទាំងអស់។"
      );
      return;
    }

    if (password !== confirmPassword) {
      showMessage(
        "registerMessage",
        "Password ទាំងពីរមិនដូចគ្នាទេ។"
      );
      return;
    }

    if (password.length < 8) {
      showMessage(
        "registerMessage",
        "Password ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ។"
      );
      return;
    }

    setButtonLoading(
      "registerBtn",
      true,
      "កំពុងបង្កើតគណនី..."
    );

    try {
      await api("activateAccount", {
        staffId,
        activationCode,
        password
      });

      $("registerForm")?.reset();

      showMessage(
        "registerMessage",
        "បង្កើតគណនីបានជោគជ័យ! សូមចូលប្រើប្រាស់ប្រព័ន្ធ។",
        "success"
      );

      window.setTimeout(() => {
        showView("loginView");

        if ($("loginIdentifier")) {
          $("loginIdentifier").value = staffId;
        }

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

  /* =========================
     ADMIN DASHBOARD
  ========================= */

  async function showAdminDashboard(user) {
    showView("adminView");

    if ($("adminEmail")) {
      $("adminEmail").textContent =
        user.email || "Administrator";
    }

    if ($("adminRole")) {
      $("adminRole").textContent =
        user.adminRole || "HR Admin";
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
      const [summary, analytics, responses] = await Promise.all([
        api("adminSummary", { token: currentToken }),
        api("adminAnalytics", { token: currentToken }),
        api("adminResponses", { token: currentToken })
      ]);

      dashboardSummary = summary || {};
      dashboardAnalytics = analytics || {};
      allResponses = normalizeResponseRows(responses);

      renderSummary(dashboardSummary);
      renderAnalytics(dashboardAnalytics);
      renderResponses(allResponses);

    } catch (error) {
      showMessage("responseMessage", error.message);

      if (
        /token|session|unauthorized|expired/i.test(error.message)
      ) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     SUMMARY CARDS
  ========================= */

  function renderSummary(data) {
    const fields = {
      totalEmployees: data.totalEmployees,
      activeEmployees: data.activeEmployees,
      respondedEmployees: data.respondedEmployees,
      pendingEmployees: data.pendingEmployees,
      totalResponses: data.totalResponses
    };

    Object.entries(fields).forEach(([id, value]) => {
      if ($(id)) {
        $(id).textContent = numberFormat(value);
      }
    });

    if ($("surveyStatus")) {
      $("surveyStatus").textContent =
        data.surveyStatus || "-";
    }

    if ($("surveyId")) {
      $("surveyId").textContent =
        data.surveyId || "EPDS-2026";
    }
  }

  /* =========================
     ANALYTICS
  ========================= */

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
      .filter(item =>
        item.label && Number.isFinite(item.count)
      )
      .sort((a, b) => b.count - a.count);

    if (!items.length) {
      element.innerHTML =
        '<p class="empty-state">មិនទាន់មានទិន្នន័យ</p>';
      return;
    }

    const max = Math.max(
      ...items.map(item => item.count),
      1
    );

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
            <div
              class="progress-fill"
              style="width:${percent}%"
            ></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAnalytics(data) {
    // Backend v3.0 returns "departments" (plural).
    renderAggregate(
      "departmentAnalytics",
      data.departments ?? data.department
    );

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

    tbody.innerHTML = rows.map(row => {
      // Keep the original allResponses index so Details
      // continues to work after filtering/searching.
      const originalIndex = allResponses.indexOf(row);

      return `
        <tr>
          <td>${originalIndex + 1}</td>
          <td>${escapeHTML(
            getRowValue(row, "staffId", "Staff_ID") || "-"
          )}</td>
          <td>${escapeHTML(
            getRowValue(row, "employeeName", "Employee_Name") || "-"
          )}</td>
          <td>${escapeHTML(
            getRowValue(row, "department", "Department") || "-"
          )}</td>
          <td>${escapeHTML(
            getRowValue(row, "position", "Position") || "-"
          )}</td>
          <td>${escapeHTML(
            formatDate(
              getRowValue(row, "submissionDate", "Submission_Date")
            )
          )}</td>
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
    const keyword =
      $("responseSearch")?.value.trim().toLowerCase() || "";

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

  /* =========================
     RESPONSE DETAIL MODAL
  ========================= */

  function showResponseDetail(index) {
    const row = allResponses[index];
    if (!row) return;

    const fields = [
      [
        "Staff ID",
        getRowValue(row, "staffId", "Staff_ID")
      ],
      [
        "Employee Name",
        getRowValue(row, "employeeName", "Employee_Name")
      ],
      [
        "Department",
        getRowValue(row, "department", "Department")
      ],
      [
        "Position",
        getRowValue(row, "position", "Position")
      ],
      [
        "Q1 - Skills",
        getRowValue(row, "q1Skills", "Q1_Skills")
      ],
      [
        "Q1 - Other Skill",
        getRowValue(row, "q1OtherSkill", "Q1_Other_Skill")
      ],
      [
        "Q2 - Development",
        getRowValue(row, "q2Development", "Q2_Development")
      ],
      [
        "Q3 - Support",
        getRowValue(row, "q3Support", "Q3_Support")
      ],
      [
        "Q4 - Comments",
        getRowValue(row, "q4Comments", "Q4_Comments")
      ],
      [
        "Submission Date",
        getRowValue(row, "submissionDate", "Submission_Date")
      ]
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

  /* =========================
     EXPORT DATA PREPARATION
  ========================= */

  function getExportRows() {
    return allResponses.map((row, index) => ({
      No: index + 1,
      "Staff ID": getRowValue(row, "staffId", "Staff_ID"),
      "Employee Name": getRowValue(
        row,
        "employeeName",
        "Employee_Name"
      ),
      "Department": getRowValue(
        row,
        "department",
        "Department"
      ),
      "Position": getRowValue(
        row,
        "position",
        "Position"
      ),
      "Q1 Skills": displayValue(
        getRowValue(row, "q1Skills", "Q1_Skills")
      ),
      "Q1 Other Skill": getRowValue(
        row,
        "q1OtherSkill",
        "Q1_Other_Skill"
      ),
      "Q2 Development": displayValue(
        getRowValue(row, "q2Development", "Q2_Development")
      ),
      "Q3 Support": displayValue(
        getRowValue(row, "q3Support", "Q3_Support")
      ),
      "Q4 Comments": getRowValue(
        row,
        "q4Comments",
        "Q4_Comments"
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

  /* =========================
     EXCEL EXPORT (.XLSX)
  ========================= */

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
          reject(new Error("មិនអាច Load Excel Library បានទេ។"));
        }
      };

      script.onerror = () => {
        xlsxLibraryPromise = null;
        reject(
          new Error(
            "មិនអាចភ្ជាប់ Excel Library បានទេ។ សូមពិនិត្យ Internet របស់អ្នក។"
          )
        );
      };

      document.head.appendChild(script);
    });

    return xlsxLibraryPromise;
  }

  async function exportExcel() {
    if (!allResponses.length) {
      showMessage(
        "responseMessage",
        "មិនមានទិន្នន័យសម្រាប់ Export ទេ។"
      );
      return;
    }

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
      const responseRows = getExportRows();
      const responseSheet = XLSX.utils.json_to_sheet(
        responseRows
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

      const filename =
        `EPDS_Report_${getTodayISO()}.xlsx`;

      XLSX.writeFile(workbook, filename, {
        compression: true
      });

      showMessage(
        "responseMessage",
        "Export Excel បានជោគជ័យ។",
        "success"
      );

    } catch (error) {
      showMessage(
        "responseMessage",
        error.message || "មានបញ្ហាក្នុងការបង្កើត Excel។"
      );
    } finally {
      setButtonLoading("exportExcelBtn", false);
    }
  }

  /* =========================
     PDF EXPORT - KHMER SUPPORT
     Uses browser print engine.
  ========================= */

  function exportPDF() {
    if (!allResponses.length) {
      showMessage(
        "responseMessage",
        "មិនមានទិន្នន័យសម្រាប់ Export ទេ។"
      );
      return;
    }

    const printWindow = window.open(
      "",
      "_blank",
      "width=1200,height=800"
    );

    if (!printWindow) {
      showMessage(
        "responseMessage",
        "Browser បានទប់ស្កាត់ Popup។ សូមអនុញ្ញាត Popup សម្រាប់ Website នេះ រួចសាកល្បងម្ដងទៀត។"
      );
      return;
    }

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
        <div><strong>Survey ID</strong><span>${escapeHTML(summary.surveyId || "EPDS-2026")}</span></div>
        <div><strong>Survey Status</strong><span>${escapeHTML(summary.surveyStatus || "-")}</span></div>
        <div><strong>Total Employees</strong><span>${numberFormat(summary.totalEmployees)}</span></div>
        <div><strong>Active Employees</strong><span>${numberFormat(summary.activeEmployees)}</span></div>
        <div><strong>Total Responses</strong><span>${numberFormat(summary.totalResponses)}</span></div>
        <div><strong>Responded Employees</strong><span>${numberFormat(summary.respondedEmployees)}</span></div>
        <div><strong>Pending Employees</strong><span>${numberFormat(summary.pendingEmployees)}</span></div>
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
          <table class="analytics-table">
            <thead>
              <tr><th>Name</th><th>Count</th></tr>
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

    const documentHTML = `
      <!DOCTYPE html>
      <html lang="km">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <title>EPDS Survey Report</title>

        <link
          href="https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&family=Noto+Sans+Khmer:wght@400;500;700&display=swap"
          rel="stylesheet"
        >

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            font-family: "Noto Sans Khmer", "Battambang", sans-serif;
            color: #1f2937;
            margin: 24px;
            font-size: 11px;
          }

          h1 {
            font-size: 21px;
            text-align: center;
            margin: 0 0 6px;
          }

          .subtitle {
            text-align: center;
            color: #64748b;
            margin-bottom: 22px;
            font-size: 12px;
          }

          h2 {
            font-size: 15px;
            margin: 22px 0 10px;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 6px;
          }

          h3 {
            font-size: 12px;
            margin: 12px 0 6px;
          }

          .report-meta {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
            color: #475569;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
          }

          .summary-grid > div {
            border: 1px solid #dbe2ea;
            border-radius: 5px;
            padding: 9px;
          }

          .summary-grid strong,
          .summary-grid span {
            display: block;
          }

          .summary-grid strong {
            color: #64748b;
            margin-bottom: 4px;
          }

          .summary-grid span {
            font-size: 14px;
            font-weight: 700;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th, td {
            border: 1px solid #cbd5e1;
            padding: 6px;
            text-align: left;
            vertical-align: top;
            overflow-wrap: anywhere;
          }

          th {
            background: #f1f5f9;
            font-weight: 700;
          }

          .analytics-section {
            margin-bottom: 12px;
            break-inside: avoid;
          }

          .analytics-table {
            max-width: 600px;
          }

          .footer {
            margin-top: 24px;
            color: #64748b;
            text-align: right;
            font-size: 10px;
          }

          @page {
            size: A4 landscape;
            margin: 12mm;
          }

          @media print {
            body {
              margin: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .no-print {
              display: none !important;
            }

            thead {
              display: table-header-group;
            }

            tr {
              break-inside: avoid;
            }
          }

          .print-toolbar {
            margin-bottom: 18px;
            padding: 12px;
            background: #f1f5f9;
            border-radius: 6px;
            text-align: center;
          }

          .print-toolbar button {
            padding: 9px 18px;
            border: 0;
            border-radius: 5px;
            background: #2563eb;
            color: white;
            font-size: 13px;
            cursor: pointer;
          }
        </style>
      </head>

      <body>
        <div class="print-toolbar no-print">
          <button onclick="window.print()">
            Print / Save as PDF
          </button>
          <p>
            សូមជ្រើសរើស "Save as PDF" ក្នុង Print Destination
            ដើម្បីរក្សាទុកឯកសារ PDF។
          </p>
        </div>

        <h1>ប្រព័ន្ធស្ទង់មតិការអភិវឌ្ឍសមត្ថភាពបុគ្គលិក</h1>
        <div class="subtitle">
          Employee Development Survey (EPDS) - Report
        </div>

        <div class="report-meta">
          <span>Survey ID: ${escapeHTML(summary.surveyId || "EPDS-2026")}</span>
          <span>Export Date: ${escapeHTML(formatDateTime(new Date()))}</span>
        </div>

        <h2>សេចក្តីសង្ខេប / Summary</h2>
        ${summaryHTML}

        <h2>លទ្ធផលវិភាគ / Analytics</h2>
        ${analyticsHTML || "<p>No analytics data available.</p>"}

        <h2>ចម្លើយស្ទង់មតិ / Survey Responses</h2>

        <table>
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

          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Generated by EPDS - Employee Development Survey
        </div>

        <script>
          window.addEventListener("load", () => {
            document.fonts.ready.then(() => {
              // Keep the print window open for the user.
            });
          });
        <\/script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(documentHTML);
    printWindow.document.close();

    showMessage(
      "responseMessage",
      "បានបើកផ្ទាំង PDF Report។ សូមចុច Print / Save as PDF ដើម្បីរក្សាទុក។",
      "success"
    );
  }

  /* =========================
     EVENT LISTENERS
  ========================= */

  function bindEvents() {
    $("loginForm")?.addEventListener(
      "submit",
      handleLogin
    );

    $("registerForm")?.addEventListener(
      "submit",
      handleRegistration
    );

    $("surveyForm")?.addEventListener(
      "submit",
      handleSurveySubmit
    );

    $("showRegisterBtn")?.addEventListener("click", () => {
      clearMessage("registerMessage");
      showView("registerView");
    });

    $("backToLoginBtn")?.addEventListener("click", () => {
      showView("loginView");
    });

    $("employeeLogoutBtn")?.addEventListener(
      "click",
      logout
    );

    $("adminLogoutBtn")?.addEventListener(
      "click",
      logout
    );

    $("refreshDashboardBtn")?.addEventListener(
      "click",
      loadAdminDashboard
    );

    $("responseSearch")?.addEventListener(
      "input",
      filterResponses
    );

    // New export buttons
    $("exportPdfBtn")?.addEventListener(
      "click",
      exportPDF
    );

    $("exportExcelBtn")?.addEventListener(
      "click",
      exportExcel
    );

    // Old CSV button intentionally has no event listener.

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

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp
  );

})();

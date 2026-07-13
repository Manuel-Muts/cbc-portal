
import { formatDate } from './Utility/date-utils.js';

(function () {
  const API_BASE = config.api.baseURL;

  // ---------------------------
  // STYLES FOR COMPACTNESS
  // ---------------------------
  const compactStyle = document.createElement("style");
  compactStyle.textContent = `
    #feeStructuresTable th, #feeStructuresTable td, 
    #outstandingFeesTable th, #outstandingFeesTable td { padding: 5px 8px !important; font-size: 0.82rem !important; vertical-align: middle; border-bottom: 1px solid #edf2f7; }
    #feeStructuresTable th, #outstandingFeesTable th { background-color: #f8fafc; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.025em; }
    .status-badge { padding: 2px 6px !important; font-size: 0.7rem !important; font-weight: 600 !important; border-radius: 4px !important; display: inline-block; }
    .stat-card { padding: 12px !important; }
    .stat-card p { font-size: 1.3rem !important; }
    .card { padding: 15px !important; }
    .btn { padding: 3px 8px !important; font-size: 0.75rem !important; }
  `;
  document.head.appendChild(compactStyle);

  // ---------------------------
  // Ensure jsPDF and autoTable are loaded for PDF exports
  // ---------------------------
  function resolvePdfLibrary() {
    const jsPDFClass = window.jspdf?.jsPDF || window.jsPDF || null;
    if (!jsPDFClass || typeof jsPDFClass !== 'function') {
      return { jsPDFClass: null, hasAutoTable: false };
    }

    try {
      const tempDoc = new jsPDFClass({ orientation: 'p', unit: 'mm', format: 'a4' });
      return {
        jsPDFClass,
        hasAutoTable: typeof tempDoc?.autoTable === 'function'
      };
    } catch (error) {
      return { jsPDFClass, hasAutoTable: false };
    }
  }

  function isPdfAutoTableReady() {
    return resolvePdfLibrary().hasAutoTable;
  }

  function collectTableData(table) {
    const headers = [];
    const rows = [];
    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
      headerRow.querySelectorAll('th').forEach((th) => {
        headers.push(th.textContent.trim());
      });
    }

    table.querySelectorAll('tbody tr').forEach((tr) => {
      const row = [];
      tr.querySelectorAll('td').forEach((td) => {
        row.push(td.textContent.trim());
      });
      if (row.length) rows.push(row);
    });

    return { headers, rows };
  }

  function getSectionTitleForTable(table) {
    const previous = table.previousElementSibling;
    if (previous && /^H[1-6]$/.test(previous.tagName)) {
      return previous.textContent.trim();
    }
    if (table.closest('#fee-structure-for-pdf')) return 'Fee Structure & Status';
    if (table.closest('#payment-statement-for-pdf')) return 'Payment History';
    return null;
  }

  function drawAccountsWatermark(pdf) {
    const brandingSource = accountsProfileData.schoolLogoBase64 || accountsProfileData.logoSrc || window.schoolInfo?.logo;
    const watermarkSrc = brandingSource;
    if (!watermarkSrc) return;

    try {
      const format = accountsProfileData.logoFormat || 'PNG';
      const imgProps = accountsProfileData.logoProps || pdf.getImageProperties(watermarkSrc);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const width = 90;
      const height = (imgProps.height * width) / imgProps.width;

      pdf.saveGraphicsState();
      pdf.setGState(new pdf.GState({ opacity: 0.05 }));
      pdf.addImage(watermarkSrc, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
      pdf.restoreGraphicsState();
    } catch (e) {
      console.warn('Watermark rendering failed', e);
    }
  }

  function getPdfSummaryLines(contentElement) {
    if (!contentElement) return [];

    return Array.from(contentElement.querySelectorAll('.pdf-summary-card')).map((card) => {
      const title = card.querySelector('.pdf-card-title')?.textContent?.trim();
      const value = card.querySelector('.pdf-card-value')?.textContent?.trim();
      if (title && value) return `${title}: ${value}`;
      return title || '';
    }).filter(Boolean);
  }

  function drawPdfSummaryCards(pdf, contentElement, pageWidth, margin, currentY) {
    const cards = Array.from(contentElement.querySelectorAll('.pdf-summary-card')).map((card) => ({
      title: card.querySelector('.pdf-card-title')?.textContent?.trim(),
      caption: card.querySelector('.pdf-card-caption')?.textContent?.trim(),
      value: card.querySelector('.pdf-card-value')?.textContent?.trim()
    })).filter((card) => card.title && card.value);

    if (!cards.length) return currentY;

    const innerWidth = pageWidth - margin * 2;
    const spacing = 4;
    const halfWidth = (innerWidth - spacing) / 2;
    const fullWidth = innerWidth;

    const bgColor = (title) => {
      if (/receipts|income/i.test(title)) return [219, 234, 254];
      if (/expenses/i.test(title)) return [254, 226, 226];
      if (/net cash/i.test(title)) return [254, 249, 195];
      return [243, 244, 246];
    };

    const textColor = [15, 23, 42];

    const drawCard = (card, x, width, y) => {
      const hasCaption = Boolean(card.caption);
      const cardHeight = hasCaption ? 28 : 22;
      const captionY = y + 18;
      const titleY = y + 8;
      const [r, g, b] = bgColor(card.title);

      pdf.setFillColor(r, g, b);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.3);
      pdf.rect(x, y, width, cardHeight, 'FD');

      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      pdf.text(card.title, x + 6, titleY);
      pdf.text(card.value, x + width - 6, titleY, { align: 'right' });

      if (hasCaption) {
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        pdf.text(card.caption, x + 6, captionY);
      }

      return cardHeight;
    };

    if (cards.length >= 2) {
      const firstHeight = drawCard(cards[0], margin, halfWidth, currentY);
      const secondHeight = drawCard(cards[1], margin + halfWidth + spacing, halfWidth, currentY);
      const rowHeight = Math.max(firstHeight, secondHeight);
      currentY += rowHeight + spacing;
      if (cards[2]) {
        const thirdHeight = drawCard(cards[2], margin, fullWidth, currentY);
        currentY += thirdHeight + spacing;
      }
    } else {
      const height = drawCard(cards[0], margin, fullWidth, currentY);
      currentY += height + spacing;
    }

    return currentY;
  }

  async function generatePdfFromTables(jsPDFClass, contentElement, titleSuffix, customTitle, schoolName) {
    try {
      if (typeof jsPDFClass !== 'function' || !contentElement) return null;

      const pdf = new jsPDFClass('p', 'mm', 'a4');
      const hasAutoTable = typeof pdf.autoTable === 'function';
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 14;
      let yPos = 18;

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text(schoolName, pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      const headerTitleText = contentElement.querySelector('.report-header h2')?.textContent?.trim();
      const titleText = (headerTitleText || customTitle || titleSuffix || 'DOCUMENT').toUpperCase();
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'normal');
      pdf.text(titleText, pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      // Try to extract a dedicated student info block first (preferred),
      // otherwise fall back to any paragraph inside the report header.
      const studentInfoElement = contentElement.querySelector('.report-header .pdf-student-info');
      const studentInfoText = studentInfoElement?.textContent?.trim()
        || contentElement.querySelector('.report-header p')?.textContent?.trim();
      if (studentInfoText) {
        const normalizedText = studentInfoText.replace(/\s+/g, ' ');
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(17, 24, 39);

        const textWidth = pdf.getTextWidth(normalizedText);
        const padding = 4;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = 8;
        const boxX = (pageWidth - boxWidth) / 2;
        const boxY = yPos - 4;

        pdf.setFillColor(227, 242, 253);
        pdf.rect(boxX, boxY, boxWidth, boxHeight, 'F');

        pdf.text(normalizedText, pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;
      }

      const summaryCardCount = contentElement.querySelectorAll('.pdf-summary-card').length;
      if (summaryCardCount) {
        yPos = drawPdfSummaryCards(pdf, contentElement, pageWidth, margin, yPos);
      } else {
        const summaryLines = getPdfSummaryLines(contentElement);
        if (summaryLines.length) {
          pdf.setFontSize(10);
          pdf.setTextColor(30, 41, 59);
          summaryLines.forEach((line) => {
            if (yPos > 280) {
              pdf.addPage();
              yPos = 20;
            }
            pdf.text(line, margin, yPos);
            yPos += 5;
          });
          yPos += 3;
        }
      }

      const tables = Array.from(contentElement.querySelectorAll('table'));
      if (!tables.length) return null;

      tables.forEach((table, index) => {
        const sectionTitle = getSectionTitleForTable(table);
        const { headers, rows } = collectTableData(table);
        if (!headers.length || !rows.length) return;

        if (sectionTitle) {
          if (yPos > 250) {
            pdf.addPage();
            yPos = 18;
          }
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(15, 23, 42);
          pdf.text(sectionTitle, margin, yPos);
          yPos += 7;
        }

        if (hasAutoTable) {
          pdf.autoTable({
            startY: yPos,
            head: [headers],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 9 },
            styles: { fontSize: 9, cellPadding: 3, halign: 'right', textColor: [15, 23, 42], lineColor: [226, 232, 240], lineWidth: 0.2 },
            columnStyles: { 0: { halign: 'left' } },
            margin: { left: margin, right: margin },
            didDrawPage: () => {
              drawAccountsWatermark(pdf);
            }
          });

          yPos = pdf.lastAutoTable.finalY + 8;
        } else {
          pdf.setFontSize(9);
          pdf.setTextColor(15, 23, 42);
          if (sectionTitle) {
            pdf.text(sectionTitle, margin, yPos);
            yPos += 5;
          }
          pdf.text(headers.join(' | '), margin, yPos);
          yPos += 5;
          rows.forEach((row) => {
            if (yPos > 285) {
              pdf.addPage();
              yPos = 20;
            }
            pdf.text(row.join(' | '), margin, yPos);
            yPos += 4.5;
          });
          yPos += 6;
        }
        if (index < tables.length - 1 && yPos > 240) {
          pdf.addPage();
          yPos = 18;
        }
      });

      const pageCount = pdf.internal.getNumberOfPages();
      const servedBy = (userProfile?.name || userProfile?.username || userProfile?.email || 'Unknown').trim();
      const servedText = `Served by: ${servedBy}`;

      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        const footerY = pdf.internal.pageSize.getHeight() - 10;
        pdf.text(`Generated: ${formatDate(new Date(), { withTime: true })}`, margin, footerY);
        pdf.text(servedText, pageWidth / 2, footerY, { align: 'center' });
        pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, footerY, { align: 'right' });
      }

      const baseName = (customTitle || currentStudentDetails?.name || titleSuffix || 'Document').replace(/\s+/g, '_');
      pdf.save(`${baseName}_${titleSuffix}.pdf`);
      return true;
    } catch (e) {
      console.warn('Direct PDF export failed', e);
      return false;
    }
  }

  // ---------------------------
  // Cache State - All as Maps
  // ---------------------------
  let userProfile = null;
  let schoolInfoBootstrapPromise = null;
  let accountsLogoBootstrapPromise = null;
  // Precomputed assets for accounts PDF (logo base64, format, image properties)
  let accountsProfileData = {
    schoolLogoBase64: null,
    logoFormat: null,
    logoProps: null
  };
  let statsCache = new Map();
  let statsLastFetch = 0;
  let feeStructuresCache = new Map();
  let globalNoteCache = new Map();
  let feesLastFetch = 0;
  const schoolInfoCache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Ledger Modal State
  let currentLedgerAdmission = null;
  let currentLedgerName = null;
  let currentLedgerPage = 1;

  // Pagination for Fee Structures
  let feeStructuresPage = 1;
  let feeStructuresCachePage = 1;
  let feeStructuresTotalPages = 1;
  const FEE_STRUCTURES_LIMIT = 10;

  // Pagination for Expenses
  let expensesPage = 1;
  let expensesTotalPages = 1;
  let expensesTotalCount = 0;
  const EXPENSES_LIMIT = 50;
  let currentExpenseBalanceSheetData = {
    academicYear: new Date().getFullYear(),
    term: '',
    category: '',
    totalIncome: 0,
    totalExpenses: 0,
    netCash: 0,
    expenses: []
  };

  // DOM Elements
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // Fee Balance Section DOM Elements
  const outstandingTableBody = document.getElementById("outstandingFeesTableBody");
  const outstandingGradeFilter = document.getElementById("outstandingGradeFilter");
  const outstandingYearFilter = document.getElementById("outstandingYearFilter");
  const outstandingTermFilter = document.getElementById("outstandingTermFilter");
  const outstandingSortFilter = document.getElementById("outstandingSortFilter");
  const outstandingSearchInput = document.getElementById("outstandingSearchInput");
  const outstandingPageInfo = document.getElementById("outstandingPageInfo");
  const outstandingPrevBtn = document.getElementById("outstandingPrevBtn");
  const outstandingNextBtn = document.getElementById("outstandingNextBtn");
  const downloadOutstandingPDF = document.getElementById("downloadOutstandingPDF");

  // Payment Overview Section DOM Elements
  const overviewYearFilter = document.getElementById("overviewYearFilter");
  const overviewTermFilter = document.getElementById("overviewTermFilter");
  const overviewClassFilter = document.getElementById("overviewClassFilter");

  // Fee Structures DOM Elements
  const feeStructuresPageInfo = document.getElementById("feeStructuresPageInfo");
  const feeStructuresPrevBtn = document.getElementById("feeStructuresPrevBtn");
  const feeStructuresNextBtn = document.getElementById("feeStructuresNextBtn");
  const editFeeModal = document.getElementById("editFeeModal");
  const cancelEditFeeBtn = document.getElementById("cancelEditFeeBtn");
  const updateFeeBtn = document.getElementById("updateFeeBtn");
  const openPostFeeBtn = document.getElementById("openPostFeeBtn");
  const postFeeModal = document.getElementById("postFeeModal");
  const cancelPostFeeBtn = document.getElementById("cancelPostFeeBtn");
  const postedFeesYearFilter = document.getElementById("postedFeesYearFilter");
  const postedFeesClassFilter = document.getElementById("postedFeesClassFilter");
  const saveFeeBtn = document.getElementById("saveFeeBtn");
  const downloadAllFeeStructuresBtn = document.getElementById("downloadAllFeeStructuresBtn");

  // Expense Elements
  const expenseModal = document.getElementById("expenseModal");
  const openExpenseModalBtn = document.getElementById("openExpenseModal");
  const closeExpenseModalBtn = document.getElementById("closeExpenseModal");
  const saveExpenseBtn = document.getElementById("saveExpenseBtn");
  const expenseTableBody = document.getElementById("expensesTableBody");
  const expensePageInfo = document.getElementById("expensePageInfo");
  const expensePrevBtn = document.getElementById("expensePrevBtn");
  const expenseNextBtn = document.getElementById("expenseNextBtn");
  const openBalanceSheetModalBtn = document.getElementById("openBalanceSheetModal");
  const balanceSheetModal = document.getElementById("balanceSheetModal");
  const closeBalanceSheetModalBtn = document.getElementById("closeBalanceSheetModal");
  const dlBalanceSheetBtn = document.getElementById("dlBalanceSheetBtn");
  const balanceSheetModalBody = document.getElementById("balanceSheetModalBody");

  // Student Fee Details Modal Elements
  const studentFeeDetailsModal = document.getElementById("studentFeeDetailsModal");
  const studentFeeModalBody = document.getElementById("studentFeeModalBody");
  const closeStudentFeeDetailsBtn = document.getElementById("closeStudentFeeDetailsBtn");
  const dlStructureBtn = document.getElementById("dlStructureBtn");
  const dlStatementBtn = document.getElementById("dlStatementBtn");

  // Global Fee Note Elements
  const globalNoteContent = document.getElementById("globalNoteContent");
  const globalFeeNoteInput = document.getElementById("globalFeeNoteInput");
  const noteYearDisplay = document.getElementById("noteYearDisplay");
  const applyGlobalNoteFiltersBtn = document.getElementById("applyGlobalNoteFilters");
  const editGlobalNoteBtn = document.getElementById("editGlobalNoteBtn");
  const cancelGlobalNoteBtn = document.getElementById("cancelGlobalNoteBtn");
  const saveGlobalNoteBtn = document.getElementById("saveGlobalNoteBtn");
  const globalNoteEditMode = document.getElementById("globalNoteEditMode");
  const globalNoteYearFilter = document.getElementById("globalNoteYearFilter");

  // Pagination for Outstanding Fees
  let outstandingPage = 1;
  let outstandingTotalPages = 1;
  let outstandingCache = new Map();
  const outstandingLimit = 10;

  // Current student details for PDF generation
  let currentStudentDetails = null;

  // ---------------------------
  // HELPERS
  // ---------------------------
  function setupSidebarNavigation() {
    const menuItems = document.querySelectorAll(".sidebar .menu li[data-section]");
    const mainSections = document.querySelectorAll(".main-section");
    menuItems.forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const targetSectionId = item.dataset.section;
        if (!targetSectionId) return;
        
        menuItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        
        mainSections.forEach(section => {
          section.style.display = section.id === targetSectionId ? "block" : "none";
        });
        
        if (targetSectionId === "feesPaymentOverviewSection") {
          loadStats();
        } else if (targetSectionId === "postedFeesSection") {
          loadFeeStructures();
        } else if (targetSectionId === "feeBalanceSection") {
          loadOutstandingFees(1);
        } else if (targetSectionId === "expensesSection") {
          loadExpenses();
        } else if (targetSectionId === "instructionsSection") {
          loadGlobalFeeNote();
        }
      });
    });
  }

  // ---------------------------
  // SCHOOL TYPE & GRADE HELPERS
  // ---------------------------
    const SCHOOL_TYPES = {
        full: {
            label: "Full School (PG-12)",
            gradeOptions: ["PG", "PP1", "PP2", "1","2","3","4","5","6","7","8","9","10","11","12"]
        },
        primary_junior: {
            label: "Primary + Junior ( PG-9)",
            gradeOptions: ["PG", "PP1", "PP2", "1","2","3","4","5","6","7","8","9"]
        },
        senior: {
            label: "Senior School (Grades 10-12)",
            gradeOptions: ["10","11","12"]
        }
    };

  function getSchoolTypeKey() {
    const preferredKeys = ['school-name,schoolType', 'school-all'];

    for (const key of preferredKeys) {
      const schoolInfoEntry = schoolInfoCache.get(key);
      const schoolInfo = schoolInfoEntry ? schoolInfoEntry.data : null;
      if (schoolInfo && schoolInfo.schoolType) {
        const rawType = String(schoolInfo.schoolType).toLowerCase().replace(/[^a-z]/g, '_');
        if (rawType.includes('primary') || rawType.includes('junior')) return 'primary_junior';
        if (rawType.includes('senior')) return 'senior';
        return 'full';
      }
    }

    for (const schoolInfoEntry of schoolInfoCache.values()) {
      const schoolInfo = schoolInfoEntry ? schoolInfoEntry.data : null;
      if (schoolInfo && schoolInfo.schoolType) {
        const rawType = String(schoolInfo.schoolType).toLowerCase().replace(/[^a-z]/g, '_');
        if (rawType.includes('primary') || rawType.includes('junior')) return 'primary_junior';
        if (rawType.includes('senior')) return 'senior';
        return 'full';
      }
    }

    return 'full';
  }

  // ---------------------------
  // SECURE FETCH
  // ---------------------------
  async function secureFetch(url, options = {}) {
    const token = authService.getToken();
    const headers = { ...options.headers, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
    
    let finalUrl = url;
    if (options.query) {
      const queryString = new URLSearchParams(options.query).toString();
      const separator = url.includes("?") ? "&" : "?";
      finalUrl = `${url}${separator}${queryString}`;
    }
    
    const res = await fetch(finalUrl, { ...options, headers });
    if (res.status === 401 || res.status === 403) return authService.redirectToLogin();
    
    const contentType = res.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    
    if (!res.ok) {
      let errorMessage = "Request failed";
      if (isJson) {
        const errorData = await res.json().catch(() => ({ message: "Failed to parse JSON error" }));
        errorMessage = errorData.message || JSON.stringify(errorData);
      } else {
        errorMessage = await res.text();
        if (errorMessage.length > 200) errorMessage = errorMessage.substring(0, 200) + "... (non-JSON error response)";
      }
      throw new Error(errorMessage);
    }
    
    if (!isJson) {
      const textResponse = await res.text();
      throw new Error(`Expected JSON response, but received ${contentType || 'unknown content type'}. Status: ${res.status}.`);
    }
    
    return res.json();
  }

  async function getSchoolInfo(options = {}) {
    const includeLogo = !!options.includeLogo;
    const fieldsQuery = options.fields && options.fields !== 'all' ? options.fields : '';
    const includeLogoFlag = includeLogo ? '_logo' : '';
    const cacheKey = `school-${fieldsQuery || 'default'}${includeLogoFlag}`;
    if (schoolInfoCache.has(cacheKey)) {
      const cached = schoolInfoCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
    }

    if (!schoolInfoBootstrapPromise) {
      schoolInfoBootstrapPromise = (async () => {
        try {
          const queryParams = { includeLogo: 'true' };
          const schoolData = await secureFetch(`${API_BASE}/my-school`, { query: queryParams });
          schoolInfoCache.set('school-default_logo', { timestamp: Date.now(), data: schoolData });
          schoolInfoCache.set('school-default', { timestamp: Date.now(), data: schoolData });
          schoolInfoCache.set('school-name,schoolType', { timestamp: Date.now(), data: schoolData });
          window.schoolInfo = schoolData;
          return schoolData;
        } catch (e) {
          console.error("School info fetch failed", e);
          const fallback = { name: "SCHOOL NAME", schoolType: "full" };
          schoolInfoCache.set('school-default_logo', { timestamp: Date.now(), data: fallback });
          schoolInfoCache.set('school-default', { timestamp: Date.now(), data: fallback });
          schoolInfoCache.set('school-name,schoolType', { timestamp: Date.now(), data: fallback });
          window.schoolInfo = fallback;
          return fallback;
        }
      })();
    }

    const bootstrapped = await schoolInfoBootstrapPromise;
    const requestedCacheKey = `school-${fieldsQuery || 'default'}${includeLogoFlag}`;
    if (!schoolInfoCache.has(requestedCacheKey)) {
      schoolInfoCache.set(requestedCacheKey, { timestamp: Date.now(), data: bootstrapped });
    }
    return schoolInfoCache.get(requestedCacheKey)?.data || bootstrapped;
  }

  // Preload and normalize logo for PDF embedding (similar to `dean.js` logic)
  async function preloadAccountsLogo() {
    try {
      const school = await getSchoolInfo({ fields: 'name,status,logo,logoMimeType,schoolType,', includeLogo: 'true' });
      const brandingSource = school || window.schoolInfo || {};
      const logoCandidate = brandingSource.logo || window.schoolInfo?.logo;
      if (!brandingSource || !logoCandidate) return;

      let logoSrc = logoCandidate;
      if (!logoSrc.startsWith('http') && !logoSrc.startsWith('/') && !logoSrc.startsWith('data:')) {
        const mimeType = school.logoMimeType || 'image/png';
        logoSrc = `data:${mimeType};base64,${logoSrc}`;
      }

      accountsProfileData.logoSrc = logoSrc.startsWith('data:') ? logoSrc : normalizeLogoSrc(logoSrc);

      const base64 = await (async () => {
        if (!accountsProfileData.logoSrc) return null;
        if (accountsProfileData.logoSrc.startsWith('data:')) return accountsProfileData.logoSrc;

        try {
          const response = await fetch(accountsProfileData.logoSrc);
          const blob = await response.blob();
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.warn('Logo conversion failed', error);
          return null;
        }
      })();

      if (!base64) return;

      accountsProfileData.schoolLogoBase64 = base64;
      accountsProfileData.logoFormat = /data:image\/([a-zA-Z+]+);base64,/i.test(base64)
        ? (base64.match(/^data:image\/([a-zA-Z+]+);base64,/i)[1].toUpperCase() === 'JPG' ? 'JPEG' : base64.match(/^data:image\/([a-zA-Z+]+);base64,/i)[1].toUpperCase())
        : 'PNG';

      if (window.jspdf && window.jspdf.jsPDF) {
        try {
          const tempDoc = new window.jspdf.jsPDF();
          accountsProfileData.logoProps = tempDoc.getImageProperties(base64);
        } catch (e) {
          console.warn('Failed to get logo image properties for accounts PDF', e);
        }
      }
    } catch (e) {
      console.warn('preloadAccountsLogo failed', e);
    }
  }

  function normalizeLogoSrc(logoSrc) {
    if (!logoSrc) return null;
    if (logoSrc.startsWith('data:')) return logoSrc;
    if (logoSrc.startsWith('http')) return logoSrc;
    const BACKEND_URL = config.api.baseURL.replace('/api', '');
    return `${BACKEND_URL}${logoSrc.startsWith('/') ? '' : '/'}${logoSrc}`;
  }

  async function bootstrapAccountsSharedData() {
    try {
      const school = await getSchoolInfo({ includeLogo: 'true' });
      if (school?.logo && !accountsProfileData.schoolLogoBase64 && !accountsLogoBootstrapPromise) {
        accountsLogoBootstrapPromise = preloadAccountsLogo();
        await accountsLogoBootstrapPromise;
      }
      return school;
    } catch (error) {
      console.warn('Shared accounts bootstrap failed', error);
      return null;
    }
  }

  // ---------------------------
  // HELPERS - NOTIFICATIONS
  // ---------------------------
  bootstrapAccountsSharedData();
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      color: white;
      font-size: 14px;
      z-index: 999999;
      animation: slideIn 0.3s ease-out;
      pointer-events: none;
    `;
    
    if (type === "success") {
      toast.style.backgroundColor = "#28a745";
    } else if (type === "error") {
      toast.style.backgroundColor = "#dc3545";
    } else {
      toast.style.backgroundColor = "#0078D4";
    }
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = "slideOut 0.3s ease-out";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---------------------------
  // LOAD DASHBOARD DATA
  // ---------------------------
  async function loadDashboardData(forceRefresh = false) {
    if(refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Refreshing...";
    }
    
    if (forceRefresh) {
      console.log('Clearing all caches for dashboard refresh...');
      outstandingCache.clear();
      statsCache.clear();
      feeStructuresCache.clear();
      globalNoteCache.clear();
    }
    
    try {
      await Promise.all([
        loadStats(forceRefresh),
        loadFeeStructures(forceRefresh),
        loadOutstandingFees(1, forceRefresh),
        loadGlobalFeeNote(forceRefresh),
        loadExpenses(forceRefresh)
      ]);
    } catch (err) {
      console.error("Dashboard load error", err);
    } finally {
      if(refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "🔄 Refresh Data";
      }
    }
  }

  // ---------------------------
  // EXPENSES LOGIC
  // ---------------------------
  async function loadExpenses(forceRefresh = false, newPage = 1) {
    const year = document.getElementById("expenseYearFilter")?.value || new Date().getFullYear();
    const term = document.getElementById("expenseTermFilter")?.value || "";
    const category = document.getElementById("expenseCategoryFilter")?.value || "";
    if (!expenseTableBody) return;
    expenseTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
    
    try {
      // Set current page
      expensesPage = newPage;
      
      // Build query parameters
      let queryParams = `academicYear=${year}&page=${expensesPage}&limit=${EXPENSES_LIMIT}`;
      if (term) queryParams += `&term=${encodeURIComponent(term)}`;
      if (category) queryParams += `&category=${encodeURIComponent(category)}`;
      
      const [expenseData, incomeData] = await Promise.all([
        secureFetch(`${API_BASE}/expenses?${queryParams}`),
        secureFetch(`${API_BASE}/reports/school-totals?academicYear=${year}${term ? `&term=${encodeURIComponent(term)}` : ''}`)
      ]);
      
      const expenses = expenseData.data || [];
      const pagination = expenseData.pagination || {};
      const totalIncome = incomeData.totalPaid || 0;
      
      // Update pagination state
      expensesTotalPages = pagination.totalPages || 1;
      expensesTotalCount = pagination.totalCount || 0;
      
      let totalExp = 0;
      
      expenseTableBody.innerHTML = expenses.map(e => {
        totalExp += e.amount;
        return `
          <tr>
            <td>${new Date(e.date).toLocaleDateString()}</td>
            <td><span class="status-badge" style="background:#e2e8f0;">${e.category}</span></td>
            <td>${e.description}</td>
            <td style="text-align:right; font-weight:bold;">KES ${e.amount.toLocaleString()}</td>
            <td><button class="btn danger-btn delete-expense-btn" data-id="${e._id}">Delete</button></td>
          </tr>
        `;
      }).join('');
      
      if(expenses.length === 0) expenseTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No expenses recorded.</td></tr>';
      
      // Update pagination info
      if (expensePageInfo) {
        expensePageInfo.textContent = `Page ${expensesPage} of ${expensesTotalPages} (${expensesTotalCount} total)`;
      }
      
      // Update pagination button states
      if (expensePrevBtn) expensePrevBtn.disabled = expensesPage <= 1;
      if (expenseNextBtn) expenseNextBtn.disabled = expensesPage >= expensesTotalPages;
      
      if(document.getElementById("expenseIncome")) document.getElementById("expenseIncome").textContent = `KES ${totalIncome.toLocaleString()}`;
      if(document.getElementById("expenseTotal")) document.getElementById("expenseTotal").textContent = `KES ${totalExp.toLocaleString()}`;
      
      const balance = totalIncome - totalExp;
      const balanceEl = document.getElementById("netCash");
      if(balanceEl) {
        balanceEl.textContent = `KES ${balance.toLocaleString()}`;
        balanceEl.style.color = balance < 0 ? "#dc3545" : "#28a745";
      }

      currentExpenseBalanceSheetData = {
        academicYear: Number(year),
        term,
        category,
        totalIncome,
        totalExpenses: totalExp,
        netCash: balance,
        expenses
      };
    } catch (err) {
      console.error(err);
      expenseTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error loading expenses.</td></tr>';
    }
  }

  // Global function for deleting expenses
  window.deleteExpense = async (expenseId) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    try {
      await secureFetch(`${API_BASE}/expenses/${expenseId}`, { method: 'DELETE' });
      showToast("Expense deleted successfully", "success");
      loadExpenses(true, 1); // Reset to page 1 after deletion
    } catch (err) {
      console.error("Delete Expense Error:", err);
      showToast("Failed to delete expense", "error");
    }
  };

  if (saveExpenseBtn) {
    saveExpenseBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      const categoryEl = document.getElementById("expCategory");
      const descriptionEl = document.getElementById("expDesc");
      const amountEl = document.getElementById("expAmount");
      const dateEl = document.getElementById("expDate");
      const termEl = document.getElementById("expTerm");
      const yearEl = document.getElementById("expenseYearFilter");

      const payload = {
        category: categoryEl?.value,
        description: descriptionEl?.value,
        amount: Number(amountEl?.value),
        date: dateEl?.value,
        academicYear: Number(yearEl?.value) || new Date().getFullYear(),
        term: termEl?.value
      };

      if (!payload.category || !payload.description || !payload.amount || !payload.date || !payload.academicYear || !payload.term) {
        showToast("Please fill in all required expense fields.", "error");
        return;
      }

      if (payload.amount <= 0) {
        showToast("Expense amount must be greater than zero.", "error");
        return;
      }

      try {
        await secureFetch(`${API_BASE}/expenses`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast("Expense recorded", "success");
        if(expenseModal) {
          expenseModal.classList.remove('visible');
          setTimeout(() => expenseModal.style.display = 'none', 200);
        }
        // Reset form fields
        if (categoryEl) categoryEl.value = "Salaries";
        if (descriptionEl) descriptionEl.value = "";
        if (amountEl) amountEl.value = "";
        if (dateEl) dateEl.value = "";
        loadExpenses(true, 1); // Reset to page 1 after adding
      } catch (err) {
        showToast("Error: " + err.message, "error");
      }
    });
  }

  if (openExpenseModalBtn) {
    openExpenseModalBtn.addEventListener('click', () => {
      if (expenseModal) {
        expenseModal.style.display = "flex";
        requestAnimationFrame(() => expenseModal.classList.add('visible'));
        const expDate = document.getElementById("expDate");
        if (expDate && !expDate.value) {
          const today = new Date();
          // Adjust for timezone offset to ensure the local date is used instead of UTC
          expDate.value = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        }
        
        // Auto-set term based on month
        const month = new Date().getMonth() + 1;
        const expTerm = document.getElementById("expTerm");
        if (expTerm) {
          if (month <= 4) expTerm.value = "Term 1";
          else if (month <= 8) expTerm.value = "Term 2";
          else expTerm.value = "Term 3";
        }
      }
    });
  }

  if (closeExpenseModalBtn) {
    closeExpenseModalBtn.addEventListener('click', () => {
      if (expenseModal) {
        expenseModal.classList.remove('visible');
        setTimeout(() => expenseModal.style.display = 'none', 200);
      }
    });
  }

  if (openBalanceSheetModalBtn) {
    openBalanceSheetModalBtn.addEventListener('click', () => {
      if (!balanceSheetModal || !balanceSheetModalBody) return;
      renderBalanceSheetModal();
      balanceSheetModal.style.display = 'flex';
      requestAnimationFrame(() => balanceSheetModal.classList.add('visible'));
    });
  }

  if (closeBalanceSheetModalBtn) {
    closeBalanceSheetModalBtn.addEventListener('click', () => {
      balanceSheetModal.classList.remove('visible');
      setTimeout(() => balanceSheetModal.style.display = 'none', 200);
    });
  }

  if (dlBalanceSheetBtn) {
    dlBalanceSheetBtn.addEventListener('click', () => {
      runDownloadWithSpinner(dlBalanceSheetBtn, 'balance-sheet-for-pdf', 'Balance_Sheet', 'SCHOOL BALANCE SHEET');
    });
  }

  function renderBalanceSheetModal() {
    if (!balanceSheetModalBody) return;
    const data = currentExpenseBalanceSheetData;
    const categoryLabel = data.category || 'All Categories';
    const termLabel = data.term || 'All Terms';
    const currentDateLabel = formatDate(new Date());

    const expensesRows = data.expenses.map((e) => `
      <tr>
        <td style="padding:8px; border-bottom:1px solid #e2e8f0;">${formatDate(e.date)}</td>
        <td style="padding:8px; border-bottom:1px solid #e2e8f0;">${e.category}</td>
        <td style="padding:8px; border-bottom:1px solid #e2e8f0;">${e.description || '—'}</td>
        <td style="padding:8px; text-align:right; border-bottom:1px solid #e2e8f0;">${formatCurrency(e.amount)}</td>
      </tr>
    `).join('');

    const content = `
      <div id="balance-sheet-for-pdf" class="pdf-report-shell" style="font-family:Arial, sans-serif; color:#1f2937;">
        <div class="report-header pdf-report-header" style="text-align:center; margin-bottom:24px; border-bottom:2px solid #e5e7eb; padding-bottom:12px;">
          <h2 style="margin:0; font-size:22px; letter-spacing:0.03em; white-space:nowrap;">
            SCHOOL BALANCE SHEET&nbsp;<small style="font-size:14px; font-weight:600; color:#4b5563;">AS AT ${currentDateLabel}</small>
          </h2>
          <p style="margin:6px 0 0; font-size:13px;">${data.academicYear} | ${termLabel} | ${categoryLabel}</p>
        </div>

        <div class="pdf-summary-grid" style="margin-bottom:24px;">
          <div class="pdf-summary-card receipt-card" style="padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
            <div class="pdf-summary-card-row">
              <h4 class="pdf-card-title" style="margin:0; font-size:16px; color:#111827;">Receipts / Income</h4>
              <div class="pdf-card-value" style="font-size:20px; font-weight:700; margin:0;">${formatCurrency(data.totalIncome)}</div>
            </div>
            <p class="pdf-card-caption" style="margin:8px 0 0; font-size:14px; color:#6b7280;">Total fees received for this selection.</p>
          </div>
          <div class="pdf-summary-card expense-card" style="padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
            <div class="pdf-summary-card-row">
              <h4 class="pdf-card-title" style="margin:0; font-size:16px; color:#111827;">Expenses</h4>
              <div class="pdf-card-value" style="font-size:20px; font-weight:700; margin:0;">${formatCurrency(data.totalExpenses)}</div>
            </div>
            <p class="pdf-card-caption" style="margin:8px 0 0; font-size:14px; color:#6b7280;">Total expenses recorded for this selection.</p>
          </div>
        </div>

        <div class="pdf-summary-card net-cash" style="padding:16px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:24px;">
          <div class="pdf-summary-card-row" style="justify-content:space-between; align-items:center; gap:12px;">
            <div>
              <h4 class="pdf-card-title" style="margin:0; font-size:16px; color:#111827;">Net Cash Position</h4>
              <p class="pdf-card-caption" style="margin:8px 0 0; font-size:14px; color:#6b7280;">Income minus expenses.</p>
            </div>
            <div class="pdf-card-value" style="font-size:24px; font-weight:800; color:${data.netCash < 0 ? '#b91c1c' : '#047857'};">${formatCurrency(data.netCash)}</div>
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <h4 style="margin:0 0 12px; font-size:16px; color:#111827;">Expense Breakdown</h4>
          <table class="pdf-export-table" style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="background:#f3f4f6; color:#374151; text-align:left;">
                <th style="padding:10px; border:1px solid #e5e7eb;">Date</th>
                <th style="padding:10px; border:1px solid #e5e7eb;">Category</th>
                <th style="padding:10px; border:1px solid #e5e7eb;">Description</th>
                <th style="padding:10px; border:1px solid #e5e7eb; text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${expensesRows || '<tr><td colspan="4" style="padding:14px; text-align:center; color:#6b7280;">No expenses recorded for this selection.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    balanceSheetModalBody.innerHTML = content;
  }

  // ---------------------------
  // STATS & CHART
  // ---------------------------
  async function loadStats(forceRefresh = false) {
    const grade = overviewClassFilter?.value || "";
    const year = overviewYearFilter?.value || new Date().getFullYear();
    const term = overviewTermFilter?.value || "";
    
    // Show loading state on cards
    const cardIds = ["totalLearners", "totalExpected", "totalPaid", "totalBalance"];
    cardIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span style="font-size: 0.8rem; color: #94a3b8;">Updating...</span>';
    });

    const cacheKey = `stats_${grade}_${year}_${term}`;
    
    if (!forceRefresh && statsCache.has(cacheKey)) {
      const cached = statsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        updateOverviewCards(cached.data, {
           grade: grade || "All Grades",
          year: year,
          term: term || "Annual"
        });
        drawOverviewChart(cached.data);
        return;
      }
    }
    
    try {
      const params = { academicYear: year };
      if (grade) params.grade = grade;
      if (term) params.term = term;
      
      const data = await secureFetch(`${API_BASE}/reports/school-overview-stats`, { query: params });
      statsCache.set(cacheKey, { data, timestamp: Date.now() });
      
      updateOverviewCards(data, {
        grade: grade || "All Grades",
        year: year,
        term: term || "Annual"
      });
      drawOverviewChart(data);
    } catch (err) {
      console.error('Load stats error', err);
      cardIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "Error";
      });
    }
  }

  function updateOverviewCards(stats, context) {
    const totalLearners = stats.totalLearners || 0;
    const totalExpected = stats.totalExpectedFees || 0;
    const totalPaid = stats.totalPaid || 0;
    const totalBalance = (stats.totalOutstandingBalance !== undefined) ? stats.totalOutstandingBalance : (totalExpected - totalPaid);
    
    if (document.getElementById("totalLearners")) document.getElementById("totalLearners").textContent = totalLearners.toLocaleString();
    if (document.getElementById("totalExpected")) document.getElementById("totalExpected").textContent = `KES ${(totalExpected || 0).toLocaleString()}`;
    if (document.getElementById("totalPaid")) document.getElementById("totalPaid").textContent = `KES ${totalPaid.toLocaleString()}`;
    if (document.getElementById("totalBalance")) document.getElementById("totalBalance").textContent = `KES ${totalBalance.toLocaleString()}`;

    // Update Card Headers to reflect current filters
    const headers = document.querySelectorAll(".stat-card h4");
    headers.forEach(h => {
      if (!h.dataset.original) h.dataset.original = h.textContent;
      h.textContent = `${h.dataset.original} (${context.term})`;
    });
  }

  function drawOverviewChart(stats) {
    const canvas = document.getElementById("feesChart");
    if(!canvas) return;
    
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const expected = stats.totalExpected || 0;
    const paid = stats.totalPaid || 0;
    const balance = expected - paid;
    const max = Math.max(expected, paid, balance) || 1;
    const barWidth = 60;
    const base = canvas.height - 20;
    
    function bar(x, val, label, color) {
      const h = (val / max) * (canvas.height - 40);
      ctx.fillStyle = color;
      ctx.fillRect(x, base - h, barWidth, h);
      ctx.fillStyle = "#333";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, x + barWidth/2, base + 15);
      ctx.fillStyle = "#000";
      ctx.fillText(val.toLocaleString(), x + barWidth/2, base - h - 5);
    }
    
    bar(50, expected, "Expected", "#0078D4");
    bar(150, paid, "Paid", "#28a745");
    bar(250, balance, "Balance", "#dc3545");
  }

  // ---------------------------
  // FEE STRUCTURES LOGIC
  // ---------------------------
  async function loadFeeStructures(forceRefresh = false, page = feeStructuresPage) {
    try {
      const year = postedFeesYearFilter?.value || new Date().getFullYear();
      const grade = postedFeesClassFilter?.value || "";
      
      const cacheKey = `feeStructures_${year}_${grade}_p${page}`;
      
      if (!forceRefresh && feeStructuresCache.has(cacheKey)) {
        const cached = feeStructuresCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          renderFeeStructures(cached.data);
          updateFeeStructuresPaginationControls();
          return;
        }
      }
      
      const query = new URLSearchParams({ page, limit: FEE_STRUCTURES_LIMIT });
      if (year) query.append("academicYear", year);
      if (grade) query.append("grade", grade);
      
      const payload = await secureFetch(`${API_BASE}/accounts/fee-structures?${query.toString()}`);
      const list = Array.isArray(payload) ? payload : payload.data || [];
      const pagination = payload.pagination || {};
      
      feeStructuresCache.set(cacheKey, { data: list, pagination, timestamp: Date.now() });
      
      feeStructuresTotalPages = pagination.totalPages || 1;
      feeStructuresPage = pagination.page || page;
      
      renderFeeStructures(list);
      updateFeeStructuresPaginationControls();
    } catch (err) {
      console.error('Load fee structures error', err);
    }
  }

  function renderFeeStructures(list) {
    const tbody = document.getElementById('feeStructuresTableBody');
    if (!tbody) return;
    
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">No fee structures posted yet.</td></tr>';
      return;
    }
    
    tbody.innerHTML = list.map(f => `
      <tr>
        <td><strong>${f.grade}</strong></td>
        <td>${f.academicYear}</td>
        <td>KES ${(f.term1Fee || 0).toLocaleString()}</td>
        <td>KES ${(f.term2Fee || 0).toLocaleString()}</td>
        <td>KES ${(f.term3Fee || 0).toLocaleString()}</td>
        <td><strong>KES ${(f.totalFee || 0).toLocaleString()}</strong></td>
        <td style="white-space: nowrap;">
          <button class="btn secondary-btn edit-fee-btn" data-id="${f._id}">Edit</button>
          <button class="btn danger-btn delete-fee-btn" data-id="${f._id}">Delete</button>
        </td>
      </tr>
    `).join('');
    
    tbody.querySelectorAll('.edit-fee-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const fee = list.find(item => item._id === id);
        if (fee) openEditFeeModal(fee);
      });
    });
    
    tbody.querySelectorAll('.delete-fee-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(confirm("Delete this fee structure?")) {
          await secureFetch(`${API_BASE}/accounts/fee-structure/${btn.dataset.id}`, { method: 'DELETE' });
          loadFeeStructures(true);
          statsCache.clear();
          loadStats(true);
        }
      });
    });
  }

  function updateFeeStructuresPaginationControls() {
    if (feeStructuresPageInfo) {
      feeStructuresPageInfo.textContent = `Page ${feeStructuresPage} of ${feeStructuresTotalPages}`;
    }
    if (feeStructuresPrevBtn) {
      feeStructuresPrevBtn.disabled = feeStructuresPage <= 1;
    }
    if (feeStructuresNextBtn) {
      feeStructuresNextBtn.disabled = feeStructuresPage >= feeStructuresTotalPages;
    }
  }

  if (feeStructuresPrevBtn) {
    feeStructuresPrevBtn.addEventListener('click', () => {
      if (feeStructuresPage > 1) {
        feeStructuresPage -= 1;
        loadFeeStructures(false);
      }
    });
  }
  if (feeStructuresNextBtn) {
    feeStructuresNextBtn.addEventListener('click', () => {
      if (feeStructuresPage < feeStructuresTotalPages) {
        feeStructuresPage += 1;
        loadFeeStructures(false);
      }
    });
  }

  // ---------------------------
  // OUTSTANDING FEES LOGIC
  // ---------------------------
  async function loadOutstandingFees(page = 1, forceRefresh = false) {
    if (!outstandingTableBody) {
      console.error("Error: outstandingFeesTableBody element not found in the DOM.");
      return;
    }
    outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';
    
    const grade = outstandingGradeFilter?.value || "";
    const year = outstandingYearFilter?.value || new Date().getFullYear();
    const term = outstandingTermFilter?.value || getCurrentTerm();
    const sort = outstandingSortFilter?.value || "balance_desc";
    const search = outstandingSearchInput?.value.trim() || "";
    
    const cacheKey = `outstanding_${grade}_${year}_${term}_${sort}_${search}_p${page}`;
    
    if (!forceRefresh && outstandingCache.has(cacheKey)) {
      const cached = outstandingCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('Using cached outstanding fees');
        renderOutstandingTable(cached.data.students || []);
        outstandingPage = cached.data.currentPage || 1;
        outstandingTotalPages = cached.data.totalPages || 1;
        updateOutstandingPagination();
        return;
      }
    }
    
    const query = new URLSearchParams({ academicYear: year, limit: outstandingLimit, page });
    if (grade) query.append("class", grade);
    if (term) query.append("term", term);
    if (sort) query.append("sort", sort);
    if (search) query.append("name", search);
    // Add cache-busting parameter if force refresh
    if (forceRefresh) query.append("_t", Date.now());
    
    try {
      console.log(`Fetching outstanding fees (forceRefresh=${forceRefresh})...`);
      const data = await secureFetch(`${API_BASE}/reports/outstanding-fees?${query.toString()}`);
      console.log('Outstanding fees data received:', data.students?.length || 0, 'students');
      outstandingCache.set(cacheKey, { data, timestamp: Date.now() });
      
      renderOutstandingTable(data.students || []);
      outstandingPage = data.currentPage || 1;
      outstandingTotalPages = data.totalPages || 1;
      updateOutstandingPagination();
    } catch (err) {
      console.error('Error loading outstanding fees:', err);
      outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Error loading data.</td></tr>';
    }
  }

  function updateOutstandingPagination() {
    if (outstandingPageInfo) outstandingPageInfo.textContent = `Page ${outstandingPage} of ${outstandingTotalPages}`;
    if (outstandingPrevBtn) outstandingPrevBtn.disabled = outstandingPage <= 1;
    if (outstandingNextBtn) outstandingNextBtn.disabled = outstandingPage >= outstandingTotalPages;
  }

  function renderOutstandingTable(accounts) {
    if (accounts.length === 0) {
      outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No students with outstanding balances found.</td></tr>';
      return;
    }
    const selectedTerm = outstandingTermFilter?.value || '';
    const selectedTermKey = selectedTerm ? selectedTerm.toLowerCase().replace(/\s+/g, '') : null;

    outstandingTableBody.innerHTML = accounts.map(s => {
      const totalFee = Number(s.expected ?? s.totalFee ?? 0);
      const paidAmount = Number(s.totalPaid ?? s.paid ?? 0);
      let balance = Number(s.balance ?? (totalFee - paidAmount));
      if (!Number.isFinite(balance)) balance = 0;

      const termFee = selectedTermKey ? getNumeric(s.termBalances?.[selectedTermKey]?.fee ?? 0) : totalFee;
      const termPaid = selectedTermKey ? getNumeric(s.termBalances?.[selectedTermKey]?.paid ?? 0) : paidAmount;
      const termBalance = selectedTermKey ? getNumeric(s.termBalances?.[selectedTermKey]?.balance ?? 0) : balance;
      if (termBalance <= 0) return '';

      const safeName = (s.studentName || s.name || 'Unknown').replace(/'/g, "&apos;");
      let studentId = s.studentId;
      if (studentId && typeof studentId === 'object') studentId = studentId._id;
      if (!studentId) studentId = s._id;

      const admission = s.admission || s.admissionNo || '';
      let statusBadge = '';

      if (termBalance <= 0) {
        statusBadge = `<span class="status-badge status-paid" style="background:#d1fae5; color:#065f46;">Paid</span>`;
      } else if (termPaid > 0 && termBalance > 0) {
        statusBadge = `<span class="status-badge status-partial" style="background:#fef3c7; color:#92400e;">Partial</span>`;
      } else {
        statusBadge = `<span class="status-badge status-unpaid" style="background:#fee2e2; color:#991b1b;">Unpaid</span>`;
      }

      const term1Fee = getNumeric(s.termBalances?.term1?.fee ?? s.termBalances?.term1?.amount ?? 0);
      const term2Fee = getNumeric(s.termBalances?.term2?.fee ?? s.termBalances?.term2?.amount ?? 0);
      const term3Fee = getNumeric(s.termBalances?.term3?.fee ?? s.termBalances?.term3?.amount ?? 0);
      const totalFeeValue = getNumeric(s.termBalances?.term1?.fee ?? s.termBalances?.term2?.fee ?? s.termBalances?.term3?.fee ?? totalFee);
      return `
        <tr>
          <td>${admission}</td>
          <td>${safeName}</td>
          <td>${s.className || s.grade || '-'}</td>
          <td style="text-align: right; font-weight: bold; color: #dc3545;">KES ${termBalance.toLocaleString()}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td style="text-align: center;"><button class="btn secondary-btn view-fee-btn" data-id="${studentId}" data-admission="${admission}" data-name="${safeName}" data-grade="${s.className || s.grade || ''}" data-expected="${termFee}" data-paid="${termPaid}" data-balance="${termBalance}" data-term1fee="${term1Fee}" data-term2fee="${term2Fee}" data-term3fee="${term3Fee}" data-totalfee="${totalFeeValue}">View</button></td>
        </tr>
      `;
    }).join('');
  }

  if (outstandingTableBody) {
    outstandingTableBody.addEventListener('click', async (e) => {
      if (e.target.classList.contains('view-fee-btn')) {
        const btn = e.target;
        await openStudentFeeDetails(btn.dataset.id, btn.dataset.admission, btn.dataset.name, btn.dataset.grade, {
          expected: btn.dataset.expected,
          paid: btn.dataset.paid,
          balance: btn.dataset.balance,
          term1Fee: btn.dataset.term1fee,
          term2Fee: btn.dataset.term2fee,
          term3Fee: btn.dataset.term3fee,
          totalFee: btn.dataset.totalfee
        });
      }
    });
  }

  const getNumeric = (val) => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'object') {
      if ('amount' in val) return Number(val.amount) || 0;
      if ('fee' in val) return Number(val.fee) || 0;
      if ('value' in val) return Number(val.value) || 0;
      return 0;
    }
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^0-9.\-]/g, '');
      return Number(cleaned) || 0;
    }
    if (typeof val === 'number') return val;
    return 0;
  };

  const formatCurrency = (value) => {
    const numericValue = getNumeric(value);
    return `KES ${Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'}`;
  };

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      try {
        authService.logout();
      } catch (e) {
        console.error("Logout error:", e);
      }
    });
  }

  async function openStudentFeeDetails(studentId, admission, studentName, grade, summaryData = {}) {
    studentFeeModalBody.innerHTML = '<div style="text-align:center; padding:20px;">Loading details...</div>';
    studentFeeDetailsModal.style.display = 'flex';
    requestAnimationFrame(() => studentFeeDetailsModal.classList.add('visible'));
    
    const year = outstandingYearFilter?.value || new Date().getFullYear();
    // Store full student details for use in exports and metadata
    currentStudentDetails = { name: studentName, adm: admission, grade: grade, year };
    
    if (!admission) {
      studentFeeModalBody.innerHTML = '<div style="color:red; text-align:center;">Error: Missing Admission Number</div>';
      return;
    }
    
    try {
      const matchesGrade = (candidate, target) => {
        const normalize = (value) => String(value || '').trim().replace(/^Grade\s+/i, '').replace(/\s+/g, '');
        const left = normalize(candidate);
        const right = normalize(target);

        // direct equality or Grade wrapper
        if (left === right || `Grade ${left}` === right || left === `Grade ${right}`) return true;

        // handle class sections like '10A' vs '10' by comparing numeric parts
        const leftDigits = (left.match(/\d+/) || [])[0] || '';
        const rightDigits = (right.match(/\d+/) || [])[0] || '';
        if (leftDigits && rightDigits && leftDigits === rightDigits) return true;

        // handle startsWith/includes (e.g., '10' matches '10A' or '10A' matches '10')
        if (left && right && (left.startsWith(right) || right.startsWith(left))) return true;

        return false;
      };

      let statement = null;
      let ledgerPayload = null;
      let feeStructuresPayload = null;

      try {
        statement = await secureFetch(`${API_BASE}/accounts/student-fee-statement/${admission}?academicYear=${year}${grade ? `&grade=${encodeURIComponent(grade)}` : ''}`);
      } catch (err) {
        console.warn('Fee statement endpoint failed, falling back to ledger data.', err);
      }

      if (!statement) {
        try {
          ledgerPayload = await secureFetch(`${API_BASE}/users/ledger/${admission}`);
        } catch (err) {
          console.warn('Ledger fallback failed.', err);
        }

        try {
          feeStructuresPayload = await secureFetch(`${API_BASE}/accounts/fee-structures?limit=1000`);
        } catch (err) {
          console.warn('Fee structure fallback failed.', err);
        }
      }

      const feeList = Array.isArray(feeStructuresPayload)
        ? feeStructuresPayload
        : Array.isArray(feeStructuresPayload?.data)
          ? feeStructuresPayload.data
          : [];

      const directFeeStructure = statement?.feeStructure && Object.keys(statement.feeStructure).length
        ? statement.feeStructure
        : null;
      let fallbackFeeStructure = feeList.find((item) => Number(item.academicYear) === Number(year) && matchesGrade(item.grade, grade)) || null;
      // If not found, try looser matching by comparing numeric grade parts or includes
      if (!fallbackFeeStructure && grade) {
        const gradeDigits = (String(grade).match(/\d+/) || [])[0] || '';
        fallbackFeeStructure = feeList.find((item) => {
          if (Number(item.academicYear) !== Number(year)) return false;
          if (!item.grade) return false;
          const g = String(item.grade);
          if (matchesGrade(g, grade)) return true;
          const gDigits = (g.match(/\d+/) || [])[0] || '';
          if (gradeDigits && gDigits && gradeDigits === gDigits) return true;
          if (g.toLowerCase().includes(String(grade).toLowerCase()) || String(grade).toLowerCase().includes(g.toLowerCase())) return true;
          return false;
        }) || null;
      }
      const hasRowFeeSource = summaryData.term1Fee !== undefined || summaryData.term2Fee !== undefined || summaryData.term3Fee !== undefined || summaryData.totalFee !== undefined;
      const rowFeeStructure = hasRowFeeSource
        ? {
            term1Fee: getNumeric(summaryData.term1Fee),
            term2Fee: getNumeric(summaryData.term2Fee),
            term3Fee: getNumeric(summaryData.term3Fee),
            totalFee: getNumeric(summaryData.totalFee || summaryData.expected)
          }
        : null;
      const matchedFeeStructure = {
        term1Fee: rowFeeStructure?.term1Fee ?? directFeeStructure?.term1Fee ?? fallbackFeeStructure?.term1Fee ?? 0,
        term2Fee: rowFeeStructure?.term2Fee ?? directFeeStructure?.term2Fee ?? fallbackFeeStructure?.term2Fee ?? 0,
        term3Fee: rowFeeStructure?.term3Fee ?? directFeeStructure?.term3Fee ?? fallbackFeeStructure?.term3Fee ?? 0,
        totalFee: rowFeeStructure?.totalFee ?? directFeeStructure?.totalFee ?? fallbackFeeStructure?.totalFee ?? getNumeric(summaryData.totalFee || summaryData.expected || 0)
      };

      const feePayload = matchedFeeStructure?.feeStructure || matchedFeeStructure;
      const fees = feePayload || { term1Fee: 0, term2Fee: 0, term3Fee: 0, totalFee: 0 };
      const normalizedFees = {
        term1Fee: getNumeric(fees.term1Fee ?? fees.term1 ?? fees.Term1 ?? fees.term1Amount ?? (fees.term1 && fees.term1.amount) ?? 0),
        term2Fee: getNumeric(fees.term2Fee ?? fees.term2 ?? fees.Term2 ?? fees.term2Amount ?? (fees.term2 && fees.term2.amount) ?? 0),
        term3Fee: getNumeric(fees.term3Fee ?? fees.term3 ?? fees.Term3 ?? fees.term3Amount ?? (fees.term3 && fees.term3.amount) ?? 0),
        totalFee: getNumeric(fees.totalFee ?? fees.total ?? fees.Total ?? fees.amount ?? fees.fee ?? 0)
      };
      if (!normalizedFees.totalFee && (normalizedFees.term1Fee || normalizedFees.term2Fee || normalizedFees.term3Fee)) {
        normalizedFees.totalFee = normalizedFees.term1Fee + normalizedFees.term2Fee + normalizedFees.term3Fee;
      }
      const payments = Array.isArray(statement?.payments)
        ? statement.payments
        : Array.isArray(ledgerPayload?.payments)
          ? ledgerPayload.payments.filter((payment) => Number(payment.academicYear) === Number(year))
          : [];
      const totals = statement?.totals || {};
      const termPaid = { "Term 1": 0, "Term 2": 0, "Term 3": 0 };
      payments.forEach((payment) => {
        const amount = Number(payment.amount || payment.totalAmount || 0);
        if (termPaid[payment.term] !== undefined) {
          termPaid[payment.term] += amount;
        }
      });

      const paymentTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || payment.totalAmount || 0), 0);
      const totalPaid = Number(summaryData.paid ?? totals.totalPaid ?? paymentTotal ?? 0);
      const totalPaidFromTerms = termPaid["Term 1"] + termPaid["Term 2"] + termPaid["Term 3"];
      const calculatedTotalFee = normalizedFees.term1Fee + normalizedFees.term2Fee + normalizedFees.term3Fee;
      const totalBalance = calculatedTotalFee - totalPaidFromTerms;
      const unpaidAmount = Math.max(totalBalance, 0);
      
      let content = `
        <div id="fee-details-content" class="pdf-report-shell">
          <div class="report-header pdf-report-header" style="text-align:center; margin-bottom:24px; border-bottom: 2px solid #d1d5db; padding-bottom: 12px;">
            <h2 style="margin:0; font-size:24px; letter-spacing:0.05em; color:#111827;">FEE STATEMENT</h2>
            <div class="pdf-student-info" style="margin:8px 0 4px; font-size:14px; color:#374151;">
              <strong class="pdf-student-name">${studentName}</strong>
              <span class="pdf-student-meta"> | Adm: ${admission} |  ${grade} |  ${year}</span>
            </div>
          </div>

          <div id="fee-structure-for-pdf" style="margin-bottom: 28px;">
            <h4 class="pdf-section-title" style="border-bottom: 1px solid #d1d5db; padding-bottom: 8px; margin-bottom: 14px; font-size:16px; color:#111827;">Fee Structure & Status</h4>
            <table class="pdf-export-table" style="width:100%; border-collapse:collapse; font-size: 15px; margin-bottom: 18px;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="padding:10px; text-align:left; border:1px solid #d1d5db; font-size:14px;">Term</th>
                  <th style="padding:10px; text-align:right; border:1px solid #d1d5db; font-size:14px;">Fee</th>
                  <th style="padding:10px; text-align:right; border:1px solid #d1d5db; font-size:14px;">Paid</th>
                  <th style="padding:10px; text-align:right; border:1px solid #d1d5db; font-size:14px;">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:12px; border:1px solid #d1d5db; font-size:14px;">Term 1</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-size:14px;">${formatCurrency(normalizedFees.term1Fee || 0)}</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-size:14px;">${formatCurrency(termPaid["Term 1"])}</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-weight:700; font-size:14px;">${formatCurrency((normalizedFees.term1Fee || 0) - termPaid["Term 1"])}</td>
                </tr>
                <tr>
                  <td style="padding:12px; border:1px solid #d1d5db; font-size:14px;">Term 2</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-size:14px;">${formatCurrency(normalizedFees.term2Fee || 0)}</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-size:14px;">${formatCurrency(termPaid["Term 2"])}</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-weight:700; font-size:14px;">${formatCurrency((normalizedFees.term2Fee || 0) - termPaid["Term 2"])}</td>
                </tr>
                <tr>
                  <td style="padding:12px; border:1px solid #d1d5db; font-size:14px;">Term 3</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-size:14px;">${formatCurrency(normalizedFees.term3Fee || 0)}</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-size:14px;">${formatCurrency(termPaid["Term 3"])}</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-weight:700; font-size:14px;">${formatCurrency((normalizedFees.term3Fee || 0) - termPaid["Term 3"])}</td>
                </tr>
                <tr style="background:#f3f4f6; font-weight:700;">
                  <td style="padding:12px; border:1px solid #d1d5db; font-size:14px;">TOTAL</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-size:14px;">${formatCurrency(calculatedTotalFee)}</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; font-size:14px;">${formatCurrency(totalPaidFromTerms)}</td>
                  <td style="padding:12px; text-align:right; border:1px solid #d1d5db; color:${totalBalance > 0 ? '#dc3545' : '#16a34a'}; font-size:14px;">${formatCurrency(totalBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div id="payment-statement-for-pdf" style="margin-bottom: 28px;">
            <h4 class="pdf-section-title" style="border-bottom: 1px solid #d1d5db; padding-bottom: 8px; margin-bottom: 14px; font-size:16px; color:#111827;">Payment History</h4>
            <table class="pdf-export-table" style="width:100%; border-collapse:collapse; font-size: 15px;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="padding:10px; text-align:left; border-bottom:1px solid #d1d5db; font-size:14px;">Date</th>
                  <th style="padding:10px; text-align:left; border-bottom:1px solid #d1d5db; font-size:14px;">Reference</th>
                  <th style="padding:10px; text-align:left; border-bottom:1px solid #d1d5db; font-size:14px;">Method</th>
                  <th style="padding:10px; text-align:left; border-bottom:1px solid #d1d5db; font-size:14px;">Term</th>
                  <th style="padding:10px; text-align:right; border-bottom:1px solid #d1d5db; font-size:14px;">Amount</th>
                </tr>
              </thead>
              <tbody>
      `;
      
      if (payments.length === 0) {
        content += `<tr><td colspan="5" style="text-align:center; padding:14px; font-size:14px;">No payments recorded for this year.</td></tr>`;
      } else {
        payments.forEach((payment) => {
          const paymentDate = payment.createdAt ? formatDate(payment.createdAt) : '—';
          const paymentAmount = Number(payment.amount || payment.totalAmount || 0);
          content += `
            <tr>
              <td style="padding:12px; border-bottom:1px solid #e5e7eb;">${paymentDate}</td>
              <td style="padding:12px; border-bottom:1px solid #e5e7eb;">${payment.reference || '—'}</td>
              <td style="padding:12px; border-bottom:1px solid #e5e7eb;">${payment.method || '—'}</td>
              <td style="padding:12px; border-bottom:1px solid #e5e7eb;">${payment.term || '—'}</td>
              <td style="padding:12px; border-bottom:1px solid #e5e7eb; text-align:right;">${formatCurrency(paymentAmount)}</td>
            </tr>
          `;
        });
      }
      
      content += `
              </tbody>
            </table>
          </div>
        </div>
      `;
      
      // Prepend debug panel so it's visible in modal when debugging
      try {
        studentFeeModalBody.innerHTML = (typeof debugHtml !== 'undefined' ? debugHtml : '') + content;
      } catch (e) {
        // Fallback to plain content if debug injection fails
        studentFeeModalBody.innerHTML = content;
      }
    } catch (err) {
      console.error("Error loading student details", err);
      studentFeeModalBody.innerHTML = '<div style="color:red; text-align:center;">Error loading details.</div>';
    }
  }

  if (closeStudentFeeDetailsBtn) {
    closeStudentFeeDetailsBtn.addEventListener('click', () => {
      studentFeeDetailsModal.classList.remove('visible');
      setTimeout(() => studentFeeDetailsModal.style.display = 'none', 200);
    });
  }

  // ---------------------------
  // GENERATE PDF FROM MODAL CONTENT
  // ---------------------------
  async function runDownloadWithSpinner(button, elementId, titleSuffix, customTitle) {
    if (!button) {
      await generateModalPDF(elementId, titleSuffix, customTitle);
      return;
    }

    window.spinner?.show(button, "Generating...");
    try {
      await generateModalPDF(elementId, titleSuffix, customTitle);
    } finally {
      window.spinner?.hide(button);
    }
  }

  async function generateModalPDF(elementId, titleSuffix, customTitle) {
    // Prefer using the fully-rendered modal wrapper so the student header is included
    const modalWrapper = document.getElementById(elementId)?.closest('.confirm-box') || document.getElementById(elementId);
    const contentElement = modalWrapper || document.getElementById(elementId);
    const { jsPDFClass } = resolvePdfLibrary();

    if (!contentElement || !jsPDFClass) {
      showToast("PDF generation libraries are not ready.", "error");
      return;
    }

    try {
      const school = await bootstrapAccountsSharedData();
      await preloadAccountsLogo();
      const resolvedSchool = school || await getSchoolInfo({ includeLogo: 'true' });
      const schoolName = (resolvedSchool?.name || window.schoolInfo?.name || "SCHOOL NAME").toUpperCase();

      const exported = await generatePdfFromTables(jsPDFClass, contentElement, titleSuffix, customTitle, schoolName);
      if (!exported) {
        showToast("PDF generation failed", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("PDF generation failed", "error");
    }
  }

  if (dlStructureBtn) {
    dlStructureBtn.addEventListener('click', () => runDownloadWithSpinner(dlStructureBtn, 'fee-structure-for-pdf', 'Fee_Structure', 'FEE STRUCTURE AND BALANCE'));
  }
  if (dlStatementBtn) {
    dlStatementBtn.addEventListener('click', () => runDownloadWithSpinner(dlStatementBtn, 'payment-statement-for-pdf', 'Fee_Statement', 'FEE STATEMENT'));
  }

  // ---------------------------
  // GLOBAL FEE NOTE LOGIC
  // ---------------------------
  async function loadGlobalFeeNote(forceRefresh = false) {
    const year = globalNoteYearFilter?.value;
    if (!year) return;
    
    if (noteYearDisplay) noteYearDisplay.textContent = year;
    
    const cacheKey = `globalNote_${year}`;
    
    if (!forceRefresh && globalNoteCache.has(cacheKey)) {
      const cached = globalNoteCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        if (globalNoteContent && globalFeeNoteInput) {
          const note = cached.data.note || '';
          globalNoteContent.textContent = note || 'No general instructions set for this year.';
          globalNoteContent.style.fontStyle = note ? "normal" : "italic";
          globalFeeNoteInput.value = note;
        }
        return;
      }
    }
    
    try {
      const data = await secureFetch(`${API_BASE}/payments/global-note?academicYear=${year}`);
      if (data && globalNoteContent && globalFeeNoteInput) {
        const note = data.note || '';
        globalNoteContent.textContent = note || 'No general instructions set for this year.';
        globalNoteContent.style.fontStyle = note ? "normal" : "italic";
        globalFeeNoteInput.value = note;
        globalNoteCache.set(cacheKey, { data, timestamp: Date.now() });
      }
    } catch (err) {
      console.error("Error loading global fee note:", err);
    }
  }

  async function saveGlobalFeeNote() {
    const year = globalNoteYearFilter?.value;
    const note = globalFeeNoteInput.value.trim();
    
    saveGlobalNoteBtn.disabled = true;
    saveGlobalNoteBtn.textContent = "Saving...";
    
    try {
      await secureFetch(`${API_BASE}/payments/global-note`, {
        method: 'POST',
        body: JSON.stringify({ academicYear: year, note })
      });
      
      toggleGlobalNoteEdit(false);
      loadGlobalFeeNote(true);
      globalNoteCache.delete(`globalNote_${year}`);
    } catch (err) {
      console.error("Error saving note:", err);
    } finally {
      saveGlobalNoteBtn.disabled = false;
      saveGlobalNoteBtn.textContent = "Save for All Grades";
    }
  }

  function toggleGlobalNoteEdit(show) {
    if (globalNoteEditMode) globalNoteEditMode.style.display = show ? "block" : "none";
    if (globalNoteContent) globalNoteContent.style.display = show ? "none" : "block";
    if (editGlobalNoteBtn) editGlobalNoteBtn.style.display = show ? "none" : "inline-block";
  }

  if (editGlobalNoteBtn) editGlobalNoteBtn.addEventListener("click", () => toggleGlobalNoteEdit(true));
  if (cancelGlobalNoteBtn) cancelGlobalNoteBtn.addEventListener("click", () => toggleGlobalNoteEdit(false));
  if (saveGlobalNoteBtn) saveGlobalNoteBtn.addEventListener("click", saveGlobalFeeNote);

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadDashboardData(true));
  }

  // ---------------------------
  // EDIT FEE MODAL LOGIC
  // ---------------------------
  function openEditFeeModal(fee) {
    if (!editFeeModal) return;
    document.getElementById('editFeeId').value = fee._id;
    document.getElementById('editFeeGrade').value = fee.grade;
    document.getElementById('editFeeYear').value = fee.academicYear;
    document.getElementById('editFeeTerm1').value = fee.term1Fee;
    document.getElementById('editFeeTerm2').value = fee.term2Fee;
    document.getElementById('editFeeTerm3').value = fee.term3Fee;
    
    editFeeModal.style.display = "flex";
    requestAnimationFrame(() => editFeeModal.classList.add('visible'));
  }

  if (cancelEditFeeBtn) {
    cancelEditFeeBtn.addEventListener('click', () => {
      editFeeModal.classList.remove('visible');
      setTimeout(() => editFeeModal.style.display = "none", 200);
    });
  }

  if (updateFeeBtn) {
    updateFeeBtn.addEventListener('click', async () => {
      const id = document.getElementById('editFeeId').value;
      const grade = document.getElementById('editFeeGrade').value.trim();
      const year = Number(document.getElementById('editFeeYear').value);
      const t1 = Number(document.getElementById('editFeeTerm1').value);
      const t2 = Number(document.getElementById('editFeeTerm2').value);
      const t3 = Number(document.getElementById('editFeeTerm3').value);
      
      if (!grade || !year) return alert("Grade and Year are required");
      
      updateFeeBtn.disabled = true;
      updateFeeBtn.textContent = "Updating...";
      
      try {
        await secureFetch(`${API_BASE}/accounts/fee-structure/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ grade, academicYear: year, term1Fee: t1, term2Fee: t2, term3Fee: t3 })
        });
        
        alert("Fee structure updated successfully!");
        editFeeModal.classList.remove('visible');
        setTimeout(() => editFeeModal.style.display = "none", 200);
        loadFeeStructures(true);
        statsCache.clear();
        loadStats(true);
      } catch (e) {
        alert("Error: " + e.message);
      } finally {
        updateFeeBtn.disabled = false;
        updateFeeBtn.textContent = "Update Fee Structure";
      }
    });
  }

  // ---------------------------
  // POST FEE MODAL
  // ---------------------------
  if (openPostFeeBtn) {
    openPostFeeBtn.addEventListener('click', () => {
      if(postFeeModal) {
        postFeeModal.style.display = "flex";
        postFeeModal.classList.add('visible');
        const fy = document.getElementById('feeYear');
        if (fy && !fy.value) fy.value = new Date().getFullYear();
      }
    });
  }

  if (cancelPostFeeBtn) {
    cancelPostFeeBtn.addEventListener('click', () => {
      postFeeModal.classList.remove('visible');
      setTimeout(() => postFeeModal.style.display = "none", 200);
    });
  }

  if (saveFeeBtn) {
    saveFeeBtn.addEventListener('click', async () => {
      const grade = document.getElementById('feeGrade').value.trim();
      const year = Number(document.getElementById('feeYear').value);
      const t1 = Number(document.getElementById('feeTerm1').value);
      const t2 = Number(document.getElementById('feeTerm2').value);
      const t3 = Number(document.getElementById('feeTerm3').value);
      
      if(!grade || !year) {
        showToast("Grade and Year are required", "error");
        return;
      }

      // --- Client-side duplicate check ---
      let isDuplicate = false;
      for (const cachedEntry of feeStructuresCache.values()) {
        const list = cachedEntry.data; // This is an array of fee structures
        if (list && Array.isArray(list)) {
          if (list.some(f => f.grade === grade && f.academicYear === year)) {
            isDuplicate = true;
            break;
          }
        }
      }
      
      if (isDuplicate) {
        showToast(`Fee structure for Grade ${grade} in Academic Year ${year} already exists.`, "error");
        return; // Prevent form submission
      }

      const payload = { grade, academicYear: year, term1Fee: t1, term2Fee: t2, term3Fee: t3 };
      
      saveFeeBtn.disabled = true;
      saveFeeBtn.textContent = "Saving...";
      
      try {
        await secureFetch(`${API_BASE}/accounts/fee-structure`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        
        showToast("Fee structure saved!", "success");
        postFeeModal.classList.remove('visible');
        setTimeout(() => postFeeModal.style.display = "none", 200);
        loadFeeStructures(true);
        statsCache.clear();
        loadStats(true);
      } catch(e) {
        showToast("Error: " + e.message, "error");
      } finally {
        saveFeeBtn.disabled = false;
        saveFeeBtn.textContent = "Save Fee Structure";
      }
    });
  }

  // ---------------------------
  // EVENT LISTENERS
  // ---------------------------
  function populateYearFilters() {
    const currentYear = new Date().getFullYear();
    const startYear = 2026;
    const endYear = 3026;
    
    const yearSelectors = [
      document.getElementById("outstandingYearFilter"),
      document.getElementById("overviewYearFilter"),
      document.getElementById("postedFeesYearFilter"),
      document.getElementById("globalNoteYearFilter"),
      document.getElementById("expenseYearFilter")
    ].filter(Boolean);
    
    yearSelectors.forEach(selector => {
      selector.innerHTML = "";
      for (let y = startYear; y <= endYear; y++) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        if (y === currentYear) option.selected = true;
        selector.appendChild(option);
      }
    });
  }

  function populateGradeFilters() {
    const schoolType = getSchoolTypeKey();
    const grades = SCHOOL_TYPES[schoolType].gradeOptions;
    const gradeSelectors = [
      document.getElementById("outstandingGradeFilter"),
      document.getElementById("overviewClassFilter"),
      document.getElementById("postedFeesClassFilter"),
      document.getElementById("feeGrade"),
      document.getElementById("editFeeGrade")
    ].filter(Boolean);
    
    gradeSelectors.forEach(selector => {
      const isFilter = selector.id.toLowerCase().includes('filter');
      selector.innerHTML = isFilter ? '<option value="">All Grades</option>' : '<option value="">-- Select Grade --</option>';
      grades.forEach(g => {
        const option = document.createElement("option");
        
         // Use the normalizeGrade function to normalize the grade
        const displayValue = (String(g).toUpperCase().startsWith("PP") || String(g).toUpperCase() === "PG") ? g : `Grade ${g}`;
        option.value = displayValue;
        option.textContent = displayValue;
        selector.appendChild(option);
      });
    });
  }

  function getCurrentTerm() {
    const month = new Date().getMonth() + 1;
    if (month <= 4) return 'Term 1';
    if (month <= 8) return 'Term 2';
    return 'Term 3';
  }

  function applyCurrentTermFilters() {
    const currentTerm = getCurrentTerm();
    if (overviewTermFilter) {
      overviewTermFilter.value = currentTerm;
    }
    const expenseTermSelect = document.getElementById('expenseTermFilter');
    if (expenseTermSelect) {
      expenseTermSelect.value = currentTerm;
    }
    if (outstandingTermFilter) {
      outstandingTermFilter.value = currentTerm;
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';

      try {
        outstandingCache.clear();
        statsCache.clear();
        feeStructuresCache.clear();
        globalNoteCache.clear();

        await Promise.all([
          loadOutstandingFees(1, true),
          loadStats(true),
          loadFeeStructures(true),
          loadGlobalFeeNote(true)
        ]);

        showToast('Accounts data refreshed', 'success');
      } catch (err) {
        console.error('Refresh failed:', err);
        showToast('Refresh failed', 'error');
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh';
      }
    });
  }

  // Filter listeners
  outstandingGradeFilter?.addEventListener('change', () => loadOutstandingFees(1, true));
  outstandingTermFilter?.addEventListener('change', () => loadOutstandingFees(1, true));
  outstandingSortFilter?.addEventListener('change', () => loadOutstandingFees(1));
  overviewClassFilter?.addEventListener('change', () => loadStats(true));
  overviewYearFilter?.addEventListener('change', () => loadStats(true));
  overviewTermFilter?.addEventListener('change', () => loadStats(true));
  postedFeesYearFilter?.addEventListener('change', () => loadFeeStructures(false));
  postedFeesClassFilter?.addEventListener('change', () => loadFeeStructures(false));
  globalNoteYearFilter?.addEventListener('change', () => loadGlobalFeeNote(true));
  outstandingYearFilter?.addEventListener('change', () => loadOutstandingFees(1, true));

  if (outstandingPrevBtn) outstandingPrevBtn.addEventListener('click', () => loadOutstandingFees(outstandingPage - 1));
  if (outstandingNextBtn) outstandingNextBtn.addEventListener('click', () => loadOutstandingFees(outstandingPage + 1));

  // Expense pagination handlers
  if (expensePrevBtn) expensePrevBtn.addEventListener('click', () => loadExpenses(false, expensesPage - 1));
  if (expenseNextBtn) expenseNextBtn.addEventListener('click', () => loadExpenses(false, expensesPage + 1));
  
  // Expense delete handler (CSP compliant delegation)
  if (expenseTableBody) {
    expenseTableBody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.delete-expense-btn');
      if (btn) {
        const id = btn.dataset.id;
        if (id) await window.deleteExpense(id);
      }
    });
  }

  // Reset expense pagination when filters change
  if (document.getElementById("expenseYearFilter")) {
    document.getElementById("expenseYearFilter").addEventListener('change', () => loadExpenses(false, 1));
  }
  if (document.getElementById("expenseTermFilter")) {
    document.getElementById("expenseTermFilter").addEventListener('change', () => loadExpenses(false, 1));
  }
  if (document.getElementById("expenseCategoryFilter")) {
    document.getElementById("expenseCategoryFilter").addEventListener('change', () => loadExpenses(false, 1));
  }

  let outstandingDebounce;
  outstandingSearchInput?.addEventListener('input', () => {
    clearTimeout(outstandingDebounce);
    outstandingDebounce = setTimeout(() => loadOutstandingFees(1), 500);
  });

  // ---------------------------
  // CROSS-PAGE PAYMENT SIGNAL LISTENER
  // ---------------------------
  let lastPaymentSignalTime = 0;

  // Listen for storage events (cross-tab payments)
  window.addEventListener('storage', (e) => {
    if (e.key === 'paymentRecorded') {
      console.log('[Accounts] Payment detected from another tab, refreshing...');
      outstandingCache.clear();
      statsCache.clear();
      loadOutstandingFees(1, true);
      loadStats(true);
    }
  });

  // Listen for custom payment event (same-tab payments)
  window.addEventListener('paymentRecorded', (e) => {
    console.log('[Accounts] Payment detected (custom event), refreshing...', e.detail);
    lastPaymentSignalTime = Date.now();
    outstandingCache.clear();
    statsCache.clear();
    feeStructuresCache.clear();
    loadOutstandingFees(1, true);
    loadStats(true);
    loadFeeStructures(true);
  });

  // More aggressive same-tab check - run every 500ms for 5 seconds after page load
  const paymentCheckInterval = setInterval(() => {
    const paymentTime = Math.max(
      parseInt(sessionStorage.getItem('paymentRecorded') || '0'),
      parseInt(localStorage.getItem('paymentRecorded') || '0')
    );
    const now = Date.now();
    
    // If payment signal detected and it's recent (within 5 seconds), refresh
    if (paymentTime > 0 && now - paymentTime < 5000 && now - lastPaymentSignalTime > 1000) {
      console.log('[Accounts] Payment detected on same tab, refreshing table and stats...');
      lastPaymentSignalTime = now;
      outstandingCache.clear();
      statsCache.clear();
      feeStructuresCache.clear();
      loadOutstandingFees(1, true);
      loadStats(true);
      loadFeeStructures(true);
    }
  }, 500);

  // Stop checking after 30 seconds to avoid performance impact
  setTimeout(() => clearInterval(paymentCheckInterval), 30000);

  // ---------------------------
  // INITIALIZATION
  // ---------------------------
  (async function init() {
    // Check if there was a recent payment while this page was closed
    const lastPaymentTime = Math.max(
      parseInt(sessionStorage.getItem('paymentRecorded') || '0'),
      parseInt(localStorage.getItem('paymentRecorded') || '0')
    );
    const now = Date.now();
    if (lastPaymentTime > 0 && now - lastPaymentTime < 60000) {
      console.log('[Accounts] Recent payment detected on initialization, will refresh data...');
      lastPaymentSignalTime = Date.now();
    }
    
    userProfile = await authService.getUserProfile(["accounts", "admin"]);
    if (!userProfile) return;
    authService.initLogout();
    // 🚀 Optimization: Explicitly request only necessary fields for UI identity and configuration.
    await getSchoolInfo({ fields: 'name,schoolType' });
    populateYearFilters();
    populateGradeFilters();
    applyCurrentTermFilters();
    setupSidebarNavigation();
    
    let initialActiveSidebarItem = document.querySelector(".sidebar .menu li.active[data-section]");
    if (!initialActiveSidebarItem || initialActiveSidebarItem?.dataset.section === "dashboardSection") {
      initialActiveSidebarItem = document.querySelector(".sidebar .menu li[data-section='feesPaymentOverviewSection']");
      if (initialActiveSidebarItem) initialActiveSidebarItem.classList.add('active');
    }
    if (initialActiveSidebarItem) {
      initialActiveSidebarItem.dispatchEvent(new Event('click'));
    }
  })();

})();
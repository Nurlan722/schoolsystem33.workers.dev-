let db = { students: [], classes: [], teachers: [] };
let loading = false;

function apiErrorMessage(error) {
    return error?.message || "Ошибка сервера";
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
}

async function loadDatabase() {
    loading = true;
    try {
        const data = await api("/api/state");
        db = {
            students: Array.isArray(data.students) ? data.students : [],
            classes: Array.isArray(data.classes) ? data.classes : [],
            teachers: Array.isArray(data.teachers) ? data.teachers : []
        };
        renderAll();
    } catch (error) {
        console.error(error);
        showToast(`Не удалось подключиться к D1: ${apiErrorMessage(error)}`, "error");
    } finally {
        loading = false;
    }
}

function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(button => {
        button.addEventListener("click", () => showPage(button.dataset.page));
    });
}

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));

    document.getElementById(pageId)?.classList.add("active");
    document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add("active");

    const titles = {
        dashboard: "Главная",
        students: "Ученики",
        classes: "Классы",
        teachers: "Преподаватели",
        search: "Поиск по ИИН",
        promotion: "Перевод классов",
        backup: "Резервная копия"
    };
    document.getElementById("pageTitle").textContent = titles[pageId] || "Школа №33";

    if (pageId === "students") populateStudentFilters();
    if (pageId === "promotion") loadPromotionStatus();
    if (pageId === "backup") populateExcelClassSelect();
}

function renderAll() {
    updateStatistics();
    renderDashboard();
    renderStudents();
    renderClasses();
    renderTeachers();
    populateStudentClassSelect();
    populateStudentFilters();
    populateTeacherSelect();
    populateExcelClassSelect();
}

function updateStatistics() {
    document.getElementById("statStudents").textContent = db.students.length;
    document.getElementById("statClasses").textContent = db.classes.length;
    document.getElementById("statTeachers").textContent = db.teachers.length;
    document.getElementById("statActive").textContent = db.students.filter(s => normalizeStatus(s.status) === "Активный").length;
}

function renderDashboard() {
    const tbody = document.getElementById("recentStudents");
    const list = db.students.slice().sort((a, b) => (b.id || "").localeCompare(a.id || "")).slice(0, 8);
    tbody.innerHTML = list.length ? list.map(s => `
        <tr>
            <td>${escapeHTML(s.name)}</td>
            <td>${escapeHTML(s.iin)}</td>
            <td>${escapeHTML(getClassName(s.classId))}</td>
            <td>${statusBadge(s.status)}</td>
        </tr>`).join("") : `<tr><td colspan="4" class="empty">Записей пока нет</td></tr>`;
}

function openClassModal(id = null) {
    populateTeacherSelect();
    document.getElementById("classId").value = id || "";
    document.getElementById("classModalTitle").textContent = id ? "Изменить класс" : "Добавить класс";
    const item = id ? getClass(id) : null;
    document.getElementById("className").value = item?.name || "";
    document.getElementById("classTeacher").value = item?.teacherId || "";
    openModal("classModal");
}

async function saveClass(event) {
    event.preventDefault();
    const id = document.getElementById("classId").value;
    const name = document.getElementById("className").value.trim();
    const teacherId = document.getElementById("classTeacher").value;
    if (!name) return showToast("Введите название класса", "error");

    try {
        await api(id ? `/api/classes/${encodeURIComponent(id)}` : "/api/classes", {
            method: id ? "PUT" : "POST",
            body: JSON.stringify({ name, teacherId })
        });
        closeModal("classModal");
        await loadDatabase();
        showToast("Класс сохранён", "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

async function deleteClass(id) {
    const item = getClass(id);
    if (!item) return;
    const count = db.students.filter(s => s.classId === id).length;
    const message = count ? `В классе "${item.name}" находятся ${count} ученик(ов). Удалить класс всё равно?` : `Удалить класс "${item.name}"?`;
    if (!confirm(message)) return;
    try {
        await api(`/api/classes/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadDatabase();
        showToast("Класс удалён", "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

function renderClasses() {
    const container = document.getElementById("classesGrid");
    if (!db.classes.length) {
        container.innerHTML = `<div class="card empty">Классы ещё не добавлены</div>`;
        return;
    }
    container.innerHTML = db.classes.map(c => {
        const teacher = getTeacher(c.teacherId);
        const count = db.students.filter(s => s.classId === c.id).length;
        return `<div class="class-card">
            <h3>${escapeHTML(c.name)}</h3>
            <div class="teacher">Классный руководитель: ${escapeHTML(teacher ? teacher.name : "не назначен")}</div>
            <div class="count">👨‍🎓 Учеников: <strong>${count}</strong></div>
            <div class="actions">
                <button class="btn btn-secondary" onclick="viewClassStudents('${escapeAttribute(c.id)}')">Список</button>
                <button class="btn btn-secondary" onclick="exportClassExcel('${escapeAttribute(c.id)}')">Excel</button>
                <button class="icon-btn" onclick="openClassModal('${escapeAttribute(c.id)}')">✏️</button>
                <button class="icon-btn danger" onclick="deleteClass('${escapeAttribute(c.id)}')">🗑</button>
            </div>
        </div>`;
    }).join("");
}

function viewClassStudents(classId) {
    const item = getClass(classId);
    if (!item) return;
    showPage("students");
    const filter = document.getElementById("studentClassFilter");
    if (filter) { filter.value = classId; renderStudents(); }
}

function openTeacherModal(id = null) {
    document.getElementById("teacherId").value = id || "";
    document.getElementById("teacherModalTitle").textContent = id ? "Изменить преподавателя" : "Добавить преподавателя";
    const item = id ? getTeacher(id) : null;
    document.getElementById("teacherName").value = item?.name || "";
    document.getElementById("teacherSubject").value = item?.subject || "";
    openModal("teacherModal");
}

async function saveTeacher(event) {
    event.preventDefault();
    const id = document.getElementById("teacherId").value;
    const name = document.getElementById("teacherName").value.trim();
    const subject = document.getElementById("teacherSubject").value.trim();
    if (!name) return showToast("Введите ФИО преподавателя", "error");
    try {
        await api(id ? `/api/teachers/${encodeURIComponent(id)}` : "/api/teachers", {
            method: id ? "PUT" : "POST", body: JSON.stringify({ name, subject })
        });
        closeModal("teacherModal");
        await loadDatabase();
        showToast("Преподаватель сохранён", "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

async function deleteTeacher(id) {
    const item = getTeacher(id);
    if (!item || !confirm(`Удалить преподавателя "${item.name}"?`)) return;
    try {
        await api(`/api/teachers/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadDatabase();
        showToast("Преподаватель удалён", "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

function renderTeachers() {
    const tbody = document.getElementById("teachersTable");
    if (!db.teachers.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">Преподаватели ещё не добавлены</td></tr>`;
        return;
    }
    tbody.innerHTML = db.teachers.map((t, index) => {
        const classCount = db.classes.filter(c => c.teacherId === t.id).length;
        return `<tr>
            <td>${index + 1}</td><td>${escapeHTML(t.name)}</td><td>${escapeHTML(t.subject || "—")}</td><td>${classCount}</td>
            <td class="actions"><button class="icon-btn" onclick="openTeacherModal('${escapeAttribute(t.id)}')">✏️</button><button class="icon-btn danger" onclick="deleteTeacher('${escapeAttribute(t.id)}')">🗑</button></td>
        </tr>`;
    }).join("");
}

function openStudentModal(id = null) {
    populateStudentClassSelect();
    document.getElementById("studentId").value = id || "";
    document.getElementById("studentModalTitle").textContent = id ? "Изменить ученика" : "Добавить ученика";
    const item = id ? db.students.find(s => s.id === id) : null;
    document.getElementById("studentName").value = item?.name || "";
    document.getElementById("studentIIN").value = item?.iin || "";
    document.getElementById("studentBirthDate").value = item?.birthDate || "";
    document.getElementById("studentClass").value = item?.classId || "";
    document.getElementById("studentStatus").value = normalizeStatus(item?.status);
    document.getElementById("studentNote").value = item?.note || "";
    openModal("studentModal");
}

async function saveStudent(event) {
    event.preventDefault();
    const id = document.getElementById("studentId").value;
    const name = document.getElementById("studentName").value.trim();
    const iin = normalizeIIN(document.getElementById("studentIIN").value);
    const birthDate = document.getElementById("studentBirthDate").value;
    const classId = document.getElementById("studentClass").value;
    const status = normalizeStatus(document.getElementById("studentStatus").value);
    const note = document.getElementById("studentNote").value.trim();
    if (!name || !classId) return showToast("Заполните обязательные поля", "error");
    if (!/^\d{12}$/.test(iin)) return showToast("ИИН должен содержать ровно 12 цифр", "error");
    try {
        await api(id ? `/api/students/${encodeURIComponent(id)}` : "/api/students", {
            method: id ? "PUT" : "POST", body: JSON.stringify({ name, iin, birthDate, classId, status, note })
        });
        closeModal("studentModal");
        await loadDatabase();
        showToast("Ученик сохранён", "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

async function deleteStudent(id) {
    const item = db.students.find(s => s.id === id);
    if (!item || !confirm(`Удалить ученика "${item.name}"?`)) return;
    try {
        await api(`/api/students/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadDatabase();
        showToast("Ученик удалён", "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

function renderStudents() {
    const tbody = document.getElementById("studentsTable");
    const query = (document.getElementById("studentFilter")?.value || "").trim().toLowerCase();
    const classFilter = document.getElementById("studentClassFilter")?.value || "";
    const statusFilter = document.getElementById("studentStatusFilter")?.value || "";
    const list = db.students.filter(s => {
        const matchesQuery = !query || String(s.name || "").toLowerCase().includes(query) || String(s.iin || "").includes(query);
        const matchesClass = !classFilter || s.classId === classFilter;
        const matchesStatus = !statusFilter || normalizeStatus(s.status) === statusFilter;
        return matchesQuery && matchesClass && matchesStatus;
    });
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty">Ученики не найдены</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map((s, index) => `<tr>
        <td>${index + 1}</td><td>${escapeHTML(s.name)}</td><td>${escapeHTML(s.iin)}</td><td>${formatDate(s.birthDate)}</td>
        <td>${escapeHTML(getClassName(s.classId))}</td><td>${statusBadge(s.status)}</td>
        <td class="actions"><button class="icon-btn" onclick="openStudentModal('${escapeAttribute(s.id)}')">✏️</button><button class="icon-btn danger" onclick="deleteStudent('${escapeAttribute(s.id)}')">🗑</button></td>
    </tr>`).join("");
}

function populateStudentClassSelect() {
    const select = document.getElementById("studentClass");
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Выберите класс</option>` + db.classes.map(c => `<option value="${escapeAttribute(c.id)}">${escapeHTML(c.name)}</option>`).join("");
    if (db.classes.some(c => c.id === current)) select.value = current;
}

function populateStudentFilters() {
    const select = document.getElementById("studentClassFilter");
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Все классы</option>` + db.classes.map(c => `<option value="${escapeAttribute(c.id)}">${escapeHTML(c.name)}</option>`).join("");
    if (db.classes.some(c => c.id === current)) select.value = current;
}

function populateTeacherSelect() {
    const select = document.getElementById("classTeacher");
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Не назначен</option>` + db.teachers.map(t => `<option value="${escapeAttribute(t.id)}">${escapeHTML(t.name)}</option>`).join("");
    if (db.teachers.some(t => t.id === current)) select.value = current;
}

async function searchByIIN() {
    const iin = normalizeIIN(document.getElementById("iinSearchInput").value);
    const container = document.getElementById("searchResult");
    if (!/^\d{12}$/.test(iin)) {
        container.innerHTML = `<div class="search-result"><strong>Введите корректный ИИН из 12 цифр.</strong></div>`;
        return;
    }
    const student = db.students.find(s => s.iin === iin);
    if (!student) {
        container.innerHTML = `<div class="search-result"><strong>Ученик не найден.</strong><p>ИИН ${escapeHTML(iin)} отсутствует в базе.</p></div>`;
        return;
    }
    const cls = getClass(student.classId);
    const teacher = cls ? getTeacher(cls.teacherId) : null;
    container.innerHTML = `<div class="search-result">
        <h3>${escapeHTML(student.name)}</h3><p><strong>ИИН:</strong> ${escapeHTML(student.iin)}</p>
        <p><strong>Дата рождения:</strong> ${formatDate(student.birthDate)}</p><p><strong>Класс:</strong> ${escapeHTML(getClassName(student.classId))}</p>
        <p><strong>Классный руководитель:</strong> ${escapeHTML(teacher ? teacher.name : "не назначен")}</p>
        <p><strong>Статус:</strong> ${statusBadge(student.status)}</p><p><strong>Примечание:</strong> ${escapeHTML(student.note || "—")}</p>
    </div>`;
}

function exportData() {
    downloadBlob(JSON.stringify(db, null, 2), `Резервная_копия_${getDateForFile()}.json`, "application/json;charset=utf-8");
    showToast("JSON-файл скачан", "success");
}

async function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const imported = JSON.parse(await file.text());
        if (!imported || !Array.isArray(imported.students) || !Array.isArray(imported.classes) || !Array.isArray(imported.teachers)) throw new Error("Неверный формат");
        if (!confirm("Заменить текущую общую базу данными из JSON-файла?")) return;
        await api("/api/backup/import", { method: "POST", body: JSON.stringify(imported) });
        await loadDatabase();
        showToast("База восстановлена из JSON", "success");
    } catch (error) { showToast(`Ошибка импорта: ${apiErrorMessage(error)}`, "error"); }
    event.target.value = "";
}

function exportStudentsExcel() { exportExcelForStudents(db.students, "Ученики"); }
function exportExcelFromBackup() {
    const classId = document.getElementById("excelClassSelect").value;
    classId ? exportClassExcel(classId) : exportStudentsExcel();
}
function exportClassExcel(classId) {
    const item = getClass(classId);
    if (!item) return;
    exportExcelForStudents(db.students.filter(s => s.classId === classId), `Ученики_${sanitizeFileName(item.name)}`);
}
async function exportExcelForStudents(students, filenameBase) {
    if (typeof ExcelJS === "undefined") return showToast("Excel-библиотека не загружена. Проверьте интернет-соединение.", "error");

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Школа №33";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Ученики", {
        pageSetup: {
            paperSize: 9, // A4
            orientation: "landscape",
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            horizontalCentered: true,
            margins: { left: 0.2, right: 0.2, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 }
        },
        properties: { defaultRowHeight: 18 }
    });

    // Только эти 7 столбцов входят в печатную форму.
    worksheet.columns = [
        { header: "№", key: "num", width: 5 },
        { header: "ФИО", key: "name", width: 31 },
        { header: "ИИН", key: "iin", width: 15 },
        { header: "Дата рождения", key: "birthDate", width: 14 },
        { header: "Класс", key: "className", width: 9 },
        { header: "Классный руководитель", key: "teacher", width: 27 },
        { header: "Примечание", key: "note", width: 27 }
    ];

    students.forEach((s, index) => {
        const cls = getClass(s.classId);
        const teacher = cls ? getTeacher(cls.teacherId) : null;
        worksheet.addRow({
            num: index + 1,
            name: s.name || "",
            iin: s.iin || "",
            birthDate: formatDate(s.birthDate),
            className: cls?.name || "",
            teacher: teacher?.name || "",
            note: s.note || ""
        });
    });

    // Высота строк подбирается по размеру списка. Большие списки не сжимаются
    // в одну страницу по высоте: Excel переносит их на следующие листы A4.
    const count = students.length;
    const dataRowHeight = count <= 15 ? 26 : count <= 25 ? 22 : count <= 35 ? 19 : 17;
    const thin = { style: "thin", color: { argb: "FF000000" } };

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        row.height = rowNumber === 1 ? 28 : dataRowHeight;
        row.eachCell({ includeEmpty: true }, cell => {
            cell.border = { top: thin, left: thin, bottom: thin, right: thin };
            cell.alignment = {
                horizontal: rowNumber === 1 ? "center" : (cell.col === 1 || cell.col === 3 || cell.col === 4 || cell.col === 5 ? "center" : "left"),
                vertical: "middle",
                wrapText: true
            };
            if (rowNumber === 1) {
                cell.font = { bold: true, size: 10 };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9EEF7" } };
            } else {
                cell.font = { size: count > 35 ? 9 : 10 };
            }
        });
    });

    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = { from: "A1", to: "G1" };
    worksheet.printArea = `A1:G${Math.max(1, count + 1)}`;
    worksheet.pageSetup.printTitlesRow = "1:1";
    worksheet.headerFooter.oddFooter = "Страница &P из &N";

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}_${getDateForFile()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Excel готов для печати на A4", "success");
}
function importExcel(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (typeof XLSX === "undefined") { showToast("Excel-библиотека не загружена.", "error"); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            if (!rows.length) throw new Error("Excel-файл пуст");
            processExcelRows(rows);
        } catch (error) { showToast(`Не удалось прочитать Excel: ${error.message}`, "error"); }
        event.target.value = "";
    };
    reader.readAsArrayBuffer(file);
}

async function processExcelRows(rows) {
    const imported = { students: [...db.students], classes: [...db.classes], teachers: [...db.teachers] };
    let added = 0, updated = 0, skipped = 0;
    for (const row of rows) {
        const name = getExcelValue(row, ["ФИО", "фио", "ФИО ученика", "Ученик"]).trim();
        const iin = normalizeIIN(getExcelValue(row, ["ИИН", "иин"]));
        const birthDate = getExcelValue(row, ["Дата рождения", "Дата Рождения", "Дата рождения ученика"]).trim();
        const className = getExcelValue(row, ["Класс", "класс"]).trim();
        const status = normalizeStatus(getExcelValue(row, ["Статус", "статус"]));
        const note = getExcelValue(row, ["Примечание", "примечание", "Примечания"]).trim();
        if (!name || !/^\d{12}$/.test(iin) || !className) { skipped++; continue; }
        let cls = imported.classes.find(c => c.name.trim().toLowerCase() === className.toLowerCase());
        if (!cls) { cls = { id: generateId(), name: className, teacherId: "" }; imported.classes.push(cls); }
        const existing = imported.students.find(s => s.iin === iin);
        if (existing) { Object.assign(existing, { name, iin, birthDate, classId: cls.id, status, note }); updated++; }
        else { imported.students.push({ id: generateId(), name, iin, birthDate, classId: cls.id, status, note }); added++; }
    }
    try {
        await api("/api/backup/import", { method: "POST", body: JSON.stringify(imported) });
        await loadDatabase();
        showToast(`Excel импортирован: добавлено ${added}, обновлено ${updated}, пропущено ${skipped}`, "success");
    } catch (error) { showToast(`Ошибка импорта Excel: ${apiErrorMessage(error)}`, "error"); }
}

function populateExcelClassSelect() {
    const select = document.getElementById("excelClassSelect");
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Все классы</option>` + db.classes.map(c => `<option value="${escapeAttribute(c.id)}">${escapeHTML(c.name)}</option>`).join("");
    if (db.classes.some(c => c.id === current)) select.value = current;
}

async function clearDatabase() {
    const password = prompt("Введите пароль администратора для очистки базы данных:");
    if (password === null) return;
    if (!confirm("⚠️ Будут удалены ВСЕ ученики, классы и преподаватели из общей D1-базы. Продолжить?")) return;
    try {
        await api("/api/database/clear", { method: "POST", body: JSON.stringify({ password }) });
        await loadDatabase();
        showToast("Общая база данных полностью очищена", "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

function getExcelValue(row, names) {
    for (const name of names) if (row[name] !== undefined && row[name] !== null) return String(row[name]);
    const keys = Object.keys(row);
    const found = keys.find(key => names.some(name => key.trim().toLowerCase() === name.trim().toLowerCase()));
    return found ? String(row[found]) : "";
}
function normalizeIIN(value) { return String(value ?? "").replace(/\s+/g, "").trim(); }
function normalizeStatus(status) { const s = String(status ?? "").trim().toLowerCase(); if (s === "выбыл") return "Выбыл"; if (s === "переведён" || s === "переведен") return "Переведён"; return "Активный"; }
function statusBadge(status) { const s = normalizeStatus(status); const cls = s === "Активный" ? "status-active" : s === "Выбыл" ? "status-inactive" : "status-transferred"; return `<span class="status-badge ${cls}">${escapeHTML(s)}</span>`; }
function getClass(id) { return db.classes.find(c => c.id === id); }
function getClassName(id) { return getClass(id)?.name || "—"; }
function getTeacher(id) { return db.teachers.find(t => t.id === id); }
function generateId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function formatDate(value) { if (!value) return "—"; const parts = String(value).split("-"); return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : escapeHTML(value); }
function getDateForFile() { return new Date().toISOString().slice(0, 10); }
function sanitizeFileName(value) { return String(value || "file").replace(/[\\/:*?"<>|]/g, "_"); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c])); }
function escapeAttribute(value) { return escapeHTML(value); }
function downloadBlob(content, filename, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function openModal(id) { document.getElementById(id)?.classList.add("open"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }
function updateCurrentDate() { document.getElementById("currentDate").textContent = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date()); }
function showToast(message, type = "") { const container = document.getElementById("toastContainer"); const toast = document.createElement("div"); toast.className = `toast ${type}`; toast.textContent = message; container.appendChild(toast); setTimeout(() => toast.remove(), 4200); }



let promotionTimer = null;
let promotionStatus = null;

async function loadPromotionStatus() {
    try {
        const data = await api("/api/promotion/status");
        promotionStatus = data;
        const input = document.getElementById("promotionDateInput");
        if (input) input.value = data.nextDate || "";
        const last = document.getElementById("lastPromotionText");
        if (last) last.textContent = `Последний перевод: ${data.lastDate ? formatDate(data.lastDate) : "ещё не выполнялся"}`;
        updatePromotionCountdown();
        if (promotionTimer) clearInterval(promotionTimer);
        promotionTimer = setInterval(updatePromotionCountdown, 1000);
    } catch (error) {
        showToast(`Не удалось загрузить таймер: ${apiErrorMessage(error)}`, "error");
    }
}

function updatePromotionCountdown() {
    const el = document.getElementById("promotionCountdown");
    const dateText = document.getElementById("promotionDateText");
    if (!el || !promotionStatus?.nextDate) return;
    if (dateText) dateText.textContent = formatDate(promotionStatus.nextDate);
    const target = new Date(`${promotionStatus.nextDate}T00:00:00`);
    const diff = target.getTime() - Date.now();
    if (diff <= 0) { el.textContent = "Перевод будет выполнен при следующем обращении к базе"; return; }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    el.textContent = `${days} дн. ${hours} ч. ${minutes} мин. ${seconds} сек.`;
}

async function savePromotionDate() {
    const nextDate = document.getElementById("promotionDateInput")?.value || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return showToast("Выберите дату перевода", "error");
    try {
        await api("/api/promotion/settings", { method: "PUT", body: JSON.stringify({ nextDate }) });
        showToast("Дата ежегодного перевода сохранена", "success");
        await loadPromotionStatus();
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

async function runPromotionNow() {
    if (!confirm("Выполнить перевод классов сейчас? Ученики 11-х классов и 11-е классы будут удалены. Рекомендуется сначала скачать резервную копию.")) return;
    try {
        const result = await api("/api/promotion/run", { method: "POST", body: JSON.stringify({}) });
        await loadDatabase();
        await loadPromotionStatus();
        showToast(`Перевод выполнен: переведено классов ${result.promotedClasses || 0}, выпущено учеников ${result.graduatedStudents || 0}`, "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

function applyTheme(theme) {
    const normalized = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = normalized;
    const button = document.getElementById("themeToggle");
    if (button) {
        button.textContent = normalized === "dark" ? "☀️" : "🌙";
        button.title = normalized === "dark" ? "Светлая тема" : "Тёмная тема";
        button.setAttribute("aria-label", button.title);
    }
}

function toggleTheme() {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("school33-theme", next);
    applyTheme(next);
}

function initTheme() {
    const saved = localStorage.getItem("school33-theme");
    const preferred = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(saved || preferred);
}

// Explicit button wiring: works even when inline onclick handlers are restricted.
function bindStaticButtons() {
    document.getElementById("addStudentBtn")?.addEventListener("click", () => openStudentModal());
    document.getElementById("addClassBtn")?.addEventListener("click", () => openClassModal());
    document.getElementById("addTeacherBtn")?.addEventListener("click", () => openTeacherModal());
    document.getElementById("savePromotionDateBtn")?.addEventListener("click", savePromotionDate);
    document.getElementById("runPromotionBtn")?.addEventListener("click", runPromotionNow);
    document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);

    document.querySelectorAll("[data-close-modal]").forEach(btn => {
        btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
    });
}

// Make public functions available for the existing action buttons in rendered tables/cards.
Object.assign(window, {
    openStudentModal, openClassModal, openTeacherModal,
    closeModal, saveStudent, saveClass, saveTeacher,
    deleteStudent, deleteClass, deleteTeacher,
    viewClassStudents, exportClassExcel
});

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    setupNavigation();
    bindStaticButtons();
    document.getElementById("studentForm")?.addEventListener("submit", saveStudent);
    document.getElementById("classForm")?.addEventListener("submit", saveClass);
    document.getElementById("teacherForm")?.addEventListener("submit", saveTeacher);
    document.querySelectorAll(".modal").forEach(modal => modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); }));
    updateCurrentDate();
    setInterval(updateCurrentDate, 60000);
    await loadDatabase();
});

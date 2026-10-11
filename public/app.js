let db = { students: [], classes: [], teachers: [] };
let loading = false;
const kkCollator = new Intl.Collator("kk-KZ", { sensitivity: "base", numeric: true });
let studentView = localStorage.getItem("studentView") || "list";
let teacherView = localStorage.getItem("teacherView") || "list";
let selectedStudents = new Set();
let adminToken = sessionStorage.getItem("school33-admin-token") || "";
let adminMode = false;

function sortByKazakhName(items) {
    return items.slice().sort((a, b) => kkCollator.compare(String(a.name || ""), String(b.name || "")));
}
function getGradeNumber(className) {
    const m = String(className || "").trim().match(/^(\d+)/);
    const grade = m ? Number(m[1]) : NaN;
    return Number.isInteger(grade) && grade >= 1 && grade <= 11 ? grade : null;
}
function schoolClasses() {
    return db.classes.filter(c => getGradeNumber(c.name) !== null).slice().sort(classSort);
}
function classSort(a, b) {
    const pa = String(a.name || "").trim().match(/^(\d+)\s*(.*)$/);
    const pb = String(b.name || "").trim().match(/^(\d+)\s*(.*)$/);
    if (pa && pb && Number(pa[1]) !== Number(pb[1])) return Number(pa[1]) - Number(pb[1]);
    return kkCollator.compare(pa ? pa[2] : a.name, pb ? pb[2] : b.name);
}
function toggleClassPicker(id) { document.getElementById(id)?.classList.toggle("open"); }
function renderClassPicker(containerId, selectedId, includeAll, onPick) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const classes = schoolClasses();
    const groups = new Map();
    classes.forEach(c => {
        const m = String(c.name || "").trim().match(/^(\d+)/);
        const key = m ? m[1] : "Другие";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
    });
    let html = includeAll ? `<button type="button" class="class-chip ${!selectedId ? "active" : ""}" onclick="${onPick}('')">Все</button>` : "";
    for (const [grade, items] of groups) {
        html += `<div class="class-grade"><span>${escapeHTML(grade)}</span><div>` + items.map(c => `<button type="button" class="class-chip ${c.id === selectedId ? "active" : ""}" onclick="${onPick}('${escapeAttribute(c.id)}')">${escapeHTML(c.name)}</button>`).join("") + `</div></div>`;
    }
    box.innerHTML = html || `<div class="empty compact-empty">Классы не добавлены</div>`;
}
function pickStudentFilterClass(id) {
    document.getElementById("studentClassFilter").value = id;
    document.getElementById("studentClassFilterLabel").textContent = id ? getClassName(id) : "Все классы";
    renderClassPicker("studentClassFilterPicker", id, true, "pickStudentFilterClass");
    document.getElementById("studentClassFilterPicker")?.classList.remove("open");
    renderStudents();
}
function pickStudentClass(id) {
    document.getElementById("studentClass").value = id;
    document.getElementById("studentClassLabel").textContent = id ? getClassName(id) : "Выберите класс";
    renderClassPicker("studentClassPicker", id, false, "pickStudentClass");
    document.getElementById("studentClassPicker")?.classList.remove("open");
}
function setStudentView(view) { studentView = view; localStorage.setItem("studentView", view); applyViews(); renderStudents(); }
function setTeacherView(view) { teacherView = view; localStorage.setItem("teacherView", view); applyViews(); renderTeachers(); }
function applyViews() {
    const sl=document.getElementById("studentsListView"), sc=document.getElementById("studentsCardsView");
    if(sl&&sc){sl.hidden=studentView!=="list";sc.hidden=studentView!=="cards";}
    document.querySelectorAll("[data-student-view]").forEach(b=>b.classList.toggle("active",b.dataset.studentView===studentView));
    const tl=document.getElementById("teachersListView"), tc=document.getElementById("teachersCardsView");
    if(tl&&tc){tl.hidden=teacherView!=="list";tc.hidden=teacherView!=="cards";}
    document.querySelectorAll("[data-teacher-view]").forEach(b=>b.classList.toggle("active",b.dataset.teacherView===teacherView));
}


function apiErrorMessage(error) {
    return error?.message || "Ошибка сервера";
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: { "Content-Type": "application/json", ...(adminToken ? {"X-Admin-Token": adminToken} : {}), ...(options.headers || {}) }
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
}

function applyAdminMode() {
    document.documentElement.dataset.admin = adminMode ? "on" : "off";
    const btn=document.getElementById("adminToggle");
    if(btn){btn.textContent=adminMode?"🔓":"🔒";btn.classList.toggle("active",adminMode);btn.title=adminMode?"Выйти из режима администратора":"Режим администратора";}
    document.querySelectorAll(".admin-only").forEach(el=>el.hidden=!adminMode);
}
async function checkAdminMode() {
    if(!adminToken){adminMode=false;applyAdminMode();return;}
    try { const r=await api("/api/admin/status"); adminMode=!!r.admin; }
    catch { adminMode=false; }
    if(!adminMode){adminToken="";sessionStorage.removeItem("school33-admin-token");}
    applyAdminMode();
}
async function toggleAdminMode() {
    if(adminMode){const frame=document.getElementById("schoolMapFrame")?.contentWindow;if(frame?.flushSchoolMap){const saved=await frame.flushSchoolMap();if(!saved){showToast("Не удалось сохранить карту. Повторите выход после проверки соединения.","error");return;}}try{await api("/api/admin/logout",{method:"POST",body:"{}"});}catch{} adminToken="";adminMode=false;sessionStorage.removeItem("school33-admin-token");applyAdminMode();document.getElementById("schoolMapFrame")?.contentWindow?.postMessage({type:"school33-admin-changed"},location.origin);showToast("Режим администратора выключен");return;}
    const password=prompt("Введите пароль администратора:"); if(password===null)return;
    try{const r=await api("/api/admin/login",{method:"POST",body:JSON.stringify({password:password.trim()})});adminToken=r.token;sessionStorage.setItem("school33-admin-token",adminToken);adminMode=true;applyAdminMode();document.getElementById("schoolMapFrame")?.contentWindow?.postMessage({type:"school33-admin-changed"},location.origin);showToast("Режим администратора включён","success");}
    catch(e){showToast(apiErrorMessage(e),"error");}
}
async function updateD1Status() {
    const el=document.getElementById("d1Status"); if(!el)return;
    try{const r=await api("/api/health");el.className="d1-status online";el.innerHTML='<span class="d1-dot"></span><span>D1 подключена</span>';}
    catch(e){el.className="d1-status offline";el.innerHTML='<span class="d1-dot"></span><span>D1: нет соединения</span>';}
}
async function loadDatabaseChecks(){
    const box=document.getElementById("databaseChecks"); if(!box)return;
    box.innerHTML='<div class="card"><span class="hint">Проверка…</span></div>';
    try{const r=await api("/api/checks"); const checks=r.checks||[]; if(!checks.length){box.innerHTML='<div class="card check-ok"><h3>✓ Ошибок не найдено</h3><p>Основные проверки базы пройдены.</p></div>';return;} box.innerHTML=checks.map(c=>`<div class="card check-card ${c.type}"><h3>${c.type==='error'?'⛔':'⚠️'} ${escapeHTML(c.title)} <span>${c.count}</span></h3><div class="check-items">${(c.items||[]).slice(0,30).map(x=>`<div>${escapeHTML(x)}</div>`).join('')}${c.count>30?`<small>И ещё ${c.count-30}…</small>`:''}</div></div>`).join('');}
    catch(e){box.innerHTML=`<div class="card"><p class="danger-text">${escapeHTML(apiErrorMessage(e))}</p></div>`;}
}
async function loadAuditLog(){
    const tbody=document.getElementById("auditTable"); if(!tbody)return;
    tbody.innerHTML='<tr><td colspan="3" class="empty">Загрузка…</td></tr>';
    try{const r=await api("/api/audit");const items=r.items||[];tbody.innerHTML=items.length?items.map(x=>`<tr><td>${escapeHTML(formatDateTime(x.createdAt))}</td><td><strong>${escapeHTML(x.action)}</strong></td><td>${escapeHTML(x.details||'—')}</td></tr>`).join(''):'<tr><td colspan="3" class="empty">Журнал пока пуст</td></tr>';}
    catch(e){tbody.innerHTML=`<tr><td colspan="3" class="empty">${escapeHTML(apiErrorMessage(e))}</td></tr>`;}
}
function formatDateTime(v){if(!v)return '—';const d=new Date(String(v).replace(' ','T')+'Z');return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'medium'}).format(d);}
function filterClassTeacherOptions(){const q=(document.getElementById('classTeacherSearch')?.value||'').trim().toLocaleLowerCase('kk-KZ');const sel=document.getElementById('classTeacher');if(!sel)return;Array.from(sel.options).forEach((o,i)=>{o.hidden=i>0&&q&&!o.text.toLocaleLowerCase('kk-KZ').includes(q);});}

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
        updateD1Status();
    } catch (error) {
        console.error(error);
        updateD1Status();
        showToast(`Не удалось загрузить базу: ${apiErrorMessage(error)}`, "error");
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
        schoolmap: "Схема школы",
        students: "Ученики",
        classes: "Классы",
        teachers: "Преподаватели",
        search: "Поиск по ИИН",
        checks: "Проверка базы",
        audit: "Журнал действий",
        promotion: "Перевод классов",
        backup: "Резервная копия"
    };
    document.getElementById("pageTitle").textContent = titles[pageId] || "Школа №33";

    if (pageId === "students") populateStudentFilters();
    if (pageId === "checks") loadDatabaseChecks();
    if (pageId === "audit") loadAuditLog();
    if (pageId === "promotion") { loadPromotionStatus(); populateSinglePromotionClassSelect(); }
    if (pageId === "backup") { populateExcelClassSelect(); loadBackupPoints(); }
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
    populateBulkClassSelect();
    applyAdminMode();
}

function updateStatistics() {
    document.getElementById("statStudents").textContent = db.students.length;
    document.getElementById("statClasses").textContent = db.classes.length;
    document.getElementById("statTeachers").textContent = db.teachers.length;
    document.getElementById("statActive").textContent = db.students.filter(s => normalizeStatus(s.status) === "Активный").length;
}

function renderDashboard() {
    const tbody = document.getElementById("recentStudents");
    // UUID не показывает порядок добавления. Сортируем по времени создания записи в D1.
    const list = db.students.slice().sort((a, b) => {
        const aTime = Date.parse(a.createdAt || "") || 0;
        const bTime = Date.parse(b.createdAt || "") || 0;
        if (bTime !== aTime) return bTime - aTime;
        return kkCollator.compare(String(b.name || ""), String(a.name || ""));
    }).slice(0, 8);
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
    if (getGradeNumber(name) === null) return showToast("Класс должен быть только с 1 по 11 (например: 1 А, 7 Ә, 11 Б)", "error");

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
    if(!adminMode) return showToast("Сначала включите режим администратора", "error");
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
    const classes = schoolClasses();
    if (!classes.length) {
        container.innerHTML = `<div class="card empty">Классы с 1 по 11 ещё не добавлены</div>`;
        return;
    }
    container.innerHTML = classes.map(c => {
        const teacher = getTeacher(c.teacherId);
        const count = db.students.filter(s => s.classId === c.id).length;
        return `<div class="class-card">
            <h3>${escapeHTML(c.name)}</h3>
            <div class="teacher">Классный руководитель: ${escapeHTML(teacher ? teacher.name : "не назначен")}</div>
            <div class="count">👨‍🎓 Учеников: <strong>${count}</strong></div>
            <div class="actions">
                <button class="btn btn-secondary" onclick="viewClassStudents('${escapeAttribute(c.id)}')">Список</button>
                <button class="btn btn-secondary" onclick="exportClassExcel('${escapeAttribute(c.id)}')">Excel</button>
                <button class="btn btn-secondary" onclick="printClassList('${escapeAttribute(c.id)}')">🖨</button>
                <button class="icon-btn" onclick="openClassModal('${escapeAttribute(c.id)}')">✏️</button>
                <button class="icon-btn danger admin-only" onclick="deleteClass('${escapeAttribute(c.id)}')">🗑</button>
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
    if(!adminMode) return showToast("Сначала включите режим администратора", "error");
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
    const cards = document.getElementById("teachersCardsView");
    const list = sortByKazakhName(db.teachers);
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">Преподаватели ещё не добавлены</td></tr>`;
        if (cards) cards.innerHTML = `<div class="card empty">Преподаватели ещё не добавлены</div>`;
        return;
    }
    tbody.innerHTML = list.map((t, index) => {
        const classCount = db.classes.filter(c => c.teacherId === t.id).length;
        return `<tr><td>${index + 1}</td><td>${escapeHTML(t.name)}</td><td>${escapeHTML(t.subject || "—")}</td><td>${classCount}</td><td class="actions"><button class="icon-btn" onclick="openTeacherModal('${escapeAttribute(t.id)}')">✏️</button><button class="icon-btn danger admin-only" onclick="deleteTeacher('${escapeAttribute(t.id)}')">🗑</button></td></tr>`;
    }).join("");
    if (cards) cards.innerHTML = list.map(t => {
        const teacherClasses = schoolClasses().filter(c => c.teacherId === t.id);
        const classCount = teacherClasses.length;
        return `<article class="person-card"><div class="person-card-top"><div class="person-avatar">👩‍🏫</div><div><h3>${escapeHTML(t.name)}</h3><p>${escapeHTML(t.subject || "Предмет не указан")}</p></div></div><div class="person-meta"><span>Классов: <strong>${classCount}</strong></span><span>Руководитель: <strong>${teacherClasses.length ? teacherClasses.map(c=>escapeHTML(c.name)).join(', ') : '—'}</strong></span></div><div class="person-actions"><button class="icon-btn" onclick="openTeacherModal('${escapeAttribute(t.id)}')">✏️</button><button class="icon-btn danger admin-only" onclick="deleteTeacher('${escapeAttribute(t.id)}')">🗑</button></div></article>`;
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
    document.getElementById("studentClassLabel").textContent = item?.classId ? getClassName(item.classId) : "Выберите класс";
    renderClassPicker("studentClassPicker", item?.classId || "", false, "pickStudentClass");
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
    if(!adminMode) return showToast("Сначала включите режим администратора", "error");
    const item = db.students.find(s => s.id === id);
    if (!item || !confirm(`Удалить ученика "${item.name}"? Перед удалением будет создана точка восстановления.`)) return;
    try {
        await api(`/api/students/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadDatabase();
        selectedStudents.delete(id); showToast("Ученик удалён. Точка восстановления сохранена.", "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

function renderStudents() {
    const tbody = document.getElementById("studentsTable");
    const cards = document.getElementById("studentsCardsView");
    const query = (document.getElementById("studentFilter")?.value || "").trim().toLocaleLowerCase("kk-KZ");
    const classFilter = document.getElementById("studentClassFilter")?.value || "";
    const statusFilter = document.getElementById("studentStatusFilter")?.value || "";
    const list = db.students.filter(s => {
        const matchesQuery = !query || String(s.name || "").toLocaleLowerCase("kk-KZ").includes(query) || String(s.iin || "").includes(query);
        const matchesClass = !classFilter || s.classId === classFilter;
        const matchesStatus = !statusFilter || normalizeStatus(s.status) === statusFilter;
        return matchesQuery && matchesClass && matchesStatus;
    }).sort((a,b)=>kkCollator.compare(String(a.name||""),String(b.name||"")));
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty">Ученики не найдены</td></tr>`;
        if(cards) cards.innerHTML = `<div class="card empty">Ученики не найдены</div>`;
        return;
    }
    tbody.innerHTML = list.map((s, index) => `<tr><td><input class="student-select" type="checkbox" data-id="${escapeAttribute(s.id)}" ${selectedStudents.has(s.id)?"checked":""} onchange="toggleStudentSelection('${escapeAttribute(s.id)}',this.checked)"></td><td>${index + 1}</td><td>${escapeHTML(s.name)}</td><td>${escapeHTML(s.iin)}</td><td>${formatDate(s.birthDate)}</td><td>${escapeHTML(getClassName(s.classId))}</td><td>${statusBadge(s.status)}</td><td>${escapeHTML(s.note || "—")}</td><td class="actions"><button class="icon-btn" onclick="openStudentModal('${escapeAttribute(s.id)}')">✏️</button><button class="icon-btn danger admin-only" onclick="deleteStudent('${escapeAttribute(s.id)}')">🗑</button></td></tr>`).join("");
    if(cards) cards.innerHTML = list.map(s => `<article class="person-card"><label class="card-select"><input type="checkbox" ${selectedStudents.has(s.id)?"checked":""} onchange="toggleStudentSelection('${escapeAttribute(s.id)}',this.checked)"> Выбрать</label><div class="person-card-top"><div class="person-avatar">👨‍🎓</div><div><h3>${escapeHTML(s.name)}</h3><p>${escapeHTML(getClassName(s.classId))}</p></div></div><div class="person-meta"><span>ИИН: <strong>${escapeHTML(s.iin)}</strong></span><span>Дата рождения: <strong>${formatDate(s.birthDate)}</strong></span><span>${statusBadge(s.status)}</span>${s.note ? `<span class="person-note">${escapeHTML(s.note)}</span>` : ""}</div><div class="person-actions"><button class="icon-btn" onclick="openStudentModal('${escapeAttribute(s.id)}')">✏️</button><button class="icon-btn danger admin-only" onclick="deleteStudent('${escapeAttribute(s.id)}')">🗑</button></div></article>`).join("");
    updateBulkUI();
}

function visibleStudents() {
    const query=(document.getElementById("studentFilter")?.value||"").trim().toLocaleLowerCase("kk-KZ");
    const classFilter=document.getElementById("studentClassFilter")?.value||""; const statusFilter=document.getElementById("studentStatusFilter")?.value||"";
    return sortByKazakhName(db.students.filter(st=>(!query||String(st.name||"").toLocaleLowerCase("kk-KZ").includes(query)||String(st.iin||"").includes(query))&&(!classFilter||st.classId===classFilter)&&(!statusFilter||normalizeStatus(st.status)===statusFilter)));
}
function toggleStudentSelection(id,checked){checked?selectedStudents.add(id):selectedStudents.delete(id);updateBulkUI();}
function updateBulkUI(){
    const el=document.getElementById("selectedCount"); if(el) el.textContent=`Выбрано: ${selectedStudents.size}`;
    const all=document.getElementById("selectAllStudents"); const visible=visibleStudents(); if(all) all.checked=visible.length>0&&visible.every(s=>selectedStudents.has(s.id));
}
function selectAllVisible(checked){for(const st of visibleStudents()) checked?selectedStudents.add(st.id):selectedStudents.delete(st.id);renderStudents();}
async function bulkAction(action){
    if(!adminMode) return showToast("Сначала включите режим администратора", "error");
    const ids=[...selectedStudents]; if(!ids.length)return showToast("Выберите учеников","error");
    const body={ids,action};
    if(action==="class"){body.classId=document.getElementById("bulkClass")?.value||"";if(!body.classId)return showToast("Выберите класс","error");}
    if(action==="status")body.status=document.getElementById("bulkStatus")?.value||"Активный";
    if(action==="delete"&&!confirm(`Удалить ${ids.length} учеников? Перед удалением будет создана точка восстановления.`))return;
    try{await api("/api/students/bulk",{method:"POST",body:JSON.stringify(body)});selectedStudents.clear();await loadDatabase();showToast("Массовая операция выполнена","success");}catch(e){showToast(apiErrorMessage(e),"error");}
}
function selectedStudentObjects(){return sortByKazakhName(db.students.filter(s=>selectedStudents.has(s.id)));}
function bulkExport(){const list=selectedStudentObjects();if(!list.length)return showToast("Выберите учеников","error");exportExcelForStudents(list,"Выбранные_ученики");}
function bulkPrint(){const list=selectedStudentObjects();if(!list.length)return showToast("Выберите учеников","error");printStudents(list,"Выбранные ученики");}

function printStudents(students,title){
    const rows=sortByKazakhName(students).map((st,i)=>{const cls=getClass(st.classId),teacher=cls?getTeacher(cls.teacherId):null;return `<tr><td>${i+1}</td><td>${escapeHTML(st.name)}</td><td>${escapeHTML(st.iin)}</td><td>${formatDate(st.birthDate)}</td><td>${escapeHTML(cls?.name||"")}</td><td>${escapeHTML(teacher?.name||"")}</td><td>${escapeHTML(st.note||"")}</td></tr>`}).join("");
    const w=window.open("","_blank"); if(!w)return showToast("Разрешите всплывающие окна для печати","error");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;font-size:9pt}h2{text-align:center;margin:0 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:4px;vertical-align:middle;word-wrap:break-word}th{text-align:center;background:#eee}th:nth-child(1){width:4%}th:nth-child(2){width:24%}th:nth-child(3){width:13%}th:nth-child(4){width:12%}th:nth-child(5){width:7%}th:nth-child(6){width:23%}th:nth-child(7){width:17%}</style></head><body><h2>${escapeHTML(title)}</h2><table><thead><tr><th>№</th><th>ФИО</th><th>ИИН</th><th>Дата рождения</th><th>Класс</th><th>Классный руководитель</th><th>Примечание</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>{window.print()}<\/script></body></html>`);w.document.close();
}
function printClassList(classId){const cls=getClass(classId);if(!cls)return;printStudents(db.students.filter(s=>s.classId===classId),`Класс ${cls.name}`);}

async function loadBackupPoints(){
    try{const data=await api("/api/backups");const box=document.getElementById("backupPoints");if(!box)return;box.innerHTML=data.items?.length?data.items.map(b=>`<div class="backup-point"><div><strong>${escapeHTML(b.reason)}</strong><small>${escapeHTML(String(b.createdAt||"").replace("T"," "))}</small></div><button class="btn btn-secondary admin-only" onclick="restoreBackupPoint('${escapeAttribute(b.id)}')">↩ Восстановить</button></div>`).join(""):`<span class="hint">Точек восстановления пока нет</span>`;applyAdminMode();}catch(e){showToast(apiErrorMessage(e),"error");}
}
async function restoreBackupPoint(id){
    if(!adminMode) return showToast("Сначала включите режим администратора", "error");if(!confirm("Восстановить базу до выбранной точки? Текущее состояние тоже будет сохранено."))return;try{await api(`/api/backups/${encodeURIComponent(id)}/restore`,{method:"POST",body:"{}"});await loadDatabase();await loadBackupPoints();showToast("База восстановлена","success");}catch(e){showToast(apiErrorMessage(e),"error");}}

function populateBulkClassSelect(){const sel=document.getElementById("bulkClass");if(sel)sel.innerHTML=`<option value="">Перевести в класс…</option>`+schoolClasses().map(c=>`<option value="${escapeAttribute(c.id)}">${escapeHTML(c.name)}</option>`).join("");}

function populateStudentClassSelect() {
    const selected = document.getElementById("studentClass")?.value || "";
    renderClassPicker("studentClassPicker", selected, false, "pickStudentClass");
}

function populateStudentFilters() {
    const selected = document.getElementById("studentClassFilter")?.value || "";
    renderClassPicker("studentClassFilterPicker", selected, true, "pickStudentFilterClass");
    const label = document.getElementById("studentClassFilterLabel");
    if(label) label.textContent = selected ? getClassName(selected) : "Все классы";
}

function populateTeacherSelect() {
    const select = document.getElementById("classTeacher");
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Не назначен</option>` + sortByKazakhName(db.teachers).map(t => `<option value="${escapeAttribute(t.id)}">${escapeHTML(t.name)}</option>`).join("");
    const search=document.getElementById("classTeacherSearch"); if(search) search.value="";
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
    downloadBlob(JSON.stringify(db, null, 2), `Классы резерв.json`, "application/json;charset=utf-8");
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

function exportStudentsExcel() { exportClassesReserveExcel(); }
function exportExcelFromBackup() {
    const classId = document.getElementById("excelClassSelect").value;
    classId ? exportClassExcel(classId) : exportClassesReserveExcel();
}
function exportClassExcel(classId) {
    const item = getClass(classId);
    if (!item) return;
    exportExcelForStudents(sortByKazakhName(db.students.filter(s => s.classId === classId)), `ученики ${sanitizeFileName(item.name)}`, item.name, false);
}
function setupStudentWorksheet(workbook, sheetName, students) {
    const safeSheetName = String(sheetName || "Ученики").replace(/[\\/*?:\[\]]/g, "_").slice(0,31) || "Ученики";
    const worksheet = workbook.addWorksheet(safeSheetName, {
        pageSetup: {
            paperSize: 9,
            orientation: "landscape",
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            horizontalCentered: true,
            margins: { left: 0.2, right: 0.2, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 }
        },
        properties: { defaultRowHeight: 18 }
    });
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
        worksheet.addRow({num:index+1,name:s.name||"",iin:s.iin||"",birthDate:formatDate(s.birthDate),className:cls?.name||"",teacher:teacher?.name||"",note:s.note||""});
    });
    const count=students.length, dataRowHeight=count<=15?26:count<=25?22:count<=35?19:17;
    const thin={style:"thin",color:{argb:"FF000000"}};
    worksheet.eachRow({includeEmpty:true},(row,rowNumber)=>{
        row.height=rowNumber===1?28:dataRowHeight;
        row.eachCell({includeEmpty:true},cell=>{
            cell.border={top:thin,left:thin,bottom:thin,right:thin};
            cell.alignment={horizontal:rowNumber===1?"center":([1,3,4,5].includes(cell.col)?"center":"left"),vertical:"middle",wrapText:true};
            if(rowNumber===1){cell.font={bold:true,size:10};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFE9EEF7"}};}
            else cell.font={size:count>35?9:10};
        });
    });
    worksheet.views=[{state:"frozen",ySplit:1}];
    worksheet.autoFilter={from:"A1",to:"G1"};
    worksheet.printArea=`A1:G${Math.max(1,count+1)}`;
    worksheet.pageSetup.printTitlesRow="1:1";
    worksheet.headerFooter.oddHeader=`&C&"Arial,Bold"Класс ${safeSheetName}`;
    worksheet.headerFooter.oddFooter="Страница &P из &N";
    return worksheet;
}
async function downloadWorkbook(workbook, filename) {
    const buffer=await workbook.xlsx.writeBuffer();
    const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
async function exportClassesReserveExcel() {
    if(typeof ExcelJS==="undefined") return showToast("Excel-библиотека не загружена. Проверьте интернет-соединение.","error");
    const workbook=new ExcelJS.Workbook();workbook.creator="Школа №33";workbook.created=new Date();
    const classes=schoolClasses();
    for(const cls of classes){
        const students=sortByKazakhName(db.students.filter(s=>s.classId===cls.id));
        setupStudentWorksheet(workbook,cls.name,students);
    }
    if(!classes.length) setupStudentWorksheet(workbook,"Ученики",sortByKazakhName(db.students));
    await downloadWorkbook(workbook,`Классы резерв_${getDateForFile()}.xlsx`);
    showToast("Резерв классов Excel скачан: каждый класс на отдельном листе","success");
}
async function exportExcelForStudents(students, filenameBase, sheetName="Ученики", addDate=true) {
    if(typeof ExcelJS==="undefined") return showToast("Excel-библиотека не загружена. Проверьте интернет-соединение.","error");
    const workbook=new ExcelJS.Workbook();workbook.creator="Школа №33";workbook.created=new Date();
    setupStudentWorksheet(workbook,sheetName,students);
    await downloadWorkbook(workbook,`${filenameBase}${addDate?`_${getDateForFile()}`:""}.xlsx`);
    showToast("Excel готов для печати на A4","success");
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
    select.innerHTML = `<option value="">Все классы</option>` + schoolClasses().map(c => `<option value="${escapeAttribute(c.id)}">${escapeHTML(c.name)}</option>`).join("");
    if (db.classes.some(c => c.id === current)) select.value = current;
}

async function clearDatabase() {
    if(!adminMode) return showToast("Сначала включите режим администратора", "error");
    if (!confirm("⚠️ Будут удалены ВСЕ ученики, классы и преподаватели из общей D1-базы. Продолжить?")) return;
    try { await api("/api/database/clear", { method: "POST", body: "{}" }); await loadDatabase(); await loadBackupPoints(); showToast("Общая база данных полностью очищена", "success"); } catch (error) { showToast(apiErrorMessage(error), "error"); }
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
    if(!adminMode) return showToast("Сначала включите режим администратора", "error");
    const nextDate = document.getElementById("promotionDateInput")?.value || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return showToast("Выберите дату перевода", "error");
    try {
        await api("/api/promotion/settings", { method: "PUT", body: JSON.stringify({ nextDate }) });
        showToast("Дата ежегодного перевода сохранена", "success");
        await loadPromotionStatus();
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

function populateSinglePromotionClassSelect() {
    const select = document.getElementById("singlePromotionClass");
    if (!select) return;
    const current = select.value;
    const classes = schoolClasses();
    select.innerHTML = `<option value="">Выберите класс…</option>` + classes.map(c => `<option value="${escapeAttribute(c.id)}">${escapeHTML(c.name)}</option>`).join("");
    if (classes.some(c => c.id === current)) select.value = current;
    updateSinglePromotionInfo();
}

function updateSinglePromotionInfo() {
    const select = document.getElementById("singlePromotionClass");
    const info = document.getElementById("singlePromotionInfo");
    if (!select || !info) return;
    const cls = getClass(select.value);
    if (!cls) { info.textContent = "Выберите класс"; return; }
    const grade = getGradeNumber(cls.name);
    const count = db.students.filter(s => s.classId === cls.id).length;
    if (grade === 11) info.innerHTML = `<strong>${escapeHTML(cls.name)} → Выпуск</strong><span>${count} учеников. Класс и его ученики будут удалены из базы.</span>`;
    else {
        const nextName = String(cls.name).replace(/^\s*\d+/, String(grade + 1));
        info.innerHTML = `<strong>${escapeHTML(cls.name)} → ${escapeHTML(nextName)}</strong><span>${count} учеников</span>`;
    }
}

async function runSinglePromotion() {
    const classId = document.getElementById("singlePromotionClass")?.value || "";
    const cls = getClass(classId);
    if (!cls) return showToast("Выберите класс", "error");
    const grade = getGradeNumber(cls.name);
    const actionText = grade === 11 ? `выпустить ${cls.name} и удалить этот класс с учениками` : `перевести ${cls.name} на следующую ступень`;
    if (!confirm(`Выполнить: ${actionText}?`)) return;
    if(!adminMode) return showToast("Сначала включите режим администратора", "error");
    try {
        const result = await api("/api/promotion/class", { method: "POST", body: JSON.stringify({ classId }) });
        await loadDatabase();
        populateSinglePromotionClassSelect();
        await loadBackupPoints();
        showToast(result.graduated ? `Класс ${cls.name} выпущен` : `Класс переведён: ${result.fromName} → ${result.toName}`, "success");
    } catch (error) { showToast(apiErrorMessage(error), "error"); }
}

async function runPromotionNow() {
    if (!confirm("Выполнить перевод классов сейчас? Ученики 11-х классов и 11-е классы будут удалены. Рекомендуется сначала скачать резервную копию.")) return;
    if(!adminMode) return showToast("Сначала включите режим администратора", "error");
    try {
        const result = await api("/api/promotion/run", { method: "POST", body: "{}" });
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
    document.getElementById("runSinglePromotionBtn")?.addEventListener("click", runSinglePromotion);
    document.getElementById("singlePromotionClass")?.addEventListener("change", updateSinglePromotionInfo);
    document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
    document.getElementById("adminToggle")?.addEventListener("click", toggleAdminMode);
    document.getElementById("selectAllStudents")?.addEventListener("change", e=>selectAllVisible(e.target.checked));
    document.getElementById("bulkMoveBtn")?.addEventListener("click", ()=>bulkAction("class"));
    document.getElementById("bulkStatusBtn")?.addEventListener("click", ()=>bulkAction("status"));
    document.getElementById("bulkDeleteBtn")?.addEventListener("click", ()=>bulkAction("delete"));
    document.getElementById("bulkExportBtn")?.addEventListener("click", bulkExport);
    document.getElementById("bulkPrintBtn")?.addEventListener("click", bulkPrint);

    document.querySelectorAll("[data-close-modal]").forEach(btn => {
        btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
    });
}

// Make public functions available for the existing action buttons in rendered tables/cards.
Object.assign(window, {
    openStudentModal, openClassModal, openTeacherModal,
    closeModal, saveStudent, saveClass, saveTeacher,
    deleteStudent, deleteClass, deleteTeacher,
    viewClassStudents, exportClassExcel, printClassList, toggleClassPicker, pickStudentFilterClass, pickStudentClass, setStudentView, setTeacherView, toggleStudentSelection, restoreBackupPoint, runSinglePromotion, updateSinglePromotionInfo, loadDatabaseChecks, loadAuditLog, filterClassTeacherOptions
});

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    await checkAdminMode();
    updateD1Status();
    setInterval(updateD1Status, 60000);
    setupNavigation();
    bindStaticButtons();
    applyViews();
    document.getElementById("studentForm")?.addEventListener("submit", saveStudent);
    document.getElementById("classForm")?.addEventListener("submit", saveClass);
    document.getElementById("teacherForm")?.addEventListener("submit", saveTeacher);
    document.querySelectorAll(".modal").forEach(modal => modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); }));
    updateCurrentDate();
    setInterval(updateCurrentDate, 60000);
    await loadDatabase();
});

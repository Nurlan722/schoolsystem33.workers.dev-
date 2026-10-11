const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    teacher_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    iin TEXT NOT NULL UNIQUE,
    birth_date TEXT NOT NULL DEFAULT '',
    class_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Активный',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '', snapshot TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, action TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY, expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_students_iin ON students(iin)`,
  `CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id)`,
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function id() {
  return crypto.randomUUID();
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeIIN(value) {
  return clean(value).replace(/\s+/g, "");
}

function validSchoolClassName(value) {
  const m = clean(value).match(/^(\d+)/);
  if (!m) return false;
  const grade = Number(m[1]);
  return Number.isInteger(grade) && grade >= 1 && grade <= 11;
}

function normalizeStatus(value) {
  const v = clean(value).toLowerCase();
  if (v === "выбыл") return "Выбыл";
  if (v === "переведён" || v === "переведен") return "Переведён";
  return "Активный";
}

function mapTeacher(row) {
  return { id: row.id, name: row.name, subject: row.subject || "" };
}

function mapClass(row) {
  return { id: row.id, name: row.name, teacherId: row.teacher_id || "" };
}

function mapStudent(row) {
  return {
    id: row.id,
    name: row.name,
    iin: row.iin,
    birthDate: row.birth_date || "",
    classId: row.class_id || "",
    status: row.status || "Активный",
    note: row.note || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

async function ensureSchema(db) {
  for (const statement of SCHEMA) await db.prepare(statement).run();
  await db.prepare("CREATE TABLE IF NOT EXISTS school_map (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}

async function getState(db) {
  const [students, classes, teachers] = await Promise.all([
    db.prepare("SELECT id,name,iin,birth_date,class_id,status,note,created_at,updated_at FROM students ORDER BY name COLLATE NOCASE").all(),
    db.prepare("SELECT id,name,teacher_id FROM classes ORDER BY name COLLATE NOCASE").all(),
    db.prepare("SELECT id,name,subject FROM teachers ORDER BY name COLLATE NOCASE").all(),
  ]);

  return {
    students: students.results.map(mapStudent),
    classes: classes.results.map(mapClass),
    teachers: teachers.results.map(mapTeacher),
  };
}

function isConstraintError(err) {
  return /unique|constraint|UNIQUE/i.test(String(err?.message || err));
}

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Некорректный JSON-запрос");
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addOneYearISO(dateString) {
  const [y, m, d] = String(dateString).split("-").map(Number);
  const date = new Date(Date.UTC(y + 1, (m || 1) - 1, d || 1));
  if (date.getUTCMonth() !== (m || 1) - 1) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

async function getSetting(db, key) {
  const row = await db.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  return row?.value || "";
}

async function setSetting(db, key, value) {
  await db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(key, String(value || "")).run();
}

async function getPromotionStatus(db) {
  let nextDate = await getSetting(db, "next_promotion_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
    nextDate = addOneYearISO(todayISO());
    await setSetting(db, "next_promotion_date", nextDate);
  }
  return { nextDate, lastDate: await getSetting(db, "last_promotion_date") };
}

function parseGradeName(name) {
  const match = String(name || "").match(/^(\s*)(\d{1,2})(.*)$/);
  if (!match) return null;
  const grade = Number(match[2]);
  if (grade < 1 || grade > 11) return null;
  return { grade, nextName: `${match[1]}${grade + 1}${match[3]}` };
}

async function runPromotion(db, force = false) {
  const status = await getPromotionStatus(db);
  const today = todayISO();
  if (!force && today < status.nextDate) return { ran: false, ...status };

  const result = await db.prepare("SELECT id,name FROM classes").all();
  const classes = result.results.map(row => ({ ...row, parsed: parseGradeName(row.name) })).filter(row => row.parsed);
  let graduatedStudents = 0;
  let graduatedClasses = 0;
  let promotedClasses = 0;

  for (const cls of classes.filter(c => c.parsed.grade === 11)) {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM students WHERE class_id=?").bind(cls.id).first();
    graduatedStudents += Number(count?.count || 0);
    await db.prepare("DELETE FROM students WHERE class_id=?").bind(cls.id).run();
    await db.prepare("DELETE FROM classes WHERE id=?").bind(cls.id).run();
    graduatedClasses++;
  }

  for (let grade = 10; grade >= 1; grade--) {
    for (const cls of classes.filter(c => c.parsed.grade === grade)) {
      await db.prepare("UPDATE classes SET name=? WHERE id=?").bind(cls.parsed.nextName, cls.id).run();
      promotedClasses++;
    }
  }

  await setSetting(db, "last_promotion_date", today);
  let nextDate = status.nextDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || today >= nextDate) nextDate = addOneYearISO(nextDate || today);
  await setSetting(db, "next_promotion_date", nextDate);
  return { ran: true, nextDate, lastDate: today, graduatedStudents, graduatedClasses, promotedClasses };
}


async function createBackup(db, reason = "Автоматическая точка восстановления") {
  const state = await getState(db);
  const backupId = id();
  const snapshot = JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    students: state.students,
    classes: state.classes,
    teachers: state.teachers,
  });

  await db.prepare("INSERT INTO backups (id,reason,snapshot) VALUES (?,?,?)")
    .bind(backupId, clean(reason), snapshot).run();

  // Не даём автоматическим точкам восстановления бесконечно разрастаться.
  await db.prepare(`DELETE FROM backups WHERE id NOT IN (
    SELECT id FROM backups ORDER BY datetime(created_at) DESC LIMIT 3
  )`).run();

  return backupId;
}

async function restoreSnapshot(db, snapshot) {
  const body = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
  if (!body || !Array.isArray(body.students) || !Array.isArray(body.classes) || !Array.isArray(body.teachers)) throw new Error('Некорректная резервная копия');
  const statements=[db.prepare('DELETE FROM students'),db.prepare('DELETE FROM classes'),db.prepare('DELETE FROM teachers')];
  for (const t of body.teachers) statements.push(db.prepare('INSERT INTO teachers (id,name,subject) VALUES (?,?,?)').bind(clean(t.id)||id(),clean(t.name),clean(t.subject)));
  for (const c of body.classes) statements.push(db.prepare('INSERT INTO classes (id,name,teacher_id) VALUES (?,?,?)').bind(clean(c.id)||id(),clean(c.name),clean(c.teacherId)));
  for (const st of body.students) statements.push(db.prepare(`INSERT INTO students (id,name,iin,birth_date,class_id,status,note) VALUES (?,?,?,?,?,?,?)`).bind(clean(st.id)||id(),clean(st.name),normalizeIIN(st.iin),clean(st.birthDate),clean(st.classId),normalizeStatus(st.status),clean(st.note)));
  for (let i=0;i<statements.length;i+=100) await db.batch(statements.slice(i,i+100));
}

async function logAction(db, action, details = "") {
  await db.prepare("INSERT INTO audit_logs (id,action,details) VALUES (?,?,?)").bind(id(), clean(action), clean(details)).run();
  await db.prepare(`DELETE FROM audit_logs WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY datetime(created_at) DESC LIMIT 500)`).run();
}

async function createAdminSession(db) {
  const token = id() + id();
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  await db.prepare("DELETE FROM admin_sessions WHERE datetime(expires_at) <= datetime('now')").run();
  await db.prepare("INSERT INTO admin_sessions (token,expires_at) VALUES (?,?)").bind(token, expires).run();
  return { token, expiresAt: expires };
}

async function isAdmin(request, db) {
  const token = clean(request.headers.get("x-admin-token"));
  if (!token) return false;
  const row = await db.prepare("SELECT token FROM admin_sessions WHERE token=? AND datetime(expires_at) > datetime('now')").bind(token).first();
  return !!row;
}

async function requireAdmin(request, db) {
  if (!await isAdmin(request, db)) throw Object.assign(new Error("Требуется режим администратора."), { status: 403 });
}

async function databaseChecks(db) {
  const checks = [];
  const invalidIin = await db.prepare("SELECT id,name,iin FROM students WHERE length(iin)<>12 OR iin GLOB '*[^0-9]*' LIMIT 100").all();
  if (invalidIin.results.length) checks.push({type:"error",title:"Некорректный ИИН",count:invalidIin.results.length,items:invalidIin.results.map(r=>`${r.name} — ${r.iin||'пусто'}`)});
  const noClass = await db.prepare("SELECT s.id,s.name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE c.id IS NULL LIMIT 100").all();
  if (noClass.results.length) checks.push({type:"warning",title:"Ученики без существующего класса",count:noClass.results.length,items:noClass.results.map(r=>r.name)});
  const noBirth = await db.prepare("SELECT id,name FROM students WHERE trim(birth_date)='' LIMIT 100").all();
  if (noBirth.results.length) checks.push({type:"warning",title:"Не указана дата рождения",count:noBirth.results.length,items:noBirth.results.map(r=>r.name)});
  const noTeacher = await db.prepare("SELECT name FROM classes WHERE trim(teacher_id)='' OR teacher_id NOT IN (SELECT id FROM teachers) ORDER BY name LIMIT 100").all();
  if (noTeacher.results.length) checks.push({type:"warning",title:"Классы без классного руководителя",count:noTeacher.results.length,items:noTeacher.results.map(r=>r.name)});
  const duplicatePerson = await db.prepare("SELECT name,birth_date,COUNT(*) cnt FROM students WHERE trim(name)<>'' AND trim(birth_date)<>'' GROUP BY lower(trim(name)),birth_date HAVING COUNT(*)>1 LIMIT 100").all();
  if (duplicatePerson.results.length) checks.push({type:"warning",title:"Возможные дубликаты ФИО + дата рождения",count:duplicatePerson.results.length,items:duplicatePerson.results.map(r=>`${r.name} — ${r.birth_date} (${r.cnt})`)});
  const invalidClass = await db.prepare("SELECT name FROM classes").all();
  const bad=invalidClass.results.filter(r=>!validSchoolClassName(r.name));
  if (bad.length) checks.push({type:"error",title:"Классы вне диапазона 1–11",count:bad.length,items:bad.map(r=>r.name)});
  return checks;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "content-type" } });
  }

  if (!env.DB) return error("D1 binding DB не подключён к Worker.", 500);
  await ensureSchema(env.DB);

  if (path === "/api/health" && method === "GET") {
    const probe = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: probe?.ok === 1, database: "D1" });
  }

  if (path === "/api/school-map" && method === "GET") {
    const row = await env.DB.prepare("SELECT payload FROM school_map WHERE id=1").first();
    return json({ok:true,map:row?JSON.parse(row.payload):null});
  }
  if (path === "/api/school-map" && method === "PUT") {
    await requireAdmin(request,env.DB);
    const body = await parseBody(request);
    const map=body.map;
    if(!map||typeof map!=="object"||!map.floors||!["1","2","3","4"].every(f=>Array.isArray(map.floors[f])))return error("Неверный формат карты.",400);
    const payload=JSON.stringify(map);
    if(payload.length>1500000)return error("Карта слишком большая. Уменьшите размер изображений.",413);
    await env.DB.prepare("INSERT INTO school_map(id,payload,updated_at) VALUES(1,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=datetime('now')").bind(payload).run();
    return json({ok:true});
  }
  if (path === "/api/admin/login" && method === "POST") {
    const body = await parseBody(request);
    if (clean(body.password) !== "3333") return error("Неверный пароль.", 403);
    const session = await createAdminSession(env.DB);
    await logAction(env.DB, "Вход в режим администратора");
    return json({ok:true,...session});
  }
  if (path === "/api/admin/status" && method === "GET") return json({ok:true,admin:await isAdmin(request,env.DB)});
  if (path === "/api/admin/logout" && method === "POST") {
    const token=clean(request.headers.get("x-admin-token"));
    if(token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token=?").bind(token).run();
    return json({ok:true});
  }
  if (path === "/api/checks" && method === "GET") return json({ok:true,checks:await databaseChecks(env.DB)});
  if (path === "/api/audit" && method === "GET") {
    const rows=await env.DB.prepare("SELECT id,action,details,created_at FROM audit_logs ORDER BY datetime(created_at) DESC LIMIT 200").all();
    return json({ok:true,items:rows.results.map(r=>({id:r.id,action:r.action,details:r.details,createdAt:r.created_at}))});
  }

  if (path === "/api/state" && method === "GET") {
    await runPromotion(env.DB, false);
    return json({ ok: true, ...await getState(env.DB) });
  }

  if (path === "/api/promotion/status" && method === "GET") {
    const status = await getPromotionStatus(env.DB);
    return json({ ok: true, ...status });
  }

  if (path === "/api/promotion/settings" && method === "PUT") {
    await requireAdmin(request, env.DB);
    const body = await parseBody(request);
    const nextDate = clean(body.nextDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return error("Укажите корректную дату перевода.");
    await setSetting(env.DB, "next_promotion_date", nextDate);
    await logAction(env.DB,"Изменена дата ежегодного перевода",nextDate);
    return json({ ok: true, nextDate });
  }

  if (path === "/api/promotion/run" && method === "POST") {
    await requireAdmin(request, env.DB);
    const body = await parseBody(request);
    await createBackup(env.DB, "Перед ручным переводом классов");
    const result=await runPromotion(env.DB, true);
    await logAction(env.DB,"Ручной перевод всех классов",`Переведено: ${result.promotedClasses||0}; выпущено учеников: ${result.graduatedStudents||0}`);
    return json({ ok: true, ...result });
  }

  if (path === "/api/promotion/class" && method === "POST") {
    await requireAdmin(request, env.DB);
    const body = await parseBody(request);
    const classId = clean(body.classId);
    if (!classId) return error("Выберите класс.");
    const cls = await env.DB.prepare("SELECT id,name FROM classes WHERE id=?").bind(classId).first();
    if (!cls) return error("Класс не найден.", 404);
    const parsed = parseGradeName(cls.name);
    if (!parsed) return error("Можно переводить только классы с 1 по 11.");
    await createBackup(env.DB, `Перед переводом класса ${clean(cls.name)}`);
    if (parsed.grade === 11) {
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM students WHERE class_id=?").bind(classId).first();
      await env.DB.prepare("DELETE FROM students WHERE class_id=?").bind(classId).run();
      await env.DB.prepare("DELETE FROM classes WHERE id=?").bind(classId).run();
      await logAction(env.DB,"Выпущен 11 класс",`${cls.name} · учеников: ${Number(count?.count||0)}`);
      return json({ ok: true, graduated: true, fromName: cls.name, students: Number(count?.count || 0) });
    }
    const fromName = cls.name;
    const toName = parsed.nextName;
    const duplicate = await env.DB.prepare("SELECT id FROM classes WHERE name=? AND id<>?").bind(toName,classId).first();
    if (duplicate) return error(`Класс ${toName} уже существует. Сначала проверьте классы, чтобы не объединить разные классы.` ,409);
    await env.DB.prepare("UPDATE classes SET name=? WHERE id=?").bind(toName,classId).run();
    await logAction(env.DB,"Переведён отдельный класс",`${fromName} → ${toName}`);
    return json({ ok: true, graduated: false, fromName, toName });
  }

  if (path === "/api/students" && method === "POST") {
    const body = await parseBody(request);
    const name = clean(body.name);
    const iin = normalizeIIN(body.iin);
    const birthDate = clean(body.birthDate);
    const classId = clean(body.classId);
    const status = normalizeStatus(body.status);
    const note = clean(body.note);

    if (!name || !/^\d{12}$/.test(iin) || !classId) return error("Заполните ФИО, корректный ИИН из 12 цифр и класс.");
    try {
      const newId = id();
      await env.DB.prepare(`INSERT INTO students (id,name,iin,birth_date,class_id,status,note) VALUES (?,?,?,?,?,?,?)`)
        .bind(newId, name, iin, birthDate, classId, status, note).run();
      const classInfo = await env.DB.prepare(`SELECT c.name AS class_name, t.name AS teacher_name FROM classes c LEFT JOIN teachers t ON t.id=c.teacher_id WHERE c.id=?`).bind(classId).first();
      const className = clean(classInfo?.class_name) || "класс не указан";
      const teacherName = clean(classInfo?.teacher_name) || "классный руководитель не назначен";
      await logAction(env.DB, "Добавлен ученик", `${name} · ИИН ${iin} · класс ${className} · преподаватель ${teacherName}`);
      return json({ ok: true, id: newId });
    } catch (err) {
      return error(isConstraintError(err) ? "Ученик с таким ИИН уже есть в базе." : "Не удалось сохранить ученика.", isConstraintError(err) ? 409 : 500);
    }
  }

  if (path.startsWith("/api/students/") && (method === "PUT" || method === "DELETE")) {
    const studentId = decodeURIComponent(path.slice("/api/students/".length));
    if (!studentId) return error("Не указан ID ученика.");

    if (method === "DELETE") {
      await createBackup(env.DB, "Перед удалением ученика");
      await requireAdmin(request, env.DB);
      const old=await env.DB.prepare("SELECT name,iin FROM students WHERE id=?").bind(studentId).first();
      await env.DB.prepare("DELETE FROM students WHERE id=?").bind(studentId).run();
      await logAction(env.DB,"Удалён ученик",old?`${old.name} · ИИН ${old.iin}`:studentId);
      return json({ ok: true });
    }

    const body = await parseBody(request);
    const name = clean(body.name);
    const iin = normalizeIIN(body.iin);
    const birthDate = clean(body.birthDate);
    const classId = clean(body.classId);
    const status = normalizeStatus(body.status);
    const note = clean(body.note);
    if (!name || !/^\d{12}$/.test(iin) || !classId) return error("Заполните ФИО, корректный ИИН из 12 цифр и класс.");

    try {
      await env.DB.prepare(`UPDATE students SET name=?,iin=?,birth_date=?,class_id=?,status=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(name, iin, birthDate, classId, status, note, studentId).run();
      await logAction(env.DB,"Изменён ученик",`${name} · ИИН ${iin}`);
      return json({ ok: true });
    } catch (err) {
      return error(isConstraintError(err) ? "Другой ученик уже использует этот ИИН." : "Не удалось изменить ученика.", isConstraintError(err) ? 409 : 500);
    }
  }

  if (path === "/api/students/bulk" && method === "POST") {
    const body = await parseBody(request);
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(clean).filter(Boolean))] : [];
    if (!ids.length) return error("Не выбраны ученики.");
    await requireAdmin(request, env.DB);
    await createBackup(env.DB, `Перед массовой операцией: ${clean(body.action)}`);
    if (body.action === "delete") {
      for (const sid of ids) await env.DB.prepare("DELETE FROM students WHERE id=?").bind(sid).run();
    } else if (body.action === "class") {
      const classId=clean(body.classId); if (!classId) return error("Выберите класс.");
      for (const sid of ids) await env.DB.prepare("UPDATE students SET class_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(classId,sid).run();
    } else if (body.action === "status") {
      const status=normalizeStatus(body.status);
      for (const sid of ids) await env.DB.prepare("UPDATE students SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,sid).run();
    } else return error("Неизвестная массовая операция.");
    await logAction(env.DB,"Массовая операция",`${clean(body.action)} · учеников: ${ids.length}`);
    return json({ok:true,count:ids.length});
  }

  if (path === "/api/backups" && method === "GET") {
    const rows=await env.DB.prepare("SELECT id,reason,created_at FROM backups ORDER BY datetime(created_at) DESC LIMIT 3").all();
    return json({ok:true,items:rows.results.map(r=>({id:r.id,reason:r.reason,createdAt:r.created_at}))});
  }
  if (path.startsWith("/api/backups/") && method === "POST") {
    const rest=path.slice('/api/backups/'.length); const [backupId,action]=rest.split('/');
    const row=await env.DB.prepare("SELECT snapshot FROM backups WHERE id=?").bind(backupId).first();
    if (!row) return error("Резервная точка не найдена.",404);
    if (action === 'restore') { await requireAdmin(request, env.DB); await createBackup(env.DB,"Перед восстановлением резервной точки"); await restoreSnapshot(env.DB,row.snapshot); await logAction(env.DB,'Восстановлена резервная точка',backupId); return json({ok:true}); }
  }

  if (path === "/api/classes" && method === "POST") {
    const body = await parseBody(request);
    const name = clean(body.name);
    const teacherId = clean(body.teacherId);
    if (!name) return error("Введите название класса.");
    if (!validSchoolClassName(name)) return error("Класс должен быть только с 1 по 11.");
    try {
      const newId = id();
      await env.DB.prepare("INSERT INTO classes (id,name,teacher_id) VALUES (?,?,?)").bind(newId, name, teacherId).run();
      const teacher=teacherId?await env.DB.prepare("SELECT name FROM teachers WHERE id=?").bind(teacherId).first():null;
      await logAction(env.DB,"Добавлен класс",`${name} · руководитель: ${teacher?.name||'не назначен'}`);
      return json({ ok: true, id: newId });
    } catch (err) {
      return error(isConstraintError(err) ? "Такой класс уже существует." : "Не удалось сохранить класс.", isConstraintError(err) ? 409 : 500);
    }
  }

  if (path.startsWith("/api/classes/") && (method === "PUT" || method === "DELETE")) {
    const classId = decodeURIComponent(path.slice("/api/classes/".length));
    if (method === "DELETE") {
      await requireAdmin(request, env.DB);
      const old=await env.DB.prepare("SELECT name FROM classes WHERE id=?").bind(classId).first();
      await env.DB.batch([
        env.DB.prepare("UPDATE students SET class_id='' WHERE class_id=?").bind(classId),
        env.DB.prepare("DELETE FROM classes WHERE id=?").bind(classId),
      ]);
      await logAction(env.DB,"Удалён класс",old?.name||classId);
      return json({ ok: true });
    }
    const body = await parseBody(request);
    const name = clean(body.name);
    const teacherId = clean(body.teacherId);
    if (!name) return error("Введите название класса.");
    if (!validSchoolClassName(name)) return error("Класс должен быть только с 1 по 11.");
    try {
      await env.DB.prepare("UPDATE classes SET name=?,teacher_id=? WHERE id=?").bind(name, teacherId, classId).run();
      const teacher=teacherId?await env.DB.prepare("SELECT name FROM teachers WHERE id=?").bind(teacherId).first():null;
      await logAction(env.DB,"Изменён класс",`${name} · руководитель: ${teacher?.name||'не назначен'}`);
      return json({ ok: true });
    } catch (err) {
      return error(isConstraintError(err) ? "Такой класс уже существует." : "Не удалось изменить класс.", isConstraintError(err) ? 409 : 500);
    }
  }

  if (path === "/api/teachers" && method === "POST") {
    const body = await parseBody(request);
    const name = clean(body.name);
    const subject = clean(body.subject);
    if (!name) return error("Введите ФИО преподавателя.");
    const newId = id();
    await env.DB.prepare("INSERT INTO teachers (id,name,subject) VALUES (?,?,?)").bind(newId, name, subject).run();
    await logAction(env.DB,"Добавлен преподаватель",`${name} · ${subject||'без предмета'}`);
    return json({ ok: true, id: newId });
  }

  if (path.startsWith("/api/teachers/") && (method === "PUT" || method === "DELETE")) {
    const teacherId = decodeURIComponent(path.slice("/api/teachers/".length));
    if (method === "DELETE") {
      await requireAdmin(request, env.DB);
      const old=await env.DB.prepare("SELECT name FROM teachers WHERE id=?").bind(teacherId).first();
      await env.DB.batch([
        env.DB.prepare("UPDATE classes SET teacher_id='' WHERE teacher_id=?").bind(teacherId),
        env.DB.prepare("DELETE FROM teachers WHERE id=?").bind(teacherId),
      ]);
      await logAction(env.DB,"Удалён преподаватель",old?.name||teacherId);
      return json({ ok: true });
    }
    const body = await parseBody(request);
    const name = clean(body.name);
    const subject = clean(body.subject);
    if (!name) return error("Введите ФИО преподавателя.");
    await env.DB.prepare("UPDATE teachers SET name=?,subject=? WHERE id=?").bind(name, subject, teacherId).run();
    await logAction(env.DB,"Изменён преподаватель",`${name} · ${subject||'без предмета'}`);
    return json({ ok: true });
  }

  if (path === "/api/backup/import" && method === "POST") {
    await requireAdmin(request, env.DB);
    const body = await parseBody(request);
    if (!body || !Array.isArray(body.students) || !Array.isArray(body.classes) || !Array.isArray(body.teachers)) {
      return error("Неверный формат резервной копии.");
    }

    await createBackup(env.DB, "Перед импортом JSON/Excel");

    const statements = [
      env.DB.prepare("DELETE FROM students"),
      env.DB.prepare("DELETE FROM classes"),
      env.DB.prepare("DELETE FROM teachers"),
    ];

    for (const t of body.teachers) {
      const tid = clean(t.id) || id();
      const name = clean(t.name);
      if (name) statements.push(env.DB.prepare("INSERT INTO teachers (id,name,subject) VALUES (?,?,?)").bind(tid, name, clean(t.subject)));
    }
    for (const c of body.classes) {
      const cid = clean(c.id) || id();
      const name = clean(c.name);
      if (name) statements.push(env.DB.prepare("INSERT INTO classes (id,name,teacher_id) VALUES (?,?,?)").bind(cid, name, clean(c.teacherId)));
    }
    for (const s of body.students) {
      const sid = clean(s.id) || id();
      const name = clean(s.name);
      const iin = normalizeIIN(s.iin);
      if (name && /^\d{12}$/.test(iin)) {
        statements.push(env.DB.prepare("INSERT INTO students (id,name,iin,birth_date,class_id,status,note) VALUES (?,?,?,?,?,?,?)")
          .bind(sid, name, iin, clean(s.birthDate), clean(s.classId), normalizeStatus(s.status), clean(s.note)));
      }
    }

    try {
      for (let i = 0; i < statements.length; i += 100) await env.DB.batch(statements.slice(i, i + 100));
      await logAction(env.DB,"Импортирована резервная копия",`Ученики: ${body.students.length}, классы: ${body.classes.length}, преподаватели: ${body.teachers.length}`);
      return json({ ok: true });
    } catch (err) {
      return error("Не удалось импортировать резервную копию. Проверьте уникальность ИИН и классов.", 400);
    }
  }

  if (path === "/api/database/clear" && method === "POST") {
    await requireAdmin(request, env.DB);
    const body = await parseBody(request);
    await createBackup(env.DB, "Перед полной очисткой базы");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM students"),
      env.DB.prepare("DELETE FROM classes"),
      env.DB.prepare("DELETE FROM teachers"),
    ]);
    await logAction(env.DB,"Очищена база данных","Удалены ученики, классы и преподаватели");
    return json({ ok: true });
  }

  return error("API endpoint не найден.", 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (err) {
        console.error(err);
        return error(err?.message || "Внутренняя ошибка сервера.", err?.status || 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil((async () => {
      await ensureSchema(env.DB);
      await runPromotion(env.DB, false);
    })());
  },
};

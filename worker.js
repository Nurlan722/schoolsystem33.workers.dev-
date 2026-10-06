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
    return json({ ok: true, database: "D1" });
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
    const body = await parseBody(request);
    const nextDate = clean(body.nextDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return error("Укажите корректную дату перевода.");
    await setSetting(env.DB, "next_promotion_date", nextDate);
    return json({ ok: true, nextDate });
  }

  if (path === "/api/promotion/run" && method === "POST") {
    const body = await parseBody(request);
    if (clean(body.password) !== "3333") return error("Неверный пароль для ручного перевода классов.", 403);
    await createBackup(env.DB, "Перед ручным переводом классов");
    return json({ ok: true, ...await runPromotion(env.DB, true) });
  }

  if (path === "/api/promotion/class" && method === "POST") {
    const body = await parseBody(request);
    if (clean(body.password) !== "3333") return error("Неверный пароль для перевода класса.", 403);
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
      return json({ ok: true, graduated: true, fromName: cls.name, students: Number(count?.count || 0) });
    }
    const fromName = cls.name;
    const toName = parsed.nextName;
    const duplicate = await env.DB.prepare("SELECT id FROM classes WHERE name=? AND id<>?").bind(toName,classId).first();
    if (duplicate) return error(`Класс ${toName} уже существует. Сначала проверьте классы, чтобы не объединить разные классы.` ,409);
    await env.DB.prepare("UPDATE classes SET name=? WHERE id=?").bind(toName,classId).run();
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
      await env.DB.prepare("DELETE FROM students WHERE id=?").bind(studentId).run();
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
      return json({ ok: true });
    } catch (err) {
      return error(isConstraintError(err) ? "Другой ученик уже использует этот ИИН." : "Не удалось изменить ученика.", isConstraintError(err) ? 409 : 500);
    }
  }

  if (path === "/api/students/bulk" && method === "POST") {
    const body = await parseBody(request);
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(clean).filter(Boolean))] : [];
    if (!ids.length) return error("Не выбраны ученики.");
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
    if (action === 'restore') { await createBackup(env.DB,"Перед восстановлением резервной точки"); await restoreSnapshot(env.DB,row.snapshot); return json({ok:true}); }
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
      return json({ ok: true, id: newId });
    } catch (err) {
      return error(isConstraintError(err) ? "Такой класс уже существует." : "Не удалось сохранить класс.", isConstraintError(err) ? 409 : 500);
    }
  }

  if (path.startsWith("/api/classes/") && (method === "PUT" || method === "DELETE")) {
    const classId = decodeURIComponent(path.slice("/api/classes/".length));
    if (method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("UPDATE students SET class_id='' WHERE class_id=?").bind(classId),
        env.DB.prepare("DELETE FROM classes WHERE id=?").bind(classId),
      ]);
      return json({ ok: true });
    }
    const body = await parseBody(request);
    const name = clean(body.name);
    const teacherId = clean(body.teacherId);
    if (!name) return error("Введите название класса.");
    if (!validSchoolClassName(name)) return error("Класс должен быть только с 1 по 11.");
    try {
      await env.DB.prepare("UPDATE classes SET name=?,teacher_id=? WHERE id=?").bind(name, teacherId, classId).run();
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
    return json({ ok: true, id: newId });
  }

  if (path.startsWith("/api/teachers/") && (method === "PUT" || method === "DELETE")) {
    const teacherId = decodeURIComponent(path.slice("/api/teachers/".length));
    if (method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("UPDATE classes SET teacher_id='' WHERE teacher_id=?").bind(teacherId),
        env.DB.prepare("DELETE FROM teachers WHERE id=?").bind(teacherId),
      ]);
      return json({ ok: true });
    }
    const body = await parseBody(request);
    const name = clean(body.name);
    const subject = clean(body.subject);
    if (!name) return error("Введите ФИО преподавателя.");
    await env.DB.prepare("UPDATE teachers SET name=?,subject=? WHERE id=?").bind(name, subject, teacherId).run();
    return json({ ok: true });
  }

  if (path === "/api/backup/import" && method === "POST") {
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
      return json({ ok: true });
    } catch (err) {
      return error("Не удалось импортировать резервную копию. Проверьте уникальность ИИН и классов.", 400);
    }
  }

  if (path === "/api/database/clear" && method === "POST") {
    const body = await parseBody(request);
    // Пароль ручной очистки совпадает с паролем ручного перевода классов.
    if (clean(body.password) !== "3333") return error("Неверный пароль.", 403);

    await createBackup(env.DB, "Перед полной очисткой базы");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM students"),
      env.DB.prepare("DELETE FROM classes"),
      env.DB.prepare("DELETE FROM teachers"),
    ]);
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
        return error("Внутренняя ошибка сервера.", 500);
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

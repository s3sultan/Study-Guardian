const firebaseConfig = { apiKey: "AIzaSyAUjRlZmePLlKKRDS8JdM4i9r0eCXcnoek", authDomain: "study-guardian-groups.firebaseapp.com", databaseURL: "https://study-guardian-groups-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "study-guardian-groups", storageBucket: "study-guardian-groups.firebasestorage.app", messagingSenderId: "499313905189", appId: "1:499313905189:web:589c4dfade509c853779cc" };
const $ = id => document.getElementById(id);
const state = { file: null, bytes: null, lines: [], marks: [], worker: null, libraries: null, processing: false, syncCode: "", stopSync: null, pendingMarks: [] };
const importantWords = /(مهم|ركز|تذكر|اختبار|واجب|كويز|تسليم|مشروع|بحث|تقرير|موعد|deadline|exam|quiz|assignment|homework|submit|important|remember|focus)/i;
let syncApi = null;

function pdfStatus(text) { $("pdf-status").textContent = text; }
function setProgress(percent, visible = true) { $("pdf-progress").hidden = !visible; $("pdf-progress-bar").style.width = `${Math.max(0, Math.min(100, percent))}%`; }
function syncStatus(text) { $("pdf-sync-status").textContent = text; }
function refreshMarksUi() { $("download-highlighted-pdf").hidden = !state.marks.length; $("send-highlighted-pdf").hidden = !state.marks.length; }
async function ensureSyncAuth() {
  if (location.protocol === "file:") throw new Error("المزامنة بين الأجهزة تعمل من الرابط المنشور فقط.");
  if (!syncApi) {
    const [appSdk, authSdk, databaseSdk] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js")
    ]);
    const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig);
    syncApi = { auth: authSdk.getAuth(app), db: databaseSdk.getDatabase(app), signInAnonymously: authSdk.signInAnonymously, ref: databaseSdk.ref, set: databaseSdk.set, get: databaseSdk.get, update: databaseSdk.update, onValue: databaseSdk.onValue };
  }
  if (!syncApi.auth.currentUser) await syncApi.signInAnonymously(syncApi.auth);
  return syncApi;
}
function newSyncCode() { return `sgpdf-${crypto.randomUUID ? crypto.randomUUID().replaceAll("-", "") : Array.from(crypto.getRandomValues(new Uint32Array(5))).map(value => value.toString(36)).join("")}`; }
async function saveSyncMarks() { if (!state.syncCode) return; try { const api = await ensureSyncAuth(); await api.update(api.ref(api.db, `pdfSync/${state.syncCode}`), { marks: state.marks, updatedAt: Date.now() }); } catch (_) { syncStatus("تعذر تحديث التظليلات على الأجهزة الأخرى."); } }
async function watchSync(code) { const api = await ensureSyncAuth(); state.stopSync?.(); state.stopSync = api.onValue(api.ref(api.db, `pdfSync/${code}`), snapshot => { const data = snapshot.val(); if (!data) return; if (Array.isArray(data.marks)) { state.marks = data.marks; refreshMarksUi(); } }); }
function connectSync(code) { state.syncCode = code; localStorage.pdfSyncCode = code; $("pdf-sync-code").value = code; $("copy-pdf-sync").hidden = false; $("leave-pdf-sync").hidden = false; watchSync(code).catch(error => syncStatus(error.message)); }
async function downloadSyncFile(data) { const token = $("telegram-token").value.trim(); if (!token) throw new Error("اكتب Bot Token في قسم Telegram على هذا الجهاز أولًا."); const infoResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(data.fileId)}`), info = await infoResponse.json(); if (!infoResponse.ok || !info.ok || !info.result?.file_path) throw new Error("تعذر الوصول إلى ملف Telegram."); const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`); if (!fileResponse.ok) throw new Error("تعذر تنزيل الملف من Telegram."); return new File([await fileResponse.blob()], data.fileName || "lecture.pdf", { type: data.fileType || "application/pdf" }); }
function normalize(value) { return String(value || "").toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim(); }
function lineGroups(words) {
  const sorted = [...words].filter(word => word.text && word.bbox).sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0), groups = [];
  sorted.forEach(word => {
    const middle = (word.bbox.y0 + word.bbox.y1) / 2, group = groups.find(item => Math.abs(item.middle - middle) < Math.max(16, (word.bbox.y1 - word.bbox.y0) * .75));
    if (group) { group.words.push(word); group.middle = (group.middle * (group.words.length - 1) + middle) / group.words.length; }
    else groups.push({ middle, words: [word] });
  });
  return groups.map(group => {
    const boxes = group.words.map(word => word.bbox), x0 = Math.min(...boxes.map(box => box.x0)), y0 = Math.min(...boxes.map(box => box.y0)), x1 = Math.max(...boxes.map(box => box.x1)), y1 = Math.max(...boxes.map(box => box.y1));
    return { text: group.words.map(word => word.text).join(" "), bbox: { x0, y0, x1, y1 } };
  }).filter(line => normalize(line.text).length > 3);
}
function scoreLine(phrase, line) {
  const wanted = normalize(phrase).split(" ").filter(word => word.length > 1), found = new Set(normalize(line.text).split(" "));
  if (wanted.length < 2) return 0;
  return wanted.filter(word => found.has(word)).length / wanted.length;
}
function highlightPhrase(phrase, auto = false) {
  if (!state.lines.length) return false;
  const ranked = state.lines.map(line => ({ line, score: scoreLine(phrase, line) })).sort((a, b) => b.score - a.score), best = ranked[0];
  if (!best || best.score < (auto ? .56 : .4)) return false;
  const key = `${best.line.pageIndex}:${Math.round(best.line.x)}:${Math.round(best.line.y)}:${Math.round(best.line.w)}:${Math.round(best.line.h)}`;
  if (!state.marks.some(mark => mark.key === key)) state.marks.push({ ...best.line, key, phrase });
  $("pdf-match").hidden = false;
  $("pdf-match").textContent = `تم تحديد جملة قريبة في الصفحة ${best.line.pageIndex + 1}: ${best.line.text.slice(0, 130)}`;
  refreshMarksUi(); saveSyncMarks();
  pdfStatus(`تم تجهيز ${state.marks.length} تظليل${state.marks.length === 1 ? "" : "ات"} حتى الآن.`);
  return true;
}
async function loadLibraries() {
  if (state.libraries) return state.libraries;
  pdfStatus("جارٍ تنزيل محرك قراءة PDF والتعرّف العربي/الإنجليزي للمرة الأولى...");
  const [pdfjs, tesseractModule, pdfLib] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs"),
    import("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js"),
    import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm")
  ]);
  const tesseract = tesseractModule.default || tesseractModule;
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
  state.libraries = { pdfjs, tesseract, pdfLib };
  return state.libraries;
}
async function readFileBytes(file) {
  if (typeof file?.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر قراءة ملف PDF. اختره مرة أخرى ثم حاول."));
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
}
async function preparePdf(fileOverride = null, syncedMarks = []) {
  const file = fileOverride || $("study-pdf").files?.[0];
  if (!file) return pdfStatus("اختر ملف PDF أولًا.");
  if (file.size > 45 * 1024 * 1024) return pdfStatus("الملف كبير جدًا لهذه النسخة. استخدم ملفًا أقل من 45 MB.");
  if (state.processing) return;
  state.processing = true; state.file = file; state.bytes = null; state.lines = []; state.marks = []; state.pendingMarks = Array.isArray(syncedMarks) ? syncedMarks : [];
  $("prepare-study-pdf").disabled = true; $("cancel-study-pdf").hidden = false; $("pdf-match").hidden = true; setProgress(2);
  try {
    pdfStatus("جارٍ قراءة ملف PDF...");
    state.bytes = await readFileBytes(file);
    const { pdfjs, tesseract } = await loadLibraries();
    state.worker = await tesseract.createWorker("ara+eng", 1, { langPath: new URL("./tessdata/", location.href).href, logger: event => { if (event.status === "recognizing text" && Number.isFinite(event.progress)) setProgress(8 + event.progress * 78); } });
    const task = pdfjs.getDocument({ data: new Uint8Array(state.bytes.slice(0)) }), pdf = await task.promise;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      if (!state.processing) return;
      pdfStatus(`جارٍ قراءة الصفحة ${number} من ${pdf.numPages}...`);
      const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 2 }), canvas = document.createElement("canvas"), context = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const result = await state.worker.recognize(canvas), groups = result.data.lines?.length ? result.data.lines.map(line => ({ text: line.text, bbox: line.bbox })) : lineGroups(result.data.words || []), original = page.getViewport({ scale: 1 });
      groups.forEach(group => {
        const box = group.bbox, x = box.x0 / canvas.width * original.width, y = original.height - box.y1 / canvas.height * original.height, w = (box.x1 - box.x0) / canvas.width * original.width, h = (box.y1 - box.y0) / canvas.height * original.height;
        if (w > 0 && h > 0) state.lines.push({ pageIndex: number - 1, text: group.text, x, y, w, h });
      });
      setProgress(8 + (number / pdf.numPages) * 82);
    }
    await state.worker.terminate(); state.worker = null; setProgress(100); state.marks = state.pendingMarks; refreshMarksUi();
    window.studyGuardianPdfListening = true;
    pdfStatus(`اكتمل تجهيز ${state.lines.length} سطر من ${file.name}. ابدأ الاستماع أو ألصق جملة لتحديدها.`);
  } catch (error) {
    pdfStatus(`تعذر تجهيز الملف: ${(error?.message || "تحقق من الإنترنت ثم حاول مرة أخرى.").slice(0, 150)}`);
    console.error(error);
  } finally { state.processing = false; $("prepare-study-pdf").disabled = false; }
}
function clearPdfSession() {
  state.processing = false; state.worker?.terminate?.(); state.worker = null; state.file = null; state.bytes = null; state.lines = []; state.marks = [];
  window.studyGuardianPdfListening = false; $("study-pdf").value = ""; $("pdf-manual-sentence").value = ""; $("pdf-match").hidden = true; $("download-highlighted-pdf").hidden = true; $("send-highlighted-pdf").hidden = true; $("cancel-study-pdf").hidden = true; setProgress(0, false);
  pdfStatus("تم إلغاء جلسة PDF ومسح بياناتها من الذاكرة. ملفك الأصلي لم يتغير.");
}
async function buildHighlightedPdf() {
  if (!state.bytes || !state.marks.length) throw new Error("لا توجد جمل محددة.");
  const { pdfLib } = await loadLibraries(), documentPdf = await pdfLib.PDFDocument.load(state.bytes.slice(0)), pages = documentPdf.getPages();
    state.marks.forEach(mark => pages[mark.pageIndex]?.drawRectangle({ x: mark.x - 1.5, y: mark.y - 1.5, width: mark.w + 3, height: mark.h + 3, color: pdfLib.rgb(1, .86, .12), opacity: .42, borderWidth: 0 }));
  return new Blob([await documentPdf.save()], { type: "application/pdf" });
}
async function downloadHighlightedPdf() {
  if (!state.bytes || !state.marks.length) return pdfStatus("لا توجد جمل محددة لتحميلها.");
  try {
    const url = URL.createObjectURL(await buildHighlightedPdf()), link = document.createElement("a");
    link.href = url; link.download = `${state.file.name.replace(/\.pdf$/i, "")}-مظلل.pdf`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    pdfStatus("تم تجهيز نسخة PDF المظللة للتحميل.");
  } catch (_) { pdfStatus("تعذر إنشاء نسخة PDF المظللة. حاول مرة أخرى."); }
}
async function sendHighlightedPdf() {
  if (!state.bytes || !state.marks.length) return pdfStatus("لا توجد جمل محددة لإرسالها.");
  try {
    const blob = await buildHighlightedPdf(), name = `${state.file.name.replace(/\.pdf$/i, "")}-مظلل.pdf`, sent = await window.studyGuardianSendTelegramFile?.(new File([blob], name, { type: "application/pdf" }), "نسخة PDF مظللة من Smart Guardian");
    if (sent) pdfStatus("تم إرسال PDF المظلل إلى أجهزتك عبر Telegram.");
  } catch (_) { pdfStatus("تعذر تجهيز PDF لإرساله."); }
}
async function createPdfSync() {
  if (!state.file || !state.bytes) return syncStatus("جهّز ملف PDF أولًا، ثم ارفعه للمزامنة.");
  try {
    const api = await ensureSyncAuth(); syncStatus("جارٍ رفع الملف مرة واحدة إلى Telegram وربطه بالأجهزة...");
    const sent = await window.studyGuardianSendTelegramFile?.(state.file, "ملف مزامنة Smart Guardian بين الأجهزة");
    if (!sent?.fileId) throw new Error("تعذر إرسال الملف إلى Telegram.");
    const code = newSyncCode();
    await api.set(api.ref(api.db, `pdfSync/${code}`), { fileId: sent.fileId, fileName: state.file.name, fileType: state.file.type || "application/pdf", marks: state.marks, createdAt: Date.now(), updatedAt: Date.now() });
    connectSync(code); syncStatus("تمت المزامنة. انسخ الرمز وافتحه من أي جهاز مرتبط بنفس Telegram.");
  } catch (error) { syncStatus(`تعذر إنشاء المزامنة: ${error?.message || "تحقق من الربط والإنترنت."}`); }
}
async function openPdfSync() {
  const code = $("pdf-sync-code").value.trim(); if (!code) return syncStatus("اكتب رمز المزامنة أولًا.");
  try {
    const api = await ensureSyncAuth(); syncStatus("جارٍ جلب الملف والتظليلات من المزامنة...");
    const snapshot = await api.get(api.ref(api.db, `pdfSync/${code}`)), data = snapshot.val();
    if (!data?.fileId) throw new Error("الرمز غير صحيح أو لم يعد الملف متاحًا.");
    connectSync(code); const file = await downloadSyncFile(data); await preparePdf(file, data.marks || []);
    syncStatus("تم فتح الملف. أي تظليل جديد سيتزامن تلقائيًا بين أجهزتك.");
  } catch (error) { syncStatus(`تعذر فتح المزامنة: ${error?.message || "تحقق من الرمز وTelegram."}`); }
}
async function copySyncCode() { const code = state.syncCode || $("pdf-sync-code").value.trim(); if (!code) return; try { await navigator.clipboard.writeText(code); syncStatus("تم نسخ رمز المزامنة."); } catch (_) { syncStatus(`رمز المزامنة: ${code}`); } }
function leavePdfSync() { state.stopSync?.(); state.stopSync = null; state.syncCode = ""; localStorage.removeItem("pdfSyncCode"); $("pdf-sync-code").value = ""; $("copy-pdf-sync").hidden = true; $("leave-pdf-sync").hidden = true; syncStatus("تم فصل هذا الجهاز. لم يُحذف الملف أو المزامنة."); }

$("prepare-study-pdf").onclick = () => preparePdf();
$("cancel-study-pdf").onclick = clearPdfSession;
$("pdf-listen").onclick = () => { if (!state.lines.length) return pdfStatus("جهّز ملف PDF أولًا، ثم يبدأ الاستماع لتحديد الجمل داخله."); window.studyGuardianPdfListening = true; const button = $("listen"); if (!button.textContent.includes("إيقاف")) button.click(); pdfStatus("تم طلب تشغيل الاستماع لعبارات المحاضرة."); };
$("highlight-pdf-sentence").onclick = () => { const phrase = $("pdf-manual-sentence").value.trim(); if (!phrase) return pdfStatus("اكتب الجملة أولًا."); if (!highlightPhrase(phrase)) pdfStatus("لم أجد تطابقًا واضحًا. جرّب جزءًا أطول أو أوضح من الجملة."); };
$("download-highlighted-pdf").onclick = downloadHighlightedPdf;
$("send-highlighted-pdf").onclick = sendHighlightedPdf;
$("create-pdf-sync").onclick = createPdfSync;
$("open-pdf-sync").onclick = openPdfSync;
$("copy-pdf-sync").onclick = copySyncCode;
$("leave-pdf-sync").onclick = leavePdfSync;
$("pdf-sync-code").value = localStorage.pdfSyncCode || "";
window.addEventListener("smartguardian:heard", event => { const phrase = event.detail?.text || ""; if (state.processing || !state.lines.length || !$("pdf-auto-highlight").checked || !importantWords.test(phrase)) return; highlightPhrase(phrase, true); });

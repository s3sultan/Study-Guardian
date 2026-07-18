import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getDatabase, ref, push, set, get, onChildAdded, onValue, query, limitToLast, update, remove } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

const config = {
  apiKey: "AIzaSyAUjRlZmePLlKKRDS8JdM4i9r0eCXcnoek",
  authDomain: "study-guardian-groups.firebaseapp.com",
  databaseURL: "https://study-guardian-groups-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "study-guardian-groups",
  storageBucket: "study-guardian-groups.firebasestorage.app",
  messagingSenderId: "499313905189",
  appId: "1:499313905189:web:589c4dfade509c853779cc"
};
const $ = id => document.getElementById(id);
const app = initializeApp(config);
const auth = getAuth(app);
const db = getDatabase(app);
const ADMIN_EMAIL = "s2shug@gmail.com";
const googleProvider = new GoogleAuthProvider();
let stopAdminFeedback = null, stopAdminRatings = null, stopOwnFeedback = [], knownReplies = new Map(), selectedRating = 0, adminExpanded = false;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let room = "", stop = null, recognition, listening = false, starting = false, languageIndex = 0, languageTimer = null, lastAlert = 0, latestVersion = "";
const status = (id, text) => { $(id).textContent = text; };
const nickname = () => { const value = $("alias").value.trim(); return value && !hasAnimalAlias(value) ? value : "طالب"; };
const isAdmin = user => Boolean(user?.email && user.email.toLowerCase() === ADMIN_EMAIL);
const customArabicBlocked = ["انت كلب", "يا مروح", "يا حيوان", "يا كلب", "يا عفن", "كل تبن", "كل زق", "انطم", "انقلع", "حيوان", "كلب", "عفن", "مروح", "تبن", "زق"];
const normalizedForModeration = text => String(text || "").toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي");
const animalAliasTerms = ["كلب", "قط", "قطة", "حصان", "حمار", "بغل", "خنزير", "بقرة", "ثور", "ماعز", "خروف", "كبش", "قرد", "غوريلا", "شمبانزي", "فيل", "زرافة", "ذئب", "ثعلب", "ضبع", "ارنب", "تمساح", "ثعبان", "عقرب", "عنكبوت", "سلحفاة", "سحلية", "قرش", "حوت", "دلفين", "بطريق", "بومة", "ديك", "دجاجة", "بطة", "سمكة", "dog", "cat", "horse", "donkey", "mule", "pig", "cow", "bull", "goat", "sheep", "monkey", "ape", "gorilla", "chimpanzee", "elephant", "giraffe", "wolf", "fox", "hyena", "rabbit", "crocodile", "snake", "scorpion", "spider", "turtle", "lizard", "shark", "whale", "dolphin", "penguin", "owl", "rooster", "chicken", "duck", "fish", "lion", "tiger", "leopard"];
const animalAliasCompact = animalAliasTerms.map(term => normalizedForModeration(term).replace(/[^\p{L}]/gu, ""));
const hasAnimalAlias = text => { const compact = normalizedForModeration(text).replace(/[^\p{L}]/gu, ""); return compact !== "نمر" && animalAliasCompact.some(term => compact.includes(term)); };
const evasiveArabicPatterns = customArabicBlocked.map(term => { const letters = [...normalizedForModeration(term).replace(/[^\p{L}]/gu, "")]; return new RegExp(letters.map(letter => letter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(?:[^\\p{L}]|ـ)*"), "giu"); });
const customArabicPattern = new RegExp("(^|[^\\p{L}])(?:" + customArabicBlocked.sort((a, b) => b.length - a.length).map(term => term.replaceAll(" ", "\\s*")).join("|") + ")(?=$|[^\\p{L}])", "giu");
const blockedPatterns = [
  /f[\W_]*u[\W_]*c[\W_]*k(?:ing|er|ed|s)?/giu, /s[\W_]*h[\W_]*i[\W_]*t(?:ty|s)?/giu,
  /\b(?:bitch|bastard|asshole|dick|pussy|cunt|whore|slut|nigger|motherfucker)\b/giu,
  /(?:شرموط(?:ه|ة|ين)?|قحب(?:ه|ة)?|ديوث|طيز|خرا|عرص|متناك|منيوك|يلعن(?:ك|كم|امك)|امك\s*(?:كلمة\s*بذيئة)?|كل\s*تبن|روح\s*تبن|انقلع|انطم|انبح|انقلع\s*بس|يا\s*حمار|يا\s*كلب|يا\s*تيس|يا\s*غبي|يا\s*حقير|يا\s*وسخ|تف\s*عليك)/giu,
  /(^|[^\p{L}])(?:كس|زب)(?=$|[^\p{L}])/giu, customArabicPattern, ...evasiveArabicPatterns
];
const moderate = text => { const value = normalizedForModeration(text); return blockedPatterns.some(pattern => { pattern.lastIndex = 0; return pattern.test(value); }); };
const cleanText = text => { let value = String(text || ""); blockedPatterns.forEach(pattern => { pattern.lastIndex = 0; value = value.replace(pattern, (match, prefix) => typeof prefix === "string" ? prefix : ""); }); return value.replace(/\s{2,}/g, " "); };
const allowedText = (text, target) => { if (!moderate(text)) return true; status(target, "لا يمكن إرسال عبارات غير لائقة. عدّل النص ثم حاول."); return false; };
function protectTyping(id, target) { const input = $(id); if (!input) return; input.addEventListener("input", () => { const cleaned = cleanText(input.value); if (cleaned !== input.value) { input.value = cleaned; status(target, "تمت إزالة عبارة غير لائقة من النص."); } }); }
function protectAlias() { const input = $("alias"); input.addEventListener("input", () => { if (hasAnimalAlias(input.value)) { input.value = ""; status("group-status", "لا يُسمح باستخدام أسماء الحيوانات كاسم مستعار."); } }); }
function limitAdminItems() { const cards = [...$("admin-feedback").querySelectorAll(".feedback-card")]; cards.forEach((card, index) => { card.hidden = !adminExpanded && index >= 3; }); $("admin-more").hidden = cards.length <= 3; $("admin-more").textContent = adminExpanded ? "إخفاء الرسائل القديمة" : "أكثر"; }
function adminStatus(text) { status("admin-status", text); }
function showAdminFeedback(id, data, announce = false) {
  if (moderate(`${data.author || ""} ${data.text || ""} ${data.reply || ""}`)) { remove(ref(db, `feedback/${id}`)).catch(() => {}); return; }
  const empty = $("admin-feedback").querySelector(".hint"); if (empty) empty.remove();
  const old = document.getElementById(`feedback-${id}`); if (old) old.remove();
  const card = document.createElement("article"); card.className = "feedback-card"; card.id = `feedback-${id}`;
  const title = document.createElement("strong"); title.textContent = data.author || "طالب";
  const body = document.createElement("p"); body.textContent = data.text || "";
  const time = document.createElement("small"); time.textContent = data.createdAt ? new Date(data.createdAt).toLocaleString("ar-SA") : "";
  const response = document.createElement("textarea"); response.rows = 2; response.placeholder = "اكتب ردك على صاحب الاقتراح"; response.value = data.reply || ""; response.addEventListener("input", () => { const cleaned = cleanText(response.value); if (cleaned !== response.value) { response.value = cleaned; adminStatus("تمت إزالة عبارة غير لائقة من الرد."); } });
  const send = document.createElement("button"); send.type = "button"; send.textContent = "إرسال الرد";
  send.onclick = async () => { const reply = response.value.trim(); if (!reply || !allowedText(reply, "admin-status")) return; send.disabled = true; try { await update(ref(db, `feedback/${id}`), { reply, repliedAt: Date.now() }); deleteReply.hidden = false; send.textContent = "تم حفظ الرد"; } catch (error) { send.textContent = "تعذر حفظ الرد"; } finally { send.disabled = false; } };
  const deleteReply = document.createElement("button"); deleteReply.type = "button"; deleteReply.className = "delete-item"; deleteReply.textContent = "حذف الرد"; deleteReply.hidden = !data.reply; deleteReply.onclick = async () => { if (!confirm("حذف رد الإدارة فقط؟")) return; try { await update(ref(db, `feedback/${id}`), { reply: null, repliedAt: null }); response.value = ""; deleteReply.hidden = true; } catch (_) { adminStatus("تعذر حذف الرد."); } };
  const del = document.createElement("button"); del.type = "button"; del.className = "delete-item"; del.textContent = "حذف"; del.onclick = async () => { if (!confirm("حذف هذا الاقتراح نهائيًا؟")) return; await remove(ref(db, `feedback/${id}`)); card.remove(); limitAdminItems(); };
  card.append(title, body, time, response, send, deleteReply, del); $("admin-feedback").prepend(card); limitAdminItems();
  if (announce) { adminStatus("وصل اقتراح جديد الآن."); const toast = document.createElement("div"); toast.className = "admin-toast"; toast.textContent = "اقتراح جديد"; document.body.append(toast); setTimeout(() => toast.remove(), 6000); }
}
function showAdminRating(id, data, announce = false) { if (moderate(`${data.author || ""} ${data.comment || ""}`)) { remove(ref(db, `ratings/${id}`)).catch(() => {}); return; } const empty = $("admin-feedback").querySelector(".hint"); if (empty) empty.remove(); const card = document.createElement("article"); card.className = "feedback-card rating-admin-card"; const title = document.createElement("strong"); title.textContent = `تقييم ${"★".repeat(Math.max(1, Math.min(5, Number(data.score) || 1)))} — ${data.author || "طالب"}`; const body = document.createElement("p"); body.textContent = data.comment || "تم إرسال تقييم بدون تعليق."; const time = document.createElement("small"); time.textContent = data.createdAt ? new Date(data.createdAt).toLocaleString("ar-SA") : ""; const del = document.createElement("button"); del.type = "button"; del.className = "delete-item"; del.textContent = "حذف التقييم"; del.onclick = async () => { if (!confirm("حذف هذا التقييم؟")) return; await remove(ref(db, `ratings/${id}`)); card.remove(); limitAdminItems(); }; card.append(title, body, time, del); $("admin-feedback").prepend(card); limitAdminItems(); if (announce) { adminStatus("وصل تقييم جديد الآن."); const toast = document.createElement("div"); toast.className = "admin-toast"; toast.textContent = "وصل تقييم جديد"; document.body.append(toast); setTimeout(() => toast.remove(), 6000); } }
async function subscribeAdminFeedback() {
  stopAdminFeedback?.(); adminExpanded = false; $("admin-feedback").replaceChildren();
  const source = query(ref(db, "feedback"), limitToLast(50)), existing = new Set();
  try { const snapshot = await get(source); snapshot.forEach(item => existing.add(item.key)); } catch (_) { adminStatus("تعذر تحميل الاقتراحات."); }
  stopAdminFeedback = onChildAdded(source, item => { const wasAlreadyThere = existing.delete(item.key); showAdminFeedback(item.key, item.val(), !wasAlreadyThere); });
}
async function subscribeAdminRatings() { stopAdminRatings?.(); const source = query(ref(db, "ratings"), limitToLast(50)), existing = new Set(); try { const snapshot = await get(source); snapshot.forEach(item => existing.add(item.key)); } catch (_) {} stopAdminRatings = onChildAdded(source, item => { const wasAlreadyThere = existing.delete(item.key); showAdminRating(item.key, item.val(), !wasAlreadyThere); }); }
const feedbackIds = () => { try { const saved = JSON.parse(localStorage.mobileFeedbackIds || "[]"), legacy = localStorage.mobileFeedbackId; return [...new Set([...(Array.isArray(saved) ? saved : []), ...(legacy ? [legacy] : [])])]; } catch (_) { return localStorage.mobileFeedbackId ? [localStorage.mobileFeedbackId] : []; } };
function rememberFeedback(id) { const all = feedbackIds().filter(item => item !== id); all.unshift(id); localStorage.mobileFeedbackIds = JSON.stringify(all.slice(0, 100)); localStorage.mobileFeedbackId = id; }
function renderOwnReplies() { const replies = [...knownReplies.values()].filter(item => item.reply).sort((a,b) => (b.repliedAt || 0) - (a.repliedAt || 0)); const list = $("idea-reply-list"); list.replaceChildren(); $("idea-reply").hidden = !replies.length; $("more-responses").hidden = replies.length <= 3; replies.slice(0, 3).forEach(item => { const row = document.createElement("article"); row.className = "idea-reply-item"; const text = document.createElement("p"); text.textContent = item.reply; const time = document.createElement("small"); time.textContent = item.repliedAt ? new Date(item.repliedAt).toLocaleString("ar-SA") : ""; row.append(text, time); list.append(row); }); }
function subscribeOwnFeedback(user) {
  stopOwnFeedback.forEach(unsubscribe => unsubscribe()); stopOwnFeedback = []; knownReplies.clear();
  if (!user || isAdmin(user)) return;
  feedbackIds().forEach(id => { const unsubscribe = onValue(ref(db, `feedback/${id}`), item => { if (!item.exists()) return; const data = item.val(), previous = knownReplies.get(id); knownReplies.set(id, data); renderOwnReplies(); if (data.reply && previous?.reply !== data.reply) { status("idea-status", "تم استلام رد الإدارة."); const toast = document.createElement("div"); toast.className = "reply-toast"; toast.textContent = "وصل رد جديد من الإدارة"; document.body.append(toast); setTimeout(() => toast.remove(), 7000); } }); stopOwnFeedback.push(unsubscribe); });
}
function adminLoginMessage(text) { $("admin-login-status").textContent = text; }
async function adminLogin() {
  if (location.protocol === "file:") return adminLoginMessage("دخول الإدارة يعمل من الرابط المنشور فقط، وليس من الملف المحلي.");
  const mobile = matchMedia("(max-width: 719px), (pointer: coarse)").matches;
  adminLoginMessage(mobile ? "جارٍ الانتقال لتسجيل Google..." : "جارٍ فتح تسجيل Google...");
  try { if (mobile) return signInWithRedirect(auth, googleProvider); await signInWithPopup(auth, googleProvider); adminLoginMessage(""); } catch (error) {
    const messages = { "auth/operation-not-allowed": "فعّل Google من Firebase أولًا.", "auth/unauthorized-domain": "افتح الرابط المنشور للحارس الذكي ثم حاول.", "auth/popup-blocked": "اسمح للنوافذ المنبثقة ثم حاول مرة أخرى." };
    const text = messages[error.code] || "تعذر تسجيل الدخول. حاول مرة أخرى."; adminStatus(text); adminLoginMessage(text);
  }
}
$("admin-login").onclick = adminLogin;
$("admin-logout").onclick = () => signOut(auth);
$("admin-more").onclick = () => { adminExpanded = !adminExpanded; limitAdminItems(); };
getRedirectResult(auth).then(() => { if (location.protocol !== "file:") adminLoginMessage(""); }).catch(error => { const messages = { "auth/operation-not-allowed": "فعّل Google من Firebase أولًا.", "auth/unauthorized-domain": "افتح الرابط المنشور للحارس الذكي ثم حاول." }; adminLoginMessage(messages[error.code] || "تعذر إكمال تسجيل Google."); });
onAuthStateChanged(auth, user => {
  const allowed = isAdmin(user);
  $("admin-panel").hidden = !allowed; $("admin-logout").hidden = !allowed;
  $("admin-login").hidden = allowed;
  if (allowed) { adminStatus(`مرحبًا ${user.displayName || "مدير الأداة"} — الاقتراحات والتقييمات تُحدّث مباشرة.`); subscribeAdminFeedback(); subscribeAdminRatings(); }
  else { stopAdminFeedback?.(); stopAdminFeedback = null; stopAdminRatings?.(); stopAdminRatings = null; subscribeOwnFeedback(user); if (user?.email) { adminStatus("هذا الحساب ليس حساب الإدارة المعتمد."); signOut(auth); } }
});
const quotes = [["فَإِنَّ مَعَ الْعُسْرِ يُسْرًا", "Indeed, with hardship comes ease. — Quran 94:5"],["اللهم لا سهل إلا ما جعلته سهلاً", "O Allah, nothing is easy except what You make easy."],["التقدم البسيط يظل تقدّمًا.", "Small progress is still progress."],["رَبِّ زِدْنِي عِلْمًا", "My Lord, increase me in knowledge. — Quran 20:114"]];
function rotateQuote(index = 0) { const quote = quotes[index % quotes.length]; $("quote-text").textContent = quote[0]; $("quote-translation").textContent = quote[1]; setTimeout(() => rotateQuote(index + 1), 18000); }
const normalize = value => value.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const watchedNames = () => $("listen-names").value.split(/[,،\n]/).map(normalize).filter(Boolean);
const recognitionLanguages = () => {
  const names = $("listen-names").value;
  const arabic = /[\u0600-\u06FF]/.test(names), english = /[A-Za-z]/.test(names);
  if (arabic && english) return ["ar-SA", "en-US"];
  return [arabic ? "ar-SA" : "en-US"];
};
const minutesOf = value => { const [hours, minutes] = (value || "").split(":").map(Number); return Number.isInteger(hours) && Number.isInteger(minutes) ? hours * 60 + minutes : null; };
function scheduleIsActive() {
  const start = minutesOf($("listen-start").value), end = minutesOf($("listen-end").value);
  if (start === null || end === null || start === end) return false;
  const now = new Date(), current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}
function updateSchedule() {
  const enabled = $("listen-schedule").checked;
  localStorage.mobileListenStart = $("listen-start").value;
  localStorage.mobileListenEnd = $("listen-end").value;
  localStorage.mobileListenSchedule = enabled ? "1" : "0";
  if (!enabled) return status("schedule-status", "الجدول غير مفعّل.");
  if (!$("listen-start").value || !$("listen-end").value || $("listen-start").value === $("listen-end").value) return status("schedule-status", "اختر وقت بداية ونهاية مختلفين.");
  status("schedule-status", `الاستماع المجدول: ${$("listen-start").value} إلى ${$("listen-end").value} يوميًا.`);
}
function checkSchedule() {
  if (!$("listen-schedule").checked || !$("listen-start").value || !$("listen-end").value) return;
  if (scheduleIsActive() && !listening) startListening();
  if (!scheduleIsActive() && listening) stopListening();
}
function listenError(error) {
  const code = error?.error || error?.name || "";
  if (["not-allowed", "NotAllowedError", "service-not-allowed"].includes(code)) return "تم رفض إذن الميكروفون. من رمز القفل بجانب الرابط اختر: الميكروفون > سماح، ثم حدّث الصفحة.";
  if (["not-found", "NotFoundError"].includes(code)) return "لا يوجد ميكروفون متاح. تأكد من اختيار ميكروفون في إعدادات Windows.";
  if (["not-readable", "NotReadableError"].includes(code)) return "الميكروفون مستخدم في برنامج آخر. أغلق Teams أو Zoom أو أي برنامج يستخدمه ثم حاول.";
  if (code === "network") return "تعذر تشغيل خدمة التعرف الصوتي. تأكد من الإنترنت ثم حاول.";
  return `تعذر بدء الاستماع: ${code || "خطأ غير معروف"}`;
}

function ring() { const context = new AudioContext(), gain = context.createGain(); gain.gain.value = .35; gain.connect(context.destination); for (let i = 0; i < 8; i += 1) { const tone = context.createOscillator(); tone.frequency.value = i % 2 ? 1180 : 880; tone.connect(gain); tone.start(context.currentTime + i * .16); tone.stop(context.currentTime + i * .16 + .1); } setTimeout(() => context.close(), 1500); }
function alertName() { if (Date.now() - lastAlert < 12000) return; lastAlert = Date.now(); ring(); $("alert").hidden = false; }
function startRecognitionSession() {
  const languages = recognitionLanguages();
  const language = languages[languageIndex % languages.length];
  recognition = new Recognition(); recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 3; recognition.lang = language;
  recognition.onresult = event => { let text = ""; for (let i = event.resultIndex; i < event.results.length; i += 1) text += `${event.results[i][0].transcript} `; text = normalize(text); if (!text) return; $("heard").textContent = `آخر ما سمعه: ${text}`; if (watchedNames().some(name => text.includes(name))) alertName(); };
  recognition.onend = () => {
    clearTimeout(languageTimer);
    if (!listening) return;
    languageIndex = (languageIndex + 1) % recognitionLanguages().length;
    setTimeout(() => { if (listening) { try { startRecognitionSession(); } catch (error) { status("listen-status", listenError(error)); } } }, 180);
  };
  recognition.onerror = error => { if (!["no-speech", "aborted"].includes(error.error)) status("listen-status", listenError(error)); };
  recognition.start();
  if (languages.length > 1) languageTimer = setTimeout(() => { if (listening) recognition?.abort(); }, 4500);
}
async function startListening() {
  if (!Recognition) return status("listen-status", "ميزة التعرف الصوتي غير متاحة في هذا المتصفح.");
  if (!watchedNames().length) return status("listen-status", "اكتب الاسم أولًا.");
  if (listening || starting) return;
  starting = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
  } catch (error) { starting = false; return status("listen-status", listenError(error)); }
  try {
    languageIndex = 0; listening = true; startRecognitionSession(); $("listen").textContent = "🎧 إيقاف متابعة الاسم"; status("listen-status", recognitionLanguages().length > 1 ? "تتم متابعة العربية والإنجليزية بالتبديل التلقائي." : "تتم متابعة الاسم من ميكروفون هذا الجهاز."); localStorage.mobileNames = $("listen-names").value;
  } catch (error) { listening = false; status("listen-status", listenError(error)); }
  starting = false;
}
function stopListening() { listening = false; clearTimeout(languageTimer); recognition?.stop(); $("listen").textContent = "🎧 بدء متابعة الاسم"; status("listen-status", "المتابعة متوقفة."); }

function render(data) {
  const item = document.createElement("article");
  item.className = "note";
  item.textContent = `[${data.mode || "مستقل"}] ${data.author || "طالب"}: ${data.text || ""}`;
  const time = document.createElement("small");
  time.textContent = data.createdAt ? new Date(data.createdAt).toLocaleString("ar-SA") : "";
  item.appendChild(time);
  $("notes").prepend(item);
  while ($("notes").children.length > 2) $("notes").lastElementChild.remove();
}
async function connect(code) {
  code = code.trim().toLowerCase();
  if ($("alias").value.trim() && hasAnimalAlias($("alias").value)) return status("group-status", "اكتب اسمًا مستعارًا مناسبًا أولًا.");
  if (!/^[a-z0-9-]{8,40}$/.test(code)) return status("group-status", "اكتب رمزًا صحيحًا أو أنشئ مجموعة.");
  try {
    status("group-status", "جارٍ الربط...");
    if (!auth.currentUser) await signInAnonymously(auth);
    stop?.(); room = code; $("notes").replaceChildren();
    stop = onChildAdded(query(ref(db, `groups/${room}/notes`), limitToLast(50)), item => render(item.val()));
    localStorage.mobileGroup = room; localStorage.mobileAlias = nickname();
    $("copy").hidden = false; $("leave").hidden = false;
    $("mode-status").textContent = "الحالة الحالية: مرتبط بالمجموعة";
    status("group-status", `تم الربط برمز: ${room}`);
  } catch (error) { status("group-status", `تعذر الربط: ${error.code || "خطأ اتصال"}`); }
}
$("create").onclick = () => { if ($("alias").value.trim() && hasAnimalAlias($("alias").value)) return status("group-status", "اكتب اسمًا مستعارًا مناسبًا أولًا."); const code = `sg-${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`; $("group-code").value = code; connect(code); };
$("join").onclick = () => connect($("group-code").value);
$("copy").onclick = async () => { try { await navigator.clipboard.writeText(room); status("group-status", "تم نسخ الرمز."); } catch (_) { status("group-status", room); } };
$("leave").onclick = () => { stop?.(); room = ""; $("copy").hidden = true; $("leave").hidden = true; $("notes").replaceChildren(); $("mode-status").textContent = "الحالة الحالية: مستقل"; status("group-status", "أنت الآن في الوضع المستقل."); };
$("save").onclick = async () => {
  const text = $("note").value.trim();
  if (!text) return status("note-status", "اكتب الملاحظة أولًا.");
  if (!allowedText(text, "note-status")) return;
  const entry = { text, author: nickname(), createdAt: Date.now(), mode: $("share").checked ? "مجموعة" : "مستقل" };
  try {
    if ($("share").checked) {
      if (!room) return status("note-status", "اربط مجموعة أولًا ثم اختر المشاركة.");
      await set(push(ref(db, `groups/${room}/notes`)), entry);
      status("note-status", "تمت مشاركتها مع المجموعة.");
    } else {
      const own = JSON.parse(localStorage.mobileNotes || "[]"); own.unshift(entry); localStorage.mobileNotes = JSON.stringify(own.slice(0, 100)); render(entry);
      status("note-status", "تم حفظها على هذا الجوال.");
    }
    $("note").value = "";
  } catch (error) { status("note-status", `تعذر الحفظ: ${error.code || "خطأ اتصال"}`); }
};
function exportNotes() {
  const saved = JSON.parse(localStorage.mobileNotes || "[]"), notes = saved.length ? saved.map(item => `[${item.mode || "مستقل"}] ${item.author || "طالب"}: ${item.text || ""}\n${item.createdAt ? new Date(item.createdAt).toLocaleString("ar-SA") : ""}`) : [...document.querySelectorAll("#notes .note")].map(item => item.innerText.trim()).filter(Boolean);
  if (!notes.length) return status("note-status", "لا توجد ملاحظات لتصديرها.");
  const text = `Study Guardian Notes\n${new Date().toLocaleString("ar-SA")}\n\n${notes.join("\n\n--------------------\n\n")}`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `study-guardian-notes-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  status("note-status", "تم تجهيز ملف الملاحظات.");
}
$("export-notes").onclick = exportNotes;
$("print-notes").onclick = () => { const saved = JSON.parse(localStorage.mobileNotes || "[]"), notes = saved.length ? saved : [...document.querySelectorAll("#notes .note")].map(item => ({ text: item.innerText })); if (!notes.length) return status("note-status", "لا توجد ملاحظات لحفظها."); const page = window.open("", "_blank"); if (!page) return status("note-status", "اسمح بفتح نافذة الطباعة لحفظ PDF."); const rows = notes.map(item => `<article><p>${String(item.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><small>${item.createdAt ? new Date(item.createdAt).toLocaleString("ar-SA") : ""}</small></article>`).join(""); page.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملاحظات Smart Guardian</title><style>body{font-family:Tahoma,Arial;padding:28px;color:#142449}h1{color:#1d326a}article{padding:12px;border-bottom:1px solid #ddd}small{color:#65718b}</style></head><body><h1>ملاحظات Smart Guardian</h1>${rows}</body></html>`); page.document.close(); page.onload = () => page.print(); };
$("send-idea").onclick = async () => {
  const text = $("idea").value.trim();
  if (!text) return status("idea-status", "اكتب الاقتراح أولًا.");
  if (!allowedText(text, "idea-status")) return;
  try {
    if (!auth.currentUser) await signInAnonymously(auth);
    const item = push(ref(db, "feedback"));
    await set(item, { text, author: nickname(), createdAt: Date.now(), ownerUid: auth.currentUser.uid });
    rememberFeedback(item.key); $("idea-reply").hidden = true;
    subscribeOwnFeedback(auth.currentUser);
    $("idea").value = "";
    status("idea-status", "شكرًا، تم إرسال اقتراحك لصاحب الأداة.");
  } catch (error) { status("idea-status", `تعذر إرسال الاقتراح: ${error.code || "خطأ اتصال"}`); }
};
const ratingPrompts = ["ما أكثر ميزة أعجبتك في الحارس الذكي؟", "ما الذي جعلك تستخدم الأداة مرة أخرى؟", "أي جزء وفّر عليك وقتًا أكثر؟", "ما الميزة التي تتمنى استمرار تطويرها؟", "شاركنا شيئًا نافعًا وجدته في الأداة."];
function rotateRatingPrompt(index = 0) { $("rating-prompt").textContent = ratingPrompts[index % ratingPrompts.length]; setTimeout(() => rotateRatingPrompt(index + 1), 16000); }
function paintStars() { [...$("rating-stars").children].forEach(button => button.classList.toggle("selected", Number(button.dataset.score) <= selectedRating)); }
$("rating-stars").onclick = event => { const score = Number(event.target.dataset.score); if (!score) return; selectedRating = score; paintStars(); };
$("send-rating").onclick = async () => { const comment = $("rating-comment").value.trim(); if (!selectedRating) return status("rating-status", "اختر عدد النجوم أولًا."); if (!allowedText(comment, "rating-status")) return; try { if (!auth.currentUser) await signInAnonymously(auth); await set(push(ref(db, "ratings")), { score: selectedRating, comment, author: nickname(), ownerUid: auth.currentUser.uid, createdAt: Date.now() }); $("rating-comment").value = ""; selectedRating = 0; paintStars(); status("rating-status", "شكرًا لتقييمك ودعمك للأداة."); } catch (error) { status("rating-status", "تعذر إرسال التقييم. حاول مرة أخرى."); } };
[["listen-names", "listen-status"], ["note", "note-status"], ["idea", "idea-status"], ["rating-comment", "rating-status"]].forEach(([id, target]) => protectTyping(id, target)); protectAlias();
$("alias").value = localStorage.mobileAlias || "";
$("group-code").value = localStorage.mobileGroup || "";
if (!window.studyGuardianCoreReady) {
$("listen-names").value = localStorage.mobileNames || "";
$("listen-start").value = localStorage.mobileListenStart || "";
$("listen-end").value = localStorage.mobileListenEnd || "";
$("listen-schedule").checked = localStorage.mobileListenSchedule === "1";
$("listen-start").onchange = updateSchedule;
$("listen-end").onchange = updateSchedule;
$("listen-schedule").onchange = updateSchedule;
updateSchedule();
setInterval(checkSchedule, 10000);
checkSchedule();
$("listen").onclick = () => listening ? stopListening() : startListening();
$("close-alert").onclick = () => { $("alert").hidden = true; };
}
const updateBanner = $("update-banner");
const hideUpdateBanner = () => { updateBanner.hidden = true; updateBanner.style.display = "none"; };
const showUpdateBanner = () => { updateBanner.hidden = false; updateBanner.style.display = "flex"; };
hideUpdateBanner();
$("refresh-app").onclick = () => { localStorage.mobileAppVersion = latestVersion || localStorage.mobileAppVersion || "local"; hideUpdateBanner(); location.reload(); };
if (location.protocol !== "file:") fetch("./version.json?time=" + Date.now(), { cache: "no-store" }).then(response => response.json()).then(data => { latestVersion = data.version; const seen = localStorage.mobileAppVersion; if (seen && seen !== data.version) showUpdateBanner(); if (!seen) localStorage.mobileAppVersion = data.version; }).catch(hideUpdateBanner);
JSON.parse(localStorage.mobileNotes || "[]").reverse().forEach(render);
if (!window.studyGuardianCoreReady) rotateQuote();
rotateRatingPrompt();
window.studyGuardianMobileReady = true;

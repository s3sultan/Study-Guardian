/*
 * Smart Guardian - Auto-close a class tab
 * © sultan alharbi
 *
 * Browser security note:
 * A website can close only a tab/window that it opened itself.
 * Call SmartGuardianClassCloser.start(...) from a direct user click.
 */
(function (global) {
  "use strict";

  let classTab = null;
  let timer = null;
  let endAt = 0;

  const formatTime = (milliseconds) => {
    const total = Math.max(0, Math.ceil(milliseconds / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  };

  const clear = () => {
    clearInterval(timer);
    timer = null;
    endAt = 0;
  };

  const finish = (onFinish) => {
    try {
      if (classTab && !classTab.closed) classTab.close();
    } catch (_) {}
    clear();
    if (typeof onFinish === "function") onFinish();
  };

  const start = ({ url, hours = 0, minutes = 0, seconds = 0, onTick, onFinish }) => {
    const target = String(url || "").trim();
    const duration =
      (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000;

    if (!/^https?:\/\//i.test(target)) {
      throw new Error("اكتب رابط الكلاس كاملًا ويبدأ بـ https://");
    }
    if (!Number.isFinite(duration) || duration < 1000) {
      throw new Error("حدد مدة لا تقل عن ثانية واحدة.");
    }

    classTab = global.open(target, "smartGuardianClass");
    if (!classTab) {
      throw new Error("اسمح بالنوافذ المنبثقة حتى يفتح تبويب الكلاس.");
    }

    clearInterval(timer);
    endAt = Date.now() + duration;

    const tick = () => {
      const remaining = endAt - Date.now();
      if (typeof onTick === "function") onTick(formatTime(remaining), remaining);
      if (remaining <= 0) finish(onFinish);
    };

    timer = setInterval(tick, 500);
    tick();
    return { cancel: clear, closeNow: () => finish(onFinish) };
  };

  global.SmartGuardianClassCloser = { start, cancel: clear, closeNow: finish };
})(window);

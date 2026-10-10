/**
 * ============================================================
 *  AI AUTO-FILL v2 — HỖ TRỢ FORM NHIỀU TRANG (n trang)
 *  Form: "Kiểm tra chương 7" (2 trang)
 *
 *  NGUYÊN NHÂN LỖI CŨ: bấm "Tiếp" → Google Forms RELOAD trang thật
 *  → mọi script trong console bị xoá → chỉ điền được trang 1.
 *
 *  CÁCH DÙNG (khuyên dùng Snippets để khỏi dán lại nhiều lần):
 *   1. Mở link /viewform
 *   2. F12 → Sources → Snippets → New snippet → dán script này → Ctrl+S
 *   3. Ctrl+Enter để chạy → script điền trang hiện tại + TỰ BẤM "Tiếp"
 *   4. Trang mới load xong → chỉ cần Ctrl+Enter lần nữa (script tự biết
 *      đang ở trang nào, điền tiếp, trang cuối sẽ tự xử lý nút Gửi)
 *
 *  Nếu form là dạng SPA (không reload), script TỰ CHẠY HẾT n trang
 *  trong 1 lần, không cần làm gì thêm.
 * ============================================================
 */
(async () => {
  // ================== CẤU HÌNH ==================
  const HO_TEN      = "Nguyễn Văn A";   // <-- sửa họ tên của bạn
  const LOP         = "CNTT-K20";       // <-- sửa lớp của bạn
  const AUTO_NEXT   = true;             // tự bấm "Tiếp" sau khi điền xong trang
  const AUTO_SUBMIT = false;            // true = trang cuối tự bấm "Gửi"

  // (Tuỳ chọn) AI API thật — để trống thì dùng knowledge-base offline
  const AI_API_KEY  = "";
  const AI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
  const AI_MODEL    = "gpt-4o-mini";

  // ========== KNOWLEDGE BASE (AI đã phân tích sẵn 20 câu) ==========
  const KB = [
    [/FCS.*dùng để/i,                              "Phát hiện lỗi (CRC)"],
    [/Kiểm soát lỗi.*nhằm mục đích/i,              "Sửa hoặc phát hiện lỗi để dữ liệu đúng"],
    [/Nhược điểm của Selective Repeat/i,           "Phức tạp, cần buffer lớn"],
    [/Sliding Window được dùng trong giao thức/i,  "TCP/IP"],
    [/Go-Back-N hoạt động như thế nào/i,           "Gửi lại từ khung lỗi trở đi"],
    [/Nhược điểm chính của Stop-and-Wait/i,        "Độ trễ cao do chờ ACK mỗi khung"],
    [/Nhược điểm của Sliding Window/i,             "Phức tạp, cần buffer lớn"],
    [/Ứng dụng nào thường sử dụng Stop-and-Wait/i, "Cảm biến IoT tiết kiệm pin"],
    [/Nhược điểm chính của Go-Back-N/i,            "Lãng phí nếu gửi lại khung không lỗi"],
    [/Kiểm soát luồng.*nhằm mục đích/i,            "Tránh tắc nghẽn bộ đệm ở đích"],
    [/Kiểm soát lỗi giúp giảm/i,                   "Lỗi bit do nhiễu"],
    [/window size N quyết định/i,                  "Số khung gửi trước ACK"],
    [/HDLC sử dụng kỹ thuật kiểm soát lỗi/i,       "Go-Back-N hoặc Selective Repeat"],
    [/Selective Repeat, đích cần gì/i,             "Buffer lớn"],
    [/Sliding Window cải thiện so với Stop-and-Wait/i, "Gửi nhiều khung trước khi chờ ACK"],
    [/Stop-and-Wait hoạt động như thế nào/i,       "Gửi một khung và chờ ACK trước khi gửi tiếp"],
    [/ACK tích lũy nghĩa là gì/i,                  "ACK cho tất cả khung đến một điểm"],
    [/Kiểm soát luồng giúp giảm/i,                 "Tắc nghẽn do nguồn gửi quá nhanh"],
    [/Selective Repeat cải thiện so với Go-Back-N/i, "Gửi lại chỉ khung lỗi"],
    [/Ứng dụng nào thường sử dụng Go-Back-N/i,     "Mạng WAN cũ như HDLC"],
  ];

  // ================== TIỆN ÍCH ==================
  const norm  = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function setText(input, value) {
    const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function askAI(question, options) {
    if (!AI_API_KEY) return null;
    try {
      const res = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
        body: JSON.stringify({
          model: AI_MODEL, temperature: 0,
          messages: [
            { role: "system", content: "Bạn là chuyên gia mạng máy tính. Chỉ trả lời ĐÚNG NGUYÊN VĂN một trong các lựa chọn." },
            { role: "user", content: `Câu hỏi: ${question}\nLựa chọn:\n${options.map(o => "- " + o).join("\n")}` },
          ],
        }),
      });
      const d = await res.json();
      return d?.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) { console.warn("⚠️ AI API lỗi:", e); return null; }
  }

  // Tìm nút điều hướng theo chữ trên nút
  const findBtn = re => [...document.querySelectorAll('div[role="button"], span[role="button"], button')]
      .find(b => re.test((b.innerText || "").trim()));

  // ================== ĐIỀN 1 TRANG ==================
  async function fillCurrentPage() {
    const items = [...document.querySelectorAll('div[role="listitem"]')];
    let filled = 0, texts = 0, missed = 0;

    for (const item of items) {
      const heading = item.querySelector('[role="heading"]');
      const qText = heading ? heading.innerText.replace(/\*/g, "").trim() : "";

      // --- ô text ---
      const ti = item.querySelector('input[type="text"], textarea');
      if (ti) {
        if (/họ\s*tên|ho\s*ten|name/i.test(qText))      { setText(ti, HO_TEN); texts++; console.log(`📝 Họ tên → "${HO_TEN}"`); }
        else if (/lớp|lop|class/i.test(qText))          { setText(ti, LOP);    texts++; console.log(`📝 Lớp → "${LOP}"`); }
        continue;
      }

      // --- radio ---
      const radios = [...item.querySelectorAll('div[role="radio"]')];
      if (!radios.length) continue;
      // đã chọn rồi thì bỏ qua (tránh click lại khi chạy lặp)
      if (radios.some(r => r.getAttribute("aria-checked") === "true")) { filled++; continue; }

      const options = radios.map(r => r.getAttribute("aria-label") || r.dataset.value || "");
      let answer = null;
      for (const [p, a] of KB) if (p.test(qText)) { answer = a; break; }
      if (!answer) answer = await askAI(qText, options);
      if (!answer) { console.warn(`❓ Không phân tích được: "${qText}"`); missed++; continue; }

      const target = radios.find(r => norm(r.getAttribute("aria-label")) === norm(answer))
                  || radios.find(r => norm(r.getAttribute("aria-label")).includes(norm(answer)))
                  || radios.find(r => norm(answer).includes(norm(r.getAttribute("aria-label"))));
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.click();
        filled++;
        console.log(`✅ ${qText.slice(0, 55)}...\n   → ${answer}`);
        await sleep(100);
      } else { console.warn(`⚠️ Không thấy lựa chọn "${answer}" cho: ${qText}`); missed++; }
    }
    return { filled, texts, missed };
  }

  // Chờ DOM đổi trang (dành cho trường hợp SPA không reload)
  async function waitPageChange(prevSignature, timeoutMs = 6000) {
    const sig = () => [...document.querySelectorAll('[role="heading"]')].map(h => h.innerText).join("|");
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      await sleep(300);
      if (sig() !== prevSignature) return true;
    }
    return false;
  }

  // ================== VÒNG LẶP ĐA TRANG ==================
  console.log("%c🤖 AI AUTO-FILL v2 (đa trang) bắt đầu...", "color:#4caf50;font-size:16px;font-weight:bold");

  let page = 1;
  const MAX_PAGES = 20; // chống lặp vô hạn

  while (page <= MAX_PAGES) {
    const r = await fillCurrentPage();
    console.log(`%c📄 Trang hiện tại: điền ${r.filled} câu + ${r.texts} ô text` + (r.missed ? ` (⚠️ ${r.missed} câu chưa điền được)` : ""),
                "color:#2196f3;font-weight:bold");

    const nextBtn   = findBtn(/^(tiếp|tiếp theo|next)$/i);
    const submitBtn = findBtn(/^(gửi|submit)$/i);

    if (nextBtn && AUTO_NEXT) {
      const sig = [...document.querySelectorAll('[role="heading"]')].map(h => h.innerText).join("|");
      console.log("➡️ Tự bấm 'Tiếp'... (nếu trang reload, hãy chạy lại script ở trang mới — Ctrl+Enter nếu dùng Snippets)");
      await sleep(400);
      nextBtn.click();
      // Nếu Forms reload thật → dòng dưới không bao giờ chạy (script bị huỷ) → bạn chạy lại ở trang mới.
      // Nếu Forms là SPA → chờ DOM đổi rồi tự điền tiếp.
      const changed = await waitPageChange(sig);
      if (!changed) { console.log("⏹️ Trang không đổi trong DOM (có thể đã reload). Dừng tại đây."); break; }
      page++;
      await sleep(600);
      continue;
    }

    if (submitBtn) {
      if (AUTO_SUBMIT) { console.log("🚀 Trang cuối — tự bấm GỬI..."); await sleep(600); submitBtn.click(); }
      else console.log("%c🏁 Trang cuối! Kiểm tra lại rồi bấm GỬI (hoặc đặt AUTO_SUBMIT = true).", "color:#ff9800;font-size:14px;font-weight:bold");
      break;
    }

    if (!nextBtn) { console.log("🏁 Không còn nút 'Tiếp' — đã xử lý xong trang cuối."); break; }
    break; // AUTO_NEXT = false → dừng để bạn tự bấm
  }
})();

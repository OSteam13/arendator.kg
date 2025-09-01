// === app.js ===
// Глобальные "синглтоны"
window.USER = null;            // текущий пользователь или null
window.FAVS = new Set();       // Set<string> listing_id

// Тихо логируем (чтобы не спамить консоль в проде)
const log = (...a) => { /* console.debug('[arendator]', ...a); */ };

// Подтянуть профиль + избранное
async function loadMe() {
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    const data = await r.json().catch(() => ({}));
    if (data && data.ok) {
      window.USER = data.user || null;
      window.FAVS = new Set((data.favorites || []).map(String));
      log('me:', window.USER, 'favs:', window.FAVS);
      markFavButtons();
      return true;
    }
  } catch (_) {}
  window.USER = null;
  window.FAVS = new Set();
  markFavButtons();
  return false;
}

// Обновляем сердечки на текущей странице
function markFavButtons(root = document) {
  const btns = root.querySelectorAll('.fav-btn');
  btns.forEach(btn => {
    const id = String(btn.dataset.id || '').trim();
    const on = window.FAVS.has(id);
    // текст/класс сердечка
    const heart = btn.querySelector('.heart') || btn;
    heart.textContent = on ? '❤' : '♡';
    heart.classList.toggle('text-red-600', on);
    // для доступности
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Убрать из избранного' : 'В избранное';
  });
}

// Синхронизация на сервер (add/remove)
async function toggleFavOnServer(listingId, add) {
  const r = await fetch('/api/favorites', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing_id: String(listingId), action: add ? 'add' : 'remove' })
  });
  const data = await r.json().catch(() => ({}));
  if (!data || !data.ok) throw new Error('server_error');
  window.FAVS = new Set((data.favorites || []).map(String));
  return data;
}

// Глобальный обработчик кликов по сердечкам
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.fav-btn');
  if (!btn) return;

  e.preventDefault();

  const id = String(btn.dataset.id || '').trim();
  if (!id) return;

  // Гость — открыть твою модалку логина (если она есть)
  if (!window.USER) {
    if (typeof window.openLogin === 'function') {
      try { window.openLogin(); } catch(_) {}
    } else {
      alert('Нужно войти, чтобы пользоваться избранным');
    }
    return;
  }

  const add = !window.FAVS.has(id);
  try {
    await toggleFavOnServer(id, add);
    markFavButtons();
  } catch (err) {
    alert('Не удалось сохранить избранное. Проверь сеть и повтори.');
  }
});

// Отмечаем сердечки когда:
// 1) DOM готов
document.addEventListener('DOMContentLoaded', async () => {
  await loadMe();
});

// 2) На странице динамически дорисовали карточки — подхватываем через MutationObserver
(() => {
  const target = document.getElementById('listGrid') || document.body;
  try {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) {
          markFavButtons(m.target instanceof Element ? m.target : document);
        }
      }
    });
    mo.observe(target, { childList: true, subtree: true });
  } catch(_) {}
})();

// 3) Когда вкладка снова активна — освежаем профиль (на случай входа с другой вкладки/устройства)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadMe();
});

// 4) Экспорт пары утилит (если где-то пригодится)
window.isFav = (id) => window.FAVS.has(String(id));
window.refreshProfile = loadMe;

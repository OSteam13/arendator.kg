// app.js

// ===== helpers =====
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  let data;
  try { data = await res.json(); } catch { data = { ok: res.ok }; }
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { res, data });
  return data;
}

// универсальный открыватель модалки логина (работает на всех страницах)
function openLoginSafe() {
  try {
    if (typeof window.openLogin === 'function') { window.openLogin(); return; }
    if (typeof window.openLoginInline === 'function') { window.openLoginInline(); return; }
  } catch (_) {}

  const modal = document.getElementById('modalLogin');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

// ===== утилиты =====
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// ===== глобальное состояние (только для клиента) =====
window.USER = null;
window.FAVS = new Set();

// ===== сердечки =====
function paintHeart(btn, active) {
  // разметка: <button class="fav-btn" data-id="..."><span class="heart">♡</span> В избранное</button>
  const heart = btn.querySelector('.heart');
  if (active) {
    if (heart) { heart.textContent = '❤'; heart.classList.add('text-red-600'); }
    btn.classList.add('text-red-600');
  } else {
    if (heart) { heart.textContent = '♡'; heart.classList.remove('text-red-600'); }
    btn.classList.remove('text-red-600');
  }
}

function paintAllHearts() {
  $all('.fav-btn').forEach((btn) => {
    const id = btn.dataset.id;
    paintHeart(btn, window.FAVS.has(id));
  });
}

async function toggleFav(listingId, shouldAdd) {
  if (!listingId) return;
  if (!window.USER) {
    // гость — открываем модалку входа и прерываем
    openLoginSafe();
    throw new Error('not_logged_in');
  }

  if (shouldAdd) {
    await apiFetch('/api/favorites', { method: 'POST', body: JSON.stringify({ listing_id: listingId }) });
    window.FAVS.add(listingId);
  } else {
    await apiFetch('/api/favorites', { method: 'DELETE', body: JSON.stringify({ listing_id: listingId }) });
    window.FAVS.delete(listingId);
  }
}

// ===== загрузка профиля/избранного при старте =====
(async () => {
  try {
    const me = await apiFetch('/api/me');
    if (me.ok && me.user) {
      window.USER = me.user;
      window.FAVS = new Set(me.favorites || []);
      // синхронизируемся с твоим UI-скриптом
      try { localStorage.setItem('userLogged', '1'); } catch (_) {}
      console.log('✅ USER', USER);
      console.log('⭐ FAVS', [...FAVS]);
      paintAllHearts();
    } else {
      console.log('Гость (не вошёл)');
    }
  } catch (e) {
    if (e?.res?.status !== 401) console.error('Ошибка /api/me:', e);
  }

  // dev-хелпер для быстрого входа в одном домене (можно убрать)
  if (!window.USER) {
    const devUrl = location.origin.replace('www.', '') + '/api/dev-login?uid=777001&name=Test';
    console.log(devUrl);
  }
})();

// ===== делегирование кликов =====
document.addEventListener('click', async (ev) => {
  // 1) Кнопка "Вход / регистрация" — всегда открываем модалку
  const authBtn = ev.target.closest('#btnAuth, #btnAuthMobile');
  if (authBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    openLoginSafe();
    return;
  }

  // 2) Сердечки
  const btn = ev.target.closest('.fav-btn');
  if (!btn) return;

  const id = btn.dataset.id;
  const active = window.FAVS.has(id);

  // мгновенная визуальная обратная связь
  paintHeart(btn, !active);

  try {
    await toggleFav(id, !active);
  } catch (e) {
    // откатываем, если сервер не принял или гость
    paintHeart(btn, active);
    if (e.message !== 'not_logged_in') {
      console.error('fav toggle error:', e);
      alert('Не удалось изменить избранное. Попробуй ещё раз.');
    }
  }
});

// если карточки дорисовываются динамически после загрузки —
// вызови paintAllHearts() в конце их рендера.
window.paintAllHearts = paintAllHearts;

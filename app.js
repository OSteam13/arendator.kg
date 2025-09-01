// app.js

// ===== helpers =====
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  // пробуем JSON, если пусто — вернём заглушку
  let data;
  try { data = await res.json(); } catch { data = { ok: res.ok }; }
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { res, data });
  return data;
}

function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// ===== глобальное состояние (только для клиента) =====
window.USER = null;
window.FAVS = new Set();

// ===== сердечки =====
function paintHeart(btn, active) {
  // ожидаем разметку вида:
  // <button class="fav-btn" data-id="listingId"><span class="heart">♡</span> В избранное</button>
  const heart = btn.querySelector('.heart');
  if (active) {
    btn.classList.add('text-red-600');
    if (heart) heart.textContent = '❤';
  } else {
    btn.classList.remove('text-red-600');
    if (heart) heart.textContent = '♡';
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
    // нет сессии — пусть открывается модалка входа, если она у тебя есть
    console.warn('Not logged in');
    return;
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
      console.log('✅ USER', USER);
      console.log('⭐ FAVS', [...FAVS]);
      paintAllHearts();
    } else {
      console.log('Гость (не вошёл)');
    }
  } catch (e) {
    // 401 — это нормально для гостей
    if (e?.res?.status !== 401) console.error('Ошибка /api/me:', e);
  }

  // dev-хелпер для быстрого входа в одном домене (можно убрать)
  if (!window.USER) {
    const devUrl = location.origin.replace('www.', '') + '/api/dev-login?uid=777001&name=Test';
    console.log(devUrl);
  }
})();

// ===== делегирование кликов по сердечкам =====
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.fav-btn');
  if (!btn) return;

  const id = btn.dataset.id;
  const active = window.FAVS.has(id);

  // мгновенная визуальная обратная связь
  paintHeart(btn, !active);

  try {
    await toggleFav(id, !active);
  } catch (e) {
    // откатываем, если сервер не принял
    paintHeart(btn, active);
    console.error('fav toggle error:', e);
    alert('Не удалось изменить избранное. Попробуй ещё раз.');
  }
});

// если карточки дорисовываются динамически после загрузки —
// вызови paintAllHearts() в конце их рендера.
window.paintAllHearts = paintAllHearts;

// /app.js
(async () => {
  // 1) Тянем профиль + избранное
  async function loadMe() {
    try {
      const r = await fetch('/api/me', { credentials: 'include' });
      if (r.status === 401) return { ok: false };
      const data = await r.json();
      if (!data.ok) return { ok: false };
      window.USER = data.user;                // {id, display_name, avatar_url, locale}
      window.FAVS = new Set(data.favorites||[]);
      console.log('✅ USER', window.USER);
      console.log('⭐ FAVS', [...window.FAVS]);
      return { ok: true };
    } catch (e) {
      console.warn('me failed', e);
      return { ok: false };
    }
  }

  // 2) Подсветка сердечек по состоянию FAVS
  function paintHearts() {
    document.querySelectorAll('.fav-btn').forEach(btn => {
      const id = btn.dataset.id;
      const heart = btn.querySelector('.heart') || btn;
      const active = window.FAVS?.has(id);
      heart.textContent = active ? '❤' : '♡';
      heart.classList.toggle('text-red-600', !!active);
    });
  }

  // 3) Выстрел на сервер — добавить/убрать из избранного
  async function toggleFav(listingId, shouldAdd) {
    const r = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ listingId, add: !!shouldAdd })
    });
    if (r.status === 401) {
      // у тебя есть openLogin() в проекте — покажем модалку логина
      if (typeof openLogin === 'function') openLogin();
      throw new Error('unauthorized');
    }
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'favorites_failed');
    return data;
  }

  // 4) Делегируем клики по всем будущим .fav-btn
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.fav-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;

    const isActive = window.FAVS?.has(id);
    try {
      await toggleFav(id, !isActive);
      if (!window.FAVS) window.FAVS = new Set();
      if (isActive) window.FAVS.delete(id); else window.FAVS.add(id);
      paintHearts();
    } catch (e) {
      console.warn('toggleFav error', e);
    }
  });

  // 5) Инициализация при загрузке
  const me = await loadMe();
  if (me.ok) paintHearts();

  // Если у тебя есть функция, которая перерисовывает карточки динамически,
  // просто вызови paintHearts() после её выполнения.
})();

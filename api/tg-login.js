// ... после if (hmac !== hash) { ... } — всё ок, собираем лёгкие данные
const safeUser = { id, first_name, username };

// по желанию — кука на сутки (для SSR/Edge):
res.setHeader(
  'Set-Cookie',
  `auth=1; Path=/; Max-Age=86400; SameSite=Lax; Secure`
);

// отдадим HTML, который отправит сообщение в основное окно и закроет попап
return res.status(200).send(`<!doctype html>
<meta charset="utf-8">
<script>
  (function(){
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'tg-auth', ok: true, user: ${JSON.stringify(safeUser)} }, '*');
      }
    } catch (e) {}
    window.close();
    // на случай если браузер запретил close():
    setTimeout(function(){ location.replace('/'); }, 1200);
  })();
</script>
Успешно. Окно закроется автоматически.
`);

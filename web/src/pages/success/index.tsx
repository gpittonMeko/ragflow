<!doctype html>
<html lang="it" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Pagamento - Verifica</title>
  <style>
    :root{
      --bg: #0e1116;
      --card: rgba(23,26,33,.75);
      --fg: #e7e7e7;
      --muted: #9aa0a6;
      --accent: #31d2a1;
      --accent-2: #7c5cff;
      --danger: #ff6363;
      --ring: rgba(124,92,255,.35);
      --radius: 16px;
    }
    @media (prefers-color-scheme: light) {
      :root{ --bg:#f6f7fb; --card:#fff; --fg:#14171f; --muted:#6b7280; --ring:rgba(124,92,255,.15);}
    }

    *{box-sizing:border-box}
    html,body{height:100%}
    body{
      margin:0; color:var(--fg); background: radial-gradient(1200px 600px at 10% -10%, rgba(124,92,255,.20), transparent 50%),
                                    radial-gradient(800px 500px at 110% 10%, rgba(49,210,161,.18), transparent 50%),
                                    var(--bg);
      display:flex; align-items:center; justify-content:center; padding:24px;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol";
    }

    .card{
      width:100%; max-width:720px; background:var(--card); backdrop-filter: blur(10px);
      border:1px solid rgba(255,255,255,.08); border-radius:var(--radius);
      box-shadow: 0 10px 40px rgba(0,0,0,.35);
      overflow:hidden;
    }
    .header{
      display:flex; align-items:center; gap:10px; padding:18px 22px; border-bottom:1px solid rgba(255,255,255,.06)
    }
    .logo{display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.2px}
    .logo svg{width:24px; height:24px}

    .body{ padding:26px 22px }
    h1{margin:.2rem 0 0 0; font-size:1.15rem}
    p{margin:.55rem 0; color:var(--muted)}
    .successRow{ display:none; margin-top:8px }
    .errorRow{ display:none; margin-top:8px; color:var(--danger) }

    .status{
      display:flex; align-items:center; gap:10px; padding:14px 16px; border-radius:12px;
      background: rgba(124,92,255,.10); border:1px solid var(--ring);
    }

    .spinner{
      width:18px; height:18px; border-radius:50%; border:3px solid rgba(255,255,255,.25);
      border-top-color:var(--accent-2); animation:spin 900ms linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .check{
      width:20px;height:20px;border-radius:50%;
      background:linear-gradient(135deg,var(--accent),#17b27f);
      display:grid;place-items:center; box-shadow:0 0 0 6px rgba(49,210,161,.18);
      animation:pop .25s ease-out;
    }
    @keyframes pop { from{ transform:scale(.7); opacity:.4 } to{ transform:scale(1); opacity:1 } }

    .controls{ display:flex; align-items:center; gap:10px; margin-top:16px; flex-wrap:wrap }
    .btn{
      appearance:none; border:0; cursor:pointer; border-radius:12px; padding:12px 16px;
      background: linear-gradient(135deg, var(--accent-2), #5c79ff);
      color:white; font-weight:600; box-shadow:0 8px 24px rgba(92,121,255,.35);
      transition: transform .05s ease, filter .15s ease;
    }
    .btn:hover{ filter:brightness(1.06) }
    .btn:active{ transform: translateY(1px) }
    .muted{ color:var(--muted) }
    code{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; padding:2px 6px; background:rgba(255,255,255,.06); border-radius:8px}
  </style>
</head>
<body>
  <div class="card" role="status" aria-live="polite">
    <div class="header">
      <div class="logo" aria-label="SGAI">
        <!-- Mini logo “G”/badge -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <circle cx="12" cy="12" r="9.5" opacity=".35"/>
          <path d="M7 12h10a5 5 0 1 1-1.47-3.53" />
        </svg>
        <span>SGAI — Pagamento</span>
      </div>
    </div>

    <div class="body">
      <div id="status" class="status">
        <div class="spinner" id="spinner" aria-hidden="true"></div>
        <div>
          <div id="title">Verifica pagamento in corso…</div>
          <div id="sub" class="muted">Per favore attendi qualche istante.</div>
        </div>
      </div>

      <div id="successRow" class="successRow">
        <p><strong>Piano PREMIUM attivato.</strong> Benvenuto! 🎉</p>
        <p id="emailRow" class="muted" style="display:none">Email collegata: <b id="email"></b></p>
        <div class="controls">
          <button id="goNow" class="btn">Vai subito alla home</button>
          <span id="countdown" class="muted">Reindirizzo tra <code>3</code>…</span>
        </div>
      </div>

      <div id="errorRow" class="errorRow">
        <p id="errorMsg"><strong>Verifica non riuscita.</strong></p>
        <p class="muted">Se il pagamento è andato a buon fine, aggiorna la pagina o contattaci.</p>
      </div>
    </div>
  </div>

  <script>
    (async () => {
      const byId = id => document.getElementById(id);
      const baseURL = (window.location.origin + '/oauth').replace(/\/+$/, '/oauth');
      const redirectTo = window.location.origin + '/'; // <- destinazione finale (home SGAI)
      const countdownSeconds = 3;

      function showSuccess(email){
        byId('spinner').remove();
        const check = document.createElement('div');
        check.className = 'check';
        check.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
        byId('status').prepend(check);

        byId('title').textContent = 'Pagamento verificato. Piano PREMIUM attivato ✅';
        byId('sub').textContent   = 'Stiamo collegando il tuo account…';

        if (email){
          byId('email').textContent = email;
          byId('emailRow').style.display = 'block';
        }
        byId('successRow').style.display = 'block';

        // pulsante “vai subito”
        byId('goNow').onclick = () => { window.location.href = redirectTo; };

        // redirect con countdown
        let left = countdownSeconds;
        const tick = () => {
          byId('countdown').innerHTML = `Reindirizzo tra <code>${left}</code>…`;
          if (left-- <= 0) window.location.href = redirectTo;
          else setTimeout(tick, 1000);
        };
        tick();
      }

      function showError(msg){
        byId('spinner').remove();
        byId('title').textContent = 'Si è verificato un problema';
        byId('sub').textContent   = 'Non siamo riusciti a confermare il pagamento.';
        byId('errorMsg').textContent = msg || 'Verifica non riuscita.';
        byId('errorRow').style.display = 'block';
      }

      try {
        // session_id può essere in ?session_id=… (Stripe)
        const params = new URLSearchParams(location.search);
        let sid = params.get('session_id');

        // fallback: se in futuro passassi all’hash router #/success?session_id=…
        if (!sid && location.hash.includes('session_id=')) {
          const q = location.hash.split('?')[1] || '';
          sid = new URLSearchParams(q).get('session_id');
        }

        if (!sid) return showError('session_id assente nell’URL.');

        const res = await fetch(`${baseURL}/api/stripe/verify-session?session_id=${encodeURIComponent(sid)}`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (res.ok && data && data.ok) {
          try {
            localStorage.setItem('sgai-upgraded', '1');
            if (data.email) localStorage.setItem('sgai-upgraded-email', data.email);
          } catch {}

          showSuccess(data.email || null);
        } else {
          const reason = (data && (data.status || data.error)) || 'errore';
          showError(`Verifica non riuscita: ${reason}`);
        }
      } catch (e) {
        showError(`Errore di rete: ${e && e.message ? e.message : e}`);
      }
    })();
  </script>
</body>
</html>

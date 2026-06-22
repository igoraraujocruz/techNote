let videoId = null;
let penalidades = [];
let selectedInfracao = null;
let minimized = false;
let quickIndex = 0;
let quickButtons = [];
let justSelected = false;

let currentRenach = null;
let lastScreen = null;
let initTimeout = null;
let refreshingPenalidades = false;
let wasOnVideo = false;

let currentNome = null;
let currentAvatar = null;
let initializing = false;


function storageKey() {
  return "notes_" + videoId;
}

function playbackSpeedKey() {
  return "yt_playback_speed";
}

function commentsStatsKey() {
  return "yt_comments_stats_v2";
}

function minimizedKey() {
  return "yt_notes_minimized";
}

function positionKey() {
  return "yt_window_position";
}

function getVideo() {
  return document.querySelector("video");
}

function resetUserUI() {
  const nameEl = document.getElementById("yt-user-name");
  const avatarEl = document.getElementById("yt-avatar");
  const avatarWrapper = document.getElementById("yt-avatar-wrapper");

  if (nameEl) {
    nameEl.textContent = "";
  }

  if (avatarEl) {

  avatarEl.removeAttribute("src");

  avatarEl.src = "";

  avatarEl.style.display = "none";
}

  if (avatarWrapper) {
    avatarWrapper.style.display = "none";
  }
}

function getVideoId() {

  const video = getVideo();

  if (!video) return null;

  return (
    video.currentSrc ||
    video.src ||
    null
  );
}

function normalizeComment(text) {
  return text.trim().toLowerCase();
}

function formatTime(sec) {

  const h = Math.floor(sec / 3600);

  const m = Math.floor(
    (sec % 3600) / 60
  );

  const s = Math.floor(sec % 60);

  return `${h
    .toString()
    .padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}`;
}

function destroyUI() {

  videoId = null;
  selectedInfracao = null;
  quickButtons = [];

  const notes =
    document.getElementById(
      "yt-notes"
    );

  if (notes) {
    notes.remove();
  }
}

function getRenach() {

  const rows = document.querySelectorAll(
    ".preposto-data-table tr"
  );

  for (const row of rows) {

    const th = row.querySelector("th");
    const td = row.querySelector("td");

    if (
      th &&
      td &&
      th.textContent.trim() === "Renach"
    ) {
      return td.textContent.trim();
    }
  }

  return null;
}

async function loadPenalidades(
  force = false
) {

  const ONE_DAY =
    1000 * 60 * 60 * 24;

  const cache =
    await chrome.storage.local.get([
      "penalidades_cache",
      "penalidades_last_update"
    ]);

  const lastUpdate =
    cache.penalidades_last_update ||
    0;

  const shouldUpdate =
    force ||
    !cache.penalidades_cache ||
    Date.now() - lastUpdate >
      ONE_DAY;

  if (!shouldUpdate) {

    penalidades = Array.isArray(
      cache.penalidades_cache
    )
      ? cache.penalidades_cache
      : cache.penalidades_cache
          ?.infracoes || [];

    return;
  }

  const { data, error } =
    await supabaseClient
      .from("penalidades")
      .select(`
        *,
        comentarios_penalidades (
          id,
          comentario
        )
      `);

  if (error) {
    console.error(error);
    return;
  }

  penalidades = data || [];

  await chrome.storage.local.set({
    penalidades_cache:
      penalidades,
    penalidades_last_update:
      Date.now()
  });
}

let lastRefresh = 0;
async function forceRefreshPenalidades() {

 const now = Date.now();

  if (now - lastRefresh < 5000) {
    return;
  }

  lastRefresh = now;

  if (refreshingPenalidades) {
    return;
  }

  refreshingPenalidades = true;

  const btn = document.getElementById(
    "yt-refresh-penalidades"
  );

  try {
    if (btn) {

      btn.disabled = true;

      btn.textContent = "...";
    }

    await loadPenalidades(true);

    alert(
      "Penalidades atualizadas!"
    );

  } catch (err) {

    console.error(err);

    alert(
      "Erro ao atualizar penalidades"
    );

  } finally {

    refreshingPenalidades = false;

    if (btn) {

      btn.disabled = false;

      btn.textContent = "↻";
    }
  }
}

async function loadSavedPenalidades(
  renach
) {

  const { data, error } =
    await supabaseClient
      .from("notes")
      .select("*")
      .eq("renach", renach);

  if (error) {
    console.error(error);
    return;
  }
}

async function saveNote(
  commentOverride = null
) {

  const video = getVideo();

  if (
    !video ||
    !selectedInfracao
  ) return;

  let comentario = null;

  if (
    commentOverride &&
    commentOverride !==
      "Inserir apenas o artigo"
  ) {
    comentario = commentOverride;
  }

  const payload = {
    renach: currentRenach,
    video_id: videoId,
    infracao:
      selectedInfracao.tipo,
    comentario,
    tempo: video.currentTime
  };

  const { error } =
  await supabaseClient
    .from("notes")
    .insert(payload);

if (error) {

  console.error(error);

  alert("Erro ao salvar nota");

  return;
}

await loadNotes();

await updatePontuacaoStatus();
}

async function saveProblema(texto) {

  if (!texto?.trim()) {
    return;
  }

  const video = getVideo();

  const payload = {
    renach: currentRenach,
    video_id: videoId,
    problema: texto.trim(),
    nome: currentNome,
    tempo: video
      ? video.currentTime
      : 0
  };

  const { error } =
    await supabaseClient
      .from("problemas")
      .insert(payload);

  if (error) {

    console.error(error);

    alert(
      "Erro ao salvar problema"
    );

    return;
  }

  alert(
    "Problema enviado!"
  );
}

async function loadNotes() {

  const container =
    document.getElementById(
      "yt-list"
    );

  if (!container) return;

  const { data, error } =
    await supabaseClient
      .from("notes")
      .select("*")
      .eq(
        "renach",
        currentRenach
      )
      .order("tempo", {
        ascending: true
      });

  if (error) {
    console.error(error);
    return;
  }

  container.innerHTML = "";

  if (!data.length) {
    container.innerHTML = `
      <div class="empty-notes">
        Nenhuma pendência encontrada.
      </div>
    `;

    return;
  }

  data.forEach(note => {

    const div =
      document.createElement("div");

    div.className =
      "note-item";

    const texto =
      note.comentario ||
      note.infracao ||
      "Sem descrição";

    div.innerHTML = `
      <b>
        ${formatTime(
          note.tempo || 0
        )}
      </b>

      <br>

      ${texto}

      <button class="delete-btn">
        ✖
      </button>
    `;

    div.onclick = (e) => {

      if (
        e.target.classList.contains(
          "delete-btn"
        )
      ) {
        return;
      }

      const video = getVideo();

      if (
        video &&
        note.tempo != null
      ) {

        video.currentTime =
          note.tempo;
      }
    };

    div
      .querySelector(
        ".delete-btn"
      )
      .onclick = async (e) => {

        e.stopPropagation();

        await deleteNote(
          note.id
        );
      };

    container.appendChild(div);
  });
}

async function deleteNote(id) {

  const { error } =
  await supabaseClient
    .from("notes")
    .delete()
    .eq("id", id);

if (error) {

  console.error(error);

  return;
}

await loadNotes();

await updatePontuacaoStatus();
}

function updateUserInfo() {

  const nameEl =
    document.getElementById(
      "yt-user-name"
    );

  const avatarEl =
    document.getElementById(
      "yt-avatar"
    );

  const avatarWrapper =
    document.getElementById(
      "yt-avatar-wrapper"
    );

  if (nameEl) {
    nameEl.textContent =
      currentNome || "";

      avatarEl.src =
        currentAvatar;

      avatarEl.style.display =
        "block";
  }

  if (avatarEl) {
    if (currentAvatar) {
      if (avatarWrapper) {
        avatarWrapper.style.display =
          "flex";
      }
    } else {
      avatarEl.removeAttribute(
        "src"
      );
      avatarEl.src = "";
      avatarEl.style.display =
        "none";
      if (avatarWrapper) {
        avatarWrapper.style.display =
          "none";
      }
    }
  }
}

function createUI() {

  if (
    document.getElementById(
      "yt-notes"
    )
  ) return;

  const container =
    document.createElement("div");

  container.id = "yt-notes";

  container.innerHTML = `
    <div id="yt-header">

      <div id="yt-user-info">

  <span id="yt-title">
    TechPark Notas
  </span>

  <div id="yt-user-meta">

  <span id="yt-user-name">
    Carregando...
  </span>

  <span id="yt-user-status">
    0 pontos • Apto
  </span>

</div>

</div>

      <button
  id="yt-refresh-penalidades"
  title="Atualizar"
>
  ↻
</button>

<select id="yt-speed-select">
  <option value="1">1x</option>
  <option value="1.25">1.25x</option>
  <option value="1.5">1.5x</option>
  <option value="1.75">1.75x</option>
  <option value="2">2x</option>
</select>

<button id="yt-toggle">
  −
</button>

    </div>

    <div id="yt-body">

    <div id="yt-avatar-wrapper">

  <img
    id="yt-avatar"
    src=""
  />

</div>

      <div id="yt-existing-penalidades"></div>

<input
  id="yt-search"
  placeholder="Infração"
/>
      <ul id="yt-suggestions"></ul>

      <div id="yt-quick-comments"></div>

      <div id="yt-list"></div>

      <div id="yt-footer">

  <button id="yt-send-platform">
    Adicionar na Plataforma
  </button>

  <div id="yt-problema-actions">

    <button id="yt-problema-btn">
  ⚠ Relatar
</button>

<button id="yt-problema-resolvido-btn">
  ✔ Resolvido
</button>

  </div>

</div>

    </div>
  `;

  document.body.appendChild(
    container
  );

  loadPosition();

  setupEvents();

  setupSearch();

  setupDrag();

  setupMinimize();

  setupPlaybackSpeed();
}

async function resolverProblema() {

  if (!currentRenach) {
    return;
  }

  const confirmar = confirm(
    "Deseja marcar os problemas deste candidato como resolvidos?"
  );

  if (!confirmar) {
    return;
  }

  const btn =
    document.getElementById(
      "yt-problema-resolvido-btn"
    );

  try {

    if (btn) {

      btn.disabled = true;

      btn.textContent =
        "Resolvendo...";
    }

    const { error } =
      await supabaseClient
        .from("problemas")
        .update({
          resolvido: true
        })
        .eq(
          "renach",
          currentRenach
        )
        .eq(
          "resolvido",
          false
        );

    if (error) {

      console.error(error);

      alert(
        "Erro ao resolver problema"
      );

      return;
    }

    alert(
      "Problema marcado como resolvido!"
    );

    await processTabelaProblemas(true);

  } finally {

    if (btn) {

      btn.disabled = false;

      btn.textContent =
        "✔ Problema solucionado";
    }
  }
}

async function setupPlaybackSpeed() {

  const select =
    document.getElementById(
      "yt-speed-select"
    );

  if (!select) {
    return;
  }

  const saved =
    await chrome.storage.local.get([
      playbackSpeedKey()
    ]);

  const savedSpeed =
    saved[
      playbackSpeedKey()
    ] || "1";

  select.value =
    String(savedSpeed);

  const video = getVideo();

  if (video) {

    video.playbackRate =
      Number(savedSpeed);
  }

  select.onchange =
    async () => {

      const speed =
        Number(select.value);

      const video =
        getVideo();

      if (video) {

        video.playbackRate =
          speed;
      }

      await chrome.storage.local.set({
        [playbackSpeedKey()]:
          speed
      });
    };
}

function loadPosition() {

  const el =
    document.getElementById(
      "yt-notes"
    );

  chrome.storage.local.get(
    [positionKey()],
    (res) => {

      const pos =
        res[positionKey()];

      let left =
        window.innerWidth - 380;

      let top = 100;

      if (pos) {

        left = pos.left;
        top = pos.top;
      }

      const rect =
        el.getBoundingClientRect();

      const margin = 20;

      const maxLeft =
        window.innerWidth -
        rect.width -
        margin;

      const maxTop =
        window.innerHeight -
        rect.height -
        margin;

      left = Math.max(
        margin,
        Math.min(left, maxLeft)
      );

      top = Math.max(
        margin,
        Math.min(top, maxTop)
      );

      el.style.left =
        left + "px";

      el.style.top =
        top + "px";

      el.style.right =
        "auto";

      savePosition(left, top);
    }
  );
}

async function updatePontuacaoStatus() {

  const statusEl =
    document.getElementById(
      "yt-user-status"
    );

  if (
    !statusEl ||
    !currentRenach
  ) return;

  const { data, error } =
    await supabaseClient
      .from("notes")
      .select(`
        infracao
      `)
      .eq(
        "renach",
        currentRenach
      );

  if (error) {
    console.error(error);
    return;
  }

  let total = 0;

  data.forEach(note => {

    const penalidade =
      penalidades.find(
        p =>
          p.tipo ===
          note.infracao
      );

    if (!penalidade) return;

    total += Number(
      penalidade.peso || 0
    );
  });

  const status =
    total >= 11
      ? "Inapto"
      : "Apto";

  statusEl.textContent =
    `${total} pontos • ${status}`;

  statusEl.style.color =
    total >= 11
      ? "#ff4d4d"
      : "#4caf50";
}

function savePosition(
  left,
  top
) {

  chrome.storage.local.set({
    [positionKey()]: {
      left,
      top
    }
  });
}

function setupSearch() {

  const input =
    document.getElementById(
      "yt-search"
    );

  const list =
    document.getElementById(
      "yt-suggestions"
    );

  let currentIndex = -1;
  let currentResults = [];

  function renderList(results) {

    list.innerHTML = "";

    currentResults = results;

    const limited =
      results.slice(0, 5);

    limited.forEach(
      (p, index) => {

        const li =
          document.createElement(
            "li"
          );

        li.textContent = p.tipo;

        li.onclick = () =>
          selectItem(index);

        list.appendChild(li);
      }
    );
  }

  function selectItem(index) {

    const p =
      currentResults[index];

    if (!p) return;

    selectedInfracao = p;

    justSelected = true;

    input.value = p.tipo;

    list.innerHTML = "";

    loadQuickComments();
  }

  input.addEventListener(
    "keydown",
    (e) => {

      if (
        justSelected &&
        e.key.length === 1
      ) {

        justSelected = false;

        input.value = "";

        selectedInfracao =
          null;

        clearQuickComments();
      }
    }
  );

  input.addEventListener(
    "input",
    () => {

      const value =
        input.value
          .toLowerCase()
          .trim();

      selectedInfracao = null;

      clearQuickComments();

      if (!value) {

        list.innerHTML = "";

        return;
      }

      const results =
        penalidades.filter(
          p =>
            p.tipo
              .toLowerCase()
              .includes(value) ||
            p.descricao
              .toLowerCase()
              .includes(value)
        );

      renderList(results);
    }
  );

  input.addEventListener(
    "keydown",
    (e) => {

      const items =
        list.querySelectorAll("li");

      if (!items.length) return;

      if (
        e.key === "ArrowDown"
      ) {

        e.preventDefault();

        currentIndex =
          (currentIndex + 1) %
          items.length;

        updateActive();
      }

      if (
        e.key === "ArrowUp"
      ) {

        e.preventDefault();

        currentIndex =
          (currentIndex -
            1 +
            items.length) %
          items.length;

        updateActive();
      }

      if (
        e.key === "Enter"
      ) {

        e.preventDefault();

        const indexToSelect =
          currentIndex >= 0
            ? currentIndex
            : 0;

        selectItem(
          indexToSelect
        );
      }
    }
  );

  function updateActive() {

    const items =
      list.querySelectorAll("li");

    items.forEach(
      (el, i) => {

        el.classList.toggle(
          "active",
          i === currentIndex
        );
      }
    );
  }
}

function loadQuickComments() {

  const container =
    document.getElementById(
      "yt-quick-comments"
    );

  if (
    !container ||
    !selectedInfracao
  ) return;

  container.innerHTML = "";

  quickButtons = [];
  quickIndex = 0;

  function createButton(
    text,
    isDefault = false
  ) {

    const btn =
      document.createElement(
        "button"
      );

    btn.className =
      "quick-comment";

    if (isDefault) {
      btn.classList.add(
        "no-delete"
      );
    }

    btn.textContent = text;

    btn.onclick = () => {

      saveNote(
        text ===
          "Inserir apenas o artigo"
          ? ""
          : text
      );
    };

    container.appendChild(btn);

    quickButtons.push(btn);
  }

  createButton(
    "Inserir apenas o artigo",
    true
  );

  const comentarios =
    selectedInfracao
      .comentarios_penalidades ||
    [];

  comentarios.forEach(c => {
    createButton(c.comentario);
  });
}

function clearQuickComments() {

  const el =
    document.getElementById(
      "yt-quick-comments"
    );

  if (el) {
    el.innerHTML = "";
  }
}

function setupEvents() {

  document.getElementById(
    "yt-send-platform"
  ).onclick =
    sendToPlatform;

  document.getElementById(
    "yt-refresh-penalidades"
  ).onclick =
    forceRefreshPenalidades;

  document.getElementById(
  "yt-problema-btn"
).onclick = async () => {

  const texto = prompt(
    "Descreva o problema"
  );

  if (!texto) {
    return;
  }

  await saveProblema(texto);

  await processTabelaProblemas(true);
};

document.getElementById(
  "yt-problema-resolvido-btn"
).onclick =
  resolverProblema;
}
function setupMinimize() {

  const el =
    document.getElementById(
      "yt-notes"
    );

  const btn =
    document.getElementById(
      "yt-toggle"
    );

  const body =
    document.getElementById(
      "yt-body"
    );

  function applyMinimizedState() {

    body.style.display =
      minimized
        ? "none"
        : "flex";

    updateUserInfo();

    btn.textContent =
      minimized
        ? "+"
        : "−";

    /*
    adiciona classe
    */
    el.classList.toggle(
      "minimized",
      minimized
    );
  }

  chrome.storage.local.get(
    [minimizedKey()],
    (res) => {

      minimized =
        !!res[minimizedKey()];

      applyMinimizedState();
    }
  );

  btn.onclick = () => {

    minimized = !minimized;

    applyMinimizedState();

    chrome.storage.local.set({
      [minimizedKey()]:
        minimized
    });
  };
}

function setupDrag() {

  const el =
    document.getElementById(
      "yt-notes"
    );

  const header =
    document.getElementById(
      "yt-header"
    );

  let dragging = false;

  let ox = 0;
  let oy = 0;

  header.onmousedown = e => {

    dragging = true;

    ox =
      e.clientX -
      el.offsetLeft;

    oy =
      e.clientY -
      el.offsetTop;
  };

  document.onmousemove = e => {

    if (!dragging) return;

    const left =
      e.clientX - ox;

    const top =
      e.clientY - oy;

    el.style.left =
      left + "px";

    el.style.top =
      top + "px";

    el.style.right =
      "auto";

    savePosition(
      left,
      top
    );
  };

  document.onmouseup = () => {
    dragging = false;
  };
}

async function sendToPlatform() {

  const box =
    document.querySelector(
      'textarea[ng-model="justificativa"]'
    );

  if (!box) {

    alert(
      "Campo não encontrado"
    );

    return;
  }

  const { data, error } =
    await supabaseClient
      .from("notes")
      .select("*")
      .eq(
        "renach",
        currentRenach
      )
      .order("tempo", {
        ascending: true
      });

  if (error) {
    console.error(error);
    return;
  }

  const text = data
  .map(note => {

    const penalidade =
      penalidades.find(
        p =>
          p.tipo === note.infracao
      );
    let artigo = "";

    if (penalidade?.tipo) {

      const match =
        penalidade.tipo.match(
          /^Art\.\s*\d+/
        );

      if (match) {
        artigo = match[0];
      }
    }

    const descricao =
      note.comentario ||
      note.infracao;

    return `[${formatTime(
      note.tempo
    )}]
${artigo} - ${descricao}`;

  })
  .join("\n\n");

  box.focus();

  box.value = text;

  box.dispatchEvent(
    new Event("input", {
      bubbles: true
    })
  );

  box.dispatchEvent(
    new Event("change", {
      bubbles: true
    })
  );
}

function injectCustomFullscreen() {
  

  const video = getVideo();

  if (!video) return;

  if (
    document.getElementById(
      "fullscreen-btn"
    )
  ) return;

  video.setAttribute(
  "controlslist",
  "nodownload nofullscreen"
);

  let wrapper =
    video.parentElement;

  if (
    !wrapper.id ||
    wrapper.id !==
      "video-container"
  ) {

    const newWrapper =
      document.createElement(
        "div"
      );

    newWrapper.id =
      "video-container";

    video.parentNode.insertBefore(
      newWrapper,
      video
    );

    newWrapper.appendChild(video);

    wrapper = newWrapper;
  }

  Object.assign(
    wrapper.style,
    {
      position: "relative",
      width: "100%"
    }
  );

  const btn =
    document.createElement(
      "button"
    );

  btn.id =
    "fullscreen-btn";

  btn.innerText = "⛶";

  function updateFullscreenButtonPosition() {

  const isFullscreen =
    !!document.fullscreenElement;

  Object.assign(btn.style, {
    position: "absolute",
    zIndex: "999999",
    width: "34px",
    height: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    bottom: isFullscreen
      ? "40px"
      : "35px",
    right: isFullscreen
      ? "95px"
      : "50px"
  });
}

updateFullscreenButtonPosition();

document.addEventListener(
  "fullscreenchange",
  () => {

    setTimeout(() => {

      updateFullscreenButtonPosition();

    }, 50);
  }
);

  btn.onclick = async () => {

    if (
      document.fullscreenElement
    ) {

      await document.exitFullscreen();

    } else {

      await wrapper.requestFullscreen();
    }
  };

const notes =
  document.getElementById(
    "yt-notes"
  );

if (
  notes &&
  notes.parentElement !== wrapper
) {

  wrapper.appendChild(notes);
}

  wrapper.appendChild(btn);
}

async function highlightProblemasTabela() {

  const rows = document.querySelectorAll(
    ".preposto-table tbody tr"
  );

  if (!rows.length) {
    return;
  }

  const renachs = [];

  rows.forEach(row => {

    const cells =
      row.querySelectorAll("td");

    if (cells.length < 2) {
      return;
    }

    const renach =
      cells[1]
        ?.textContent
        ?.trim();

    if (renach) {
      renachs.push(renach);
    }
  });

  if (!renachs.length) {
    return;
  }

  const { data, error } =
    await supabaseClient
      .from("problemas")
      .select(`
        renach,
        problema,
        resolvido
      `)
      .in("renach", renachs)
      .eq("resolvido", false);

  if (error) {

    console.error(error);

    return;
  }

  const problemasMap =
    new Map();

  data.forEach(item => {

    problemasMap.set(
      item.renach,
      item.problema
    );
  });

  rows.forEach(row => {

    const cells =
      row.querySelectorAll("td");

    if (cells.length < 2) {
      return;
    }

    const renach =
      cells[1]
        ?.textContent
        ?.trim();

    const problema =
      problemasMap.get(
        renach
      );
    row.style.background = "";
    row.removeAttribute(
      "title"
    );

    if (problema) {

      row.style.background =
        "#ffb3b3";

      row.style.transition =
        "0.2s";

      row.title =
        `PROBLEMA: ${problema}`;
    }
  });
}

async function init() {
  if (initializing) {
    return;
  }

  initializing = true;

  try {
  setupProblemaTooltip();

const renach = getRenach();

const nomeRaw = [...document.querySelectorAll('.preposto-card tr')]
  .find(tr =>
    tr.querySelector('th')?.textContent.trim() === 'Candidato'
  )
  ?.querySelector('td.ng-binding')
  ?.textContent.trim();

const nome = nomeRaw && nomeRaw !== "N/D" ? nomeRaw : null;

const avatar = document.querySelector(".preposto-avatar") ?.src || null;

currentNome = nome;
currentAvatar = avatar;


updateUserInfo();

if (!nome) {

  currentRenach = null;

  destroyUI();

  return;
}

    if (renach) {

      const changedRenach =
        renach !== currentRenach;

      if (changedRenach) {

        currentRenach = renach;

        await loadSavedPenalidades(
          currentRenach
        );

        setTimeout(() => {
          loadNotes();
        }, 100);

        videoId = null;

        wasOnVideo = false;
      }
    }

    if (
      !document.getElementById(
        "yt-notes"
      )
    ) {
      await loadPenalidades();

      createUI();
      loadExistingPenalidades();
    }

    const video = getVideo();

    const hasVideo = !!video;

    if (!hasVideo) {

      if (wasOnVideo) {

        console.log(
          "Saiu do vídeo"
        );

        wasOnVideo = false;

        videoId = null;

        setTimeout(() => {
          loadNotes();
        }, 100);
      }

      lastScreen = "cadastro";

      return;
    }

    if (!wasOnVideo) {

      console.log(
        "Entrou no vídeo"
      );

      wasOnVideo = true;

      setTimeout(() => {
        loadNotes();
      }, 100);
    }

    const id = getVideoId();

    if (!id) return;

    if (videoId !== id) {

      videoId = id;

      injectCustomFullscreen();
    }

    const saved =
  await chrome.storage.local.get([
    playbackSpeedKey()
  ]);

video.playbackRate =
  Number(
    saved[
      playbackSpeedKey()
    ] || 1
  );

    await highlightProblemasTabela();

    lastScreen = "video";

  } finally {

    initializing = false;
  }
}

let lastTabelaHash = null;

async function processTabelaProblemas(force = false) {

  const table = document.querySelector(
    ".preposto-table"
  );

  if (!table) {
    return;
  }

  const rows = [
    ...table.querySelectorAll(
      "tbody tr"
    )
  ].filter(row => {

    return row.querySelectorAll("td")
      .length > 5;
  });

  if (!rows.length) {
    return;
  }

  const hash = rows
    .map(row =>
      row.children[1]
        ?.textContent
        ?.trim()
    )
    .join("|");

  if (!force && hash === lastTabelaHash) {
    return;
  }

  lastTabelaHash = hash;

  const renachs = rows
    .map(row =>
      row.children[1]
        ?.textContent
        ?.trim()
    )
    .filter(Boolean);

  if (!renachs.length) {
    return;
  }

  console.log(
    "Consultando problemas..."
  );

  const { data, error } =
    await supabaseClient
      .from("problemas")
      .select(`
        renach,
        problema,
        resolvido
      `)
      .in("renach", renachs)
      .eq("resolvido", false);

  if (error) {

    console.error(error);

    return;
  }

  const problemasMap =
    new Map();

  data.forEach(item => {

    if (
      !problemasMap.has(
        item.renach
      )
    ) {

      problemasMap.set(
        item.renach,
        []
      );
    }

    problemasMap
      .get(item.renach)
      .push(item.problema);
  });

  rows.forEach(row => {

    const renach =
      row.children[1]
        ?.textContent
        ?.trim();

    const problemas =
      problemasMap.get(
        renach
      );

    row.style.background = "";
    row.style.borderLeft = "";

    row.removeAttribute(
      "title"
    );

    delete row.dataset
      .problemaTooltip;

    if (problemas?.length) {

      row.style.background =
        "rgba(255,0,0,0.12)";

      row.style.borderLeft =
        "4px solid red";

      row.dataset.problemaTooltip =
        problemas.join("\n• ");
    }
  });
}

function loadExistingPenalidades() {

  const container =
    document.getElementById(
      "yt-existing-penalidades"
    );

  if (!container) {
    return;
  }

  const cards =
    document.querySelectorAll(
      ".preposto-falta-card"
    );

  container.innerHTML = "";

  if (!cards.length) {

    container.innerHTML = `
      <div class="yt-no-existing">
        Nenhuma penalidade lançada
      </div>
    `;

    return;
  }

  cards.forEach((card, index) => {

    const desc =
      card.querySelector(
        ".preposto-falta-desc"
      )?.textContent?.trim();

    if (!desc) {
      return;
    }

    const item =
      document.createElement("div");

    item.className =
      "yt-existing-item";

    item.innerHTML = `
      <div class="yt-existing-text">
        ${desc}
      </div>

      <div class="yt-existing-actions">

        <button
          class="yt-existing-btn yt-check"
        >
          ✔
        </button>

        <button
          class="yt-existing-btn yt-x"
        >
          ✖
        </button>

      </div>
    `;

    const checkBtn =
      item.querySelector(
        ".yt-check"
      );

    const xBtn =
      item.querySelector(
        ".yt-x"
      );

    checkBtn.onclick = async () => {

  item.classList.remove(
    "yt-existing-rejected"
  );

  const approved =
    item.classList.toggle(
      "yt-existing-approved"
    );

  if (!approved) {
    return;
  }

  const video = getVideo();

  const tempo =
    video
      ? video.currentTime
      : 0;

  await supabaseClient
    .from("notes")
    .insert({
      renach: currentRenach,
      video_id: videoId,
      infracao: desc,
      comentario: desc,
      tempo
    });

  loadNotes();
};
    xBtn.onclick = () => {

      item.classList.remove(
        "yt-existing-approved"
      );

      item.classList.toggle(
        "yt-existing-rejected"
      );
    };

    container.appendChild(item);
  });
}

function setupProblemaTooltip() {

  if (
    document.getElementById(
      "yt-problema-tooltip"
    )
  ) {
    return;
  }

  const tooltip =
    document.createElement("div");

  tooltip.id =
    "yt-problema-tooltip";

  tooltip.innerHTML = `
    <div id="yt-problema-tooltip-content"></div>
  `;

Object.assign(
  tooltip.style,
  {
    position: "fixed",
    zIndex: "999999999",

    minWidth: "220px",
    maxWidth: "300px",

    padding: "10px 12px",

    borderRadius: "12px",

    background:
      "rgba(15,15,15,0.96)",

    backdropFilter:
      "blur(10px)",

    color: "#f3f4f6",

    fontSize: "12px",
    lineHeight: "1.35",

    border:
      "1px solid rgba(255,90,90,0.22)",

    boxShadow:
      `
      0 8px 24px rgba(0,0,0,0.45),
      0 0 0 1px rgba(255,255,255,0.03)
    `,

    whiteSpace: "normal",

    pointerEvents: "none",

    opacity: "0",

    transform:
      "translateY(4px) scale(0.98)",

    transition:
      `
      opacity 0.12s ease,
      transform 0.12s ease
    `,

    overflow: "hidden"
  }
);

  const arrow =
    document.createElement("div");

  Object.assign(
    arrow.style,
    {
      position: "absolute",
      width: "12px",
      height: "12px",

      background:
        "rgba(20,20,20,0.92)",

      borderLeft:
        "1px solid rgba(255,80,80,0.35)",

      borderTop:
        "1px solid rgba(255,80,80,0.35)",

      transform:
        "rotate(45deg)",

      left: "-7px",
      top: "18px"
    }
  );

  tooltip.appendChild(arrow);

  document.body.appendChild(
    tooltip
  );

  const content =
    document.getElementById(
      "yt-problema-tooltip-content"
    );

  let mouseX = 0;
  let mouseY = 0;

  document.addEventListener(
    "mousemove",
    e => {

      mouseX = e.clientX;
      mouseY = e.clientY;

      const row =
  e.target?.closest?.(
    ".preposto-table tbody tr"
  );

      if (
        !row ||
        !row.dataset
          .problemaTooltip
      ) {

        tooltip.style.opacity =
          "0";

        tooltip.style.transform =
          "translateY(6px) scale(0.98)";

        return;
      }

      const problemas =
        row.dataset
          .problemaTooltip
          .split("\n");

      content.innerHTML = `
  <div style="
    font-weight: 700;
    margin-bottom: 8px;
    color: #ff7b7b;
    font-size: 11px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  ">
    teste encontrados
  </div>

  ${problemas.map(p => `
    <div style="
      display: flex;
      gap: 6px;
      margin-bottom: 5px;
      align-items: flex-start;
    ">
      <span style="
        color: #ff6b6b;
        font-size: 12px;
        margin-top: 1px;
        flex-shrink: 0;
      ">
        •
      </span>

      <span style="
        color: #e5e7eb;
        line-height: 1.35;
        word-break: break-word;
      ">
        ${p}
      </span>
    </div>
  `).join("")}
`;

      const tooltipWidth =
        360;

      const tooltipHeight =
        tooltip.offsetHeight || 120;

      let left =
  mouseX + 14;

let top =
  mouseY + 14;

      if (
        left + tooltipWidth >
        window.innerWidth
      ) {

        left =
          mouseX - tooltipWidth - 14;
      }

      if (
        top + tooltipHeight >
        window.innerHeight
      ) {

        top =
          window.innerHeight -
          tooltipHeight -
          20;
      }

      tooltip.style.left =
        left + "px";

      tooltip.style.top =
        top + "px";

      tooltip.style.opacity =
        "1";

      tooltip.style.transform =
        "translateY(0px) scale(1)";
    }
  );
}

const observer =
  new MutationObserver(
    mutations => {

      const validMutation =
        mutations.some(m => {

          const target =
            m.target;

          if (
            target.closest?.(
              "#yt-notes"
            )
          ) {
            return false;
          }

          return true;
        });

      if (!validMutation) {
        return;
      }

      clearTimeout(
        initTimeout
      );

      initTimeout =
  setTimeout(
    async () => {

      await init();

      await processTabelaProblemas(true);
      loadExistingPenalidades();

    },
    300
  );
    }
  );

observer.observe(document.body, {
  childList: true,
  subtree: true
});

window.addEventListener(
  "resize",
  () => {
    loadPosition();
  }
);

document.addEventListener(
  "fullscreenchange",
  () => {
    setTimeout(() => {
      loadPosition();
    }, 100);
  }
);

init();
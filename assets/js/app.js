const SUPABASE_URL = "https://yjdejtmnwklfpokjtmzz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZGVqdG1ud2tsZnBva2p0bXp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0ODQ4NDgsImV4cCI6MjA4OTA2MDg0OH0.ltf_5XgC6ue8a145UrdF463LSaXy05t44A6OvwxAwnE";

const STORAGE_KEYS = {
  session: "votify_current_user"
};

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCurrentUser(user) {
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(user));
}

function getCurrentUser() {
  return readSession();
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.session);
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function renderNotice(targetId, message, type) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `<div class="notice ${type}">${escapeHTML(message)}</div>`;
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function normalizePollRow(row) {
  return {
    ...row,
    options: Array.isArray(row.options) ? row.options : []
  };
}

async function fetchPolls() {
  const { data, error } = await supabaseClient
    .from("polls")
    .select("id, user_id, title, description, created_at, options(id, option_text, vote_count)")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }
  return (data || []).map(normalizePollRow);
}

async function fetchPollById(pollId) {
  const { data, error } = await supabaseClient
    .from("polls")
    .select("id, user_id, title, description, created_at, options(id, option_text, vote_count)")
    .eq("id", pollId)
    .single();

  if (error) {
    throw error;
  }
  return normalizePollRow(data);
}

async function registerUser(name, email, password) {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing, error: existingError } = await supabaseClient
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  if (existing) {
    return { ok: false, message: "Email already registered." };
  }

  const { data, error } = await supabaseClient
    .from("users")
    .insert({
      name: name.trim(),
      email: normalizedEmail,
      password
    })
    .select("id, name, email, created_at")
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  setCurrentUser(data);
  return { ok: true, user: data };
}

async function loginUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabaseClient
    .from("users")
    .select("id, name, email, created_at")
    .eq("email", normalizedEmail)
    .eq("password", password)
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data) {
    return { ok: false, message: "Invalid email or password." };
  }

  setCurrentUser(data);
  return { ok: true, user: data };
}

async function createPoll(userId, title, description, optionTexts) {
  const cleanOptions = optionTexts.map((text) => text.trim()).filter(Boolean);

  if (!title.trim()) {
    return { ok: false, message: "Poll title is required." };
  }

  if (cleanOptions.length < 2) {
    return { ok: false, message: "Add at least two options." };
  }

  const { data: pollRow, error: pollError } = await supabaseClient
    .from("polls")
    .insert({
      user_id: userId,
      title: title.trim(),
      description: description.trim()
    })
    .select("id")
    .single();

  if (pollError) {
    return { ok: false, message: pollError.message };
  }

  const optionRows = cleanOptions.map((optionText) => ({
    poll_id: pollRow.id,
    option_text: optionText,
    vote_count: 0
  }));

  const { error: optionsError } = await supabaseClient.from("options").insert(optionRows);
  if (optionsError) {
    return { ok: false, message: optionsError.message };
  }

  return { ok: true, pollId: pollRow.id };
}

async function updatePoll(pollId, userId, title, description, optionEntries) {
  if (!title.trim()) {
    return { ok: false, message: "Poll title is required." };
  }

  const cleaned = optionEntries
    .map((entry) => ({ id: entry.id || null, text: entry.text.trim() }))
    .filter((entry) => entry.text);

  if (cleaned.length < 2) {
    return { ok: false, message: "Keep at least two options." };
  }

  const { data: poll, error: pollErr } = await supabaseClient
    .from("polls")
    .select("id, user_id")
    .eq("id", pollId)
    .eq("user_id", userId)
    .maybeSingle();

  if (pollErr) {
    return { ok: false, message: pollErr.message };
  }

  if (!poll) {
    return { ok: false, message: "Poll not found or permission denied." };
  }

  const { error: updatePollError } = await supabaseClient
    .from("polls")
    .update({ title: title.trim(), description: description.trim() })
    .eq("id", pollId)
    .eq("user_id", userId);

  if (updatePollError) {
    return { ok: false, message: updatePollError.message };
  }

  const { data: existingOptions, error: fetchOptionsErr } = await supabaseClient
    .from("options")
    .select("id")
    .eq("poll_id", pollId);

  if (fetchOptionsErr) {
    return { ok: false, message: fetchOptionsErr.message };
  }

  const keepIds = new Set(cleaned.filter((entry) => entry.id).map((entry) => entry.id));
  const deleteIds = (existingOptions || [])
    .map((row) => row.id)
    .filter((id) => !keepIds.has(id));

  if (deleteIds.length > 0) {
    const { error: deleteErr } = await supabaseClient.from("options").delete().in("id", deleteIds);
    if (deleteErr) {
      return { ok: false, message: deleteErr.message };
    }
  }

  for (let i = 0; i < cleaned.length; i += 1) {
    const entry = cleaned[i];
    if (entry.id) {
      const { error: updErr } = await supabaseClient
        .from("options")
        .update({ option_text: entry.text })
        .eq("id", entry.id)
        .eq("poll_id", pollId);
      if (updErr) {
        return { ok: false, message: updErr.message };
      }
    } else {
      const { error: insErr } = await supabaseClient
        .from("options")
        .insert({ poll_id: pollId, option_text: entry.text, vote_count: 0 });
      if (insErr) {
        return { ok: false, message: insErr.message };
      }
    }
  }

  return { ok: true };
}

async function deletePoll(pollId, userId) {
  const { data, error } = await supabaseClient
    .from("polls")
    .delete()
    .eq("id", pollId)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data || data.length === 0) {
    return { ok: false, message: "Poll not found or permission denied." };
  }

  return { ok: true };
}

async function votePoll(pollId, optionId, userId) {
  if (!userId) {
    return { ok: false, message: "Please log in to vote." };
  }

  const { error: voteInsertError } = await supabaseClient.from("votes").insert({
    poll_id: pollId,
    option_id: optionId,
    user_id: userId
  });

  if (voteInsertError) {
    if (voteInsertError.code === "23505") {
      return { ok: false, message: "You already voted on this poll." };
    }
    return { ok: false, message: voteInsertError.message };
  }

  const { data: currentOption, error: selectOptionError } = await supabaseClient
    .from("options")
    .select("id, vote_count")
    .eq("id", optionId)
    .eq("poll_id", pollId)
    .maybeSingle();

  if (selectOptionError || !currentOption) {
    return { ok: false, message: selectOptionError ? selectOptionError.message : "Option not found." };
  }

  const { error: updateCountError } = await supabaseClient
    .from("options")
    .update({ vote_count: (currentOption.vote_count || 0) + 1 })
    .eq("id", optionId)
    .eq("poll_id", pollId);

  if (updateCountError) {
    return { ok: false, message: updateCountError.message };
  }

  return { ok: true };
}

async function fetchUserVoteForPoll(pollId, userId) {
  if (!userId) return null;
  const { data, error } = await supabaseClient
    .from("votes")
    .select("id, option_id")
    .eq("poll_id", pollId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data || null;
}

function renderNavbar() {
  const currentUser = getCurrentUser();
  const target = document.getElementById("navbarLinks");
  if (!target) return;

  const links = ["<a href=\"index.html\">Home</a>"];

  if (currentUser) {
    links.push('<a href="dashboard.html">Dashboard</a>');
    links.push('<a href="create-poll.html">Create Poll</a>');
    links.push(`<span class="meta">Hi, ${escapeHTML(currentUser.name)}</span>`);
    links.push('<button id="logoutBtn" type="button">Logout</button>');
  } else {
    links.push('<a href="login.html">Login</a>');
    links.push('<a href="register.html">Register</a>');
  }

  target.innerHTML = links.join("");

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearSession();
      window.location.href = "login.html";
    });
  }
}

function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

function createOptionInput(value = "", optionId = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "option-row";
  wrapper.innerHTML = `
    <input
      type="text"
      class="option-input"
      placeholder="Option text"
      required
      data-option-id="${escapeHTML(optionId)}"
      value="${escapeHTML(value)}"
    />
    <button type="button" class="btn secondary remove-option">Remove</button>
  `;
  return wrapper;
}

function collectOptionEntries(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll(".option-input")).map((input) => ({
    id: input.dataset.optionId || null,
    text: input.value.trim()
  }));
}

function addOptionField(containerId, value = "", optionId = "") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const row = createOptionInput(value, optionId);
  row.querySelector(".remove-option").addEventListener("click", () => {
    if (container.children.length <= 2) {
      return;
    }
    row.remove();
  });
  container.appendChild(row);
}

async function initHomePage() {
  const list = document.getElementById("pollList");
  if (!list) return;

  try {
    const polls = await fetchPolls();
    if (!polls.length) {
      list.innerHTML = '<div class="empty-state">No polls yet. Create one from your dashboard.</div>';
      return;
    }

    list.innerHTML = polls
      .map((poll) => {
        const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.vote_count || 0), 0);
        return `
          <article class="card poll-card">
            <div>
              <h3>${escapeHTML(poll.title)}</h3>
              <p>${escapeHTML(poll.description || "No description provided.")}</p>
            </div>
            <div class="meta">${poll.options.length} options � ${totalVotes} total votes � Created ${formatDate(poll.created_at)}</div>
            <div class="card-actions">
              <a class="btn secondary" href="poll.html?id=${encodeURIComponent(poll.id)}">Open Poll</a>
            </div>
          </article>
        `;
      })
      .join("");
  } catch (error) {
    list.innerHTML = '<div class="notice error">Could not load polls. Check Supabase setup.</div>';
  }
}

function initRegisterPage() {
  const form = document.getElementById("registerForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (!name.trim() || !email.trim() || password.length < 6) {
      renderNotice("registerNotice", "Use a valid name, email, and password (6+ chars).", "error");
      return;
    }

    const result = await registerUser(name, email, password);
    if (!result.ok) {
      renderNotice("registerNotice", result.message, "error");
      return;
    }

    renderNotice("registerNotice", "Account created. Redirecting to dashboard...", "success");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 500);
  });
}

function initLoginPage() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const result = await loginUser(email, password);
    if (!result.ok) {
      renderNotice("loginNotice", result.message, "error");
      return;
    }

    renderNotice("loginNotice", "Login successful. Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 450);
  });
}

async function initDashboardPage() {
  const currentUser = requireAuth();
  if (!currentUser) return;

  const list = document.getElementById("myPolls");
  if (!list) return;

  try {
    const myPolls = (await fetchPolls()).filter((poll) => poll.user_id === currentUser.id);

    if (!myPolls.length) {
      list.innerHTML = `
        <div class="empty-state">
          You have no polls yet. <a class="btn secondary" href="create-poll.html">Create Poll</a>
        </div>
      `;
      return;
    }

    list.innerHTML = myPolls
      .map((poll) => {
        const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.vote_count || 0), 0);
        return `
          <article class="card poll-card">
            <div>
              <h3>${escapeHTML(poll.title)}</h3>
              <p>${escapeHTML(poll.description || "No description provided.")}</p>
            </div>
            <div class="meta">${poll.options.length} options � ${totalVotes} votes</div>
            <div class="card-actions">
              <a class="btn secondary" href="poll.html?id=${encodeURIComponent(poll.id)}">View</a>
              <a class="btn secondary" href="edit-poll.html?id=${encodeURIComponent(poll.id)}">Edit</a>
              <button class="btn danger" type="button" data-delete="${escapeHTML(poll.id)}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");

    list.querySelectorAll("button[data-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        const pollId = button.getAttribute("data-delete");
        const confirmed = window.confirm("Delete this poll? This cannot be undone.");
        if (!confirmed) return;
        const result = await deletePoll(pollId, currentUser.id);
        if (!result.ok) {
          renderNotice("dashboardNotice", result.message, "error");
          return;
        }
        await initDashboardPage();
      });
    });
  } catch (error) {
    list.innerHTML = '<div class="notice error">Could not load dashboard data.</div>';
  }
}

function initCreatePollPage() {
  const currentUser = requireAuth();
  if (!currentUser) return;

  const optionsContainer = document.getElementById("optionsContainer");
  const addOptionButton = document.getElementById("addOptionBtn");
  const form = document.getElementById("createPollForm");
  if (!optionsContainer || !addOptionButton || !form) return;

  if (!optionsContainer.children.length) {
    addOptionField("optionsContainer");
    addOptionField("optionsContainer");
  }

  addOptionButton.addEventListener("click", () => addOptionField("optionsContainer"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = document.getElementById("title").value;
    const description = document.getElementById("description").value;
    const options = collectOptionEntries("optionsContainer").map((entry) => entry.text);

    const result = await createPoll(currentUser.id, title, description, options);
    if (!result.ok) {
      renderNotice("createPollNotice", result.message, "error");
      return;
    }

    renderNotice("createPollNotice", "Poll created successfully.", "success");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 450);
  });
}

async function initEditPollPage() {
  const currentUser = requireAuth();
  if (!currentUser) return;

  const pollId = getQueryParam("id");
  const fallback = document.getElementById("editPollShell");

  if (!pollId) {
    if (fallback) {
      fallback.innerHTML = '<div class="notice error">Missing poll id.</div>';
    }
    return;
  }

  let poll;
  try {
    poll = await fetchPollById(pollId);
  } catch (error) {
    if (fallback) {
      fallback.innerHTML = '<div class="notice error">Poll not found.</div>';
    }
    return;
  }

  if (poll.user_id !== currentUser.id) {
    if (fallback) {
      fallback.innerHTML = '<div class="notice error">Poll not found or you do not have permission.</div>';
    }
    return;
  }

  const titleInput = document.getElementById("title");
  const descriptionInput = document.getElementById("description");
  const optionsContainer = document.getElementById("optionsContainer");
  const addOptionButton = document.getElementById("addOptionBtn");
  const form = document.getElementById("editPollForm");

  titleInput.value = poll.title;
  descriptionInput.value = poll.description || "";
  optionsContainer.innerHTML = "";
  poll.options.forEach((option) => addOptionField("optionsContainer", option.option_text, option.id));
  if (optionsContainer.children.length < 2) {
    addOptionField("optionsContainer");
    addOptionField("optionsContainer");
  }

  addOptionButton.addEventListener("click", () => addOptionField("optionsContainer"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const options = collectOptionEntries("optionsContainer");

    const result = await updatePoll(
      poll.id,
      currentUser.id,
      titleInput.value,
      descriptionInput.value,
      options
    );

    if (!result.ok) {
      renderNotice("editPollNotice", result.message, "error");
      return;
    }

    renderNotice("editPollNotice", "Poll updated.", "success");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 450);
  });
}

async function initPollPage() {
  const pollId = getQueryParam("id");
  const shell = document.getElementById("pollShell");
  if (!shell) return;

  if (!pollId) {
    shell.innerHTML = '<div class="notice error">Missing poll id.</div>';
    return;
  }

  let poll;
  try {
    poll = await fetchPollById(pollId);
  } catch (error) {
    shell.innerHTML = '<div class="notice error">Poll not found.</div>';
    return;
  }

  const currentUser = getCurrentUser();
  const priorVote = await fetchUserVoteForPoll(poll.id, currentUser ? currentUser.id : null);
  const totalVotes = poll.options.reduce((sum, option) => sum + (option.vote_count || 0), 0);

  shell.innerHTML = `
    <article class="card">
      <h2>${escapeHTML(poll.title)}</h2>
      <p>${escapeHTML(poll.description || "No description provided.")}</p>
      <p class="meta">Total votes: ${totalVotes}</p>
      <div id="pollNotice"></div>
      <div class="grid" id="voteActions"></div>
      <hr style="border: none; border-top: 1px solid var(--line); margin: 1rem 0;" />
      <div id="resultArea"></div>
    </article>
  `;

  const voteActions = document.getElementById("voteActions");
  const resultArea = document.getElementById("resultArea");

  poll.options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "btn secondary";
    button.type = "button";
    button.textContent = `Vote: ${option.option_text}`;

    if (!currentUser || priorVote) {
      button.disabled = true;
      button.style.opacity = "0.7";
      button.style.cursor = "not-allowed";
    }

    button.addEventListener("click", async () => {
      const result = await votePoll(poll.id, option.id, currentUser ? currentUser.id : null);
      if (!result.ok) {
        renderNotice("pollNotice", result.message, "error");
        return;
      }
      window.location.reload();
    });

    voteActions.appendChild(button);
  });

  if (!currentUser) {
    renderNotice("pollNotice", "Log in to cast your vote.", "error");
  } else if (priorVote) {
    renderNotice("pollNotice", "You already voted on this poll.", "success");
  }

  resultArea.innerHTML = poll.options
    .map((option) => {
      const pct = totalVotes === 0 ? 0 : Math.round(((option.vote_count || 0) / totalVotes) * 100);
      const selected = priorVote && priorVote.option_id === option.id ? " (your vote)" : "";
      return `
        <div class="option-result">
          <div class="option-line">
            <span>${escapeHTML(option.option_text)}${selected}</span>
            <span>${option.vote_count || 0} votes (${pct}%)</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

async function boot() {
  renderNavbar();

  const page = document.body.dataset.page;
  if (page === "home") await initHomePage();
  if (page === "register") initRegisterPage();
  if (page === "login") initLoginPage();
  if (page === "dashboard") await initDashboardPage();
  if (page === "create-poll") initCreatePollPage();
  if (page === "edit-poll") await initEditPollPage();
  if (page === "poll") await initPollPage();
}

document.addEventListener("DOMContentLoaded", boot);

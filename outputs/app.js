(function () {
  const DB_KEY = "integracontrol.db.v1";
  const LOCAL_MIGRATION_KEY = "integracontrol.localMigrationBackup.v1";
  const defaultDb = {
    companies: [],
    employees: [],
    clients: [],
    trainings: [],
    employeeTrainings: [],
    integrations: [],
    appointments: [],
    settings: {
      systemName: "IntegraControl",
      logoText: "IC",
      primaryColor: "#215a7a",
      accentColor: "#2e7d62",
      companyName: "",
      companyDocument: "",
      companyNotes: ""
    }
  };

  const online = {
    client: null,
    enabled: false,
    user: null,
    loading: false,
    saving: false,
    error: ""
  };

  let db = loadDb();
  let route = "dashboard";
  let editingId = null;
  let importPreview = [];
  let importReport = null;
  let agendaMode = "month";
  let agendaDate = new Date();

  const modules = [
    ["dashboard", "▦", "Dashboard"],
    ["employees", "👤", "Colaboradores"],
    ["companies", "▤", "Empresas"],
    ["clients", "◎", "Clientes"],
    ["trainings", "▣", "Treinamentos"],
    ["agenda", "◷", "Agenda"],
    ["fitness", "✓", "Aptidão Operacional"],
    ["import", "⇪", "Importação de Planilhas"],
    ["settings", "⚙", "Configurações"]
  ];

  const view = document.getElementById("view");
  const nav = document.getElementById("nav");
  const pageTitle = document.getElementById("pageTitle");
  const sidebar = document.querySelector(".sidebar");

  document.getElementById("today").textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date());

  document.getElementById("menuButton").addEventListener("click", () => sidebar.classList.toggle("open"));
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (event) => {
    if (event.target.id === "modalBackdrop") closeModal();
  });

  function loadDb() {
    const stored = localStorage.getItem(DB_KEY);
    if (!stored) return structuredClone(defaultDb);
    try {
      return { ...structuredClone(defaultDb), ...JSON.parse(stored) };
    } catch {
      return structuredClone(defaultDb);
    }
  }

  function saveDb() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    applySettings();
    persistOnlineDb();
  }

  async function initApp() {
    applySettings();
    await initSupabase();
    if (online.enabled) {
      const { data } = await online.client.auth.getSession();
      online.user = data.session?.user || null;
      online.client.auth.onAuthStateChange(async (_event, session) => {
        online.user = session?.user || null;
        if (online.user) {
          await loadOnlineDb();
          render();
        } else {
          renderAuth();
        }
        updateSyncStatus();
      });
      if (online.user) {
        await loadOnlineDb();
        render();
      } else {
        renderAuth();
      }
    } else {
      render();
    }
    updateSyncStatus();
  }

  async function initSupabase() {
    const config = await loadSupabaseConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
      online.enabled = false;
      return;
    }
    online.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    online.enabled = true;
  }

  async function loadSupabaseConfig() {
    if (window.INTEGRACONTROL_SUPABASE) return window.INTEGRACONTROL_SUPABASE;
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      if (response.ok) return await response.json();
    } catch {
      // Local file usage keeps working without the Vercel config endpoint.
    }
    return {
      supabaseUrl: localStorage.getItem("integracontrol.supabaseUrl") || "",
      supabaseAnonKey: localStorage.getItem("integracontrol.supabaseAnonKey") || ""
    };
  }

  function updateSyncStatus() {
    const target = document.getElementById("syncStatus");
    const logoutButton = document.getElementById("logoutButton");
    if (!target || !logoutButton) return;
    if (!online.enabled) {
      target.textContent = "Local";
      logoutButton.classList.add("hidden");
      return;
    }
    logoutButton.classList.toggle("hidden", !online.user);
    if (!online.user) target.textContent = "Login necessário";
    else if (online.saving) target.textContent = "Sincronizando";
    else if (online.error) target.textContent = "Erro de sync";
    else target.textContent = "Online";
  }

  function renderAuth(message = "") {
    renderNav();
    pageTitle.textContent = "Login";
    view.innerHTML = `
      <div class="auth-shell">
        <div class="auth-card">
          <h2>Acessar IntegraControl</h2>
          <p class="muted">Entre com e-mail e senha para usar o banco online compartilhado.</p>
          <form id="loginForm">
            ${field("E-mail", "email", "", "email", true)}
            ${field("Senha", "password", "", "password", true)}
            <button class="button" type="submit">Entrar</button>
            <button class="button secondary" type="button" id="resetPassword">Recuperar senha</button>
            <p class="auth-message" id="authMessage">${esc(message)}</p>
          </form>
        </div>
      </div>
    `;
    document.getElementById("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const { error } = await online.client.auth.signInWithPassword({
        email: formValue(form, "email"),
        password: formValue(form, "password")
      });
      document.getElementById("authMessage").textContent = error ? error.message : "Acessando...";
    });
    document.getElementById("resetPassword").addEventListener("click", async () => {
      const email = formValue(document.getElementById("loginForm"), "email");
      if (!email) {
        document.getElementById("authMessage").textContent = "Informe o e-mail para recuperar a senha.";
        return;
      }
      const { error } = await online.client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      document.getElementById("authMessage").textContent = error ? error.message : "E-mail de recuperação enviado.";
    });
  }

  async function logout() {
    if (!online.client) return;
    await online.client.auth.signOut();
  }

  function id() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function dateValue(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = dateValue(value);
    return date ? date.toLocaleDateString("pt-BR") : "Sem data";
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function addValidity(date, quantity, unit) {
    if (!date || !quantity || !unit) return "";
    const result = dateValue(date);
    if (!result) return "";
    const amount = Number(quantity);
    if (unit === "days") result.setDate(result.getDate() + amount);
    if (unit === "months") result.setMonth(result.getMonth() + amount);
    if (unit === "years") result.setFullYear(result.getFullYear() + amount);
    return result.toISOString().slice(0, 10);
  }

  function isExpired(value) {
    const date = dateValue(value);
    if (!date) return false;
    return date < dateValue(todayIso());
  }

  function isExpiring(value, days = 30) {
    const date = dateValue(value);
    if (!date || isExpired(value)) return false;
    const limit = new Date();
    limit.setDate(limit.getDate() + days);
    return date <= limit;
  }

  function companyName(companyId) {
    return db.companies.find((company) => company.id === companyId)?.name || "";
  }

  function clientName(clientId) {
    return db.clients.find((client) => client.id === clientId)?.name || "";
  }

  function trainingName(trainingId) {
    return db.trainings.find((training) => training.id === trainingId)?.name || "";
  }

  function activeEmployees() {
    return db.employees.filter((employee) => employee.active);
  }

  function getEmployeeStatus(employee) {
    if (!employee.active) return { status: "Bloqueado", className: "bad", reason: "Colaborador inativo" };
    const trainings = db.employeeTrainings.filter((item) => item.employeeId === employee.id);
    const integrations = db.integrations.filter((item) => item.employeeId === employee.id);
    const expiredTraining = trainings.find((item) => isExpired(item.expiresAt));
    const expiredIntegration = integrations.find((item) => isExpired(item.expiresAt));
    if (expiredTraining) return { status: "Bloqueado", className: "bad", reason: `Treinamento vencido: ${trainingName(expiredTraining.trainingId)}` };
    if (expiredIntegration) return { status: "Bloqueado", className: "bad", reason: `Integração vencida: ${clientName(expiredIntegration.clientId)}` };
    const warningTraining = trainings.find((item) => isExpiring(item.expiresAt));
    const warningIntegration = integrations.find((item) => isExpiring(item.expiresAt));
    if (warningTraining) return { status: "Atenção", className: "warn", reason: `Treinamento vencendo: ${trainingName(warningTraining.trainingId)}` };
    if (warningIntegration) return { status: "Atenção", className: "warn", reason: `Integração vencendo: ${clientName(warningIntegration.clientId)}` };
    const blockedClient = db.clients.find((client) => getClientStatus(employee, client).status === "Bloqueado");
    if (blockedClient) {
      const clientStatus = getClientStatus(employee, blockedClient);
      return { status: "Bloqueado", className: "bad", reason: `${blockedClient.name}: ${clientStatus.reason}` };
    }
    const warningClient = db.clients.find((client) => getClientStatus(employee, client).status === "Atenção");
    if (warningClient) {
      const clientStatus = getClientStatus(employee, warningClient);
      return { status: "Atenção", className: "warn", reason: `${warningClient.name}: ${clientStatus.reason}` };
    }
    return { status: "Apto", className: "good", reason: "Sem bloqueios registrados" };
  }

  function getClientStatus(employee, client) {
    if (!employee.active) return { status: "Bloqueado", className: "bad", reason: "Colaborador inativo" };
    const missingTrainings = (client.requiredTrainingIds || []).filter((trainingId) => {
      return !db.employeeTrainings.some((item) => item.employeeId === employee.id && item.trainingId === trainingId && !isExpired(item.expiresAt));
    });
    if (missingTrainings.length) {
      return { status: "Bloqueado", className: "bad", reason: `Treinamento obrigatório pendente: ${trainingName(missingTrainings[0])}` };
    }
    if (client.integrationType !== "none") {
      const integration = db.integrations
        .filter((item) => item.employeeId === employee.id && item.clientId === client.id)
        .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
      if (!integration) return { status: "Bloqueado", className: "bad", reason: "Integração do cliente não lançada" };
      if (isExpired(integration.expiresAt)) return { status: "Bloqueado", className: "bad", reason: "Integração vencida" };
      if (isExpiring(integration.expiresAt)) return { status: "Atenção", className: "warn", reason: "Integração próxima do vencimento" };
    }
    if (client.asoRequired) return { status: "Atenção", className: "warn", reason: "ASO obrigatório configurado; controle detalhado será tratado em versão futura" };
    return { status: "Apto", className: "good", reason: "Requisitos atendidos" };
  }

  function applySettings() {
    document.documentElement.style.setProperty("--primary", db.settings.primaryColor || defaultDb.settings.primaryColor);
    document.documentElement.style.setProperty("--accent", db.settings.accentColor || defaultDb.settings.accentColor);
    document.getElementById("brandName").textContent = db.settings.systemName || "IntegraControl";
    document.getElementById("brandMark").textContent = db.settings.logoText || "IC";
    document.title = db.settings.systemName || "IntegraControl";
  }

  function setRoute(next) {
    route = next;
    sidebar.classList.remove("open");
    render();
  }

  function renderNav() {
    nav.innerHTML = modules.map(([key, icon, label]) => `
      <button class="${route === key ? "active" : ""}" data-route="${key}">
        <span class="icon">${icon}</span><span>${label}</span>
      </button>
    `).join("");
    nav.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
  }

  function render() {
    if (online.enabled && !online.user) {
      renderAuth();
      return;
    }
    applySettings();
    renderNav();
    const item = modules.find(([key]) => key === route);
    pageTitle.textContent = item ? item[2] : "Dashboard";
    const renderers = {
      dashboard: renderDashboard,
      employees: renderEmployees,
      companies: renderCompanies,
      clients: renderClients,
      trainings: renderTrainings,
      agenda: renderAgenda,
      fitness: renderFitness,
      import: renderImport,
      settings: renderSettings
    };
    renderers[route]();
  }

  async function loadOnlineDb() {
    if (!online.enabled || !online.user) return;
    online.loading = true;
    updateSyncStatus();
    try {
      const [companies, employees, clients, trainings, employeeTrainings, integrations, appointments] = await Promise.all([
        fetchTable("empresas"),
        fetchTable("colaboradores"),
        fetchTable("clientes"),
        fetchTable("treinamentos"),
        fetchTable("treinamentos_colaborador"),
        fetchTable("integracoes_colaborador"),
        fetchTable("agenda")
      ]);
      db = {
        ...structuredClone(defaultDb),
        settings: loadDb().settings,
        companies: companies.map(fromEmpresa),
        employees: employees.map(fromColaborador),
        clients: clients.map(fromCliente),
        trainings: trainings.map(fromTreinamento),
        employeeTrainings: employeeTrainings.map(fromTreinamentoColaborador),
        integrations: integrations.map(fromIntegracaoColaborador),
        appointments: appointments.map(fromAgenda)
      };
      preserveLocalMigrationBackup();
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      online.error = "";
    } catch (error) {
      online.error = error.message;
      console.error(error);
    } finally {
      online.loading = false;
      updateSyncStatus();
    }
  }

  function preserveLocalMigrationBackup() {
    if (localStorage.getItem(LOCAL_MIGRATION_KEY)) return;
    const localDb = loadDb();
    if (hasOperationalData(localDb)) {
      localStorage.setItem(LOCAL_MIGRATION_KEY, JSON.stringify(localDb));
    }
  }

  function hasOperationalData(candidateDb) {
    return ["companies", "employees", "clients", "trainings", "employeeTrainings", "integrations", "appointments"]
      .some((key) => Array.isArray(candidateDb[key]) && candidateDb[key].length > 0);
  }

  async function fetchTable(tableName) {
    const { data, error } = await online.client.from(tableName).select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function persistOnlineDb() {
    if (!online.enabled || !online.user || online.loading || online.saving) return;
    online.saving = true;
    updateSyncStatus();
    try {
      await upsertRows("empresas", db.companies.map(toEmpresa));
      await upsertRows("clientes", db.clients.map(toCliente));
      await upsertRows("treinamentos", db.trainings.map(toTreinamento));
      await upsertRows("colaboradores", db.employees.map(toColaborador));
      await upsertRows("treinamentos_colaborador", db.employeeTrainings.map(toTreinamentoColaborador));
      await upsertRows("integracoes_colaborador", db.integrations.map(toIntegracaoColaborador));
      await upsertRows("agenda", db.appointments.map(toAgenda));
      online.error = "";
    } catch (error) {
      online.error = error.message;
      console.error(error);
    } finally {
      online.saving = false;
      updateSyncStatus();
    }
  }

  async function clearTable(tableName) {
    const { error: deleteError } = await online.client.from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteError) throw deleteError;
  }

  async function insertRows(tableName, rows) {
    if (!rows.length) return;
    const { error: insertError } = await online.client.from(tableName).insert(rows);
    if (insertError) throw insertError;
  }

  async function upsertRows(tableName, rows) {
    if (!rows.length) return;
    const { error } = await online.client.from(tableName).upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }

  async function deleteOnlineRow(tableName, itemId) {
    if (!online.enabled || !online.user || !tableName || !itemId) return;
    const { error } = await online.client.from(tableName).delete().eq("id", itemId);
    if (error) {
      online.error = error.message;
      updateSyncStatus();
      console.error(error);
    }
  }

  async function clearOnlineDb() {
    if (!online.enabled || !online.user) return;
    await clearTable("agenda");
    await clearTable("integracoes_colaborador");
    await clearTable("treinamentos_colaborador");
    await clearTable("colaboradores");
    await clearTable("treinamentos");
    await clearTable("clientes");
    await clearTable("empresas");
  }

  function toEmpresa(company) {
    return { id: company.id, nome: company.name, cnpj: company.cnpj || null, observacoes: company.notes || null };
  }

  function fromEmpresa(row) {
    return { id: row.id, name: row.nome || "", cnpj: row.cnpj || "", notes: row.observacoes || "" };
  }

  function toColaborador(employee) {
    return {
      id: employee.id,
      nome: employee.name,
      cpf: employee.cpf || null,
      rg: employee.rg || null,
      data_nascimento: employee.birthDate || null,
      funcao: employee.role || null,
      empresa_id: employee.companyId || null,
      data_admissao: employee.admissionDate || null,
      data_demissao: employee.dismissalDate || null,
      status: employee.active ? "ativo" : "inativo",
      observacoes: employee.notes || null
    };
  }

  function fromColaborador(row) {
    return {
      id: row.id,
      name: row.nome || "",
      cpf: row.cpf || "",
      rg: row.rg || "",
      birthDate: row.data_nascimento || "",
      role: row.funcao || "",
      companyId: row.empresa_id || "",
      admissionDate: row.data_admissao || "",
      dismissalDate: row.data_demissao || "",
      active: row.status !== "inativo",
      notes: row.observacoes || ""
    };
  }

  function toCliente(client) {
    return {
      id: client.id,
      nome: client.name,
      tipo_integracao: client.integrationType || "inPerson",
      validade_integracao: client.validityMode === "none" ? null : Number(client.validityQuantity || 0),
      configuracoes: {
        validityMode: client.validityMode || "none",
        validityQuantity: client.validityQuantity || "",
        validityUnit: client.validityUnit || "months",
        weekdays: client.weekdays || "",
        times: client.times || "",
        participantLimit: client.participantLimit || "",
        location: client.location || "",
        otherRequirements: client.otherRequirements || "",
        requiredTrainingIds: client.requiredTrainingIds || [],
        asoRequired: Boolean(client.asoRequired),
        notes: client.notes || ""
      }
    };
  }

  function fromCliente(row) {
    const config = row.configuracoes || {};
    return {
      id: row.id,
      name: row.nome || "",
      integrationType: row.tipo_integracao || "inPerson",
      validityMode: config.validityMode || (row.validade_integracao ? "fixed" : "none"),
      validityQuantity: config.validityQuantity || row.validade_integracao || "",
      validityUnit: config.validityUnit || "months",
      weekdays: config.weekdays || "",
      times: config.times || "",
      participantLimit: config.participantLimit || "",
      location: config.location || "",
      otherRequirements: config.otherRequirements || "",
      requiredTrainingIds: config.requiredTrainingIds || [],
      asoRequired: Boolean(config.asoRequired),
      notes: config.notes || ""
    };
  }

  function toTreinamento(training) {
    return {
      id: training.id,
      nome: training.name,
      validade_padrao: training.validityQuantity ? Number(training.validityQuantity) : null,
      unidade_validade: training.validityUnit || "months",
      observacoes: training.notes || null
    };
  }

  function fromTreinamento(row) {
    return { id: row.id, name: row.nome || "", validityQuantity: row.validade_padrao || "", validityUnit: row.unidade_validade || "months", notes: row.observacoes || "" };
  }

  function toTreinamentoColaborador(item) {
    return { id: item.id, colaborador_id: item.employeeId, treinamento_id: item.trainingId, data_realizacao: item.completedAt || null, data_vencimento: item.expiresAt || null };
  }

  function fromTreinamentoColaborador(row) {
    return { id: row.id, employeeId: row.colaborador_id, trainingId: row.treinamento_id, completedAt: row.data_realizacao || "", expiresAt: row.data_vencimento || "" };
  }

  function toIntegracaoColaborador(item) {
    return { id: item.id, colaborador_id: item.employeeId, cliente_id: item.clientId, data_integracao: item.completedAt || null, data_vencimento: item.expiresAt || null };
  }

  function fromIntegracaoColaborador(row) {
    return { id: row.id, employeeId: row.colaborador_id, clientId: row.cliente_id, completedAt: row.data_integracao || "", expiresAt: row.data_vencimento || "" };
  }

  function toAgenda(item) {
    return {
      id: item.id,
      titulo: item.title || clientName(item.clientId) || "Integração",
      data: item.date || null,
      horario: item.time || null,
      observacoes: item.notes || null,
      cliente_id: item.clientId || null,
      colaborador_id: item.employeeId || null,
      status: item.status || "Agendada"
    };
  }

  function fromAgenda(row) {
    return { id: row.id, title: row.titulo || "", date: row.data || "", time: row.horario || "", notes: row.observacoes || "", clientId: row.cliente_id || "", employeeId: row.colaborador_id || "", status: row.status || "Agendada" };
  }

  function stat(label, value, hint) {
    return `<div class="card stat-card"><span>${label}</span><strong>${value}</strong><small class="muted">${hint}</small></div>`;
  }

  function renderDashboard() {
    const statuses = activeEmployees().map(getEmployeeStatus);
    const apt = statuses.filter((item) => item.status === "Apto").length;
    const blocked = db.employees.filter((employee) => getEmployeeStatus(employee).status === "Bloqueado").length;
    const trainingDue = db.employeeTrainings.filter((item) => isExpiring(item.expiresAt) || isExpired(item.expiresAt)).length;
    const integrationDue = db.integrations.filter((item) => isExpiring(item.expiresAt) || isExpired(item.expiresAt)).length;
    const nextAppointments = db.appointments
      .filter((item) => item.date >= todayIso())
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 6);

    view.innerHTML = `
      <div class="grid stats-grid section">
        ${stat("Colaboradores ativos", activeEmployees().length, "Com status ativo")}
        ${stat("Colaboradores inativos", db.employees.filter((e) => !e.active).length, "Com status inativo")}
        ${stat("Colaboradores aptos", apt, "Sem bloqueios registrados")}
        ${stat("Colaboradores bloqueados", blocked, "Com restrição operacional")}
        ${stat("Treinamentos vencendo", trainingDue, "Vencidos ou próximos")}
        ${stat("Integrações vencendo", integrationDue, "Vencidas ou próximas")}
        ${stat("Empresas cadastradas", db.companies.length, "Base para colaboradores")}
        ${stat("Clientes cadastrados", db.clients.length, "Regras operacionais")}
      </div>
      <section class="section">
        <div class="section-head"><h2>Próximas integrações</h2><button class="button secondary" data-route-jump="agenda">Abrir agenda</button></div>
        ${nextAppointments.length ? table(["Data", "Cliente", "Colaborador", "Status"], nextAppointments.map((item) => [
          formatDate(item.date), clientName(item.clientId), employeeById(item.employeeId)?.name || "Sem colaborador", item.status || "Agendada"
        ])) : `<div class="empty">Nenhuma integração agendada. A agenda será preenchida conforme você cadastrar clientes e agendamentos.</div>`}
      </section>
      ${db.employees.length ? "" : `<div class="empty">O sistema está sem dados cadastrados. Comece por empresas, clientes, treinamentos e colaboradores conforme sua operação real.</div>`}
    `;
    bindRouteJumps();
  }

  function table(headers, rows) {
    return `<div class="table-wrap"><table><thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function bindRouteJumps() {
    document.querySelectorAll("[data-route-jump]").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.routeJump)));
  }

  function employeeById(employeeId) {
    return db.employees.find((employee) => employee.id === employeeId);
  }

  function renderCompanies() {
    renderCrudList({
      collection: "companies",
      title: "Empresa",
      searchPlaceholder: "Pesquisar empresa",
      emptyText: "Nenhuma empresa cadastrada.",
      columns: ["Nome", "CNPJ", "Observações", "Ações"],
      row: (company) => [esc(company.name), esc(company.cnpj), esc(company.notes), actions(company.id)],
      form: companyForm,
      save: saveCompany
    });
  }

  function companyForm(company = {}) {
    return `
      <form id="entityForm" class="grid form-grid">
        ${field("Nome da empresa", "name", company.name, "text", true)}
        ${field("CNPJ", "cnpj", company.cnpj)}
        ${field("Observações", "notes", company.notes, "textarea")}
        <div class="row-actions"><button class="button" type="submit">Salvar</button><button class="button secondary" type="button" data-close>Cancelar</button></div>
      </form>
    `;
  }

  function saveCompany(form) {
    upsert("companies", {
      name: formValue(form, "name").trim(),
      cnpj: formValue(form, "cnpj").trim(),
      notes: formValue(form, "notes").trim()
    });
  }

  function renderTrainings() {
    renderCrudList({
      collection: "trainings",
      title: "Treinamento",
      searchPlaceholder: "Pesquisar treinamento",
      emptyText: "Nenhum treinamento cadastrado.",
      columns: ["Nome", "Validade padrão", "Observações", "Ações"],
      row: (training) => [esc(training.name), training.validityQuantity ? `${training.validityQuantity} ${unitLabel(training.validityUnit)}` : "Sem validade padrão", esc(training.notes), actions(training.id)],
      form: trainingForm,
      save: saveTraining
    });
  }

  function trainingForm(training = {}) {
    return `
      <form id="entityForm" class="grid form-grid">
        ${field("Nome", "name", training.name, "text", true)}
        ${field("Validade padrão", "validityQuantity", training.validityQuantity, "number")}
        ${selectField("Unidade", "validityUnit", training.validityUnit, [["days", "Dias"], ["months", "Meses"], ["years", "Anos"]])}
        ${field("Observações", "notes", training.notes, "textarea")}
        <div class="row-actions"><button class="button" type="submit">Salvar</button><button class="button secondary" type="button" data-close>Cancelar</button></div>
      </form>
    `;
  }

  function saveTraining(form) {
    upsert("trainings", {
      name: formValue(form, "name").trim(),
      validityQuantity: formValue(form, "validityQuantity"),
      validityUnit: formValue(form, "validityUnit"),
      notes: formValue(form, "notes").trim()
    });
  }

  function renderClients() {
    renderCrudList({
      collection: "clients",
      title: "Cliente",
      searchPlaceholder: "Pesquisar cliente",
      emptyText: "Nenhum cliente cadastrado.",
      columns: ["Cliente", "Integração", "Validade", "Agenda padrão", "Ações"],
      row: (client) => [
        esc(client.name),
        integrationTypeLabel(client.integrationType),
        client.validityMode === "none" ? "Sem vencimento" : `${client.validityQuantity || 0} ${unitLabel(client.validityUnit)}`,
        agendaSummary(client),
        actions(client.id)
      ],
      form: clientForm,
      save: saveClient
    });
  }

  function clientForm(client = {}) {
    const required = new Set(client.requiredTrainingIds || []);
    return `
      <form id="entityForm" class="grid form-grid">
        ${field("Nome do cliente", "name", client.name, "text", true)}
        ${selectField("Tipo de integração", "integrationType", client.integrationType || "inPerson", [["inPerson", "Presencial"], ["online", "Online"], ["documental", "Documental"], ["none", "Não exige integração"]])}
        ${selectField("Validade da integração", "validityMode", client.validityMode || "none", [["none", "Sem vencimento"], ["fixed", "Com vencimento"]])}
        ${field("Quantidade", "validityQuantity", client.validityQuantity, "number")}
        ${selectField("Unidade", "validityUnit", client.validityUnit || "months", [["days", "Dias"], ["months", "Meses"], ["years", "Anos"]])}
        ${field("Dias da semana", "weekdays", client.weekdays, "text", false, "Ex.: segunda, quarta")}
        ${field("Horários", "times", client.times, "text", false, "Ex.: 08:00, 14:00")}
        ${field("Limite de participantes", "participantLimit", client.participantLimit, "number")}
        ${field("Local", "location", client.location)}
        ${field("Outros requisitos", "otherRequirements", client.otherRequirements, "textarea")}
        <div class="card">
          <h3>Treinamentos obrigatórios</h3>
          ${db.trainings.length ? db.trainings.map((training) => `
            <label class="color-row"><input type="checkbox" name="requiredTrainingIds" value="${training.id}" ${required.has(training.id) ? "checked" : ""}> ${esc(training.name)}</label>
          `).join("") : `<p class="muted">Cadastre treinamentos para vinculá-los ao cliente.</p>`}
          <label class="color-row"><input type="checkbox" name="asoRequired" ${client.asoRequired ? "checked" : ""}> ASO obrigatório</label>
        </div>
        ${field("Observações", "notes", client.notes, "textarea")}
        <div class="row-actions"><button class="button" type="submit">Salvar</button><button class="button secondary" type="button" data-close>Cancelar</button></div>
      </form>
    `;
  }

  function saveClient(form) {
    upsert("clients", {
      name: formValue(form, "name").trim(),
      integrationType: formValue(form, "integrationType"),
      validityMode: formValue(form, "validityMode"),
      validityQuantity: formValue(form, "validityQuantity"),
      validityUnit: formValue(form, "validityUnit"),
      weekdays: formValue(form, "weekdays").trim(),
      times: formValue(form, "times").trim(),
      participantLimit: formValue(form, "participantLimit"),
      location: formValue(form, "location").trim(),
      otherRequirements: formValue(form, "otherRequirements").trim(),
      requiredTrainingIds: Array.from(form.querySelectorAll("input[name='requiredTrainingIds']:checked")).map((input) => input.value),
      asoRequired: formChecked(form, "asoRequired"),
      notes: formValue(form, "notes").trim()
    });
  }

  function renderEmployees() {
    renderCrudList({
      collection: "employees",
      title: "Colaborador",
      searchPlaceholder: "Pesquisar colaborador",
      emptyText: "Nenhum colaborador cadastrado.",
      columns: ["Nome", "Empresa", "Função", "Status", "Aptidão", "Ações"],
      row: (employee) => {
        const status = getEmployeeStatus(employee);
        return [
          `<button class="button ghost" data-profile="${employee.id}">${esc(employee.name)}</button>`,
          esc(companyName(employee.companyId)),
          esc(employee.role),
          employee.active ? `<span class="badge good">Ativo</span>` : `<span class="badge neutral">Inativo</span>`,
          `<span class="badge ${status.className}">${status.status}</span>`,
          actions(employee.id)
        ];
      },
      form: employeeForm,
      save: saveEmployee,
      afterRender: () => document.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", () => openEmployeeProfile(button.dataset.profile)))
    });
  }

  function employeeForm(employee = {}) {
    return `
      <form id="entityForm" class="grid form-grid">
        ${field("Nome", "name", employee.name, "text", true)}
        ${field("CPF", "cpf", employee.cpf)}
        ${field("RG", "rg", employee.rg)}
        ${field("Data de nascimento", "birthDate", employee.birthDate, "date")}
        ${field("Função", "role", employee.role)}
        ${selectField("Empresa", "companyId", employee.companyId || "", [["", "Sem empresa"], ...db.companies.map((company) => [company.id, company.name])])}
        ${field("Data de admissão", "admissionDate", employee.admissionDate, "date")}
        ${field("Data de demissão", "dismissalDate", employee.dismissalDate, "date")}
        ${selectField("Status", "active", employee.active === false ? "false" : "true", [["true", "Ativo"], ["false", "Inativo"]])}
        ${field("Observações", "notes", employee.notes, "textarea")}
        <div class="row-actions"><button class="button" type="submit">Salvar</button><button class="button secondary" type="button" data-close>Cancelar</button></div>
      </form>
    `;
  }

  function saveEmployee(form) {
    upsert("employees", {
      name: formValue(form, "name").trim(),
      cpf: formValue(form, "cpf").trim(),
      rg: formValue(form, "rg").trim(),
      birthDate: formValue(form, "birthDate"),
      role: formValue(form, "role").trim(),
      companyId: formValue(form, "companyId"),
      admissionDate: formValue(form, "admissionDate"),
      dismissalDate: formValue(form, "dismissalDate"),
      active: formValue(form, "active") === "true",
      notes: formValue(form, "notes").trim()
    });
  }

  function renderCrudList(options) {
    const items = db[options.collection];
    view.innerHTML = `
      <div class="toolbar">
        <input class="search" id="searchInput" placeholder="${options.searchPlaceholder}" />
        <button class="button" id="newButton">+ Novo ${options.title.toLowerCase()}</button>
      </div>
      <div id="listArea"></div>
    `;
    const renderList = () => {
      const term = document.getElementById("searchInput").value.toLowerCase();
      const filtered = items.filter((item) => JSON.stringify(item).toLowerCase().includes(term));
      document.getElementById("listArea").innerHTML = filtered.length
        ? table(options.columns, filtered.map(options.row))
        : `<div class="empty">${options.emptyText}</div>`;
      document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEntityModal(options, button.dataset.edit)));
      document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => removeEntity(options.collection, button.dataset.delete)));
      if (options.afterRender) options.afterRender();
    };
    document.getElementById("searchInput").addEventListener("input", renderList);
    document.getElementById("newButton").addEventListener("click", () => openEntityModal(options));
    renderList();
  }

  function actions(itemId) {
    return `<div class="row-actions"><button class="button secondary" data-edit="${itemId}">Editar</button><button class="button danger" data-delete="${itemId}">Excluir</button></div>`;
  }

  function openEntityModal(options, itemId) {
    editingId = itemId || null;
    const item = itemId ? db[options.collection].find((entry) => entry.id === itemId) : {};
    openModal(`${itemId ? "Editar" : "Novo"} ${options.title.toLowerCase()}`, options.form(item || {}));
    document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closeModal));
    document.getElementById("entityForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.checkValidity()) return;
      options.save(form);
      closeModal();
      render();
    });
  }

  function upsert(collection, values) {
    if (editingId) {
      db[collection] = db[collection].map((item) => item.id === editingId ? { ...item, ...values } : item);
    } else {
      db[collection].push({ id: id(), ...values });
    }
    saveDb();
  }

  function removeEntity(collection, itemId) {
    if (!confirm("Excluir este registro?")) return;
    db[collection] = db[collection].filter((item) => item.id !== itemId);
    deleteOnlineRow(collectionTable(collection), itemId);
    if (collection === "employees") {
      db.employeeTrainings = db.employeeTrainings.filter((item) => item.employeeId !== itemId);
      db.integrations = db.integrations.filter((item) => item.employeeId !== itemId);
      db.appointments = db.appointments.filter((item) => item.employeeId !== itemId);
    }
    if (collection === "clients") {
      db.integrations = db.integrations.filter((item) => item.clientId !== itemId);
      db.appointments = db.appointments.filter((item) => item.clientId !== itemId);
    }
    saveDb();
    render();
  }

  function collectionTable(collection) {
    return {
      companies: "empresas",
      employees: "colaboradores",
      clients: "clientes",
      trainings: "treinamentos",
      employeeTrainings: "treinamentos_colaborador",
      integrations: "integracoes_colaborador",
      appointments: "agenda"
    }[collection];
  }

  function openEmployeeProfile(employeeId) {
    const employee = employeeById(employeeId);
    if (!employee) return;
    const status = getEmployeeStatus(employee);
    openModal("Perfil do colaborador", `
      <div class="profile-head section">
        <div>
          <h2>${esc(employee.name)}</h2>
          <p class="muted">${esc(employee.role || "Função não informada")} ${employee.companyId ? `• ${esc(companyName(employee.companyId))}` : ""}</p>
        </div>
        <span class="badge ${status.className}">${status.status}</span>
      </div>
      <div class="tabs">
        <button class="active" data-profile-tab="general">Dados Gerais</button>
        <button data-profile-tab="trainings">Treinamentos</button>
        <button data-profile-tab="integrations">Integrações</button>
        <button data-profile-tab="history">Histórico</button>
      </div>
      <div id="profileTab"></div>
    `);
    const renderTab = (tab) => {
      document.querySelectorAll("[data-profile-tab]").forEach((button) => button.classList.toggle("active", button.dataset.profileTab === tab));
      const target = document.getElementById("profileTab");
      if (tab === "general") target.innerHTML = generalProfile(employee, status);
      if (tab === "trainings") target.innerHTML = employeeTrainingPanel(employee);
      if (tab === "integrations") target.innerHTML = employeeIntegrationPanel(employee);
      if (tab === "history") target.innerHTML = employeeHistory(employee);
      bindProfileActions(employee);
    };
    document.querySelectorAll("[data-profile-tab]").forEach((button) => button.addEventListener("click", () => renderTab(button.dataset.profileTab)));
    renderTab("general");
  }

  function generalProfile(employee, status) {
    return `
      <div class="grid three-grid">
        <div class="card"><strong>CPF</strong><p>${esc(employee.cpf || "Não informado")}</p></div>
        <div class="card"><strong>RG</strong><p>${esc(employee.rg || "Não informado")}</p></div>
        <div class="card"><strong>Nascimento</strong><p>${formatDate(employee.birthDate)}</p></div>
        <div class="card"><strong>Admissão</strong><p>${formatDate(employee.admissionDate)}</p></div>
        <div class="card"><strong>Demissão</strong><p>${formatDate(employee.dismissalDate)}</p></div>
        <div class="card"><strong>Aptidão geral</strong><p><span class="badge ${status.className}">${status.status}</span></p><small>${esc(status.reason)}</small></div>
      </div>
      <div class="card section"><strong>Observações</strong><p>${esc(employee.notes || "Sem observações.")}</p></div>
    `;
  }

  function employeeTrainingPanel(employee) {
    const rows = db.employeeTrainings.filter((item) => item.employeeId === employee.id).map((item) => [
      esc(trainingName(item.trainingId)),
      formatDate(item.completedAt),
      item.expiresAt ? formatDate(item.expiresAt) : "Sem vencimento",
      expirationBadge(item.expiresAt, "Válido"),
      `<div class="row-actions"><button class="button secondary" data-edit-training="${item.id}">Editar</button><button class="button danger" data-remove-training="${item.id}">Excluir</button></div>`
    ]);
    return `
      <div class="toolbar"><button class="button" data-add-training="${employee.id}">+ Adicionar treinamento</button></div>
      ${rows.length ? table(["Treinamento", "Realização", "Vencimento", "Status", "Ações"], rows) : `<div class="empty">Nenhum treinamento lançado para este colaborador.</div>`}
    `;
  }

  function employeeIntegrationPanel(employee) {
    const rows = db.integrations.filter((item) => item.employeeId === employee.id).map((item) => [
      esc(clientName(item.clientId)),
      formatDate(item.completedAt),
      item.expiresAt ? formatDate(item.expiresAt) : "Sem vencimento",
      expirationBadge(item.expiresAt, "Válido"),
      `<div class="row-actions"><button class="button secondary" data-edit-integration="${item.id}">Editar</button><button class="button danger" data-remove-integration="${item.id}">Excluir</button></div>`
    ]);
    return `
      <div class="toolbar"><button class="button" data-add-integration="${employee.id}">+ Adicionar integração</button></div>
      ${rows.length ? table(["Cliente", "Realização", "Vencimento", "Status", "Ações"], rows) : `<div class="empty">Nenhuma integração lançada para este colaborador.</div>`}
    `;
  }

  function employeeHistory(employee) {
    const history = [
      ...db.employeeTrainings.filter((item) => item.employeeId === employee.id).map((item) => ({ date: item.completedAt, text: `Treinamento realizado: ${trainingName(item.trainingId)}` })),
      ...db.integrations.filter((item) => item.employeeId === employee.id).map((item) => ({ date: item.completedAt, text: `Integração realizada: ${clientName(item.clientId)}` })),
      ...db.appointments.filter((item) => item.employeeId === employee.id).map((item) => ({ date: item.date, text: `Integração agendada: ${clientName(item.clientId)}` }))
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return history.length ? `<div class="timeline">${history.map((item) => `<div class="timeline-item"><strong>${formatDate(item.date)}</strong><p>${esc(item.text)}</p></div>`).join("")}</div>` : `<div class="empty">Nenhum histórico operacional registrado.</div>`;
  }

  function bindProfileActions(employee) {
    document.querySelectorAll("[data-add-training]").forEach((button) => button.addEventListener("click", () => openTrainingLaunch(employee.id)));
    document.querySelectorAll("[data-add-integration]").forEach((button) => button.addEventListener("click", () => openIntegrationLaunch(employee.id)));
    document.querySelectorAll("[data-edit-training]").forEach((button) => button.addEventListener("click", () => openTrainingLaunch(employee.id, button.dataset.editTraining)));
    document.querySelectorAll("[data-edit-integration]").forEach((button) => button.addEventListener("click", () => openIntegrationLaunch(employee.id, button.dataset.editIntegration)));
    document.querySelectorAll("[data-remove-training]").forEach((button) => button.addEventListener("click", () => {
      if (!confirm("Excluir este treinamento do colaborador?")) return;
      db.employeeTrainings = db.employeeTrainings.filter((item) => item.id !== button.dataset.removeTraining);
      deleteOnlineRow("treinamentos_colaborador", button.dataset.removeTraining);
      saveDb();
      openEmployeeProfile(employee.id);
    }));
    document.querySelectorAll("[data-remove-integration]").forEach((button) => button.addEventListener("click", () => {
      if (!confirm("Excluir esta integração do colaborador?")) return;
      db.integrations = db.integrations.filter((item) => item.id !== button.dataset.removeIntegration);
      deleteOnlineRow("integracoes_colaborador", button.dataset.removeIntegration);
      saveDb();
      openEmployeeProfile(employee.id);
    }));
  }

  function openTrainingLaunch(employeeId, recordId = "") {
    if (!db.trainings.length) {
      alert("Cadastre pelo menos um treinamento antes de lançar para o colaborador.");
      return;
    }
    const record = db.employeeTrainings.find((item) => item.id === recordId) || {};
    openModal(recordId ? "Editar treinamento" : "Adicionar treinamento", `
      <form id="launchTrainingForm" class="grid form-grid">
        ${selectField("Treinamento", "trainingId", record.trainingId || "", db.trainings.map((training) => [training.id, training.name]))}
        ${field("Data de realização", "completedAt", record.completedAt || todayIso(), "date", true)}
        ${field("Data de vencimento", "expiresAt", record.expiresAt || "", "date")}
        <div class="row-actions"><button class="button" type="submit">Salvar</button><button class="button secondary" type="button" data-close>Cancelar</button></div>
      </form>
    `);
    document.querySelector("[data-close]").addEventListener("click", closeModal);
    bindAutoExpiration(document.getElementById("launchTrainingForm"), "training");
    document.getElementById("launchTrainingForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const training = db.trainings.find((item) => item.id === formValue(form, "trainingId"));
      const expiresAt = formValue(form, "expiresAt") || addValidity(formValue(form, "completedAt"), training.validityQuantity, training.validityUnit);
      const values = { employeeId, trainingId: formValue(form, "trainingId"), completedAt: formValue(form, "completedAt"), expiresAt };
      if (recordId) db.employeeTrainings = db.employeeTrainings.map((item) => item.id === recordId ? { ...item, ...values } : item);
      else db.employeeTrainings.push({ id: id(), ...values });
      saveDb();
      openEmployeeProfile(employeeId);
    });
  }

  function openIntegrationLaunch(employeeId, recordId = "") {
    if (!db.clients.length) {
      alert("Cadastre pelo menos um cliente antes de lançar integração.");
      return;
    }
    const record = db.integrations.find((item) => item.id === recordId) || {};
    openModal(recordId ? "Editar integração" : "Adicionar integração", `
      <form id="launchIntegrationForm" class="grid form-grid">
        ${selectField("Cliente", "clientId", record.clientId || "", db.clients.map((client) => [client.id, client.name]))}
        ${field("Data da integração", "completedAt", record.completedAt || todayIso(), "date", true)}
        ${field("Data de vencimento", "expiresAt", record.expiresAt || "", "date")}
        <div class="row-actions"><button class="button" type="submit">Salvar</button><button class="button secondary" type="button" data-close>Cancelar</button></div>
      </form>
    `);
    document.querySelector("[data-close]").addEventListener("click", closeModal);
    bindAutoExpiration(document.getElementById("launchIntegrationForm"), "integration");
    document.getElementById("launchIntegrationForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const client = db.clients.find((item) => item.id === formValue(form, "clientId"));
      const expiresAt = formValue(form, "expiresAt") || (client.validityMode === "none" ? "" : addValidity(formValue(form, "completedAt"), client.validityQuantity, client.validityUnit));
      const values = { employeeId, clientId: formValue(form, "clientId"), completedAt: formValue(form, "completedAt"), expiresAt };
      if (recordId) db.integrations = db.integrations.map((item) => item.id === recordId ? { ...item, ...values } : item);
      else db.integrations.push({ id: id(), ...values });
      saveDb();
      openEmployeeProfile(employeeId);
    });
  }

  function renderFitness() {
    view.innerHTML = `
      <section class="section">
        <h2>Onde pode trabalhar?</h2>
        ${selectField("Selecionar colaborador", "fitnessEmployee", "", [["", "Selecione"], ...db.employees.map((employee) => [employee.id, employee.name])])}
      </section>
      <div id="fitnessResult">${db.employees.length ? `<div class="empty">Selecione um colaborador para consultar a aptidão por cliente.</div>` : `<div class="empty">Cadastre colaboradores para consultar a aptidão operacional.</div>`}</div>
    `;
    document.getElementById("fitnessEmployee").addEventListener("change", (event) => {
      const employee = employeeById(event.target.value);
      const target = document.getElementById("fitnessResult");
      if (!employee) return;
      if (!db.clients.length) {
        target.innerHTML = `<div class="empty">Nenhum cliente cadastrado para análise.</div>`;
        return;
      }
      target.innerHTML = table(["Cliente", "Status", "Motivo"], db.clients.map((client) => {
        const status = getClientStatus(employee, client);
        return [esc(client.name), `<span class="badge ${status.className}">${status.status}</span>`, esc(status.reason)];
      }));
    });
  }

  function renderAgenda() {
    const start = new Date(agendaDate.getFullYear(), agendaDate.getMonth(), 1);
    const title = agendaMode === "month"
      ? agendaDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : `Semana de ${formatDate(weekStart(agendaDate).toISOString().slice(0, 10))}`;
    view.innerHTML = `
      <div class="toolbar">
        <div class="row-actions">
          <button class="button secondary" id="prevAgenda">‹</button>
          <button class="button secondary" id="todayAgenda">Hoje</button>
          <button class="button secondary" id="nextAgenda">›</button>
        </div>
        <h2>${title}</h2>
        <div class="row-actions">
          <button class="button secondary ${agendaMode === "month" ? "active" : ""}" data-agenda-mode="month">Mensal</button>
          <button class="button secondary ${agendaMode === "week" ? "active" : ""}" data-agenda-mode="week">Semanal</button>
          <button class="button" id="newAppointment">+ Agendar</button>
        </div>
      </div>
      ${db.clients.length ? renderCalendar() : `<div class="empty">Cadastre clientes para usar a agenda de integrações.</div>`}
      <section class="section"><h2>Agenda padrão dos clientes</h2>${clientScheduleSummary()}</section>
    `;
    document.getElementById("prevAgenda").addEventListener("click", () => moveAgenda(-1));
    document.getElementById("todayAgenda").addEventListener("click", () => { agendaDate = new Date(); render(); });
    document.getElementById("nextAgenda").addEventListener("click", () => moveAgenda(1));
    document.getElementById("newAppointment").addEventListener("click", openAppointmentModal);
    document.querySelectorAll("[data-agenda-mode]").forEach((button) => button.addEventListener("click", () => { agendaMode = button.dataset.agendaMode; render(); }));
    document.querySelectorAll("[data-appointment]").forEach((button) => button.addEventListener("click", () => openAppointmentModal(button.dataset.appointment)));
  }

  function weekStart(date) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  }

  function moveAgenda(step) {
    if (agendaMode === "month") agendaDate = new Date(agendaDate.getFullYear(), agendaDate.getMonth() + step, 1);
    else agendaDate.setDate(agendaDate.getDate() + step * 7);
    render();
  }

  function renderCalendar() {
    const days = agendaMode === "week" ? weekDays() : monthDays();
    const weekLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return `<div class="calendar">${weekLabels.map((day) => `<div class="weekday">${day}</div>`).join("")}${days.map((day) => dayCell(day)).join("")}</div>`;
  }

  function weekDays() {
    const start = weekStart(agendaDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, out: false };
    });
  }

  function monthDays() {
    const start = new Date(agendaDate.getFullYear(), agendaDate.getMonth(), 1);
    const first = new Date(start);
    first.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(first);
      date.setDate(first.getDate() + index);
      return { date, out: date.getMonth() !== agendaDate.getMonth() };
    });
  }

  function dayCell(day) {
    const iso = day.date.toISOString().slice(0, 10);
    const events = db.appointments.filter((item) => item.date === iso);
    return `<div class="day ${day.out ? "out" : ""}"><strong>${day.date.getDate()}</strong>${events.map((event) => `
      <button class="event" data-appointment="${event.id}">${esc(clientName(event.clientId))}<br>${esc(employeeById(event.employeeId)?.name || "Sem colaborador")}</button>
    `).join("")}</div>`;
  }

  function openAppointmentModal(appointmentId) {
    const appointment = db.appointments.find((item) => item.id === appointmentId) || {};
    editingId = appointmentId || null;
    openModal(appointmentId ? "Editar agendamento" : "Novo agendamento", `
      <form id="appointmentForm" class="grid form-grid">
        ${selectField("Cliente", "clientId", appointment.clientId || "", db.clients.map((client) => [client.id, client.name]))}
        ${selectField("Colaborador", "employeeId", appointment.employeeId || "", [["", "Sem colaborador definido"], ...db.employees.map((employee) => [employee.id, employee.name])])}
        ${field("Data", "date", appointment.date || todayIso(), "date", true)}
        ${field("Horário", "time", appointment.time || "", "time")}
        ${selectField("Status", "status", appointment.status || "Agendada", [["Agendada", "Agendada"], ["Concluída", "Concluída"], ["Cancelada", "Cancelada"]])}
        ${field("Observações", "notes", appointment.notes, "textarea")}
        <div class="row-actions"><button class="button" type="submit">Salvar</button>${appointmentId ? `<button class="button danger" type="button" id="deleteAppointment">Excluir</button>` : ""}<button class="button secondary" type="button" data-close>Cancelar</button></div>
      </form>
    `);
    document.querySelector("[data-close]").addEventListener("click", closeModal);
    document.getElementById("appointmentForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = {
        clientId: formValue(form, "clientId"),
        employeeId: formValue(form, "employeeId"),
        date: formValue(form, "date"),
        time: formValue(form, "time"),
        status: formValue(form, "status"),
        notes: formValue(form, "notes").trim()
      };
      upsert("appointments", values);
      closeModal();
      render();
    });
    const deleteButton = document.getElementById("deleteAppointment");
    if (deleteButton) deleteButton.addEventListener("click", () => {
      db.appointments = db.appointments.filter((item) => item.id !== appointmentId);
      deleteOnlineRow("agenda", appointmentId);
      saveDb();
      closeModal();
      render();
    });
  }

  function clientScheduleSummary() {
    if (!db.clients.length) return `<div class="empty">Nenhum cliente cadastrado.</div>`;
    return table(["Cliente", "Dias", "Horários", "Limite", "Local"], db.clients.map((client) => [
      esc(client.name), esc(client.weekdays || "Não informado"), esc(client.times || "Não informado"), esc(client.participantLimit || "Sem limite"), esc(client.location || "Não informado")
    ]));
  }

  function renderImport() {
    importReport = null;
    view.innerHTML = `
      <section class="section card">
        <h2>Importação de colaboradores</h2>
        <p class="muted">Use uma planilha .xlsx de colaboradores. O sistema reconhece variações como Nome Completo, Colaborador, CPF do Colaborador, Empresa e Empregadora. A atualização usa CPF quando ele existir.</p>
        <input id="xlsxInput" type="file" accept=".xlsx" />
      </section>
      <section id="previewArea"></section>
    `;
    document.getElementById("xlsxInput").addEventListener("change", handleXlsxUpload);
  }

  async function handleXlsxUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      importPreview = await parseXlsx(file);
      renderImportPreview();
    } catch (error) {
      document.getElementById("previewArea").innerHTML = `<div class="empty">Não foi possível ler a planilha. Verifique se o arquivo é .xlsx e tente novamente.</div>`;
    }
  }

  function renderImportPreview() {
    const target = document.getElementById("previewArea");
    if (!importPreview.length) {
      target.innerHTML = `<div class="empty">A planilha não possui linhas para importar.</div>`;
      return;
    }
    const normalized = importPreview.map((row, index) => normalizeEmployeeRow(row, index + 2));
    const validRows = normalized.filter((row) => row.name);
    const previewRows = validRows.slice(0, 100);
    target.innerHTML = `
      <div class="toolbar"><h2>Pré-visualização</h2><button class="button" id="confirmImport">Confirmar importação</button></div>
      ${validRows.length ? table(["Nome", "CPF", "RG", "Função", "Empresa", "Ação"], previewRows.map((row) => [
        esc(row.name), esc(row.cpf), esc(row.rg), esc(row.role), esc(row.companyName), row.cpf && db.employees.some((employee) => onlyDigits(employee.cpf) === onlyDigits(row.cpf)) ? "Atualizar por CPF" : "Criar novo"
      ])) : `<div class="empty">Nenhum colaborador válido encontrado. A coluna nome é obrigatória.</div>`}
      ${validRows.length > previewRows.length ? `<p class="muted">Mostrando as primeiras ${previewRows.length} linhas de ${validRows.length} registros válidos.</p>` : ""}
      ${normalized.some((row) => row.errors.length) ? `<div class="empty">${normalized.filter((row) => row.errors.length).length} linha(s) possuem campos ausentes ou inválidos e serão relatadas após a importação.</div>` : ""}
    `;
    document.getElementById("confirmImport")?.addEventListener("click", async () => {
      if (!confirm("Confirmar importação dos colaboradores exibidos?")) return;
      const button = document.getElementById("confirmImport");
      button.disabled = true;
      button.textContent = "Importando...";
      importReport = await importEmployees(normalized);
      importPreview = [];
      renderImportReport(importReport);
    });
  }

  function renderImportReport(report) {
    document.getElementById("previewArea").innerHTML = `
      <div class="card section">
        <h2>Relatório da importação</h2>
        <div class="grid stats-grid">
          ${stat("Importados", report.imported, "Novos colaboradores")}
          ${stat("Atualizados", report.updated, "Localizados por CPF")}
          ${stat("Ignorados", report.ignored, "Linhas sem dados suficientes")}
          ${stat("Erros", report.errors.length, "Validação de linhas")}
        </div>
      </div>
      ${report.errors.length ? table(["Linha", "Motivo"], report.errors.slice(0, 100).map((error) => [error.line, esc(error.message)])) : `<div class="empty">Importação concluída sem erros.</div>`}
    `;
  }

  function normalizeEmployeeRow(row, line = 0) {
    const value = (...aliases) => {
      const normalizedAliases = aliases.map(normalizeHeader);
      const found = Object.keys(row).find((key) => normalizedAliases.includes(normalizeHeader(key)));
      return found && row[found] !== undefined && row[found] !== null ? String(row[found]).trim() : "";
    };
    const employee = {
      line,
      name: value("nome", "name", "nome completo", "colaborador", "funcionario", "funcionário", "empregado"),
      cpf: normalizeCpf(value("cpf", "cpf do colaborador", "cpf colaborador", "documento cpf")),
      rg: value("rg", "identidade", "registro geral"),
      role: value("função", "funcao", "cargo", "função cargo", "funcao cargo"),
      companyName: value("empresa", "empregadora", "empresa empregadora", "contratante"),
      admissionDate: normalizeDate(value("admissão", "admissao", "data de admissão", "data admissao", "dt admissao", "admitido em")),
      dismissalDate: normalizeDate(value("demissão", "demissao", "data de demissão", "data demissao", "dt demissao", "desligamento")),
      birthDate: normalizeDate(value("nascimento", "data de nascimento", "dt nascimento")),
      notes: value("observações", "observacoes", "obs", "observacao", "observação")
    };
    employee.errors = [];
    if (!employee.name) employee.errors.push("Nome não informado");
    if (employee.cpf && onlyDigits(employee.cpf).length !== 11) employee.errors.push("CPF inválido");
    return employee;
  }

  async function importEmployees(rows) {
    const report = { imported: 0, updated: 0, ignored: 0, errors: [] };
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.name) {
        report.ignored += 1;
        report.errors.push({ line: row.line, message: "Linha ignorada: nome não informado" });
        continue;
      }
      if (row.errors.length) {
        report.errors.push(...row.errors.map((message) => ({ line: row.line, message })));
      }
      let companyId = "";
      if (row.companyName) {
        let company = db.companies.find((item) => item.name.toLowerCase() === row.companyName.toLowerCase());
        if (!company) {
          company = { id: id(), name: row.companyName, cnpj: "", notes: "Criada pela importação de colaboradores" };
          db.companies.push(company);
        }
        companyId = company.id;
      }
      const existing = row.cpf ? db.employees.find((employee) => onlyDigits(employee.cpf) === onlyDigits(row.cpf)) : null;
      const values = {
        name: row.name,
        cpf: row.cpf,
        rg: row.rg,
        birthDate: row.birthDate,
        role: row.role,
        companyId,
        admissionDate: row.admissionDate,
        dismissalDate: row.dismissalDate,
        active: !row.dismissalDate,
        notes: row.notes
      };
      if (existing) {
        Object.assign(existing, values);
        report.updated += 1;
      } else {
        db.employees.push({ id: id(), ...values });
        report.imported += 1;
      }
      if (index > 0 && index % 100 === 0) {
        saveDb();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    saveDb();
    return report;
  }

  function renderSettings() {
    view.innerHTML = `
      <form id="settingsForm" class="grid form-grid card">
        ${field("Nome do sistema", "systemName", db.settings.systemName, "text", true)}
        ${field("Logo textual", "logoText", db.settings.logoText)}
        <label class="field"><span>Cor principal</span><input type="color" name="primaryColor" value="${esc(db.settings.primaryColor)}"></label>
        <label class="field"><span>Cor de destaque</span><input type="color" name="accentColor" value="${esc(db.settings.accentColor)}"></label>
        ${field("Nome da empresa", "companyName", db.settings.companyName)}
        ${field("CNPJ da empresa", "companyDocument", db.settings.companyDocument)}
        ${field("Dados da empresa", "companyNotes", db.settings.companyNotes, "textarea")}
        <div class="row-actions">
          <button class="button" type="submit">Salvar configurações</button>
          <button class="button secondary" type="button" id="migrateLocalDb">Migrar local para Supabase</button>
          <button class="button secondary" type="button" id="exportDb">Exportar JSON</button>
          <button class="button secondary" type="button" id="exportExcel">Exportar Excel</button>
          <button class="button danger" type="button" id="clearDb">Limpar banco</button>
        </div>
      </form>
    `;
    document.getElementById("settingsForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      db.settings = {
        systemName: formValue(form, "systemName").trim() || "IntegraControl",
        logoText: formValue(form, "logoText").trim() || "IC",
        primaryColor: formValue(form, "primaryColor"),
        accentColor: formValue(form, "accentColor"),
        companyName: formValue(form, "companyName").trim(),
        companyDocument: formValue(form, "companyDocument").trim(),
        companyNotes: formValue(form, "companyNotes").trim()
      };
      saveDb();
      render();
    });
    document.getElementById("clearDb").addEventListener("click", async () => {
      if (!confirm("Limpar todos os dados cadastrados? Esta ação não pode ser desfeita.")) return;
      await clearOnlineDb();
      db = structuredClone(defaultDb);
      saveDb();
      render();
    });
    document.getElementById("exportDb").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "integracontrol-dados.json";
      link.click();
      URL.revokeObjectURL(link.href);
    });
    document.getElementById("exportExcel").addEventListener("click", exportExcelBackup);
    document.getElementById("migrateLocalDb").addEventListener("click", async () => {
      if (!online.enabled || !online.user) {
        alert("Entre com um usuário Supabase antes de migrar os dados locais.");
        return;
      }
      if (!confirm("Enviar os dados locais deste navegador para o Supabase?")) return;
      db = JSON.parse(localStorage.getItem(LOCAL_MIGRATION_KEY) || localStorage.getItem(DB_KEY) || JSON.stringify(defaultDb));
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      await persistOnlineDb();
      localStorage.removeItem(LOCAL_MIGRATION_KEY);
      alert(online.error ? `Migração concluída com alerta: ${online.error}` : "Dados locais enviados para o Supabase.");
      render();
    });
  }

  function exportExcelBackup() {
    const sheets = [
      ["Empresas", ["Nome", "CNPJ", "Observações"], db.companies.map((item) => [item.name, item.cnpj, item.notes])],
      ["Colaboradores", ["Nome", "CPF", "RG", "Nascimento", "Função", "Empresa", "Admissão", "Demissão", "Status", "Observações"], db.employees.map((item) => [item.name, item.cpf, item.rg, item.birthDate, item.role, companyName(item.companyId), item.admissionDate, item.dismissalDate, item.active ? "Ativo" : "Inativo", item.notes])],
      ["Clientes", ["Nome", "Tipo integração", "Validade", "Unidade"], db.clients.map((item) => [item.name, integrationTypeLabel(item.integrationType), item.validityQuantity, unitLabel(item.validityUnit)])],
      ["Treinamentos", ["Nome", "Validade", "Unidade", "Observações"], db.trainings.map((item) => [item.name, item.validityQuantity, unitLabel(item.validityUnit), item.notes])],
      ["Treinamentos Colaborador", ["Colaborador", "Treinamento", "Realização", "Vencimento"], db.employeeTrainings.map((item) => [employeeById(item.employeeId)?.name || "", trainingName(item.trainingId), item.completedAt, item.expiresAt])],
      ["Integrações Colaborador", ["Colaborador", "Cliente", "Integração", "Vencimento"], db.integrations.map((item) => [employeeById(item.employeeId)?.name || "", clientName(item.clientId), item.completedAt, item.expiresAt])],
      ["Agenda", ["Título", "Cliente", "Colaborador", "Data", "Horário", "Status", "Observações"], db.appointments.map((item) => [item.title || clientName(item.clientId), clientName(item.clientId), employeeById(item.employeeId)?.name || "", item.date, item.time, item.status, item.notes])]
    ];
    const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body>${sheets.map(([name, headers, rows]) => `
      <h2>${esc(name)}</h2>
      <table border="1">
        <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell || "")}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    `).join("")}</body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "integracontrol-backup.xls";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function field(label, name, value = "", type = "text", required = false, placeholder = "") {
    if (type === "textarea") {
      return `<label class="field"><span>${label}${required ? " *" : ""}</span><textarea name="${name}" ${required ? "required" : ""} placeholder="${esc(placeholder)}">${esc(value || "")}</textarea></label>`;
    }
    return `<label class="field"><span>${label}${required ? " *" : ""}</span><input name="${name}" type="${type}" value="${esc(value || "")}" ${required ? "required" : ""} placeholder="${esc(placeholder)}" /></label>`;
  }

  function selectField(label, name, value, options) {
    return `<label class="field"><span>${label}</span><select name="${name}" id="${name}">${options.map(([optionValue, optionLabel]) => `<option value="${esc(optionValue)}" ${String(value) === String(optionValue) ? "selected" : ""}>${esc(optionLabel)}</option>`).join("")}</select></label>`;
  }

  function unitLabel(unit) {
    return { days: "dias", months: "meses", years: "anos" }[unit] || "";
  }

  function expirationBadge(expiresAt, validLabel = "Válido") {
    if (!expiresAt) return `<span class="badge good">Sem vencimento</span>`;
    if (isExpired(expiresAt)) return `<span class="badge bad">Vencido</span>`;
    if (isExpiring(expiresAt)) return `<span class="badge warn">Vencendo</span>`;
    return `<span class="badge good">${validLabel}</span>`;
  }

  function integrationTypeLabel(type) {
    return { inPerson: "Presencial", online: "Online", documental: "Documental", none: "Não exige integração" }[type] || "Presencial";
  }

  function agendaSummary(client) {
    return [client.weekdays, client.times].filter(Boolean).join(" • ") || "Não informada";
  }

  function openModal(title, html) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = html;
    document.getElementById("modalBackdrop").classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("modalBackdrop").classList.add("hidden");
    document.getElementById("modalBody").innerHTML = "";
    editingId = null;
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeHeader(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizeCpf(value) {
    const digits = onlyDigits(value);
    if (!digits) return "";
    return digits.length === 11
      ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
      : String(value || "").trim();
  }

  function formValue(form, name) {
    return form.elements[name]?.value || "";
  }

  function formChecked(form, name) {
    return Boolean(form.elements[name]?.checked);
  }

  function bindAutoExpiration(form, type) {
    let manualExpiration = Boolean(formValue(form, "expiresAt"));
    const expirationInput = form.elements.expiresAt;
    const updateExpiration = () => {
      if (manualExpiration) return;
      if (type === "training") {
        const training = db.trainings.find((item) => item.id === formValue(form, "trainingId"));
        expirationInput.value = training ? addValidity(formValue(form, "completedAt"), training.validityQuantity, training.validityUnit) : "";
      }
      if (type === "integration") {
        const client = db.clients.find((item) => item.id === formValue(form, "clientId"));
        expirationInput.value = client && client.validityMode !== "none"
          ? addValidity(formValue(form, "completedAt"), client.validityQuantity, client.validityUnit)
          : "";
      }
    };
    expirationInput.addEventListener("input", () => {
      manualExpiration = true;
    });
    ["trainingId", "clientId", "completedAt"].forEach((name) => {
      if (form.elements[name]) form.elements[name].addEventListener("change", () => {
        manualExpiration = false;
        updateExpiration();
      });
    });
    updateExpiration();
  }

  function normalizeDate(value) {
    if (!value) return "";
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
      const [day, month, year] = text.split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    const serial = Number(text);
    if (serial > 25000 && serial < 70000) {
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      return date.toISOString().slice(0, 10);
    }
    return "";
  }

  async function parseXlsx(file) {
    const buffer = await file.arrayBuffer();
    const files = await unzip(buffer);
    const workbook = parseXml(files["xl/workbook.xml"]);
    const rels = parseXml(files["xl/_rels/workbook.xml.rels"]);
    const sheetRelId = workbook.querySelector("sheet")?.getAttribute("r:id");
    const rel = Array.from(rels.querySelectorAll("Relationship")).find((item) => item.getAttribute("Id") === sheetRelId);
    const sheetTarget = rel?.getAttribute("Target") || "worksheets/sheet1.xml";
    const sheetPath = sheetTarget.startsWith("/")
      ? sheetTarget.slice(1)
      : sheetTarget.startsWith("xl/")
        ? sheetTarget
        : `xl/${sheetTarget}`;
    const shared = files["xl/sharedStrings.xml"] ? Array.from(parseXml(files["xl/sharedStrings.xml"]).querySelectorAll("si")).map((si) => si.textContent) : [];
    const sheet = parseXml(files[sheetPath]);
    const rows = Array.from(sheet.querySelectorAll("sheetData row")).map((row) => {
      const cells = {};
      Array.from(row.querySelectorAll("c")).forEach((cell) => {
        const ref = cell.getAttribute("r") || "";
        const col = ref.replace(/\d/g, "");
        const value = cell.querySelector("v")?.textContent || cell.querySelector("is t")?.textContent || "";
        cells[col] = cell.getAttribute("t") === "s" ? (shared[Number(value)] || "") : value;
      });
      return cells;
    });
    if (!rows.length) return [];
    const headers = rows[0];
    return rows.slice(1).map((row) => {
      const obj = {};
      Object.keys(headers).forEach((col) => {
        const key = String(headers[col] || "").trim().toLowerCase();
        if (key) obj[key] = row[col] || "";
      });
      return obj;
    });
  }

  function parseXml(text) {
    return new DOMParser().parseFromString(text, "application/xml");
  }

  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer);
    const files = {};
    let pos = 0;
    while (pos < bytes.length - 4) {
      if (bytes[pos] !== 0x50 || bytes[pos + 1] !== 0x4b || bytes[pos + 2] !== 0x03 || bytes[pos + 3] !== 0x04) {
        pos++;
        continue;
      }
      const method = read16(bytes, pos + 8);
      const compressedSize = read32(bytes, pos + 18);
      const fileNameLength = read16(bytes, pos + 26);
      const extraLength = read16(bytes, pos + 28);
      const name = textFrom(bytes.slice(pos + 30, pos + 30 + fileNameLength));
      const start = pos + 30 + fileNameLength + extraLength;
      const data = bytes.slice(start, start + compressedSize);
      if (!name.endsWith("/")) {
        if (method === 0) files[name] = textFrom(data);
        if (method === 8) files[name] = await inflateRaw(data);
      }
      pos = start + compressedSize;
    }
    return files;
  }

  function read16(bytes, pos) {
    return bytes[pos] | (bytes[pos + 1] << 8);
  }

  function read32(bytes, pos) {
    return (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0;
  }

  function textFrom(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function inflateRaw(data) {
    if (!("DecompressionStream" in window)) {
      throw new Error("Descompactação nativa indisponível.");
    }
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    return textFrom(new Uint8Array(buffer));
  }

  initApp();
})();

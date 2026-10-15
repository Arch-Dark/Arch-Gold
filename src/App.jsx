
import { useEffect, useMemo, useState } from "react";
import {
  Activity, Archive, ArrowDownRight, ArrowUpRight, BookOpen,
  CalendarDays, ChartNoAxesCombined, ChevronDown, CircleDollarSign,
  LayoutDashboard, LogOut, Menu, Pencil, Plus, RefreshCw,
  Settings2, ShieldCheck, Trash2, Wallet, X
} from "lucide-react";
import { supabase, supabaseConfigured } from "./supabase";

const SETUPS = [
  "OB", "BB", "ZS OA", "QML + LDP",
  "SSM1", "SSM2", "SSM3", "SBM1", "SBM2", "SBM3", "CRT"
];

const PERIODS = [
  ["day", "Journalier"],
  ["week", "Hebdomadaire"],
  ["month", "Mensuel"],
  ["year", "Annuel"],
  ["all", "Global"]
];

const money = value =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD"
  }).format(Number(value) || 0);

const dateInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const blankTrade = () => ({
  trade_date: dateInput(),
  asset: "XAUUSD",
  direction: "BUY",
  setup: "OB",
  result: "TP",
  pnl: "",
  risk_amount: "",
  plan_followed: true,
  notes: ""
});

function periodStart(period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);

  if (period === "day") return d;

  if (period === "week") {
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d;
  }

  if (period === "month") {
    d.setDate(1);
    return d;
  }

  if (period === "year") {
    d.setMonth(0, 1);
    return d;
  }

  return null;
}

function inPeriod(trade, period) {
  if (period === "all") return true;
  const start = periodStart(period);
  return new Date(trade.trade_date) >= start;
}

function Stat({ label, value, detail, icon: Icon, positive }) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon"><Icon size={18} /></span>
      </div>
      <div className="stat-value">{value}</div>
      {detail && (
        <div className={`stat-detail ${positive === true ? "green" : positive === false ? "red" : ""}`}>
          {detail}
        </div>
      )}
    </article>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMessage("");
    setBusy(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });
        if (error) throw error;

        setMessage(
          data.session
            ? "Compte créé. Tu peux maintenant utiliser ton journal."
            : "Compte créé. Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error.message || "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark"><ChartNoAxesCombined size={26} /></div>
        <p className="eyebrow">TRADING JOURNAL</p>
        <h1>{mode === "login" ? "Content de te revoir." : "Créer mon compte."}</h1>
        <p className="muted">Ton journal de trading personnel, synchronisé en ligne.</p>

        <label>Adresse e-mail</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />

        <label>Mot de passe</label>
        <input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={6}
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />

        {message && <p className="notice">{message}</p>}

        <button className="primary full" disabled={busy}>
          {busy ? "Patiente..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>

        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage("");
          }}
        >
          {mode === "login" ? "Créer un nouveau compte" : "J'ai déjà un compte"}
        </button>
      </form>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [capitals, setCapitals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [period, setPeriod] = useState("month");
  const [capitalFilter, setCapitalFilter] = useState("active");
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeResultFilter, setTradeResultFilter] = useState("all");
  const [setupFilter, setSetupFilter] = useState("all");

  const [tradeModal, setTradeModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [tradeForm, setTradeForm] = useState(blankTrade());

  const [capitalModal, setCapitalModal] = useState(false);
  const [capitalName, setCapitalName] = useState("");
  const [capitalBalance, setCapitalBalance] = useState("");

  const activeCapital = capitals.find(c => c.is_active) || null;

  useEffect(() => {
    if (!supabaseConfigured) {
      setAuthReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function loadData() {
    if (!session?.user?.id) return;

    setLoading(true);
    setError("");

    try {
      const [capitalResponse, tradeResponse] = await Promise.all([
        supabase.from("capitals")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("trades")
          .select("*")
          .order("trade_date", { ascending: false })
      ]);

      if (capitalResponse.error) throw capitalResponse.error;
      if (tradeResponse.error) throw tradeResponse.error;

      setCapitals(capitalResponse.data || []);
      setTrades(tradeResponse.data || []);
    } catch (e) {
      setError(e.message || "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) loadData();
    else {
      setCapitals([]);
      setTrades([]);
    }
  }, [session?.user?.id]);

  const selectedCapitalIds = useMemo(() => {
    if (capitalFilter === "all") return null;

    return new Set(
      capitals
        .filter(c => capitalFilter === "active" ? c.is_active : !c.is_active)
        .map(c => c.id)
    );
  }, [capitals, capitalFilter]);

  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      if (selectedCapitalIds && !selectedCapitalIds.has(t.capital_id)) return false;
      if (!inPeriod(t, period)) return false;
      if (setupFilter !== "all" && t.setup !== setupFilter) return false;
      if (tradeResultFilter !== "all" && t.result !== tradeResultFilter) return false;

      const query = tradeSearch.trim().toLowerCase();
      if (query && ![
        t.asset, t.setup, t.direction, t.result, t.notes
      ].some(v => String(v || "").toLowerCase().includes(query))) return false;

      return true;
    });
  }, [
    trades, selectedCapitalIds, period, setupFilter,
    tradeResultFilter, tradeSearch
  ]);

  const stats = useMemo(() => {
    const pnl = filteredTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    const wins = filteredTrades.filter(t => Number(t.pnl) > 0).length;
    const losses = filteredTrades.filter(t => Number(t.pnl) < 0).length;
    const breakevens = filteredTrades.filter(t => Number(t.pnl) === 0).length;
    const decided = wins + losses;

    return {
      pnl,
      count: filteredTrades.length,
      wins,
      losses,
      breakevens,
      winRate: decided ? (wins / decided) * 100 : 0
    };
  }, [filteredTrades]);

  const activeTrades = trades.filter(t => t.capital_id === activeCapital?.id);
  const activePnl = activeTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
  const activeBalance = Number(activeCapital?.initial_balance || 0) + activePnl;

  const setupStats = useMemo(() => SETUPS.map(setup => {
    const rows = filteredTrades.filter(t => t.setup === setup);
    const pnl = rows.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    const wins = rows.filter(t => Number(t.pnl) > 0).length;
    const losses = rows.filter(t => Number(t.pnl) < 0).length;
    const decided = wins + losses;

    return {
      setup,
      count: rows.length,
      pnl,
      winRate: decided ? wins / decided * 100 : 0
    };
  }), [filteredTrades]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  function openNewTrade() {
    if (!activeCapital) {
      setNotice("Crée d'abord un capital actif.");
      setPage("capitals");
      return;
    }
    setEditingTrade(null);
    setTradeForm(blankTrade());
    setTradeModal(true);
  }

  function openEditTrade(trade) {
    setEditingTrade(trade);
    setTradeForm({
      ...trade,
      trade_date: new Date(trade.trade_date).toISOString().slice(0, 16),
      pnl: String(trade.pnl),
      risk_amount: trade.risk_amount == null ? "" : String(trade.risk_amount)
    });
    setTradeModal(true);
  }

  async function saveTrade(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    const capitalId = editingTrade
      ? editingTrade.capital_id
      : activeCapital?.id;

    if (!capitalId) {
      setError("Aucun capital actif. Crée un capital avant d'ajouter un trade.");
      return;
    }

    const payload = {
      user_id: session.user.id,
      capital_id: capitalId,
      trade_date: new Date(tradeForm.trade_date).toISOString(),
      asset: tradeForm.asset.trim().toUpperCase(),
      direction: tradeForm.direction,
      setup: tradeForm.setup,
      result: tradeForm.result,
      pnl: Number(tradeForm.pnl),
      risk_amount: tradeForm.risk_amount === "" ? null : Number(tradeForm.risk_amount),
      plan_followed: tradeForm.plan_followed === "" ? null : tradeForm.plan_followed === true || tradeForm.plan_followed === "true",
      notes: tradeForm.notes.trim()
    };

    try {
      const response = editingTrade
        ? await supabase.from("trades").update(payload).eq("id", editingTrade.id)
        : await supabase.from("trades").insert(payload);

      if (response.error) throw response.error;

      setTradeModal(false);
      setNotice(editingTrade ? "Trade modifié." : "Trade enregistré.");
      await loadData();
    } catch (e) {
      setError(e.message || "Impossible d'enregistrer le trade.");
    }
  }

  async function deleteTrade(trade) {
    if (!window.confirm("Supprimer définitivement ce trade ?")) return;

    const { error: deleteError } = await supabase
      .from("trades").delete().eq("id", trade.id);

    if (deleteError) setError(deleteError.message);
    else {
      setNotice("Trade supprimé.");
      await loadData();
    }
  }

  async function createCapital(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!capitalName.trim() || capitalBalance === "" || Number(capitalBalance) < 0) {
      setError("Saisis un nom et un capital initial valide.");
      return;
    }

    try {
      if (activeCapital) {
        const { error: archiveError } = await supabase
          .from("capitals")
          .update({ is_active: false, archived_at: new Date().toISOString() })
          .eq("id", activeCapital.id);

        if (archiveError) throw archiveError;
      }

      const { error: createError } = await supabase.from("capitals").insert({
        user_id: session.user.id,
        name: capitalName.trim(),
        initial_balance: Number(capitalBalance),
        is_active: true,
        archived_at: null
      });

      if (createError) throw createError;

      setCapitalModal(false);
      setCapitalName("");
      setCapitalBalance("");
      setNotice("Nouveau capital actif créé. L'ancien capital est archivé.");
      await loadData();
    } catch (e) {
      setError(e.message || "Impossible de créer le capital.");
      await loadData();
    }
  }

  async function reactivateCapital(capital) {
    if (capital.is_active) return;

    if (!window.confirm(
      `Activer "${capital.name}" ? Le capital actif actuel sera archivé.`
    )) return;

    try {
      if (activeCapital) {
        const { error: archiveError } = await supabase
          .from("capitals")
          .update({ is_active: false, archived_at: new Date().toISOString() })
          .eq("id", activeCapital.id);

        if (archiveError) throw archiveError;
      }

      const { error: activateError } = await supabase
        .from("capitals")
        .update({ is_active: true, archived_at: null })
        .eq("id", capital.id);

      if (activateError) throw activateError;

      setNotice("Capital réactivé.");
      await loadData();
    } catch (e) {
      setError(e.message || "Impossible de réactiver le capital.");
      await loadData();
    }
  }

  if (!supabaseConfigured) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Configuration nécessaire</h1>
          <p className="muted">
            Les variables VITE_SUPABASE_URL et
            VITE_SUPABASE_PUBLISHABLE_KEY ne sont pas configurées.
          </p>
          <p>Configure-les dans le fichier .env en local ou dans les paramètres GitHub Actions pour le déploiement.</p>
        </section>
      </main>
    );
  }

  if (!authReady) return <main className="loading-screen">Chargement...</main>;
  if (!session) return <AuthScreen />;

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "journal", label: "Journal des trades", icon: BookOpen },
    { id: "capitals", label: "Capitaux", icon: Wallet },
    { id: "performance", label: "Performances", icon: ChartNoAxesCombined }
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><ChartNoAxesCombined size={23} /></div>
          <div>
            <strong>Trading Journal</strong>
            <span>Mon espace personnel</span>
          </div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <p className="nav-label">MENU PRINCIPAL</p>
        <nav>
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "nav-active" : ""}`}
              onClick={() => {
                setPage(item.id);
                setSidebarOpen(false);
              }}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="account-chip">
            <div className="avatar">{session.user.email?.[0]?.toUpperCase() || "T"}</div>
            <div className="account-info">
              <strong>Mon compte</strong>
              <span>{session.user.email}</span>
            </div>
          </div>
          <button className="nav-item" onClick={signOut}>
            <LogOut size={18} /><span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="mobile-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)}>
              <Menu size={21} />
            </button>
            <div>
              <p className="eyebrow">ESPACE PERSONNEL</p>
              <h1>{navItems.find(n => n.id === page)?.label}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="sync-label"><span className="status-dot" /> Synchronisé</span>
            <button className="icon-button" title="Actualiser" onClick={loadData}><RefreshCw size={17} /></button>
            <button className="primary" onClick={openNewTrade}><Plus size={17} /> Nouveau trade</button>
          </div>
        </header>

        <div className="page-content">
          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
              <button onClick={() => setError("")}><X size={16} /></button>
            </div>
          )}
          {notice && (
            <div className="alert alert-success">
              <span>{notice}</span>
              <button onClick={() => setNotice("")}><X size={16} /></button>
            </div>
          )}

          {loading && <p className="muted">Synchronisation des données...</p>}

          {page === "dashboard" && (
            <>
              <section className="welcome-row">
                <div>
                  <h2>Ton trading, en un coup d'œil.</h2>
                  <p>Observe tes résultats et reste fidèle à ton plan.</p>
                </div>
                <div className="capital-pill">
                  <span className="status-dot" />
                  {activeCapital?.name || "Aucun capital actif"}
                </div>
              </section>

              <section className="stat-grid">
                <Stat label="Solde du capital actif" value={money(activeBalance)}
                  detail={`Départ : ${money(activeCapital?.initial_balance || 0)}`}
                  icon={Wallet} />
                <Stat label="P&L du capital actif" value={money(activePnl)}
                  detail={`${activeTrades.length} trade(s) enregistré(s)`}
                  icon={CircleDollarSign} positive={activePnl > 0 ? true : activePnl < 0 ? false : null} />
                <Stat label="Win rate de la période" value={`${stats.winRate.toFixed(1)}%`}
                  detail={`${stats.wins} gagnants · ${stats.losses} perdants`}
                  icon={Activity} />
                <Stat label="Trades de la période" value={stats.count}
                  detail={`${stats.breakevens} break-even`}
                  icon={BookOpen} />
              </section>

              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Performance récente</h2>
                    <p>Résultats selon la période et le capital sélectionnés.</p>
                  </div>
                  <button className="secondary" onClick={() => setPage("performance")}>
                    Voir les performances
                  </button>
                </div>
                <FilterBar
                  period={period} setPeriod={setPeriod}
                  capitalFilter={capitalFilter} setCapitalFilter={setCapitalFilter}
                />
                <div className="mini-stats">
                  <div><span>P&L</span><strong className={stats.pnl >= 0 ? "green" : "red"}>{money(stats.pnl)}</strong></div>
                  <div><span>Gagnants</span><strong>{stats.wins}</strong></div>
                  <div><span>Perdants</span><strong>{stats.losses}</strong></div>
                  <div><span>Break-even</span><strong>{stats.breakevens}</strong></div>
                </div>
              </section>

              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Derniers trades</h2>
                    <p>Les cinq dernières transactions enregistrées.</p>
                  </div>
                  <button className="text-button" onClick={() => setPage("journal")}>Tout afficher →</button>
                </div>
                <TradeTable
                  rows={trades.slice(0, 5)}
                  capitals={capitals}
                  onEdit={openEditTrade}
                  onDelete={deleteTrade}
                />
              </section>
            </>
          )}

          {page === "journal" && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Journal des trades</h2>
                  <p>Chaque résultat est saisi manuellement.</p>
                </div>
                <button className="primary" onClick={openNewTrade}><Plus size={16} /> Ajouter</button>
              </div>
              <FilterBar
                period={period} setPeriod={setPeriod}
                capitalFilter={capitalFilter} setCapitalFilter={setCapitalFilter}
              />
              <div className="filter-row">
                <input
                  placeholder="Rechercher un actif, setup, note..."
                  value={tradeSearch}
                  onChange={e => setTradeSearch(e.target.value)}
                />
                <select value={tradeResultFilter} onChange={e => setTradeResultFilter(e.target.value)}>
                  <option value="all">Tous les résultats</option>
                  <option value="TP">TP</option>
                  <option value="SL">SL</option>
                  <option value="BE">BE</option>
                </select>
                <select value={setupFilter} onChange={e => setSetupFilter(e.target.value)}>
                  <option value="all">Tous les setups</option>
                  {SETUPS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="table-summary">
                <span>{filteredTrades.length} trade(s)</span>
                <strong className={stats.pnl >= 0 ? "green" : "red"}>{money(stats.pnl)}</strong>
              </div>
              <TradeTable
                rows={filteredTrades}
                capitals={capitals}
                onEdit={openEditTrade}
                onDelete={deleteTrade}
              />
            </section>
          )}

          {page === "capitals" && (
            <>
              <section className="welcome-row">
                <div>
                  <h2>Gestion des capitaux</h2>
                  <p>Un capital actif à la fois. Tes archives conservent leur historique.</p>
                </div>
                <button className="primary" onClick={() => setCapitalModal(true)}>
                  <Plus size={17} /> Nouveau capital
                </button>
              </section>

              <section className="stat-grid two">
                <Stat label="Capital initial actif" value={money(activeCapital?.initial_balance || 0)}
                  icon={Wallet} detail={activeCapital?.name || "Aucun capital actif"} />
                <Stat label="Solde actif actuel" value={money(activeBalance)}
                  icon={CircleDollarSign} detail={`P&L : ${money(activePnl)}`}
                  positive={activePnl > 0 ? true : activePnl < 0 ? false : null} />
              </section>

              <section className="panel">
                <div className="section-heading">
                  <div><h2>Tous les capitaux</h2><p>Actifs et archivés.</p></div>
                </div>
                {capitals.length === 0 ? (
                  <Empty message="Aucun capital. Crée ton premier capital pour commencer." />
                ) : (
                  <div className="capital-list">
                    {capitals.map(c => {
                      const rows = trades.filter(t => t.capital_id === c.id);
                      const pnl = rows.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
                      return (
                        <article className="capital-card" key={c.id}>
                          <div className="capital-card-icon"><Wallet size={21} /></div>
                          <div className="capital-card-main">
                            <div className="capital-title">
                              <h3>{c.name}</h3>
                              <span className={`badge ${c.is_active ? "badge-active" : ""}`}>
                                {c.is_active ? "Actif" : "Archivé"}
                              </span>
                            </div>
                            <p className="muted">{rows.length} trade(s) · Créé le {new Date(c.created_at).toLocaleDateString("fr-FR")}</p>
                            <div className="capital-numbers">
                              <span>Départ <strong>{money(c.initial_balance)}</strong></span>
                              <span>P&L <strong className={pnl >= 0 ? "green" : "red"}>{money(pnl)}</strong></span>
                              <span>Solde <strong>{money(Number(c.initial_balance) + pnl)}</strong></span>
                            </div>
                          </div>
                          {!c.is_active && (
                            <button className="secondary" onClick={() => reactivateCapital(c)}>
                              Réactiver
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {page === "performance" && (
            <>
              <section className="welcome-row">
                <div>
                  <h2>Analyse de performance</h2>
                  <p>Évalue les résultats par période et par setup.</p>
                </div>
              </section>

              <section className="panel">
                <div className="section-heading">
                  <div><h2>Filtres</h2><p>Choisis les données à analyser.</p></div>
                </div>
                <FilterBar
                  period={period} setPeriod={setPeriod}
                  capitalFilter={capitalFilter} setCapitalFilter={setCapitalFilter}
                />
                <div className="stat-grid">
                  <Stat label="P&L total" value={money(stats.pnl)} icon={CircleDollarSign}
                    positive={stats.pnl > 0 ? true : stats.pnl < 0 ? false : null} />
                  <Stat label="Taux de réussite" value={`${stats.winRate.toFixed(1)}%`}
                    detail={`${stats.wins} gagnants sur ${stats.wins + stats.losses} trades décidés`}
                    icon={ChartNoAxesCombined} />
                  <Stat label="Nombre de trades" value={stats.count} icon={BookOpen} />
                  <Stat label="Break-even" value={stats.breakevens} icon={Activity} />
                </div>
              </section>

              <section className="panel">
                <div className="section-heading">
                  <div><h2>Performance des setups</h2><p>Comparaison sur la période sélectionnée.</p></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Setup</th><th>Trades</th><th>Win rate</th><th>P&L</th></tr></thead>
                    <tbody>
                      {setupStats.map(s => (
                        <tr key={s.setup}>
                          <td><span className="setup-badge">{s.setup}</span></td>
                          <td>{s.count}</td>
                          <td>{s.count ? `${s.winRate.toFixed(1)}%` : "—"}</td>
                          <td className={s.pnl > 0 ? "green" : s.pnl < 0 ? "red" : ""}>{money(s.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {tradeModal && (
        <div className="modal-backdrop" onMouseDown={e => {
          if (e.target === e.currentTarget) setTradeModal(false);
        }}>
          <form className="modal" onSubmit={saveTrade}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">JOURNAL</p>
                <h2>{editingTrade ? "Modifier le trade" : "Ajouter un trade"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setTradeModal(false)}><X size={20} /></button>
            </div>

            <div className="form-grid">
              <div className="field full-field">
                <label>Date et heure</label>
                <input type="datetime-local" required value={tradeForm.trade_date}
                  onChange={e => setTradeForm({ ...tradeForm, trade_date: e.target.value })} />
              </div>
              <div className="field">
                <label>Actif</label>
                <input required value={tradeForm.asset}
                  onChange={e => setTradeForm({ ...tradeForm, asset: e.target.value })} />
              </div>
              <div className="field">
                <label>Direction</label>
                <select value={tradeForm.direction}
                  onChange={e => setTradeForm({ ...tradeForm, direction: e.target.value })}>
                  <option value="BUY">BUY</option><option value="SELL">SELL</option>
                </select>
              </div>
              <div className="field">
                <label>Setup</label>
                <select value={tradeForm.setup}
                  onChange={e => setTradeForm({ ...tradeForm, setup: e.target.value })}>
                  {SETUPS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Résultat</label>
                <select value={tradeForm.result}
                  onChange={e => setTradeForm({ ...tradeForm, result: e.target.value })}>
                  <option value="TP">TP — Take profit</option>
                  <option value="SL">SL — Stop loss</option>
                  <option value="BE">BE — Break-even</option>
                </select>
              </div>
              <div className="field">
                <label>Gain / perte (USD)</label>
                <input type="number" step="0.01" required value={tradeForm.pnl}
                  placeholder="Ex. 50 ou -25"
                  onChange={e => setTradeForm({ ...tradeForm, pnl: e.target.value })} />
              </div>
              <div className="field">
                <label>Risque engagé (USD, facultatif)</label>
                <input type="number" min="0" step="0.01" value={tradeForm.risk_amount}
                  onChange={e => setTradeForm({ ...tradeForm, risk_amount: e.target.value })} />
              </div>
              <div className="field full-field">
                <label>Respect du plan</label>
                <select value={String(tradeForm.plan_followed)}
                  onChange={e => setTradeForm({ ...tradeForm, plan_followed: e.target.value === "true" ? true : e.target.value === "false" ? false : "" })}>
                  <option value="true">Oui</option>
                  <option value="false">Non</option>
                  <option value="">Non renseigné</option>
                </select>
              </div>
              <div className="field full-field">
                <label>Notes personnelles</label>
                <textarea rows="3" value={tradeForm.notes}
                  onChange={e => setTradeForm({ ...tradeForm, notes: e.target.value })}
                  placeholder="Analyse, erreurs, observations..." />
              </div>
            </div>

            <p className="muted small">Aucun calcul automatique : le gain ou la perte est saisi par toi.</p>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setTradeModal(false)}>Annuler</button>
              <button className="primary"><ShieldCheck size={16} /> Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {capitalModal && (
        <div className="modal-backdrop" onMouseDown={e => {
          if (e.target === e.currentTarget) setCapitalModal(false);
        }}>
          <form className="modal compact-modal" onSubmit={createCapital}>
            <div className="modal-header">
              <div><p className="eyebrow">CAPITAUX</p><h2>Nouveau capital actif</h2></div>
              <button type="button" className="icon-button" onClick={() => setCapitalModal(false)}><X size={20} /></button>
            </div>
            <p className="muted">
              Si un capital est déjà actif, il sera archivé automatiquement. Ses trades seront conservés.
            </p>
            <div className="field">
              <label>Nom du capital</label>
              <input required value={capitalName} onChange={e => setCapitalName(e.target.value)}
                placeholder="Ex. Capital principal" />
            </div>
            <div className="field">
              <label>Capital initial (USD)</label>
              <input type="number" min="0" step="0.01" required value={capitalBalance}
                onChange={e => setCapitalBalance(e.target.value)} placeholder="Ex. 1000" />
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setCapitalModal(false)}>Annuler</button>
              <button className="primary"><Plus size={16} /> Créer le capital</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function FilterBar({ period, setPeriod, capitalFilter, setCapitalFilter }) {
  return (
    <div className="filter-bar">
      <div className="filter-control">
        <CalendarDays size={16} />
        <select value={period} onChange={e => setPeriod(e.target.value)}>
          {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <ChevronDown size={14} />
      </div>
      <div className="filter-control">
        <Archive size={16} />
        <select value={capitalFilter} onChange={e => setCapitalFilter(e.target.value)}>
          <option value="active">Capital actif</option>
          <option value="archived">Capitaux archivés</option>
          <option value="all">Tous les capitaux</option>
        </select>
        <ChevronDown size={14} />
      </div>
    </div>
  );
}

function TradeTable({ rows, capitals, onEdit, onDelete }) {
  if (!rows.length) return <Empty message="Aucun trade pour le moment." />;

  const capitalNames = Object.fromEntries(capitals.map(c => [c.id, c.name]));

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Actif</th><th>Setup</th><th>Capital</th>
            <th>Résultat</th><th>P&L</th><th>Plan</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.id}>
              <td>{new Date(t.trade_date).toLocaleString("fr-FR", {
                dateStyle: "short", timeStyle: "short"
              })}</td>
              <td><strong>{t.asset}</strong><span className="sub-cell">{t.direction}</span></td>
              <td><span className="setup-badge">{t.setup}</span></td>
              <td>{capitalNames[t.capital_id] || "—"}</td>
              <td><span className={`result-badge result-${t.result.toLowerCase()}`}>{t.result}</span></td>
              <td className={Number(t.pnl) > 0 ? "green" : Number(t.pnl) < 0 ? "red" : ""}>
                {money(t.pnl)}
              </td>
              <td>{t.plan_followed == null ? "—" : t.plan_followed ? "Oui" : "Non"}</td>
              <td>
                <div className="table-actions">
                  <button className="icon-button" title="Modifier" onClick={() => onEdit(t)}><Pencil size={15} /></button>
                  <button className="icon-button danger-button" title="Supprimer" onClick={() => onDelete(t)}><Trash2 size={15} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ message }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><BookOpen size={22} /></div>
      <p>{message}</p>
    </div>
  );
}

export default App;

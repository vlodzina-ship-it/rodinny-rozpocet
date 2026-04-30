import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Database,
  LogOut,
  Download,
  Pencil,
  X,
  UserPlus,
  Repeat,
  AlertTriangle,
  CalendarDays,
  PiggyBank,
  Scale,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { exportToExcel } from './export'
import './style.css'

const budgetTypes = [
  { value: 'regular_income', label: 'Pravidelný příjem', group: 'income', type: 'income' },
  { value: 'irregular_income', label: 'Nepravidelný příjem', group: 'income', type: 'income' },
  { value: 'fixed_expense', label: 'Pevný výdaj', group: 'mandatory', type: 'expense' },
  { value: 'controllable_expense', label: 'Kontrolovatelný výdaj', group: 'planned', type: 'expense' },
  { value: 'extra_expense', label: 'Mimořádný výdaj', group: 'extra', type: 'expense' },
  { value: 'reserve_fund', label: 'Rezervní fond', group: 'planned', type: 'expense' },
]

const categories = {
  income: ['Mzda', 'Podnikání', 'Dávky', 'Důchod', 'Pronájem', 'Jiné výnosy', 'Ostatní'],
  expense: ['Bydlení', 'Energie', 'Hypotéka/úvěr', 'Pojištění', 'Jídlo', 'Doprava', 'Děti', 'Zdraví', 'Zábava', 'Oblečení', 'Rezerva', 'Ostatní'],
}

const today = new Date().toISOString().slice(0, 10)
const currentMonth = today.slice(0, 7)
const currentYear = today.slice(0, 4)

function money(value) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
  }).format(Number(value || 0))
}

function typeConfig(value) {
  return budgetTypes.find(type => type.value === value) || budgetTypes[2]
}

function typeLabel(value) {
  return typeConfig(value).label
}

function emptyForm() {
  return {
    title: '',
    amount: '',
    budget_type: 'fixed_expense',
    budget_group: 'mandatory',
    type: 'expense',
    category: 'Bydlení',
    transaction_date: today,
    note: '',
    is_recurring: false,
  }
}

function previousMonth(value) {
  const [year, month] = value.split('-').map(Number)
  const date = new Date(year, month - 2, 1)
  return date.toISOString().slice(0, 7)
}

function calculateTotals(list) {
  const sum = (predicate) =>
    list.filter(predicate).reduce((total, item) => total + Number(item.amount || 0), 0)

  const regularIncome = sum(item => item.budget_type === 'regular_income')
  const irregularIncome = sum(item => item.budget_type === 'irregular_income')
  const income = regularIncome + irregularIncome

  const fixedExpenses = sum(item => item.budget_type === 'fixed_expense')
  const controllableExpenses = sum(item => item.budget_type === 'controllable_expense')
  const extraExpenses = sum(item => item.budget_type === 'extra_expense')
  const reserveFund = sum(item => item.budget_type === 'reserve_fund')

  const recurringExpenses = sum(item => item.is_recurring && item.type !== 'income')
  const recurringIncome = sum(item => item.is_recurring && item.type === 'income')

  const totalExpenses = fixedExpenses + controllableExpenses + extraExpenses + reserveFund
  const balance = income - totalExpenses

  return {
    regularIncome,
    irregularIncome,
    income,
    fixedExpenses,
    controllableExpenses,
    extraExpenses,
    reserveFund,
    recurringExpenses,
    recurringIncome,
    totalExpenses,
    balance,
    recurringRatio: income > 0 ? recurringExpenses / income : 0,
    reserveMonths: totalExpenses > 0 ? reserveFund / totalExpenses : 0,
  }
}

function getMonthStatus(balance) {
  if (balance > 0) return { label: 'Přebytkový', text: 'Příjmy jsou vyšší než výdaje.', positive: true }
  if (balance === 0) return { label: 'Vyrovnaný', text: 'Příjmy a výdaje jsou stejné.', positive: true }
  return { label: 'Schodkový', text: 'Výdaje jsou vyšší než příjmy.', positive: false }
}

function App() {
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '' })

  const [householdId, setHouseholdId] = useState(null)
  const [memberEmail, setMemberEmail] = useState('')
  const [memberMessage, setMemberMessage] = useState('')

  const [items, setItems] = useState([])
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(true)
  const [editingItem, setEditingItem] = useState(null)
  const [showRecurringOnly, setShowRecurringOnly] = useState(false)

  const [form, setForm] = useState(emptyForm())

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    async function initAuth() {
      const { data } = await supabase.auth.getSession()
      setUser(data.session?.user || null)
      setLoading(false)
    }

    initAuth()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      initializeHousehold()
    } else {
      setHouseholdId(null)
      setItems([])
      setMemberEmail('')
      setMemberMessage('')
    }
  }, [user])

  async function initializeHousehold() {
    setLoading(true)

    const { data, error } = await supabase.rpc('get_or_create_my_household')

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    setHouseholdId(data)
    await loadItems(data)
    setLoading(false)
  }

  async function loadItems(activeHouseholdId = householdId) {
    if (!activeHouseholdId) return

    const { data, error } = await supabase
      .from('budget_transactions')
      .select('*')
      .eq('household_id', activeHouseholdId)
      .order('transaction_date', { ascending: false })

    if (error) {
      alert(error.message)
      setItems([])
    } else {
      setItems(data || [])
    }
  }

  async function handleAuth(e) {
    e.preventDefault()

    const email = authForm.email.trim()
    const password = authForm.password

    if (!email || !password) {
      alert('Vyplň e-mail i heslo.')
      return
    }

    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) alert(error.message)
      return
    }

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      alert(error.message)
      return
    }

    alert('Registrace proběhla. Teď se můžeš přihlásit.')
    setAuthMode('login')
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setHouseholdId(null)
    setItems([])
    setEditingItem(null)
    setForm(emptyForm())
  }

  async function addMember(e) {
    e.preventDefault()

    const email = memberEmail.trim()

    if (!email) {
      setMemberMessage('Vyplň e-mail člena.')
      return
    }

    const { error } = await supabase.rpc('add_household_member_by_email', {
      member_email: email,
    })

    if (error) {
      setMemberMessage(error.message)
      return
    }

    setMemberEmail('')
    setMemberMessage('Člen byl přidán do společného rozpočtu.')
    await loadItems()
  }

  async function copyRecurringFromPreviousMonth() {
    if (!householdId) {
      alert('Společný rozpočet ještě není připravený.')
      return
    }

    const sourceMonth = previousMonth(month)

    const { data, error } = await supabase.rpc('copy_recurring_transactions', {
      source_month: sourceMonth,
      target_month: month,
    })

    if (error) {
      alert(error.message)
      return
    }

    await loadItems(householdId)

    alert(`Zkopírováno ${data || 0} fixních položek z měsíce ${sourceMonth}.`)
  }

  const monthlyItems = useMemo(() => {
    return items.filter(item => String(item.transaction_date || '').startsWith(month))
  }, [items, month])

  const yearlyItems = useMemo(() => {
    return items.filter(item => String(item.transaction_date || '').startsWith(year))
  }, [items, year])

  const visibleItems = useMemo(() => {
    if (!showRecurringOnly) return monthlyItems
    return monthlyItems.filter(item => item.is_recurring)
  }, [monthlyItems, showRecurringOnly])

  const monthlyTotals = useMemo(() => calculateTotals(monthlyItems), [monthlyItems])

  const yearlyTotals = useMemo(() => {
    const totals = calculateTotals(yearlyItems)

    const recurringMonthlyExpenses = monthlyItems
      .filter(item => item.is_recurring && item.type !== 'income')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const recurringAlreadyInYearExpenses = yearlyItems
      .filter(item => item.is_recurring && item.type !== 'income')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const recurringMonthlyIncome = monthlyItems
      .filter(item => item.is_recurring && item.type === 'income')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const recurringAlreadyInYearIncome = yearlyItems
      .filter(item => item.is_recurring && item.type === 'income')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const estimatedYearlyExpenses =
      totals.totalExpenses - recurringAlreadyInYearExpenses + recurringMonthlyExpenses * 12

    const estimatedYearlyIncome =
      totals.income - recurringAlreadyInYearIncome + recurringMonthlyIncome * 12

    return {
      ...totals,
      income: estimatedYearlyIncome,
      regularIncome: totals.regularIncome - recurringAlreadyInYearIncome + recurringMonthlyIncome * 12,
      totalExpenses: estimatedYearlyExpenses,
      balance: estimatedYearlyIncome - estimatedYearlyExpenses,
    }
  }, [yearlyItems, monthlyItems])

  const monthStatus = useMemo(() => getMonthStatus(monthlyTotals.balance), [monthlyTotals.balance])

  const alerts = useMemo(() => {
    const result = []

    if (monthlyTotals.recurringRatio > 0.6) {
      result.push(`Fixní náklady jsou ${Math.round(monthlyTotals.recurringRatio * 100)} % měsíčních příjmů.`)
    }

    if (monthlyTotals.extraExpenses > monthlyTotals.controllableExpenses && monthlyTotals.controllableExpenses > 0) {
      result.push('Mimořádné výdaje překročily kontrolovatelný rozpočet.')
    }

    if (monthlyTotals.balance < 0) {
      result.push('Měsíční rozpočet je schodkový.')
    }

    if (monthlyTotals.income > 0 && monthlyTotals.reserveFund === 0) {
      result.push('Tento měsíc není vytvořena žádná rezerva.')
    }

    return result
  }, [monthlyTotals])

  const byType = useMemo(() => {
    return budgetTypes
      .map(type => [
        type.label,
        visibleItems
          .filter(item => item.budget_type === type.value)
          .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      ])
      .filter(([, amount]) => amount > 0)
  }, [visibleItems])

  const byCategory = useMemo(() => {
    const map = {}

    for (const item of visibleItems.filter(item => item.type !== 'income')) {
      map[item.category] = (map[item.category] || 0) + Number(item.amount || 0)
    }

    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [visibleItems])

  async function saveItem(e) {
    e.preventDefault()

    if (!user) {
      alert('Nejdřív se přihlas.')
      return
    }

    if (!householdId) {
      alert('Společný rozpočet ještě není připravený.')
      return
    }

    if (!form.title.trim() || !form.amount) {
      alert('Vyplň název a částku.')
      return
    }

    const config = typeConfig(form.budget_type)

    const canBeRecurring =
      form.budget_type === 'regular_income' || config.type === 'expense'

    const payload = {
      title: form.title.trim(),
      amount: Number(form.amount),
      budget_type: form.budget_type,
      budget_group: config.group,
      type: config.type,
      category: form.category || categories[config.type][0],
      transaction_date: form.transaction_date,
      note: form.note.trim(),
      is_recurring: canBeRecurring ? Boolean(form.is_recurring) : false,
      user_id: user.id,
      household_id: householdId,
    }

    if (editingItem) {
      const { error } = await supabase
        .from('budget_transactions')
        .update(payload)
        .eq('id', editingItem.id)
        .eq('household_id', householdId)

      if (error) {
        alert(error.message)
        return
      }
    } else {
      const { error } = await supabase
        .from('budget_transactions')
        .insert(payload)

      if (error) {
        alert(error.message)
        return
      }
    }

    await loadItems(householdId)
    cancelEdit()
  }

  function startEdit(item) {
    const itemType = item.budget_type || (item.type === 'income' ? 'regular_income' : 'fixed_expense')
    const config = typeConfig(itemType)

    setEditingItem(item)

    setForm({
      title: item.title || '',
      amount: item.amount || '',
      budget_type: itemType,
      budget_group: config.group,
      type: config.type,
      category: item.category || categories[config.type][0],
      transaction_date: item.transaction_date || today,
      note: item.note || '',
      is_recurring: Boolean(item.is_recurring),
    })
  }

  function cancelEdit() {
    setEditingItem(null)
    setForm(emptyForm())
  }

  async function deleteItem(id) {
    if (!confirm('Opravdu smazat položku?')) return

    const { error } = await supabase
      .from('budget_transactions')
      .delete()
      .eq('id', id)
      .eq('household_id', householdId)

    if (error) {
      alert(error.message)
      return
    }

    await loadItems(householdId)

    if (editingItem?.id === id) {
      cancelEdit()
    }
  }

  function updateForm(next) {
    let nextForm = { ...form, ...next }

    if (next.budget_type && next.budget_type !== form.budget_type) {
      const config = typeConfig(next.budget_type)

      const canBeRecurring =
        next.budget_type === 'regular_income' || config.type === 'expense'

      nextForm = {
        ...nextForm,
        budget_group: config.group,
        type: config.type,
        category: categories[config.type][0],
        is_recurring: canBeRecurring ? nextForm.is_recurring : false,
      }
    }

    setForm(nextForm)
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="app">
        <section className="panel">
          <h1>Supabase není nastavený</h1>
          <p className="muted">Zkontroluj GitHub Secrets: VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY.</p>
        </section>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="app">
        <section className="panel">
          <p>Načítám…</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="app">
        <section className="panel auth-panel">
          <h1>{authMode === 'login' ? 'Přihlášení' : 'Registrace'}</h1>

          <form className="form auth-form" onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="E-mail"
              value={authForm.email}
              onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
            />

            <input
              type="password"
              placeholder="Heslo"
              value={authForm.password}
              onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
            />

            <button type="submit">
              {authMode === 'login' ? 'Přihlásit' : 'Registrovat'}
            </button>
          </form>

          <button
            className="link-button"
            type="button"
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
          >
            {authMode === 'login' ? 'Nemáš účet? Registrovat' : 'Už máš účet? Přihlásit'}
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Rodinný rozpočet</p>
          <h1>Přehled domácího rozpočtu</h1>
          <p className="muted">Přihlášen: {user.email}</p>
        </div>

        <div className="status">
          <Database size={18} />
          Supabase

          <button type="button" onClick={() => exportToExcel(monthlyItems)}>
            <Download size={16} />
            Export měsíc
          </button>

          <button type="button" onClick={logout}>
            <LogOut size={16} />
            Odhlásit
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Období</h2>
            <p className="muted">Vyber měsíc pro měsíční rozpočet a rok pro roční souhrn.</p>
          </div>

          <div className="form" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
            <input
              type="month"
              value={month}
              onChange={e => {
                setMonth(e.target.value)
                setYear(e.target.value.slice(0, 4))
              }}
            />

            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={e => setYear(e.target.value)}
            />

            <button type="button" onClick={copyRecurringFromPreviousMonth}>
              <Repeat size={16} />
              Kopírovat fixní
            </button>
          </div>
        </div>
      </section>

      {alerts.length > 0 && (
        <section className="panel" style={{ border: '2px solid #f59e0b' }}>
          <h2>
            <AlertTriangle size={22} />
            Upozornění
          </h2>

          {alerts.map((alert, index) => (
            <p key={index}>⚠️ {alert}</p>
          ))}
        </section>
      )}

      <section className="panel">
        <h2>
          <Scale size={22} />
          Výsledek měsíce: {monthStatus.label}
        </h2>
        <p className="muted">{monthStatus.text}</p>

        <section className="grid cards">
          <Card icon={<TrendingUp />} title="Pravidelné příjmy" value={money(monthlyTotals.regularIncome)} />
          <Card icon={<TrendingUp />} title="Nepravidelné příjmy" value={money(monthlyTotals.irregularIncome)} />
          <Card icon={<TrendingDown />} title="Pevné výdaje" value={money(monthlyTotals.fixedExpenses)} />
          <Card icon={<TrendingDown />} title="Kontrolovatelné výdaje" value={money(monthlyTotals.controllableExpenses)} />
          <Card icon={<AlertTriangle />} title="Mimořádné výdaje" value={money(monthlyTotals.extraExpenses)} />
          <Card icon={<PiggyBank />} title="Rezervní fond" value={money(monthlyTotals.reserveFund)} />
          <Card icon={<Wallet />} title="Výdaje celkem" value={money(monthlyTotals.totalExpenses)} />
          <Card icon={<Wallet />} title="Zůstatek měsíce" value={money(monthlyTotals.balance)} highlight={monthlyTotals.balance >= 0} />
        </section>
      </section>

      <section className="panel">
        <h2>
          <CalendarDays size={22} />
          Celkem v roce {year}
        </h2>

        <section className="grid cards">
          <Card icon={<TrendingUp />} title="Příjmy za rok" value={money(yearlyTotals.income)} />
          <Card icon={<TrendingDown />} title="Výdaje za rok" value={money(yearlyTotals.totalExpenses)} />
          <Card icon={<PiggyBank />} title="Rezerva za rok" value={money(yearlyTotals.reserveFund)} />
          <Card icon={<Wallet />} title="Zůstatek za rok" value={money(yearlyTotals.balance)} highlight={yearlyTotals.balance >= 0} />
        </section>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{editingItem ? 'Upravit položku' : 'Nová položka'}</h2>
        </div>

        <form className="form" onSubmit={saveItem}>
          <input
            placeholder="Název"
            value={form.title}
            onChange={e => updateForm({ title: e.target.value })}
          />

          <input
            placeholder="Částka"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={e => updateForm({ amount: e.target.value })}
          />

          <select
            value={form.budget_type}
            onChange={e => updateForm({ budget_type: e.target.value })}
          >
            {budgetTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>

          <select
            value={form.category}
            onChange={e => updateForm({ category: e.target.value })}
          >
            {categories[form.type].map(category => (
              <option key={category}>{category}</option>
            ))}
          </select>

          <input
            type="date"
            value={form.transaction_date}
            onChange={e => updateForm({ transaction_date: e.target.value })}
          />

          <input
            placeholder="Poznámka"
            value={form.note}
            onChange={e => updateForm({ note: e.target.value })}
          />

          <label>
            <input
              type="checkbox"
              checked={form.is_recurring}
              disabled={form.budget_type === 'irregular_income'}
              onChange={e => updateForm({ is_recurring: e.target.checked })}
            />
            Fixní
          </label>

          <button type="submit">
            <Plus size={18} />
            {editingItem ? 'Uložit' : 'Přidat'}
          </button>

          {editingItem && (
            <button type="button" className="secondary-button" onClick={cancelEdit}>
              <X size={18} />
              Zrušit
            </button>
          )}
        </form>
      </section>

      <section className="layout">
        <div className="panel">
          <div className="panel-head">
            <h2>Položky za měsíc</h2>

            <button
              type="button"
              className={showRecurringOnly ? 'filter-button active' : 'filter-button'}
              onClick={() => setShowRecurringOnly(!showRecurringOnly)}
            >
              <Repeat size={16} />
              {showRecurringOnly ? 'Zobrazit vše' : 'Jen fixní'}
            </button>
          </div>

          {visibleItems.length === 0 ? (
            <p className="muted">Zatím žádné položky.</p>
          ) : (
            <div className="list">
              {visibleItems.map(item => {
                const isIncome = item.type === 'income'

                return (
                  <div className="row" key={item.id}>
                    <div>
                      <strong>
                        {item.title}
                        {item.is_recurring && <span className="badge">fixní</span>}
                      </strong>

                      <span>
                        {item.transaction_date} · {typeLabel(item.budget_type)} · {item.category}
                        {item.note ? ` · ${item.note}` : ''}
                      </span>
                    </div>

                    <div className={isIncome ? 'income' : 'expense'}>
                      {isIncome ? '+' : '-'} {money(item.amount)}
                    </div>

                    <button type="button" onClick={() => startEdit(item)} title="Upravit">
                      <Pencil size={16} />
                    </button>

                    <button type="button" onClick={() => deleteItem(item.id)} title="Smazat">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Rozpad rozpočtu</h2>

          {byType.length === 0 ? (
            <p className="muted">Bez položek.</p>
          ) : (
            byType.map(([label, amount]) => (
              <div className="bar-wrap" key={label}>
                <div className="bar-label">
                  <span>{label}</span>
                  <strong>{money(amount)}</strong>
                </div>

                <div className="bar">
                  <div
                    style={{
                      width: `${Math.min(100, (amount / Math.max(monthlyTotals.income + monthlyTotals.totalExpenses, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))
          )}

          <h2 style={{ marginTop: 28 }}>Výdaje podle kategorií</h2>

          {byCategory.length === 0 ? (
            <p className="muted">Bez kategorií.</p>
          ) : (
            byCategory.map(([category, amount]) => (
              <div className="bar-wrap" key={category}>
                <div className="bar-label">
                  <span>{category}</span>
                  <strong>{money(amount)}</strong>
                </div>

                <div className="bar">
                  <div
                    style={{
                      width: `${Math.min(100, (amount / Math.max(monthlyTotals.totalExpenses, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Nastavení rodiny</h2>
        <p className="muted">Přidej dalšího člena e-mailem. Uživatel musí být nejdřív zaregistrovaný.</p>

        <form className="form member-form" onSubmit={addMember}>
          <input
            type="email"
            placeholder="E-mail člena rodiny"
            value={memberEmail}
            onChange={e => setMemberEmail(e.target.value)}
          />

          <button type="submit">
            <UserPlus size={18} />
            Přidat člena
          </button>
        </form>

        {memberMessage && <p className="muted">{memberMessage}</p>}

        <p className="muted">ID rozpočtu: {householdId || 'načítám…'}</p>
      </section>
    </main>
  )
}

function Card({ icon, title, value, highlight }) {
  return (
    <div className={`card ${highlight ? 'good' : ''}`}>
      {icon}
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)

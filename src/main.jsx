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
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { exportToExcel } from './export'
import './style.css'

const budgetGroups = [
  { value: 'income', label: 'Příjem', type: 'income' },
  { value: 'mandatory', label: 'Mandatorní výdaj', type: 'expense' },
  { value: 'extra', label: 'Mimořádný výdaj', type: 'expense' },
  { value: 'planned', label: 'Plánovaný rozpočet', type: 'expense' },
]

const categories = {
  income: ['Výplata', 'Podnikání', 'Přídavky', 'Dárky', 'Ostatní'],
  expense: ['Bydlení', 'Jídlo', 'Doprava', 'Děti', 'Zdraví', 'Zábava', 'Oblečení', 'Spoření', 'Ostatní'],
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

function groupLabel(value) {
  return budgetGroups.find(group => group.value === value)?.label || 'Mandatorní výdaj'
}

function groupType(value) {
  return budgetGroups.find(group => group.value === value)?.type || 'expense'
}

function emptyForm() {
  return {
    title: '',
    amount: '',
    budget_group: 'mandatory',
    type: 'expense',
    category: 'Jídlo',
    transaction_date: today,
    note: '',
    is_recurring: false,
  }
}

function calculateTotals(list) {
  const income = list
    .filter(item => item.budget_group === 'income' || item.type === 'income')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const mandatory = list
    .filter(item => item.budget_group === 'mandatory')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const extra = list
    .filter(item => item.budget_group === 'extra')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const planned = list
    .filter(item => item.budget_group === 'planned')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const recurring = list
    .filter(item => item.is_recurring && item.budget_group !== 'income' && item.type !== 'income')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const totalExpenses = mandatory + extra + planned

  return {
    income,
    mandatory,
    extra,
    planned,
    recurring,
    totalExpenses,
    balance: income - totalExpenses,
    expectedBalance: income - mandatory - planned,
    recurringRatio: income > 0 ? recurring / income : 0,
  }
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

    return () => {
      listener.subscription.unsubscribe()
    }
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
  const yearlyTotals = useMemo(() => calculateTotals(yearlyItems), [yearlyItems])

  const alerts = useMemo(() => {
    const result = []

    if (monthlyTotals.recurringRatio > 0.6) {
      result.push(`Fixní náklady jsou ${Math.round(monthlyTotals.recurringRatio * 100)} % měsíčních příjmů.`)
    }

    if (monthlyTotals.extra > monthlyTotals.planned) {
      result.push('Mimořádné výdaje v měsíci překročily plánovaný rozpočet.')
    }

    if (monthlyTotals.balance < 0) {
      result.push('Měsíční rozpočet je v mínusu.')
    }

    return result
  }, [monthlyTotals])

  const byCategory = useMemo(() => {
    const map = {}

    for (const item of visibleItems.filter(item => item.budget_group !== 'income' && item.type !== 'income')) {
      map[item.category] = (map[item.category] || 0) + Number(item.amount || 0)
    }

    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [visibleItems])

  const byGroup = useMemo(() => {
    const totals = calculateTotals(visibleItems)

    return [
      ['Mandatorní výdaje', totals.mandatory],
      ['Mimořádné výdaje', totals.extra],
      ['Plánovaný rozpočet', totals.planned],
    ].filter(([, amount]) => amount > 0)
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

    const actualType = groupType(form.budget_group)

    const payload = {
      title: form.title.trim(),
      amount: Number(form.amount),
      type: actualType,
      budget_group: form.budget_group,
      category: form.category || categories[actualType][0],
      transaction_date: form.transaction_date,
      note: form.note.trim(),
      is_recurring: Boolean(form.is_recurring),
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
    const itemGroup = item.budget_group || (item.type === 'income' ? 'income' : 'mandatory')
    const itemType = groupType(itemGroup)

    setEditingItem(item)

    setForm({
      title: item.title || '',
      amount: item.amount || '',
      budget_group: itemGroup,
      type: itemType,
      category: item.category || categories[itemType][0],
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
    let nextForm = {
      ...form,
      ...next,
    }

    if (next.budget_group && next.budget_group !== form.budget_group) {
      const nextType = groupType(next.budget_group)

      nextForm = {
        ...nextForm,
        type: nextType,
        category: categories[nextType][0],
      }
    }

    if (next.budget_group === 'income') {
      nextForm.is_recurring = false
    }

    setForm(nextForm)
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="app">
        <section className="panel">
          <h1>Supabase není nastavený</h1>
          <p className="muted">
            Zkontroluj GitHub Secrets: VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY.
          </p>
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
            {authMode === 'login'
              ? 'Nemáš účet? Registrovat'
              : 'Už máš účet? Přihlásit'}
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
          <h1>Měsíční a roční rozpočet</h1>
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

          <div className="form" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
          <CalendarDays size={22} />
          Měsíční rozpočet
        </h2>

        <section className="grid cards">
          <Card icon={<TrendingUp />} title="Příjmy za měsíc" value={money(monthlyTotals.income)} />
          <Card icon={<TrendingDown />} title="Výdaje za měsíc" value={money(monthlyTotals.totalExpenses)} />
          <Card icon={<Repeat />} title="Fixní náklady" value={money(monthlyTotals.recurring)} />
          <Card icon={<Wallet />} title="Zůstatek za měsíc" value={money(monthlyTotals.balance)} highlight={monthlyTotals.balance >= 0} />
        </section>
      </section>

      <section className="panel">
        <h2>Celkem v roce {year}</h2>

        <section className="grid cards">
          <Card icon={<TrendingUp />} title="Příjmy za rok" value={money(yearlyTotals.income)} />
          <Card icon={<TrendingDown />} title="Výdaje za rok" value={money(yearlyTotals.totalExpenses)} />
          <Card icon={<Repeat />} title="Fixní náklady za rok" value={money(yearlyTotals.recurring)} />
          <Card icon={<Wallet />} title="Zůstatek za rok" value={money(yearlyTotals.balance)} highlight={yearlyTotals.balance >= 0} />
        </section>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Rodinný rozpočet</h2>
            <p className="muted">Přidej dalšího člena e-mailem. Uživatel musí být nejdřív zaregistrovaný.</p>
          </div>
        </div>

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
            value={form.budget_group}
            onChange={e => updateForm({ budget_group: e.target.value })}
          >
            {budgetGroups.map(group => (
              <option key={group.value} value={group.value}>
                {group.label}
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
              disabled={form.budget_group === 'income'}
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
                const isIncome = item.budget_group === 'income' || item.type === 'income'

                return (
                  <div className="row" key={item.id}>
                    <div>
                      <strong>
                        {item.title}
                        {item.is_recurring && <span className="badge">fixní</span>}
                      </strong>

                      <span>
                        {item.transaction_date} · {groupLabel(item.budget_group)} · {item.category}
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
          <h2>Výdaje podle skupin</h2>

          {byGroup.length === 0 ? (
            <p className="muted">Bez výdajů.</p>
          ) : (
            byGroup.map(([label, amount]) => (
              <div className="bar-wrap" key={label}>
                <div className="bar-label">
                  <span>{label}</span>
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
